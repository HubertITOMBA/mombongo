import { AuthFlowError } from "@/lib/auth/rate-limit";
import { customerDisplayName } from "@mombongo/contracts";

type IssueCustomer = {
  status: "ACTIVE" | "ARCHIVED";
  partyKind: "PERSON" | "COMPANY" | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  tradeName: string | null;
};

type IssueLine = { htCents: number };

export function validateDocumentForIssue(input: {
  kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE";
  customer: IssueCustomer;
  lines: IssueLine[];
  issuerName: string;
  skipLiveCustomer?: boolean;
}) {
  if (!input.skipLiveCustomer && input.customer.status === "ARCHIVED") {
    throw new AuthFlowError("Cette fiche est archivée. Restaurez-la pour émettre le document.");
  }
  if (input.lines.length === 0) {
    throw new AuthFlowError(input.kind === "QUOTE" ? "Ajoutez au moins une ligne avant d’envoyer le devis." : input.kind === "CREDIT_NOTE" ? "Ajoutez au moins une ligne à créditer." : "Ce devis n’a aucune ligne à facturer.");
  }
  if (input.lines.every(line => line.htCents <= 0)) {
    throw new AuthFlowError("Le document doit contenir un montant HT positif.");
  }
  if (!input.issuerName.trim()) {
    throw new AuthFlowError("L’émetteur n’a pas de nom affichable.");
  }
  const customerName = customerDisplayName(input.customer);
  if (customerName.trim().length < 2) {
    throw new AuthFlowError("Le destinataire n’a pas de nom affichable.");
  }
  if (input.customer.partyKind === "PERSON") return;
}
