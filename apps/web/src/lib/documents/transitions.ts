import { AuthFlowError } from "@/lib/auth/rate-limit";
import type { DocumentKind, DocumentStatus } from "@/generated/prisma/client";

const allowed: Record<DocumentKind, Partial<Record<DocumentStatus, readonly DocumentStatus[]>>> = {
  QUOTE: {
    DRAFT: ["SENT", "CANCELLED"],
    SENT: ["ACCEPTED", "REFUSED", "CANCELLED"],
  },
  INVOICE: {
    DRAFT: ["SENT", "CANCELLED"],
  },
  CREDIT_NOTE: {
    DRAFT: ["SENT"],
  },
};

export function canTransitionDocument(kind: DocumentKind, from: DocumentStatus, to: DocumentStatus) {
  return (allowed[kind][from] ?? []).includes(to);
}

export function assertDocumentTransition(kind: DocumentKind, from: DocumentStatus, to: DocumentStatus) {
  if (canTransitionDocument(kind, from, to)) return;
  if (kind === "INVOICE" && from === "SENT" && to === "CANCELLED") {
    throw new AuthFlowError("Une facture émise se corrige par un avoir, pas par une annulation de statut.", 409);
  }
  throw new AuthFlowError("Cette transition d’état n’est pas autorisée.", 409);
}
