"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { customerDisplayName, pipelineStageLabels, pipelineStages } from "@mombongo/contracts";
import { changeStageAction } from "@/lib/customers/actions";
import { Alert } from "@/components/ui/alert";
import { FieldSelect } from "@/components/ui/field-select";
import { Button } from "@/components/ui/button";

type Card = {
  id: string;
  partyKind?: "PERSON" | "COMPANY" | null;
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  displayName: string;
  email: string | null;
  estimatedCents: number | null;
  nextAction: string | null;
  owner: { name: string | null; email: string } | null;
};

export function KanbanBoard({ columns, writable }: { columns: Record<string, Card[]>; writable: boolean }) {
  const [state, action, pending] = useActionState(changeStageAction, undefined);
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {state?.error && <Alert variant="destructive">{state.error}</Alert>}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {pipelineStages.map(stage => (
          <section
            key={stage}
            className="w-72 shrink-0 rounded-xl border border-border bg-muted/40 p-3"
            onDragOver={event => writable && event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              const customerId = event.dataTransfer.getData("text/plain") || dragId;
              if (!customerId || !writable) return;
              const form = event.currentTarget.querySelector<HTMLFormElement>(`form[data-drop="${stage}"]`);
              form?.requestSubmit();
            }}
          >
            <h2 className="px-1 text-sm font-semibold">{pipelineStageLabels[stage]} <span className="text-muted-foreground">({columns[stage]?.length ?? 0})</span></h2>
            <form action={action} data-drop={stage} className="hidden">
              <input type="hidden" name="customerId" value={dragId ?? ""} />
              <input type="hidden" name="stage" value={stage} />
            </form>
            <div className="mt-3 space-y-3">
              {(columns[stage] ?? []).map(card => (
                <article
                  key={card.id}
                  draggable={writable}
                  onDragStart={event => {
                    setDragId(card.id);
                    event.dataTransfer.setData("text/plain", card.id);
                  }}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <Link href={`/espace/clients/${card.id}`} className="font-medium hover:text-primary hover:underline">{customerDisplayName(card)}</Link>
                  <p className="mt-1 text-xs text-muted-foreground">{card.email || card.owner?.name || "Sans responsable"}</p>
                  {card.nextAction && <p className="mt-2 text-xs">{card.nextAction}</p>}
                  {card.estimatedCents != null && <p className="mt-1 text-xs text-emerald-800">{(card.estimatedCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>}
                  {writable && (
                    <form action={action} className="mt-3 flex gap-2">
                      <input type="hidden" name="customerId" value={card.id} />
                      <FieldSelect name="stage" defaultValue={stage} className="h-9" aria-label={`Étape de ${customerDisplayName(card)}`}>
                        {pipelineStages.map(option => <option key={option} value={option}>{pipelineStageLabels[option]}</option>)}
                      </FieldSelect>
                      <Button type="submit" size="sm" variant="outline" disabled={pending}>OK</Button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
