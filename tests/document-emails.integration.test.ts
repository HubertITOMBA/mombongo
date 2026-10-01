import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { beginAuth, completeAuth } from "../apps/web/src/lib/auth/service";
import { addAddress, createCustomer, updateCustomer } from "../apps/web/src/lib/customers/service";
import { acceptQuote, createQuote, sendQuote } from "../apps/web/src/lib/quotes/service";
import { convertQuoteToInvoice, getInvoice } from "../apps/web/src/lib/invoices/service";
import { createCreditNote, issueCreditNote } from "../apps/web/src/lib/credit-notes/service";
import { addOrganizationAddress, updateOrganizationIdentity } from "../apps/web/src/lib/organizations/service";
import { canSendDocuments } from "../apps/web/src/lib/auth/permissions";
import { AuthFlowError } from "../apps/web/src/lib/auth/rate-limit";
import { getDb } from "../apps/web/src/lib/db";
import { setMailTestFailure } from "../apps/web/src/lib/auth/mail";
import { getDocumentEmailCompose, listDocumentEmailDeliveries, sendDocumentEmail } from "../apps/web/src/lib/document-emails/service";
import type { MemberRole } from "../apps/web/src/generated/prisma/client";
config({ path: "apps/web/.env.local", quiet: true });
const tag = `docmail-${randomUUID()}`;
const emails: string[] = [];
const password = "Une phrase de passe de test 123!";
process.env.LOCAL_MAIL_DIR = path.resolve(`.local/test-mail/${tag}`);
process.env.MAIL_TRANSPORT = "local";

async function register(organizationName = "Entreprise e-mail") {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const token = await beginAuth("register", { email, password, name: "Compte test", accountType: "BUSINESS", organizationName }, `${tag}:${email}`);
  const user = await completeAuth(token, await codeFor(token.split(".")[0], 1), `${tag}:${email}`);
  assert.ok(user);
  const membership = await getDb().membership.findFirstOrThrow({ where: { userId: user.id } });
  return { email, user, membership };
}

async function colleague(organizationId: string, role: Exclude<MemberRole, "OWNER">) {
  const email = `${tag}-${emails.length}@example.test`;
  emails.push(email);
  const user = await getDb().user.create({ data: { email, accountType: "BUSINESS", name: role } });
  await getDb().membership.create({ data: { userId: user.id, organizationId, role } });
  return user;
}

async function codeFor(id: string, send: number) {
  const mail = JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `${id}-${send}.json`), "utf8"));
  return /\b\d{6}\b/.exec(mail.text)![0];
}

async function issuer(owner: Awaited<ReturnType<typeof register>>) {
  await updateOrganizationIdentity("OWNER", owner.membership.organizationId, {
    name: "Atelier Mail",
    legalName: "Atelier Mail",
    siren: "123456789",
    siret: "12345678900014",
    vatNumber: "FR12345678901",
    email: "emetteur@example.test",
    paymentTerms: "Paiement à 30 jours.",
    currency: "EUR",
  });
  await addOrganizationAddress("OWNER", owner.membership.organizationId, {
    type: "BILLING",
    label: "Siège",
    line1: "1 rue de l’Émetteur",
    postalCode: "75011",
    city: "Paris",
    countryCode: "FR",
  });
}

async function customerWithEmail(owner: Awaited<ReturnType<typeof register>>, suffix: string, email: string) {
  const customer = await createCustomer("OWNER", owner.membership.organizationId, {
    displayName: `Client ${suffix}`,
    kind: "CLIENT",
    email,
  }, `${tag}-${suffix}-c`, owner.user.id);
  await addAddress("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    type: "BILLING",
    label: "Facturation",
    line1: "2 rue du Destinataire",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  });
  return customer;
}

async function sentQuote(owner: Awaited<ReturnType<typeof register>>, customerId: string, title: string) {
  const quote = await createQuote("OWNER", owner.membership.organizationId, {
    customerId,
    title,
    description: "Prestation",
    quantity: 1,
    unitPriceCents: 100,
    vatBps: 2000,
  }, `${tag}-${title}`, owner.user.id);
  return sendQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
}

