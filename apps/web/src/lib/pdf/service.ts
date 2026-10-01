import { documentIdInputSchema } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import { buildDocumentPrintModel } from "./model";
import { renderDocumentPdf } from "./render";

const missing = () => new AuthFlowError("Ce document est introuvable.", 404);

export async function getPrintableDocument(organizationId: string, documentId: string) {
  const parsed = documentIdInputSchema.safeParse({ documentId });
  if (!parsed.success) throw missing();
  const document = await getDb().document.findFirst({
    where: {
      id: parsed.data.documentId,
      organizationId,
      kind: { in: ["QUOTE", "INVOICE", "CREDIT_NOTE"] },
    },
    include: {
      lines: { orderBy: { position: "asc" } },
      creditedInvoice: { select: { id: true, number: true, issuedAt: true } },
    },
  });
  if (!document) throw missing();
  return document;
}

export function isDocumentPrintable(document: { kind: string; status: string }) {
  return document.kind === "QUOTE" || document.kind === "INVOICE" || document.kind === "CREDIT_NOTE";
}

export async function buildOrganizationDocumentPdf(organizationId: string, documentId: string) {
  const document = await getPrintableDocument(organizationId, documentId);
  const model = buildDocumentPrintModel(document);
  const pdf = await renderDocumentPdf(model);
  return { document, model, pdf };
}
