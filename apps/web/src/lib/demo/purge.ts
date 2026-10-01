import { getDb } from "@/lib/db";
import { assertDemoMutationsAllowed, DEMO_DATASET_KEY } from "./guard";

export type DemoPurgeSummary = {
  key: string;
  organizations: number;
  users: number;
  customers: number;
  documents: number;
  payments: number;
  catalogItems: number;
};

export async function purgeDemoDataset(key = DEMO_DATASET_KEY): Promise<DemoPurgeSummary> {
  assertDemoMutationsAllowed();
  const db = getDb();
  const [organizations, users] = await Promise.all([
    db.organization.findMany({ where: { demoDatasetKey: key }, select: { id: true } }),
    db.user.findMany({ where: { demoDatasetKey: key }, select: { id: true, email: true } }),
  ]);
  const organizationIds = organizations.map(item => item.id);
  const userIds = users.map(item => item.id);
  const emails = users.map(item => item.email);
  const empty: DemoPurgeSummary = {
    key,
    organizations: 0,
    users: 0,
    customers: 0,
    documents: 0,
    payments: 0,
    catalogItems: 0,
  };
  if (organizationIds.length === 0 && userIds.length === 0) {
    await db.demoDataset.deleteMany({ where: { key } });
    return empty;
  }

  const [customers, documents, payments, catalogItems] = organizationIds.length === 0
    ? [0, 0, 0, 0]
    : await Promise.all([
      db.customer.count({ where: { organizationId: { in: organizationIds } } }),
      db.document.count({ where: { organizationId: { in: organizationIds } } }),
      db.payment.count({ where: { organizationId: { in: organizationIds } } }),
      db.catalogItem.count({ where: { organizationId: { in: organizationIds } } }),
    ]);

  if (organizationIds.length > 0) {
    await db.electronicInboundDocument.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.electronicTransmission.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.electronicInvoicingConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.paymentConnection.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.documentEmailDelivery.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
    await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
    await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.appointment.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.customerActivity.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.catalogItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.address.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.invitation.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.documentSequence.deleteMany({ where: { organizationId: { in: organizationIds } } });
  }

  if (userIds.length > 0) {
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
    await db.mobileRefreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (organizationIds.length > 0) {
    await db.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }

  if (emails.length > 0) {
    await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  }

  await db.demoDataset.deleteMany({ where: { key } });

  return {
    key,
    organizations: organizationIds.length,
    users: userIds.length,
    customers,
    documents,
    payments,
    catalogItems,
  };
}
