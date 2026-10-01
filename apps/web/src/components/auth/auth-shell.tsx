import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandLogo, BrandMarkImage } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-10 lg:grid-cols-2">
      <section className="hidden lg:block">
        <Link href="/" aria-label="Mombongo" className="mb-10 block max-w-xs">
          <BrandLogo priority className="max-w-72" />
        </Link>
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Vos factures, simplement</p>
        <h1 className="mt-5 text-5xl font-semibold leading-tight">
          Un espace pour<br />simplifier<br /><span className="text-emerald-700">votre quotidien.</span>
        </h1>
        <p className="mt-6 max-w-sm leading-relaxed text-muted-foreground">
          Particulier ou entreprise, choisissez un espace adapté à vos besoins : vos factures du quotidien ou la gestion de votre activité.
        </p>
        <div className="mt-10 flex max-w-sm gap-3 rounded-xl bg-accent p-4 text-sm text-emerald-900">
          <ShieldCheck className="shrink-0" size={22} />
          <p>Votre connexion est validée par un code à six chiffres après la saisie de votre mot de passe.</p>
        </div>
      </section>
      <Card className="w-full max-w-lg justify-self-center rounded-2xl shadow-sm">
        <CardContent className="p-6 sm:p-10">
          <Link href="/" aria-label="Mombongo" className="mb-6 inline-flex items-center lg:hidden">
            <BrandMarkImage className="h-16" />
          </Link>
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft size={16} />Retour à l’accueil
          </Link>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
        </CardContent>
      </Card>
    </main>
  );
}
