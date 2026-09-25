"use client";
import { useState } from "react";
import { ArrowUpRight, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const topics = [
  { label: "Les modules", answer: "Pour les particuliers : factures reçues, paiements et échéances. Pour les entreprises : facturation, frais, prospects et rendez-vous. Ces modules sont encore à développer." },
  { label: "Les tarifs", answer: "Un abonnement mensuel et une facturation au service sont prévus. Les tarifs ne sont pas encore définis et aucun paiement n’est possible actuellement." },
  { label: "La connexion", answer: "Choisissez Particulier ou Entreprise dans « Créer mon espace », puis validez le code à six chiffres. Pour revenir, utilisez « Se connecter » avec votre email et votre mot de passe." },
] as const;

export function Guide() {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("Bonjour ! Je suis le guide de cette première version. Choisissez un sujet pour découvrir Facturia.");
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Découvrir avec le guide <ArrowUpRight size={16} />
      </Button>
      <Button type="button" aria-expanded={open} aria-controls="guide" className="fixed right-6 bottom-6 shadow-lg" onClick={() => setOpen(value => !value)}>
        <MessageCircle size={18} />Guide Facturia
      </Button>
      {open && (
        <section id="guide" aria-label="Guide Facturia" className="fixed right-4 bottom-20 z-10 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Votre guide</h2>
            <button type="button" aria-label="Fermer le guide" className="rounded p-2 hover:bg-muted" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <p aria-live="polite" className="rounded-xl bg-muted p-4 text-sm leading-relaxed">{answer}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {topics.map(topic => (
              <Button key={topic.label} type="button" size="sm" variant="outline" onClick={() => setAnswer(topic.answer)}>{topic.label}</Button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Guide à réponses prédéfinies • Sans IA pour le moment</p>
        </section>
      )}
    </>
  );
}
