import Link from "next/link";
import { signOut } from "@/auth";
import { requireAccount, requireMembership } from "@/lib/auth/access";
import { Button } from "@/components/ui/button";
import { Bell, CalendarDays, CreditCard, FileText, Layers, LogOut, Receipt, ShieldCheck, Users } from "lucide-react";

const businessModules = [
  { title: "Facturation", description: "Vos documents et leur suivi.", icon: FileText },
  { title: "Notes de frais", description: "Vos justificatifs et validations.", icon: Receipt },
  { title: "Clients et prospects", description: "Vos contacts et leurs adresses.", icon: Users },
  { title: "Rendez-vous", description: "Vos disponibilités et réservations.", icon: CalendarDays },
];
const individualModules = [
  { title: "Mes factures", description: "Retrouver vos factures reçues et suivre celles qui restent à régler.", icon: FileText },
  { title: "Mes paiements", description: "Régler les factures éligibles et retrouver vos justificatifs de paiement.", icon: CreditCard },
  { title: "Mes échéances", description: "Visualiser les dates de paiement et anticiper vos prochaines dépenses.", icon: CalendarDays },
  { title: "Mes rappels", description: "Être informé avant l’échéance d’une facture.", icon: Bell },
];
export default async function WorkspacePage() {
  const user = await requireAccount();
  const personal = user.accountType === "INDIVIDUAL";
  const membership = personal ? null : (await requireMembership()).membership;
  const modules = personal ? individualModules : businessModules;
  return <div className="min-h-screen">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold"><Layers className="text-emerald-700" />facturia.</Link>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/connexion" }); }}><Button type="submit" variant="outline"><LogOut size={16} />Se déconnecter</Button></form>
    </div></header>
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-700">{personal ? "Votre espace particulier" : "Votre espace entreprise"}</p>
      <h1 className="mt-3 text-3xl font-semibold">Bonjour {user.name || "et bienvenue"}.</h1>
      {personal ? <p className="mt-3 text-slate-500">Votre espace personnel est prêt pour accueillir vos factures du quotidien.</p> : <p className="mt-3 text-slate-500">Votre espace <strong className="font-medium text-slate-700">{membership!.organization.name}</strong> est prêt.</p>}
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex min-w-0 gap-3"><ShieldCheck className="shrink-0 text-emerald-700" /><div className="min-w-0"><h2 className="font-semibold text-emerald-950">Connexion vérifiée</h2><p className="mt-1 break-words text-sm text-emerald-800">{user.email} · {personal ? "Particulier" : membership!.role === "OWNER" ? "Propriétaire" : "Collaborateur"}</p></div></div>
        <span className="rounded-full bg-white px-3 py-1 text-xs text-emerald-800">Aucun abonnement actif</span>
      </section>
      <section className="mt-12">
        <h2 className="text-xl font-semibold">{personal ? "Vos factures du quotidien" : "Votre activité, au même endroit"}</h2>
        <p className="mt-2 text-sm text-slate-500">{personal ? "Votre compte est créé. L’ajout de factures et leur paiement seront disponibles dans une prochaine étape." : "Les prochains modules apparaîtront ici au fil du développement."}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{modules.map(({ title, description, icon: Icon }) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-6"><Icon className="mb-5 text-emerald-700" size={24} /><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-slate-500">{description}</p><span className="mt-5 inline-block rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">À venir</span></article>)}</div>
      </section>
    </main>
  </div>;
}
