import Link from "next/link";
import { requireMembership } from "@/lib/auth/access";
import { canWriteCustomers } from "@/lib/auth/permissions";
import { listPipeline } from "@/lib/customers/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { KanbanBoard } from "@/components/customers/kanban-board";

export default async function PipelinePage() {
  const { membership } = await requireMembership();
  const columns = await listPipeline(membership.organizationId);
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-[88rem] px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Pipeline de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Déplacez un prospect d’étape en étape. « Gagné » le convertit en client sans créer de doublon.
          {" "}<Link href="/espace/clients?type=PROSPECT" className="text-primary hover:underline">Voir la liste</Link>
        </p>
        <div className="mt-8">
          <KanbanBoard columns={columns} writable={canWriteCustomers(membership.role)} />
        </div>
      </main>
    </WorkspaceShell>
  );
}
