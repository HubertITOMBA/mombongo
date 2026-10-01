import Link from "next/link";
import { addressTypeLabels, countryLabels, type CountryCode } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canManageOrganizationProfile } from "@/lib/auth/permissions";
import { getOrganizationProfile } from "@/lib/organizations/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { OrganizationIdentityForm } from "@/components/organizations/organization-identity-form";
import { AddressForm, RemoveAddressButton } from "@/components/customers/address-form";

export default async function OrganizationIdentityPage() {
  const { membership } = await requireMembership();
  const writable = canManageOrganizationProfile(membership.role);
  const organization = await getOrganizationProfile(membership.organizationId);
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          <Link href="/espace" className="hover:underline">Espace</Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Identité de {organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Ces informations décrivent l’émetteur. Elles n’appartiennent ni au compte utilisateur, ni à une fiche client.
          Les documents déjà émis conservent leur snapshot.
        </p>
        {!writable && (
          <Alert className="mt-6">Seul le propriétaire ou un administrateur peut modifier l’identité légale de l’entreprise.</Alert>
        )}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Identité commerciale, légale et fiscale</CardTitle>
            <CardDescription>Un prospect ou un client incomplet reste possible ailleurs. Ici, renseignez l’émetteur progressivement.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationIdentityForm values={organization} locked={!writable} />
          </CardContent>
        </Card>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Intégrations</CardTitle>
            <CardDescription>
              La connexion à une plateforme agréée et les prestataires de paiement se configurent dans{" "}
              <Link href="/espace/integrations" className="text-primary hover:underline">Intégrations</Link>.
              Mombongo n’est pas une plateforme agréée.
            </CardDescription>
          </CardHeader>
        </Card>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Adresses de l’émetteur</h2>
          <p className="mt-2 text-sm text-muted-foreground">Facturation et livraison peuvent différer. Ces adresses n’appartiennent à aucune fiche client.</p>
          {organization.addresses.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">Aucune adresse d’émetteur pour le moment.</p>
          )}
          <div className="mt-4 space-y-4">
            {organization.addresses.map(address => (
              <Card key={address.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{address.label}</CardTitle>
                    <CardDescription>
                      {addressTypeLabels[address.type]} · {address.city} · {countryLabels[address.countryCode as CountryCode] ?? address.countryCode}
                    </CardDescription>
                  </div>
                  {writable && <RemoveAddressButton addressId={address.id} label={address.label} organizationOwned />}
                </CardHeader>
                <CardContent>
                  <AddressForm values={address} locked={!writable} organizationOwned />
                </CardContent>
              </Card>
            ))}
          </div>
          {writable && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Ajouter une adresse</CardTitle>
                <CardDescription>Facturation, livraison, bureau ou autre.</CardDescription>
              </CardHeader>
              <CardContent>
                <AddressForm organizationOwned />
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
