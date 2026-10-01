import { roleLabels } from "@mombongo/contracts";
import { requireMembership } from "@/lib/auth/access";
import { canAssignRole, canChangeMembership, canManageTeam } from "@/lib/auth/permissions";
import { listTeam } from "@/lib/auth/team";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "@/components/team/invite-form";
import { MemberRoleForm, RemoveMemberButton, RevokeInvitationButton } from "@/components/team/member-actions";

export default async function TeamPage() {
  const { user, membership } = await requireMembership();
  const team = await listTeam(membership.organizationId);
  const manage = canManageTeam(membership.role);
  const allowedRoles = (["ADMIN", "MEMBER", "ACCOUNTANT"] as const).filter(role => canAssignRole(membership.role, role));
  return (
    <WorkspaceShell business>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Votre entreprise</p>
        <h1 className="mt-3 text-3xl font-semibold">Équipe de {membership.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Les invitations restent valables sept jours. Un compte particulier ne peut pas rejoindre une entreprise avec la même adresse.
        </p>
        {manage && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Inviter un collaborateur</CardTitle>
              <CardDescription>Le destinataire reçoit un lien. S’il n’a pas encore de compte, il le crée depuis ce lien.</CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm allowedRoles={[...allowedRoles]} />
            </CardContent>
          </Card>
        )}
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Membres</h2>
          <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {team.members.map(member => {
              const editable = canChangeMembership(membership.role, member.role);
              const options = allowedRoles.filter(role => canChangeMembership(membership.role, member.role, role));
              return (
                <article key={member.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium">{member.user.name || member.user.email}</h3>
                    <p className="text-sm text-muted-foreground">{member.user.email} · {roleLabels[member.role]}{member.userId === user.id ? " · Vous" : ""}</p>
                  </div>
                  {editable && (
                    <div className="flex flex-wrap items-center gap-3">
                      <MemberRoleForm membershipId={member.id} role={member.role} options={options} />
                      <RemoveMemberButton membershipId={member.id} name={member.user.name || member.user.email} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Invitations en attente</h2>
          {team.invitations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucune invitation en cours.</p>
          ) : (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {team.invitations.map(invitation => (
                <article key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">{invitation.email} · {roleLabels[invitation.role]}</p>
                  {manage && canAssignRole(membership.role, invitation.role) && (
                    <RevokeInvitationButton invitationId={invitation.id} email={invitation.email} />
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
