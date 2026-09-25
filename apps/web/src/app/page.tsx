import Link from "next/link";
import { CalendarDays, Check, CircleHelp, FileText, Layers, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Guide } from "@/components/marketing/guide";

const modules = [
  { title: "Facturation électronique", text: "Préparer, suivre et transmettre vos factures depuis un même espace.", icon: FileText },
  { title: "Notes de frais", text: "Centraliser les justificatifs et simplifier les validations.", icon: Receipt },
  { title: "Prospects & clients", text: "Retrouver vos contacts, leurs adresses et vos prochaines actions.", icon: Users },
  { title: "Rendez-vous", text: "Organiser vos disponibilités et suivre vos rendez-vous.", icon: CalendarDays },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <Layers className="text-emerald-700" />facturia<span className="text-emerald-600">.</span>
          </Link>
          <Link href="/connexion" className="text-sm font-medium text-primary hover:underline">Se connecter</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="mb-6 flex items-center gap-2 text-sm font-medium text-primary">
          <span className="h-2 w-2 rounded-full bg-emerald-600" /> POUR LES PARTICULIERS ET LES ENTREPRISES
        </div>
        <section className="grid gap-10 md:grid-cols-[1.5fr_1fr] md:items-center">
          <div>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Moins de gestion.<br /><span className="text-emerald-700">Plus de possibilités.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Vos factures du quotidien ou la gestion de votre entreprise. Choisissez votre espace pour retrouver bientôt vos documents et vos paiements, sur le web et sur mobile.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Guide />
              <Button asChild variant="outline">
                <Link href="/inscription">Créer mon espace</Link>
              </Button>
            </div>
          </div>
          <aside className="rounded-2xl bg-emerald-950 p-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Une base commune</p>
            <h2 className="mt-3 text-2xl font-semibold">Vos besoins.<br />Votre espace.</h2>
            <ul className="mt-6 space-y-4 text-sm text-emerald-50">
              {["Particulier ou entreprise, un espace adapté", "Abonnement ou paiement au service", "Web d’abord, Android puis iOS"].map(item => (
                <li key={item} className="flex gap-3"><Check size={18} className="shrink-0 text-emerald-300" />{item}</li>
              ))}
            </ul>
            <p className="mt-8 border-t border-emerald-800 pt-5 text-xs leading-relaxed text-emerald-200">
              Le socle est en cours de construction. Les fonctionnalités métier et les paiements ne sont pas encore activés.
            </p>
          </aside>
        </section>
        <section className="mt-12 rounded-2xl border border-emerald-200 bg-accent p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Pour les particuliers</p>
          <h2 className="mt-3 text-2xl font-semibold">Vos factures, en toute simplicité.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Un espace personnel pour retrouver vos factures, suivre les échéances et, bientôt, régler les factures éligibles. Créez dès maintenant votre compte particulier ; les fonctions de paiement sont à venir.
          </p>
          <Link href="/inscription" className="mt-5 inline-flex text-sm font-semibold text-primary underline underline-offset-4">Choisir mon espace</Link>
        </section>
        <section className="mt-16">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold">Pour les entreprises</h2>
            <span className="text-xs text-muted-foreground">Modules à venir</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(({ title, text, icon: Icon }) => (
              <Card key={title}>
                <CardContent className="p-6">
                  <Icon size={24} className="mb-6 text-emerald-700" />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
                  <span className="mt-6 inline-block rounded bg-muted px-2 py-1 text-xs text-slate-600">Planifié</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
        <p className="mt-10 flex gap-2 text-sm text-muted-foreground">
          <CircleHelp size={18} className="shrink-0" />
          Créez votre compte pour accéder à votre espace. Les modules métier et les paiements arrivent ensuite.
        </p>
      </main>
    </div>
  );
}
