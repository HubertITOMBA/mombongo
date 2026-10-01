import type { ReactNode } from "react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Building2, CalendarDays, Columns3, ContactRound, FileText, LogOut, Package, Plug, Receipt, Users } from "lucide-react";
import { BrandMarkImage } from "@/components/brand";
import { ActiveOrganizationSync } from "./active-organization-sync";
import { OrganizationSwitcher } from "./organization-switcher";
import { listAccessibleOrganizations } from "@/lib/auth/organization";
import { clearActiveOrganizationCookie, readActiveOrganizationCookie } from "@/lib/auth/organization-cookie";

export async function WorkspaceShell({
  children,
  business,
}: {
  children: ReactNode;
  business?: boolean;
}) {
  const workspace = business ? await loadWorkspaceOrganizations() : null;
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-6">
            <Link href="/" aria-label="Mombongo" className="flex shrink-0 items-center">
              <BrandMarkImage className="h-14" />
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <Link href="/espace" className="text-muted-foreground hover:text-primary">Espace</Link>
              {business && (
                <>
                  <Link href="/espace/clients" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <ContactRound size={16} />Clients
                  </Link>
                  <Link href="/espace/pipeline" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Columns3 size={16} />Pipeline
                  </Link>
                  <Link href="/espace/agenda" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <CalendarDays size={16} />Agenda
                  </Link>
                  <Link href="/espace/devis" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <FileText size={16} />Devis
                  </Link>
                  <Link href="/espace/catalogue" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Package size={16} />Catalogue
                  </Link>
                  <Link href="/espace/factures" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Receipt size={16} />Factures
                  </Link>
                  <Link href="/espace/equipe" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Users size={16} />Équipe
                  </Link>
                  <Link href="/espace/organisation" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Building2 size={16} />Organisation
                  </Link>
                  <Link href="/espace/integrations" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Plug size={16} />Intégrations
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {workspace?.activeOrganizationId && (
              <>
                {workspace.needsPersist && <ActiveOrganizationSync organizationId={workspace.activeOrganizationId} />}
                <OrganizationSwitcher
                  organizations={workspace.organizations}
                  activeOrganizationId={workspace.activeOrganizationId}
                />
              </>
            )}
            <form action={async () => {
              "use server";
              await clearActiveOrganizationCookie();
              await signOut({ redirectTo: "/connexion" });
            }}>
              <Button type="submit" variant="outline"><LogOut size={16} />Se déconnecter</Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

async function loadWorkspaceOrganizations() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const organizations = await listAccessibleOrganizations(session.user.id);
  const requested = await readActiveOrganizationCookie();
  const active = organizations.find(item => item.id === requested) ?? organizations[0] ?? null;
  return {
    organizations,
    activeOrganizationId: active?.id ?? null,
    needsPersist: Boolean(active && requested !== active.id),
  };
}
