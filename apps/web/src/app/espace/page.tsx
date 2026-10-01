import Link from "next/link";
import { requireAccount, requireMembership } from "@/lib/auth/access";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { roleLabels } from "@mombongo/contracts";
import { Bell, CalendarDays, CreditCard, FileText, Package, Receipt, ShieldCheck, Users } from "lucide-react";

const businessModules = [
  { title: "Facturation", description: "Devis, puis factures numérotées depuis un devis accepté.", icon: FileText, href: "/espace/devis" },
  { title: "Factures émises", description: "Documents FA-AAAA-NNNN créés à partir d’un devis accepté.", icon: Receipt, href: "/espace/factures" },
  { title: "Produits & Services", description: "Catalogue réutilisable pour préremplir une ligne de devis.", icon: Package, href: "/espace/catalogue" },
  { title: "Notes de frais", description: "Vos justificatifs et validations.", icon: Receipt, href: undefined },
  { title: "Clients et prospects", description: "Vos contacts, leurs adresses et le pipeline.", icon: Users, href: "/espace/pipeline" },
  { title: "Rendez-vous", description: "Vos disponibilités et réservations.", icon: CalendarDays, href: "/espace/agenda" },
];
const individualModules = [
  { title: "Mes factures", description: "Retrouver vos factures reçues et suivre celles qui restent à régler.", icon: FileText, href: undefined },
  { title: "Mes paiements", description: "Régler les factures éligibles et retrouver vos justificatifs de paiement.", icon: CreditCard, href: undefined },
  { title: "Mes échéances", description: "Visualiser les dates de paiement et anticiper vos prochaines dépenses.", icon: CalendarDays, href: undefined },
  { title: "Mes rappels", description: "Être informé avant l’échéance d’une facture.", icon: Bell, href: undefined },
];

export default async function WorkspacePage() {
  const user = await requireAccount();
  const personal = user.accountType === "INDIVIDUAL";
  const membership = personal ? null : (await requireMembership()).membership;
  const modules = personal ? individualModules : businessModules;
  return (
    <WorkspaceShell business={!personal}>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">{personal ? "Votre espace particulier" : "Votre espace entreprise"}</p>
        <h1 className="mt-3 text-3xl font-semibold">Bonjour {user.name || "et bienvenue"}.</h1>
        {personal
          ? <p className="mt-3 text-muted-foreground">Votre espace personnel est prêt pour accueillir vos factures du quotidien.</p>
          : <p className="mt-3 text-muted-foreground">Votre espace <strong className="font-medium text-foreground">{membership!.organization.name}</strong> est prêt.</p>}
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-accent p-6">
          <div className="flex min-w-0 gap-3">
            <ShieldCheck className="shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <h2 className="font-semibold text-emerald-950">Connexion vérifiée</h2>
              <p className="mt-1 break-words text-sm text-emerald-800">{user.email} · {personal ? "Particulier" : roleLabels[membership!.role]}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!personal && <Link href="/espace/organisation" className="text-sm font-medium text-primary hover:underline">Identité de l’émetteur</Link>}
            {!personal && <Link href="/espace/equipe" className="text-sm font-medium text-primary hover:underline">Gérer l’équipe</Link>}
            <span className="rounded-full bg-card px-3 py-1 text-xs text-emerald-800">Aucun abonnement actif</span>
          </div>
        </section>
        <section className="mt-12">
          <h2 className="text-xl font-semibold">{personal ? "Vos factures du quotidien" : "Votre activité, au même endroit"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{personal ? "Votre compte est créé. L’ajout de factures et leur paiement seront disponibles dans une prochaine étape." : "Les invitations, les fiches, l’agenda, le catalogue, les devis et les factures émises sont disponibles."}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(({ title, description, icon: Icon, href }) => {
              const inner = (
                <>
                  <Icon className="mb-5 text-emerald-700" size={24} />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                  <span className={`mt-5 inline-block rounded px-2 py-1 text-xs ${href ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{href ? "Disponible" : "À venir"}</span>
                </>
              );
              return href
                ? <Link key={title} href={href} className="rounded-xl border border-border bg-card p-6 hover:border-emerald-200">{inner}</Link>
                : <article key={title} className="rounded-xl border border-border bg-card p-6">{inner}</article>;
            })}
          </div>
        </section>
      </main>
    </WorkspaceShell>
  );
}
