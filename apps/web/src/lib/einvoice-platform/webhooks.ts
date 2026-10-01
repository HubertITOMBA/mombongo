import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { authErrorResponse } from "@/lib/auth/http";
import { applyInboundWebhook, applyStatusWebhook } from "./gateway";
import { logElectronicPlatform } from "./log";
import { getEInvoiceAdapter, parseElectronicProvider } from "./registry";
import "./mock-adapter";

const MAX_WEBHOOK_BYTES = 65_536;

async function readRawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, response: NextResponse.json({ error: "Requête invalide." }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return { ok: false as const, response: NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 }) };
    }
    chunks.push(value);
  }
  return { ok: true as const, body: Buffer.concat(chunks).toString("utf8") };
}

export async function handleElectronicInvoicingWebhook(providerParam: string, request: Request) {
  const provider = parseElectronicProvider(providerParam);
  if (!provider) return NextResponse.json({ error: "Fournisseur inconnu." }, { status: 404 });
  const parsed = await readRawBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const adapter = getEInvoiceAdapter(provider);
    const hint = adapter.resolveWebhookConnection(request.headers);
    if (!hint?.externalAccountId) return NextResponse.json({ error: "Compte fournisseur introuvable." }, { status: 401 });
    const connection = await getDb().electronicInvoicingConnection.findFirst({
      where: { provider, externalAccountId: hint.externalAccountId, status: "READY" },
    });
    if (!connection) return NextResponse.json({ error: "Compte fournisseur introuvable." }, { status: 401 });
    if (!adapter.verifyWebhook({ headers: request.headers, rawBody: parsed.body, connection })) {
      logElectronicPlatform({
        organizationId: connection.organizationId,
        provider,
        event: "webhook_rejected",
      });
      return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
    }
    const event = adapter.parseWebhook(parsed.body);
    if (event.type === "UNKNOWN") {
      logElectronicPlatform({
        organizationId: connection.organizationId,
        provider,
        event: "webhook_unknown",
      });
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (event.type === "STATUS") {
      const result = await applyStatusWebhook({
        connection,
        providerEventId: event.providerEventId,
        providerTransmissionId: event.providerTransmissionId,
        status: event.status,
        providerStatus: event.providerStatus,
        message: event.message,
        occurredAt: event.occurredAt,
      });
      return NextResponse.json({ ok: true, duplicate: result.duplicate, transmissionId: result.transmissionId });
    }
    const result = await applyInboundWebhook({
      connection,
      providerEventId: event.providerEventId,
      providerDocumentId: event.providerDocumentId,
      supplierName: event.supplierName,
      documentNumber: event.documentNumber,
      currency: event.currency,
      ttcCents: event.ttcCents,
      occurredAt: event.occurredAt,
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, transmissionId: result.transmissionId });
  } catch (error) {
    if (error instanceof AuthFlowError) return authErrorResponse(error);
    console.error("Échec webhook e-invoicing", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Le webhook n’a pas pu être traité." }, { status: 503 });
  }
}
