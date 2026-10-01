import { NextRequest, NextResponse } from "next/server";
import { allowMobileRequest, authErrorResponse, readJsonBody } from "./http";
import { clientAddress } from "./rate-limit";
import { addCustomerActivity, changePipelineStage, getCustomer, listPipeline } from "@/lib/customers/service";
import { createAppointment, listAppointments } from "@/lib/appointments/service";
import { listCustomers } from "@/lib/customers/service";
import { acceptQuote, createQuote, listQuotes, sendQuote } from "@/lib/quotes/service";
import { convertQuoteToInvoice, listInvoices } from "@/lib/invoices/service";
import { listLatestDocumentTransmissions } from "@/lib/einvoice-platform/service";
import { invoiceSettlement } from "@/lib/invoices/settlement";
import { listCatalogItems } from "@/lib/catalog/service";
import { customerDisplayName } from "@mombongo/contracts";
import { documentCurrency, documentCustomerLabel } from "@/lib/documents/snapshot";
import { ORGANIZATION_HEADER, listAccessibleOrganizations, resolveActiveOrganization } from "./organization";
import { refreshMobileAuth, requireMobileAccount, requireMobileOrganization, resendMobileCode, revokeMobileAuth, startMobileAuth, summarizeAccount, verifyMobileAuth } from "./mobile";

function forbidden() {
  return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
}

