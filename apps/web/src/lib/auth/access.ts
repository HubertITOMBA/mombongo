import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";

export async function requireAccount() {
  const session = await auth();
  if (!session?.user?.id) redirect("/connexion");
  // Le type du compte est relu en base ; aucun champ du navigateur ne décide des accès.
  const user = await getDb().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, accountType: true },
  });
  if (!user) redirect("/connexion");
  return user;
}
export async function requireMembership() {
  const user = await requireAccount();
  if (user.accountType !== "BUSINESS") redirect("/espace");
  const membership = await getDb().membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { organization: true } });
  if (!membership) redirect("/connexion?error=membership");
  return { user, membership };
}
