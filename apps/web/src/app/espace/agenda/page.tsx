import Link from "next/link";
import { appointmentStatusLabels, customerDisplayName, formatDate, formatDateTime } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canWriteAppointments } from "@/lib/auth/permissions";
import { listAppointments } from "@/lib/appointments/service";
import { listCustomers } from "@/lib/customers/service";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { CancelAppointmentButton } from "@/components/appointments/cancel-appointment-button";

function dayLabel(value: Date) {
  return formatDate(value);
}

export default async function AgendaPage() {
  const { membership } = await requireMembership();
  const writable = canWriteAppointments(membership.role);
  const [appointments, customers] = await Promise.all([
    listAppointments(membership.organizationId),
    listCustomers(membership.organizationId, { status: "ACTIVE" }),
  ]);
  const groups = appointments.reduce<Record<string, typeof appointments>>((acc, item) => {
    const key = dayLabel(item.startsAt);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Agenda de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Les créneaux se chevauchant sont refusés, y compris s’ils sont posés en même temps.
          Les créneaux qui se touchent restent possibles.
          {" "}<Link href="/espace/clients" className="text-primary hover:underline">Voir les fiches</Link>
        </p>
        {writable && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Nouveau rendez-vous</CardTitle>
              <CardDescription>Liez éventuellement un prospect ou un client. Le créneau est stocké en UTC.</CardDescription>
            </CardHeader>
            <CardContent>
              <AppointmentForm customers={customers.map(item => ({ id: item.id, displayName: customerDisplayName(item) }))} />
            </CardContent>
          </Card>
        )}
        <section className="mt-10">
          <h2 className="text-xl font-semibold">À venir</h2>
          {appointments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun rendez-vous à venir.</p>
          ) : (
            <div className="mt-4 space-y-8">
              {Object.entries(groups).map(([day, items]) => (
                <div key={day}>
                  <h3 className="text-sm font-semibold capitalize text-emerald-800">{day}</h3>
                  <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
                    {items.map(item => (
                      <article key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                            {formatDateTime(item.startsAt)} – {formatDateTime(item.endsAt).slice(-5)}
                          </p>
                          <h4 className="mt-1 font-medium">{item.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            {appointmentStatusLabels[item.status]}
                            {item.customer ? <> · <Link href={`/espace/clients/${item.customer.id}`} className="text-primary hover:underline">{customerDisplayName(item.customer)}</Link></> : " · Sans fiche"}
                            {item.location ? ` · ${item.location}` : ""}
                          </p>
                        </div>
                        {writable && <CancelAppointmentButton appointmentId={item.id} title={item.title} />}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