export async function handleMobileStart(request: NextRequest, kind: "register" | "login") {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(await startMobileAuth(kind, parsed.body, clientAddress(request)));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileResend(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    await resendMobileCode(parsed.body, clientAddress(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileVerify(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(await verifyMobileAuth(parsed.body, clientAddress(request)));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileRefresh(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(await refreshMobileAuth(parsed.body, clientAddress(request)));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileLogout(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const account = await requireMobileAccount(request.headers.get("authorization"));
    const refreshToken = typeof parsed.body === "object" && parsed.body && "refreshToken" in parsed.body
      ? String((parsed.body as { refreshToken?: unknown }).refreshToken || "")
      : "";
    await revokeMobileAuth(account.user.id, account.sessionId, refreshToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function requestedOrganizationId(request: NextRequest) {
  return request.headers.get(ORGANIZATION_HEADER);
}

export async function handleMobileMe(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { user } = await requireMobileAccount(request.headers.get("authorization"));
    const organizations = user.accountType === "BUSINESS" ? await listAccessibleOrganizations(user.id) : [];
    const requested = requestedOrganizationId(request);
    const active = user.accountType === "BUSINESS" && (requested || organizations.length > 0)
      ? (await resolveActiveOrganization(user.id, requested)).context
      : null;
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      accountType: user.accountType,
      organizationId: active?.organization.id ?? null,
      organizationName: active?.organization.name ?? null,
      role: active?.role ?? null,
      organizations,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileDashboard(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { user } = await requireMobileAccount(request.headers.get("authorization"));
    return NextResponse.json(await summarizeAccount(user.id, requestedOrganizationId(request)));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobilePipeline(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    return NextResponse.json({ columns: await listPipeline(organization.id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileCustomer(request: NextRequest, customerId: string) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const customer = await getCustomer(organization.id, customerId);
    return NextResponse.json({ ...customer, displayName: customerDisplayName(customer) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileStage(request: NextRequest, customerId: string) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const body = typeof parsed.body === "object" && parsed.body ? { ...parsed.body as object, customerId } : { customerId };
    return NextResponse.json(await changePipelineStage(role, organization.id, body, user.id));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileAppointments(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const rows = await listAppointments(organization.id);
    return NextResponse.json({
      appointments: rows.map(item => ({
        id: item.id,
        title: item.title,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        location: item.location,
        status: item.status,
        customerId: item.customerId,
        customerName: item.customer ? customerDisplayName(item.customer) : null,
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileCreateAppointment(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const appointment = await createAppointment(role, organization.id, parsed.body, clientAddress(request), user.id);
    return NextResponse.json({
      id: appointment.id,
      title: appointment.title,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      customerName: appointment.customer ? customerDisplayName(appointment.customer) : null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileCustomers(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const customers = await listCustomers(organization.id, { status: "ACTIVE" });
    return NextResponse.json({
      customers: customers.map(item => ({
        id: item.id,
        displayName: customerDisplayName(item),
        kind: item.kind,
        partyKind: item.partyKind,
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileCatalog(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const items = await listCatalogItems(organization.id);
    return NextResponse.json({
      items: items.map(item => ({
        id: item.id,
        itemKind: item.itemKind,
        reference: item.reference,
        name: item.name,
        description: item.description,
        unit: item.unit,
        unitCode: item.unitCode,
        unitPriceCents: item.unitPriceCents,
        vatBps: item.vatBps,
        taxCategory: item.taxCategory,
        taxExemptionReason: item.taxExemptionReason,
        taxExemptionReasonCode: item.taxExemptionReasonCode,
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileQuotes(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { membership, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const quotes = await listQuotes(organization.id);
    const fallbackCurrency = typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR";
    return NextResponse.json({
      quotes: quotes.map(item => ({
        id: item.id,
        title: item.title,
        number: item.number,
        status: item.status,
        ttcCents: item.ttcCents,
        currency: documentCurrency(item, fallbackCurrency),
        customerName: documentCustomerLabel(item),
        invoiceId: item.derived[0]?.id ?? null,
        invoiceNumber: item.derived[0]?.number ?? null,
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileCreateQuote(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const quote = await createQuote(role, organization.id, parsed.body, clientAddress(request), user.id);
    return NextResponse.json({ id: quote.id, title: quote.title, ttcCents: quote.ttcCents });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileSendQuote(request: NextRequest, documentId: string) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const quote = await sendQuote(role, organization.id, { documentId }, user.id);
    return NextResponse.json({ id: quote.id, number: quote.number, status: quote.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileAcceptQuote(request: NextRequest, documentId: string) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const quote = await acceptQuote(role, organization.id, { documentId }, user.id);
    return NextResponse.json({ id: quote.id, number: quote.number, status: quote.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileInvoices(request: NextRequest) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { membership, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const invoices = await listInvoices(organization.id);
    const transmissions = await listLatestDocumentTransmissions(organization.id, invoices.map(item => item.id));
    const transmissionByDocument = new Map(transmissions.map(item => [item.documentId, item]));
    const fallbackCurrency = typeof membership.organization.currency === "string" ? membership.organization.currency : "EUR";
    return NextResponse.json({
      invoices: invoices.map(item => {
        const settlement = invoiceSettlement({
          grossTtcCents: item.ttcCents,
          creditNotes: item.creditNotes,
          payments: item.payments,
        });
        const transmission = transmissionByDocument.get(item.id);
        return {
          id: item.id,
          title: item.title,
          number: item.number,
          status: item.status,
          ttcCents: item.ttcCents,
          grossTtcCents: settlement.grossTtcCents,
          creditedTtcCents: settlement.creditedTtcCents,
          netTtcCents: settlement.netTtcCents,
          paidTtcCents: settlement.paidTtcCents,
          remainingTtcCents: settlement.remainingTtcCents,
          settlementState: settlement.settlementState,
          electronicTransmissionStatus: transmission?.status ?? null,
          electronicTransmissionRoute: transmission?.route ?? null,
          currency: documentCurrency(item, fallbackCurrency),
          dueDate: item.dueDate,
          customerName: documentCustomerLabel(item),
          sourceNumber: item.source?.number ?? null,
        };
      }),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileConvertQuote(request: NextRequest, documentId: string) {
  if (!allowMobileRequest(request)) return forbidden();
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const invoice = await convertQuoteToInvoice(role, organization.id, { documentId }, user.id);
    return NextResponse.json({ id: invoice.id, number: invoice.number, status: invoice.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function handleMobileActivity(request: NextRequest, customerId: string) {
  if (!allowMobileRequest(request)) return forbidden();
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const { user, role, organization } = await requireMobileOrganization(request.headers.get("authorization"), requestedOrganizationId(request));
    const body = typeof parsed.body === "object" && parsed.body ? { ...parsed.body as object, customerId } : { customerId };
    await addCustomerActivity(role, organization.id, body, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
