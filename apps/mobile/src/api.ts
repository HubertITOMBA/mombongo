import Constants from "expo-constants";
import { loginSchema, registrationSchema, verificationCodeSchema } from "@mombongo/contracts";
import { resolveApiUrl } from "./api-url";
import { clearSession, readActiveOrganization, readSession, writeActiveOrganization, writeSession } from "./session";

function expoHost() {
  return Constants.expoGoConfig?.debuggerHost?.split(":")[0]
    || Constants.linkingUri?.match(/^exp[os]?:\/\/([^:/]+)/)?.[1]
    || Constants.expoConfig?.hostUri?.split(":")[0];
}

export const apiUrl = resolveApiUrl({
  configured: (globalThis as { process?: { env?: { EXPO_PUBLIC_API_URL?: string } } }).process?.env?.EXPO_PUBLIC_API_URL,
  host: expoHost(),
  isRelease: typeof __DEV__ !== "undefined" && __DEV__ === false,
});
if (typeof __DEV__ === "undefined" || __DEV__) console.log("[mombongo] API", apiUrl);

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function request(path: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${apiUrl}${path}`, { ...init, signal: controller.signal });
  } catch (caught) {
    const aborted = caught instanceof Error && caught.name === "AbortError";
    throw new ApiError(
      aborted
        ? `API injoignable (${apiUrl}). Vérifiez que le serveur web écoute sur le port 9070 du PC.`
        : `Réseau indisponible (${apiUrl}).`,
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; name: string | null; email: string } };
export type OrganizationOption = { id: string; name: string; role: string };
export type Dashboard = {
  name: string | null;
  email: string;
  accountType: "INDIVIDUAL" | "BUSINESS";
  organizationId: string | null;
  organizationName: string | null;
  role: string | null;
  organizations: OrganizationOption[];
  customers: { clients: number; prospects: number };
  invoices: { pending: number; overdue: number; monthRevenue: number; yearRevenue: number };
  expenses: { month: number };
  appointments: { upcoming: number };
  quotes?: { open: number };
  alerts: string[];
};

async function parse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof body.error === "string" ? body.error : "La demande n’a pas abouti.", response.status);
  return body;
}

async function requestHeaders(accessToken?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    const organizationId = await readActiveOrganization();
    if (organizationId) headers["X-Organization-Id"] = organizationId;
  }
  return headers;
}

async function rememberOrganization(payload: { organizationId?: string | null; organizations?: OrganizationOption[] }) {
  const stored = await readActiveOrganization();
  if (stored && payload.organizations?.some(item => item.id === stored)) return;
  const next = payload.organizationId ?? payload.organizations?.[0]?.id;
  if (next) await writeActiveOrganization(next);
}

async function post(path: string, body: unknown, accessToken?: string) {
  return parse(await request(path, {
    method: "POST",
    headers: await requestHeaders(accessToken),
    body: JSON.stringify(body),
  }));
}

async function get(path: string, accessToken: string) {
  return parse(await request(path, {
    headers: await requestHeaders(accessToken),
  }));
}

export async function startLogin(email: string, password: string) {
  loginSchema.parse({ email, password });
  return post("/api/v1/mobile/auth/login", { email, password }) as Promise<{ challengeToken: string }>;
}

export async function startRegister(input: {
  email: string;
  password: string;
  name: string;
  accountType: "INDIVIDUAL" | "BUSINESS";
  organizationName?: string;
}) {
  registrationSchema.parse(input);
  return post("/api/v1/mobile/auth/register", input) as Promise<{ challengeToken: string }>;
}

export async function verifyCode(challengeToken: string, code: string) {
  verificationCodeSchema.parse(code);
  const tokens = await post("/api/v1/mobile/auth/verify", { challengeToken, code }) as Tokens;
  await writeSession(tokens.accessToken, tokens.refreshToken);
  return tokens;
}

export async function resendCode(challengeToken: string) {
  await post("/api/v1/mobile/auth/resend", { challengeToken });
}

async function authorized(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const session = await readSession();
  if (!session) throw new ApiError("Connectez-vous pour continuer.", 401);
  try {
    return method === "GET" ? await get(path, session.accessToken) : await post(path, body ?? {}, session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = await post("/api/v1/mobile/auth/refresh", { refreshToken: session.refreshToken }) as Tokens;
    await writeSession(refreshed.accessToken, refreshed.refreshToken);
    return method === "GET" ? await get(path, refreshed.accessToken) : await post(path, body ?? {}, refreshed.accessToken);
  }
}

export async function loadDashboard() {
  const dashboard = await authorized("/api/v1/mobile/dashboard") as Dashboard;
  await rememberOrganization(dashboard);
  return dashboard;
}

export async function switchOrganization(organizationId: string) {
  await writeActiveOrganization(organizationId);
}

export type PipelineCard = {
  id: string;
  displayName: string;
  stage: string;
  email: string | null;
  nextAction: string | null;
  estimatedCents: number | null;
};
export type PipelineColumns = Record<string, PipelineCard[]>;

export async function loadPipeline() {
  return authorized("/api/v1/mobile/pipeline") as Promise<{ columns: PipelineColumns }>;
}

export async function moveStage(customerId: string, stage: string) {
  return authorized(`/api/v1/mobile/customers/${customerId}/stage`, "POST", { stage });
}

export async function addNote(customerId: string, message: string) {
  return authorized(`/api/v1/mobile/customers/${customerId}/activities`, "POST", { type: "NOTE", message });
}

export type AppointmentItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: string;
  customerId: string | null;
  customerName: string | null;
};

export async function loadAppointments() {
  const body = await authorized("/api/v1/mobile/appointments") as { appointments: AppointmentItem[] };
  return body.appointments;
}

export async function createAppointment(input: { title: string; startsAt: string; durationMinutes: number; customerId?: string }) {
  return authorized("/api/v1/mobile/appointments", "POST", input);
}

export type QuoteItem = {
  id: string;
  title: string;
  number: string | null;
  status: string;
  ttcCents: number;
  currency?: string;
  customerName: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
};
export type InvoiceItem = {
  id: string;
  title: string;
  number: string | null;
  status: string;
  ttcCents: number;
  grossTtcCents?: number;
  creditedTtcCents?: number;
  netTtcCents?: number;
  paidTtcCents?: number;
  remainingTtcCents?: number;
  settlementState?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CREDITED";
  electronicTransmissionStatus?: string | null;
  electronicTransmissionRoute?: string | null;
  currency?: string;
  dueDate?: string | null;
  customerName: string;
  sourceNumber: string | null;
};
export type CustomerOption = { id: string; displayName: string; kind: string; partyKind?: string | null };
export type CatalogOption = {
  id: string;
  itemKind: "PRODUCT" | "SERVICE";
  reference: string | null;
  name: string;
  description: string | null;
  unit: string;
  unitCode?: string | null;
  unitPriceCents: number;
  vatBps: number;
  taxCategory?: string | null;
};

export async function loadQuotes() {
  const body = await authorized("/api/v1/mobile/quotes") as { quotes: QuoteItem[] };
  return body.quotes;
}

export async function loadCustomers() {
  const body = await authorized("/api/v1/mobile/customers") as { customers: CustomerOption[] };
  return body.customers;
}

export async function loadCatalog() {
  const body = await authorized("/api/v1/mobile/catalog") as { items: CatalogOption[] };
  return body.items;
}

export async function createQuote(input: {
  customerId: string;
  title: string;
  description: string;
  quantity: number;
  unitPriceCents: number | string;
  vatBps: number;
  unit?: string;
  itemKind?: "PRODUCT" | "SERVICE";
  catalogItemId?: string;
}) {
  return authorized("/api/v1/mobile/quotes", "POST", input);
}

export async function sendQuote(documentId: string) {
  return authorized(`/api/v1/mobile/quotes/${documentId}/send`, "POST");
}

export async function acceptQuote(documentId: string) {
  return authorized(`/api/v1/mobile/quotes/${documentId}/accept`, "POST");
}

export async function convertQuote(documentId: string) {
  return authorized(`/api/v1/mobile/quotes/${documentId}/convert`, "POST");
}

export function documentPdfPath(documentId: string) {
  return `/api/v1/mobile/documents/${documentId}/pdf`;
}

export function documentFacturXPath(documentId: string) {
  return `/api/v1/mobile/documents/${documentId}/factur-x`;
}

export async function loadInvoices() {
  const body = await authorized("/api/v1/mobile/invoices") as { invoices: InvoiceItem[] };
  return body.invoices;
}

export async function logout() {
  const session = await readSession();
  if (session) {
    await post("/api/v1/mobile/auth/logout", { refreshToken: session.refreshToken }, session.accessToken).catch(() => undefined);
  }
  await clearSession();
}
