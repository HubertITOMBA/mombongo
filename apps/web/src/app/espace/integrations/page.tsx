import Link from "next/link";
import { requireMembership } from "@/lib/auth/access";
import { canManageElectronicInvoicing, canManagePaymentIntegrations } from "@/lib/auth/permissions";
import { getIntegrationsOverview } from "@/lib/integrations/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ElectronicInvoicingConnectionForm } from "@/components/einvoice/connection-form";
import { ComingSoonPaymentCard } from "@/components/integrations/coming-soon-payment-card";

export default async function IntegrationsPage() {
  const { membership } = await requireMembership();
  const canConfigurePa = canManageElectronicInvoicing(membership.role);
  const canConfigurePayments = canManagePaymentIntegrations(membership.role);
  const overview = await getIntegrationsOverview(membership.organizationId);
  const mock = overview.electronic.find(item => item.key === "MOCK");
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href="/espace" className="hover:underline">Espace</Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Intégrations</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Les connecteurs proposés ici sont ceux que Mombongo sait gérer. Une organisation ne peut pas inventer un fournisseur en saisissant une URL.
          La facturation électronique et les paiements restent deux familles distinctes.
        </p>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Facturation électronique</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Mombongo est une solution compatible. Une plateforme agréée est un opérateur réglementaire externe.
          </p>
          {!canConfigurePa && (
            <Alert className="mt-4">Seul le propriétaire ou un administrateur peut configurer la connexion.</Alert>
          )}
          {mock && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>{mock.displayName}</CardTitle>
                <CardDescription>Connecteur interne de test. Ce n’est pas une plateforme agréée.</CardDescription>
              </CardHeader>
              <CardContent>
                <ElectronicInvoicingConnectionForm
                  descriptor={mock}
                  values={overview.electronicConnection}
                  locked={!canConfigurePa}
                />
              </CardContent>
            </Card>
          )}
        </section>
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Paiements</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            L’encaissement manuel reste distinct. Le moyen de paiement n’est pas un connecteur. Stripe et PayPal ne sont pas branchés.
          </p>
          {!canConfigurePayments && (
            <Alert className="mt-4">Seul le propriétaire ou un administrateur peut gérer les prestataires de paiement.</Alert>
          )}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {overview.payments.map(descriptor => (
              <Card key={descriptor.key}>
                <CardHeader>
                  <CardTitle>{descriptor.displayName}</CardTitle>
                  <CardDescription>{descriptor.availability === "coming_soon" ? "Bientôt disponible" : descriptor.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ComingSoonPaymentCard descriptor={descriptor} locked={!canConfigurePayments} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </WorkspaceShell>
  );
}
