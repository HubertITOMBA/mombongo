import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationForm } from "@/components/team/invitation-form";

export const metadata: Metadata = { title: "Invitation — Mombongo", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function InvitationPage() {
  const local = process.env.MAIL_TRANSPORT === "local" && process.env.NODE_ENV !== "production";
  return (
    <AuthShell title="Rejoindre une entreprise" description="Ce lien confirme votre invitation. Aucun abonnement n’est créé à cette étape.">
      {local && <p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Mode local : le lien d’invitation se lit avec <code>npm run mail:local</code>.</p>}
      <InvitationForm />
    </AuthShell>
  );
}