async function issuedInvoice(owner: Awaited<ReturnType<typeof register>>, customerId: string, title: string) {
  const quote = await sentQuote(owner, customerId, title);
  await acceptQuote("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  const invoice = await convertQuoteToInvoice("OWNER", owner.membership.organizationId, { documentId: quote.id }, owner.user.id);
  return getInvoice(owner.membership.organizationId, invoice.id);
}

async function issuedCreditNote(owner: Awaited<ReturnType<typeof register>>, customerId: string, title: string) {
  const invoice = await issuedInvoice(owner, customerId, title);
  const draft = await createCreditNote("OWNER", owner.membership.organizationId, { invoiceId: invoice.id, mode: "TOTAL", creditReason: "Annulation de test" }, owner.user.id);
  return issueCreditNote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
}

function payload(toEmail: string, subject: string, idempotencyKey = randomUUID()) {
  return {
    documentId: "",
    toEmail,
    subject,
    message: "Bonjour,\n\nVeuillez trouver le document historique en pièce jointe.\n\nCordialement.",
    idempotencyKey,
  };
}

async function mailRecord(deliveryId: string) {
  return JSON.parse(await readFile(path.join(process.env.LOCAL_MAIL_DIR!, `document-email-${deliveryId}.json`), "utf8"));
}

after(async () => {
  setMailTestFailure(null);
  const db = getDb();
  const memberships = await db.membership.findMany({ where: { user: { email: { in: emails } } } });
  const organizationIds = memberships.map(item => item.organizationId);
  await db.documentEmailDelivery.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.electronicTransmission.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.payment.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, kind: "CREDIT_NOTE" } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds }, sourceDocumentId: { not: null } } });
  await db.document.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.catalogItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.address.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.authChallenge.deleteMany({ where: { email: { in: emails } } });
  for (const file of await readdir(process.env.LOCAL_MAIL_DIR!).catch(() => [])) await unlink(path.join(process.env.LOCAL_MAIL_DIR!, file));
  await db.$disconnect();
});

test("canSendDocuments n’est pas déduit d’une autre permission", () => {
  for (const role of ["OWNER", "ADMIN", "MEMBER", "ACCOUNTANT"] as const) {
    assert.equal(canSendDocuments(role), true);
  }
});

test("un devis SENT s’envoie avec le PDF historique", async () => {
  const owner = await register("Devis mail");
  await issuer(owner);
  const customer = await customerWithEmail(owner, "devis", "snapshot-devis@example.test");
  const quote = await sentQuote(owner, customer.id, "Offre mail");
  const body = { ...payload("delivered@resend.dev", `Devis ${quote.number}`), documentId: quote.id };
  const delivery = await sendDocumentEmail("OWNER", owner.membership.organizationId, body, owner.user.id, `${tag}-send-quote`);
  assert.equal(delivery.status, "SENT");
  assert.equal(delivery.toEmail, "delivered@resend.dev");
  assert.equal(delivery.provider, "LOCAL");
  const unchanged = await getDb().document.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(unchanged.status, "SENT");
  const mail = await mailRecord(delivery.id);
  assert.equal(mail.to, "delivered@resend.dev");
  assert.equal(mail.replyTo, "emetteur@example.test");
  assert.match(mail.attachments[0].filename, /^devis-DEV-\d{4}-\d{4}\.pdf$/);
  assert.equal(await getDb().electronicTransmission.count({ where: { documentId: quote.id } }), 0);
});

test("une facture SENT et un avoir SENT s’envoient avec le PDF", async () => {
  const owner = await register("Facture mail");
  await issuer(owner);
  const customer = await customerWithEmail(owner, "facture", "snapshot-facture@example.test");
  const invoice = await issuedInvoice(owner, customer.id, "Facture mail");
  const invoiceDelivery = await sendDocumentEmail("OWNER", owner.membership.organizationId, {
    ...payload("delivered@resend.dev", `Facture ${invoice.number}`),
    documentId: invoice.id,
  }, owner.user.id, `${tag}-send-invoice`);
  assert.equal(invoiceDelivery.status, "SENT");
  assert.match((await mailRecord(invoiceDelivery.id)).attachments[0].filename, /^facture-FA-\d{4}-\d{4}\.pdf$/);
  const creditCustomer = await customerWithEmail(owner, "avoir", "snapshot-avoir@example.test");
  const note = await issuedCreditNote(owner, creditCustomer.id, "Avoir mail");
  const noteDelivery = await sendDocumentEmail("OWNER", owner.membership.organizationId, {
    ...payload("delivered@resend.dev", `Avoir ${note.number}`),
    documentId: note.id,
  }, owner.user.id, `${tag}-send-credit`);
  assert.equal(noteDelivery.status, "SENT");
  assert.match((await mailRecord(noteDelivery.id)).attachments[0].filename, /^avoir-AV-\d{4}-\d{4}\.pdf$/);
  const stillIssued = await getInvoice(owner.membership.organizationId, invoice.id);
  assert.equal(stillIssued.status, "SENT");
  assert.equal(await getDb().electronicTransmission.count({ where: { organizationId: owner.membership.organizationId } }), 0);
});

