import { appointmentIdInputSchema, createAppointmentSchema, formatDateTime } from "@mombongo/contracts";
import { getDb } from "@/lib/db";
import { AuthFlowError, rateLimit } from "@/lib/auth/rate-limit";
import { canWriteAppointments } from "@/lib/auth/permissions";
import type { AppointmentStatus, MemberRole } from "@/generated/prisma/client";

const forbidden = () => new AuthFlowError("Votre rôle ne permet pas de modifier l’agenda.", 403);
const missing = () => new AuthFlowError("Ce rendez-vous est introuvable.", 404);
const openStatuses: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];
type AppointmentStore = Pick<ReturnType<typeof getDb>, "appointment" | "customer" | "customerActivity">;

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, body: unknown, message: string): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new AuthFlowError(message);
  return input.data;
}

function assertWriter(role: MemberRole) {
  if (!canWriteAppointments(role)) throw forbidden();
}

function parseStartsAt(value: string) {
  const french = /^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})$/.exec(value);
  const normalized = french
    ? `${french[3]}-${french[2]}-${french[1]}T${french[4]}:${french[5]}:00`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new AuthFlowError("La date du rendez-vous est invalide.");
  if (date.getTime() < Date.now() - 60_000) throw new AuthFlowError("Choisissez un créneau à venir.");
  return date;
}

async function lockAgenda(tx: { $executeRaw: ReturnType<typeof getDb>["$executeRaw"] }, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
}

async function assertNoOverlap(tx: AppointmentStore, organizationId: string, startsAt: Date, endsAt: Date, appointmentId?: string) {
  const clash = await tx.appointment.findFirst({
    where: {
      organizationId,
      status: { in: openStatuses },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(appointmentId ? { id: { not: appointmentId } } : {}),
    },
    select: { id: true, title: true, startsAt: true },
  });
  if (clash) throw new AuthFlowError("Ce créneau chevauche un rendez-vous déjà planifié.");
}

async function assertCustomer(tx: AppointmentStore, organizationId: string, customerId?: string) {
  if (!customerId) return null;
  const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) throw new AuthFlowError("La fiche liée à ce rendez-vous est introuvable.", 404);
  if (customer.status === "ARCHIVED") throw new AuthFlowError("Cette fiche est archivée. Restaurez-la pour y lier un rendez-vous.");
  return customer;
}

export async function listAppointments(organizationId: string, options: { customerId?: string; includePast?: boolean } = {}) {
  return getDb().appointment.findMany({
    where: {
      organizationId,
      ...(options.customerId ? { customerId: options.customerId } : {}),
      ...(options.includePast ? {} : { startsAt: { gte: new Date() }, status: { in: openStatuses } }),
    },
    include: { customer: { select: { id: true, displayName: true } } },
    orderBy: { startsAt: "asc" },
    take: 80,
  });
}

export async function countUpcomingAppointments(organizationId: string) {
  return getDb().appointment.count({
    where: { organizationId, status: { in: openStatuses }, startsAt: { gte: new Date() } },
  });
}

export async function createAppointment(role: MemberRole, organizationId: string, body: unknown, address: string, userId: string) {
  assertWriter(role);
  await rateLimit("appointment-create", address, 40);
  const input = parse(createAppointmentSchema, body, "Vérifiez le titre, la date et la durée du rendez-vous.");
  const startsAt = parseStartsAt(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  const db = getDb();
  return db.$transaction(async tx => {
    await lockAgenda(tx, organizationId);
    const customer = await assertCustomer(tx, organizationId, input.customerId);
    await assertNoOverlap(tx, organizationId, startsAt, endsAt);
    const appointment = await tx.appointment.create({
      data: {
        organizationId,
        customerId: customer?.id,
        createdById: userId,
        title: input.title,
        startsAt,
        endsAt,
        location: input.location ?? null,
        notes: input.notes ?? null,
      },
      include: { customer: { select: { id: true, displayName: true } } },
    });
    if (customer) {
      await tx.customerActivity.create({
        data: {
          organizationId,
          customerId: customer.id,
          type: "MEETING",
          message: `Rendez-vous « ${appointment.title} » le ${formatDateTime(startsAt)}.`,
          createdById: userId,
        },
      });
    }
    return appointment;
  });
}

export async function cancelAppointment(role: MemberRole, organizationId: string, body: unknown) {
  assertWriter(role);
  const { appointmentId } = parse(appointmentIdInputSchema, body, "Ce rendez-vous est introuvable.");
  const db = getDb();
  return db.$transaction(async tx => {
    await lockAgenda(tx, organizationId);
    const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, organizationId } });
    if (!appointment) throw missing();
    if (appointment.status === "CANCELLED") throw new AuthFlowError("Ce rendez-vous est déjà annulé.");
    if (appointment.status === "DONE") throw new AuthFlowError("Un rendez-vous terminé ne peut plus être annulé.");
    return tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED" },
      include: { customer: { select: { id: true, displayName: true } } },
    });
  });
}
