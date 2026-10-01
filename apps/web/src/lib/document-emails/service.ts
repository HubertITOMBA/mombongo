import { defaultDocumentEmailCopy, sendDocumentEmailSchema } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError, rateLimit } from "@/lib/auth/rate-limit";
import { canSendDocuments } from "@/lib/auth/permissions";
import { currentMailProvider, sendOutboundMail } from "@/lib/auth/mail";
import { buildOrganizationDocumentPdf } from "@/lib/pdf/service";
import { documentCustomerLabel } from "@/lib/documents/snapshot";
import type { DocumentKind, DocumentStatus, MemberRole } from "@/generated/prisma/client";

const forbidden = () => new AuthFlowError("Votre rôle ne permet pas d’envoyer un document par e-mail.", 403);
const missing = () => new AuthFlowError("Ce document est introuvable.", 404);

const sendableStatuses: Record<DocumentKind, readonly DocumentStatus[]> = {
  QUOTE: ["SENT", "ACCEPTED", "REFUSED"],
  INVOICE: ["SENT"],
  CREDIT_NOTE: ["SENT"],
};

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertSender(role: MemberRole) {
  if (!canSendDocuments(role)) throw forbidden();
}

function isSendable(kind: DocumentKind, status: DocumentStatus) {
  return sendableStatuses[kind]?.includes(status) === true;
}

async function documentForEmail(organizationId: string, documentId: string) {
  const document = await getDb().document.findFirst({
    where: { id: documentId, organizationId, kind: { in: ["QUOTE", "INVOICE", "CREDIT_NOTE"] } },
    include: { customer: { select: { displayName: true, email: true } } },
  });
  if (!document) throw missing();
  return document;
}

export async function getDocumentEmailCompose(organizationId: string, documentId: string) {
  const document = await documentForEmail(organizationId, documentId);
  const copy = defaultDocumentEmailCopy({
    kind: document.kind,
    number: document.number,
    issuerName: document.issuerNameSnapshot || "Mombongo",
    customerName: documentCustomerLabel(document),
  });
  return {
    documentId: document.id,
    kind: document.kind,
    status: document.status,
    sendable: isSendable(document.kind, document.status),
    defaultToEmail: document.customerEmailSnapshot ?? "",
    liveCustomerEmail: document.customer.email,
    subject: copy.subject,
    message: copy.message,
    replyToEmail: document.issuerEmailSnapshot,
  };
}

export async function listDocumentEmailDeliveries(organizationId: string, documentId: string) {
  await documentForEmail(organizationId, documentId);
  return getDb().documentEmailDelivery.findMany({
    where: { organizationId, documentId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      toEmail: true,
      subject: true,
      message: true,
      provider: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      sentAt: true,
    },
  });
}

export async function sendDocumentEmail(role: MemberRole, organizationId: string, body: unknown, userId: string, address: string) {
  assertSender(role);
  await rateLimit("document-email", `${organizationId}:${address}`, 30);
  const input = parse(sendDocumentEmailSchema, body, "Vérifiez le destinataire, le sujet et le message.");
  const document = await documentForEmail(organizationId, input.documentId);
  if (!isSendable(document.kind, document.status)) {
    throw new AuthFlowError("Seul un document émis peut être envoyé par e-mail.", 409);
  }
  const existing = await getDb().documentEmailDelivery.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing && existing.documentId !== document.id) {
    throw new AuthFlowError("Cette demande d’envoi ne correspond pas à ce document.", 409);
  }
  if (existing?.status === "SENT" || existing?.status === "QUEUED") return existing;

  const delivery = existing ?? await getDb().documentEmailDelivery.create({
    data: {
      organizationId,
      documentId: document.id,
      toEmail: input.toEmail,
      replyToEmail: document.issuerEmailSnapshot,
      subject: input.subject,
      message: input.message,
      provider: currentMailProvider(),
      status: "QUEUED",
      sentById: userId,
      idempotencyKey: input.idempotencyKey,
    },
  });

  try {
    const { model, pdf } = await buildOrganizationDocumentPdf(organizationId, document.id);
    const sent = await sendOutboundMail({
      to: input.toEmail,
      subject: input.subject,
      text: input.message,
      replyTo: document.issuerEmailSnapshot ?? undefined,
      attachments: [{ filename: model.filename, content: pdf, contentType: "application/pdf" }],
    }, `document-email-${delivery.id}`);
    return getDb().documentEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        provider: sent.provider,
        providerMessageId: sent.providerMessageId,
        sentAt: new Date(),
        errorCode: null,
        errorMessage: null,
        toEmail: input.toEmail,
        subject: input.subject,
        message: input.message,
      },
    });
  } catch (error) {
    const failed = await getDb().documentEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        errorCode: "MAIL_PROVIDER",
        errorMessage: "L’e-mail n’a pas pu être envoyé. Le document reste inchangé.",
        toEmail: input.toEmail,
        subject: input.subject,
        message: input.message,
      },
    });
    if (error instanceof AuthFlowError) throw error;
    throw new AuthFlowError(failed.errorMessage ?? "L’e-mail n’a pas pu être envoyé.", 502);
  }
}