test("un brouillon est refusé et le snapshot e-mail sert de destinataire par défaut", async () => {
  const owner = await register("Snapshot mail");
  await issuer(owner);
  const customer = await customerWithEmail(owner, "snap", "fige@example.test");
  const draft = await createQuote("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    title: "Brouillon",
    description: "Ligne",
    quantity: 1,
    unitPriceCents: 80,
    vatBps: 2000,
  }, `${tag}-draft`, owner.user.id);
  await assert.rejects(
    () => sendDocumentEmail("OWNER", owner.membership.organizationId, {
      ...payload("delivered@resend.dev", "Brouillon"),
      documentId: draft.id,
    }, owner.user.id, `${tag}-draft-send`),
    error => error instanceof AuthFlowError && error.status === 409,
  );
  const quote = await sendQuote("OWNER", owner.membership.organizationId, { documentId: draft.id }, owner.user.id);
  const compose = await getDocumentEmailCompose(owner.membership.organizationId, quote.id);
  assert.equal(compose.defaultToEmail, "fige@example.test");
  await updateCustomer("OWNER", owner.membership.organizationId, {
    customerId: customer.id,
    displayName: "Client modifié",
    kind: "CLIENT",
    email: "live-after@example.test",
  }, owner.user.id);
  const afterLive = await getDocumentEmailCompose(owner.membership.organizationId, quote.id);
  assert.equal(afterLive.defaultToEmail, "fige@example.test");
  assert.equal(afterLive.liveCustomerEmail, "live-after@example.test");
  const document = await getDb().document.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(document.customerEmailSnapshot, "fige@example.test");
  assert.equal(document.status, "SENT");
});

test("le destinataire manuel et l’historique de plusieurs envois sont conservés", async () => {
  const owner = await register("Historique mail");
  await issuer(owner);
  const customer = await customerWithEmail(owner, "hist", "fige-hist@example.test");
  const quote = await sentQuote(owner, customer.id, "Historique");
  const firstKey = randomUUID();
  const first = await sendDocumentEmail("OWNER", owner.membership.organizationId, {
    ...payload("manual-one@example.test", "Premier envoi", firstKey),
    documentId: quote.id,
  }, owner.user.id, `${tag}-hist-1`);
  const same = await sendDocumentEmail("OWNER", owner.membership.organizationId, {
    ...payload("autre@example.test", "Double clic", firstKey),
    documentId: quote.id,
  }, owner.user.id, `${tag}-hist-1b`);
  assert.equal(same.id, first.id);
  assert.equal(same.toEmail, "manual-one@example.test");
  const second = await sendDocumentEmail("OWNER", owner.membership.organizationId, {
    ...payload("manual-two@example.test", "Réexpédition explicite"),
    documentId: quote.id,
  }, owner.user.id, `${tag}-hist-2`);
  assert.notEqual(second.id, first.id);
  const history = await listDocumentEmailDeliveries(owner.membership.organizationId, quote.id);
  assert.equal(history.length, 2);
  assert.equal(history[0]?.toEmail, "manual-two@example.test");
  assert.equal(history[1]?.toEmail, "manual-one@example.test");
  assert.equal(history[1]?.subject, "Premier envoi");
});

test("un échec provider marque FAILED sans changer le document", async () => {
  const owner = await register("Échec mail");
  await issuer(owner);
  const customer = await customerWithEmail(owner, "fail", "fail@example.test");
  const quote = await sentQuote(owner, customer.id, "Échec");
  setMailTestFailure("provider down");
  await assert.rejects(
    () => sendDocumentEmail("OWNER", owner.membership.organizationId, {
      ...payload("delivered@resend.dev", "Échec"),
      documentId: quote.id,
    }, owner.user.id, `${tag}-fail`),
    error => error instanceof AuthFlowError && error.status === 502,
  );
  setMailTestFailure(null);
  const failed = await getDb().documentEmailDelivery.findFirstOrThrow({ where: { documentId: quote.id } });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "MAIL_PROVIDER");
  const document = await getDb().document.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal(document.status, "SENT");
});

test("OWNER ADMIN MEMBER ACCOUNTANT peuvent envoyer, l’isolation A/B tient", async () => {
  const first = await register("Entreprise A mail");
  const second = await register("Entreprise B mail");
  await issuer(first);
  const customer = await customerWithEmail(first, "iso", "iso-a@example.test");
  const quote = await sentQuote(first, customer.id, "Isolation");
  const admin = await colleague(first.membership.organizationId, "ADMIN");
  const member = await colleague(first.membership.organizationId, "MEMBER");
  const accountant = await colleague(first.membership.organizationId, "ACCOUNTANT");
  for (const [role, user] of [["ADMIN", admin], ["MEMBER", member], ["ACCOUNTANT", accountant]] as const) {
    const delivery = await sendDocumentEmail(role, first.membership.organizationId, {
      ...payload("delivered@resend.dev", `Envoi ${role}`),
      documentId: quote.id,
    }, user.id, `${tag}-${role}`);
    assert.equal(delivery.status, "SENT");
  }
  await assert.rejects(
    () => sendDocumentEmail("OWNER", second.membership.organizationId, {
      ...payload("delivered@resend.dev", "Intrus"),
      documentId: quote.id,
    }, second.user.id, `${tag}-iso-b`),
    error => error instanceof AuthFlowError && error.status === 404,
  );
  assert.equal(await getDb().electronicTransmission.count({ where: { documentId: quote.id } }), 0);
});
