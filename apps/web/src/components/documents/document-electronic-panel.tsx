import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { ElectronicInvoiceInspection } from "@/lib/einvoice/service";

const routeLabels = {
  E_INVOICING: "e-invoicing (préparé, non transmis)",
  E_REPORTING: "e-reporting (préparé, non transmis)",
  OUT_OF_SCOPE: "hors périmètre d’envoi",
  REVIEW_REQUIRED: "revue requise",
} as const;

const marketLabels = {
  B2B_FR: "B2B France",
  B2C_FR: "B2C France",
  B2B_INTL: "B2B international",
  B2C_INTL: "B2C international",
  UNKNOWN: "qualification inconnue",
} as const;

export function DocumentFacturXLink({ documentId, available }: { documentId: string; available: boolean }) {
  if (!available) return null;
  return (
    <Button asChild variant="outline">
      <a href={`/api/v1/documents/${documentId}/factur-x`}>Télécharger le Factur-X</a>
    </Button>
  );
}

export function DocumentElectronicNotice({ inspection }: { inspection: ElectronicInvoiceInspection }) {
  const route = inspection.model?.context.route;
  const market = inspection.model?.context.market;
  const errors = inspection.issues.filter(item => item.severity === "error");
  const validators = inspection.validation?.validators.filter(item => item.status !== "skipped") ?? [];
  return (
    <div className="mt-4 space-y-3">
      {route && market && (
        <p className="text-sm text-muted-foreground">
          Facture électronique : {marketLabels[market]} · {routeLabels[route]}. Profil Factur-X EN 16931. La classification n’envoie rien ; la transmission est un cycle séparé.
        </p>
      )}
      {inspection.available && (
        <Alert>
          Validation technique réussie
          {validators.length > 0 ? ` (${validators.map(item => item.name).join(", ")}).` : "."}
          {" "}Ce n’est pas une attestation de conformité DGFiP, Factur-X ou EN 16931.
        </Alert>
      )}
      {errors.length > 0 && (
        <Alert variant="warning">
          Le PDF humain reste disponible. Le Factur-X est refusé : {errors.map(item => item.message).join(" ")}
        </Alert>
      )}
    </div>
  );
}
