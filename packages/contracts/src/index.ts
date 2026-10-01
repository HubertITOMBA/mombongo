import { z } from "zod";

const blankToUndefined = (value: unknown) => typeof value === "string" && value.trim() === "" ? undefined : value;

export const countryCodes = [
  "AD", "AE", "AT", "AU", "BE", "BG", "BR", "CA", "CH", "CI", "CN", "CY", "CZ",
  "DE", "DK", "DZ", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IN",
  "IT", "JP", "LT", "LU", "LV", "MA", "MC", "MT", "MX", "NL", "NO", "PL", "PT",
  "RO", "SE", "SI", "SK", "SN", "TN", "US",
] as const;
export type CountryCode = (typeof countryCodes)[number];
export const countryLabels: Record<CountryCode, string> = {
  AD: "Andorre", AE: "Émirats arabes unis", AT: "Autriche", AU: "Australie",
  BE: "Belgique", BG: "Bulgarie", BR: "Brésil", CA: "Canada", CH: "Suisse",
  CI: "Côte d’Ivoire", CN: "Chine", CY: "Chypre", CZ: "Tchéquie", DE: "Allemagne",
  DK: "Danemark", DZ: "Algérie", EE: "Estonie", ES: "Espagne", FI: "Finlande",
  FR: "France", GB: "Royaume-Uni", GR: "Grèce", HR: "Croatie", HU: "Hongrie",
  IE: "Irlande", IN: "Inde", IT: "Italie", JP: "Japon", LT: "Lituanie",
  LU: "Luxembourg", LV: "Lettonie", MA: "Maroc", MC: "Monaco", MT: "Malte",
  MX: "Mexique", NL: "Pays-Bas", NO: "Norvège", PL: "Pologne", PT: "Portugal",
  RO: "Roumanie", SE: "Suède", SI: "Slovénie", SK: "Slovaquie", SN: "Sénégal",
  TN: "Tunisie", US: "États-Unis",
};

export const addressTypeSchema = z.enum(["PERSONAL", "BILLING", "SHIPPING", "OFFICE", "OTHER"]);
export const addressTypeLabels = {
  PERSONAL: "Personnelle",
  BILLING: "Facturation",
  SHIPPING: "Livraison",
  OFFICE: "Bureau",
  OTHER: "Autre",
} as const;
export const organizationEntityKindSchema = z.enum(["SOLE_TRADER", "COMPANY"]);
export const organizationEntityKindLabels = {
  SOLE_TRADER: "Activité en nom propre",
  COMPANY: "Personne morale",
} as const;
export const customerPartyKindSchema = z.enum(["PERSON", "COMPANY"]);
export const customerPartyKindLabels = {
  PERSON: "Particulier",
  COMPANY: "Professionnel",
} as const;
export const customerCivilitySchema = z.enum(["MR", "MRS", "MX"]);
export const customerCivilityLabels = {
  MR: "M.",
  MRS: "Mme",
  MX: "Mx",
} as const;
export type CustomerNameSource = {
  partyKind?: "PERSON" | "COMPANY" | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
};
export function customerDisplayName(customer: CustomerNameSource) {
  if (customer.partyKind === "PERSON") {
    const full = [customer.firstName, customer.lastName].map(part => part?.trim()).filter(Boolean).join(" ");
    if (full) return full;
  }
  if (customer.partyKind === "COMPANY") {
    const company = customer.tradeName?.trim() || customer.legalName?.trim();
    if (company) return company;
  }
  return customer.displayName?.trim() || "";
}
export function resolvePersistedDisplayName(customer: CustomerNameSource) {
  return customerDisplayName(customer).slice(0, 120);
}
function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}
const optionalSiren = z.preprocess((value) => {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  return digitsOnly(String(raw));
}, z.string().length(9, "Le SIREN doit contenir 9 chiffres.").optional());
const optionalSiret = z.preprocess((value) => {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  return digitsOnly(String(raw));
}, z.string().length(14, "Le SIRET doit contenir 14 chiffres.").optional());
const optionalVatNumber = z.preprocess((value) => {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  return String(raw).replace(/[\s.-]/g, "").toUpperCase();
}, z.string().regex(/^[A-Z0-9]{4,20}$/, "Le numéro de TVA est invalide.").optional());
const optionalWebsite = z.preprocess(blankToUndefined, z.string().trim().max(200).regex(/^https?:\/\/[^\s]+$/i, "Le site web doit commencer par http:// ou https://").optional());
const optionalCountryCode = z.preprocess(blankToUndefined, z.enum(countryCodes).optional());
function assertSirenSiretPair(
  input: { siren?: string; siret?: string },
  ctx: z.RefinementCtx,
) {
  if (input.siren && input.siret && !input.siret.startsWith(input.siren)) {
    ctx.addIssue({ code: "custom", path: ["siret"], message: "Le SIRET doit commencer par le SIREN." });
  }
}
export const addressSchema = z.object({
  type: addressTypeSchema,
  label: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(200),
  line2: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  postalCode: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  countryCode: z.enum(countryCodes),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()), password: z.string().min(1).max(128) });
export const verificationCodeSchema = z.string().regex(/^\d{6}$/, "Le code doit contenir six chiffres.");
export type AddressInput = z.infer<typeof addressSchema>;

export const accountTypeSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);
const registrationBaseSchema = loginSchema.extend({
  password: z.string().min(12, "Utilisez au moins 12 caractères.").max(128),
  name: z.string().trim().min(2).max(100),
});
export const registrationSchema = z.discriminatedUnion("accountType", [
  registrationBaseSchema.extend({ accountType: z.literal("INDIVIDUAL") }),
  registrationBaseSchema.extend({
    accountType: z.literal("BUSINESS"),
    organizationName: z.string().trim().min(2).max(120),
  }),
]);

export const invitationTokenSchema = z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
export const assignableRoleSchema = z.enum(["ADMIN", "MEMBER", "ACCOUNTANT"]);
export const memberRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "ACCOUNTANT"]);
export const roleLabels = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MEMBER: "Membre",
  ACCOUNTANT: "Comptable",
} as const;
export const inviteMemberSchema = z.object({
  email: loginSchema.shape.email,
  role: assignableRoleSchema,
});
export const acceptInvitationSchema = z.object({
  token: invitationTokenSchema,
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().max(128).optional(),
  confirmation: z.string().max(128).optional(),
});
export const changeMemberRoleSchema = z.object({
  membershipId: z.string().min(1).max(64),
  role: assignableRoleSchema,
});

export const customerKindSchema = z.enum(["CLIENT", "PROSPECT"]);
export const customerStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const customerKindLabels = { CLIENT: "Client", PROSPECT: "Prospect" } as const;
export const customerStatusLabels = { ACTIVE: "Actif", ARCHIVED: "Archivé" } as const;
export const pipelineStageSchema = z.enum(["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);
export const pipelineStages = pipelineStageSchema.options;
export const pipelineStageLabels = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  QUALIFIED: "Qualifié",
  MEETING: "RDV",
  PROPOSAL: "Proposition",
  NEGOTIATION: "Négociation",
  WON: "Gagné",
  LOST: "Perdu",
} as const;
export const activityTypeSchema = z.enum(["CREATED", "NOTE", "EMAIL", "CALL", "MEETING", "STAGE", "CONVERTED", "QUOTE", "INVOICE", "CREDIT_NOTE", "PAYMENT"]);
export const activityEntrySchema = z.enum(["NOTE", "EMAIL", "CALL", "MEETING"]);
export const activityTypeLabels = {
  CREATED: "Fiche créée",
  NOTE: "Note",
  EMAIL: "E-mail",
  CALL: "Appel",
  MEETING: "Rendez-vous",
  STAGE: "Étape",
  CONVERTED: "Converti en client",
  QUOTE: "Devis",
  INVOICE: "Facture",
  CREDIT_NOTE: "Avoir",
  PAYMENT: "Paiement",
} as const;
const customerIdSchema = z.string().trim().min(1).max(64);
const optionalEurosToCents = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  const amount = Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN;
  return Math.round(amount * 100);
}, z.number().int().nonnegative().max(1_000_000_000_00).optional());
const optionalProbability = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : Number.NaN;
}, z.number().int().min(0).max(100).optional());
const optionalDate = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  return value;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const optionalPhone = z.preprocess(blankToUndefined, z.string().trim().max(30).regex(/^[0-9+()./\s-]{6,30}$/).optional());
export const customerFieldsSchema = z.object({
  partyKind: z.preprocess(blankToUndefined, customerPartyKindSchema.optional()),
  civility: z.preprocess(blankToUndefined, customerCivilitySchema.optional()),
  firstName: z.preprocess(blankToUndefined, z.string().trim().min(1).max(80).optional()),
  lastName: z.preprocess(blankToUndefined, z.string().trim().min(1).max(80).optional()),
  legalName: z.preprocess(blankToUndefined, z.string().trim().min(2).max(180).optional()),
  tradeName: z.preprocess(blankToUndefined, z.string().trim().min(2).max(180).optional()),
  displayName: z.preprocess(blankToUndefined, z.string().trim().min(2).max(120).optional()),
  email: z.preprocess(blankToUndefined, loginSchema.shape.email.optional()),
  phone: optionalPhone,
  siren: optionalSiren,
  siret: optionalSiret,
  vatNumber: optionalVatNumber,
  companyNumber: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
  taxablePerson: z.preprocess((value) => {
    if (value === true || value === "true" || value === "yes") return true;
    if (value === false || value === "false" || value === "no") return false;
    if (value === "" || value === undefined || value === null) return undefined;
    return value;
  }, z.boolean().optional()),
  kind: customerKindSchema,
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  stage: pipelineStageSchema.optional(),
  source: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  ownerUserId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
  estimatedCents: optionalEurosToCents,
  probability: optionalProbability,
  nextAction: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  nextActionAt: optionalDate,
}).superRefine((input, ctx) => {
  if (input.partyKind === "PERSON") {
    if (!input.firstName) ctx.addIssue({ code: "custom", path: ["firstName"], message: "Le prénom est obligatoire." });
    if (!input.lastName) ctx.addIssue({ code: "custom", path: ["lastName"], message: "Le nom est obligatoire." });
  } else if (input.partyKind === "COMPANY") {
    if (!input.legalName && !input.tradeName && !input.displayName) {
      ctx.addIssue({ code: "custom", path: ["legalName"], message: "Indiquez une raison sociale ou un nom commercial." });
    }
  } else if (!input.displayName) {
    ctx.addIssue({ code: "custom", path: ["displayName"], message: "Le nom du contact est obligatoire." });
  }
  if (resolvePersistedDisplayName(input).length < 2) {
    ctx.addIssue({ code: "custom", path: ["displayName"], message: "Le nom d’affichage est trop court." });
  }
  assertSirenSiretPair(input, ctx);
});
export const organizationIdentitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  entityKind: z.preprocess(blankToUndefined, organizationEntityKindSchema.optional()),
  legalName: z.preprocess(blankToUndefined, z.string().trim().min(2).max(180).optional()),
  tradeName: z.preprocess(blankToUndefined, z.string().trim().min(2).max(180).optional()),
  legalFormLabel: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  siren: optionalSiren,
  siret: optionalSiret,
  vatNumber: optionalVatNumber,
  email: z.preprocess(blankToUndefined, loginSchema.shape.email.optional()),
  phone: optionalPhone,
  website: optionalWebsite,
  countryCode: optionalCountryCode,
  currency: z.preprocess(blankToUndefined, z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional()),
  timezone: z.preprocess(blankToUndefined, z.string().trim().min(3).max(60).optional()),
  vatOnDebits: z.preprocess((value) => {
    if (value === true || value === "true" || value === "on") return true;
    if (value === false || value === "false" || value === "" || value === undefined || value === null) return false;
    return value;
  }, z.boolean().optional()),
  invoiceDueDays: z.preprocess((value) => {
    if (value === "" || value === undefined || value === null) return undefined;
    return value;
  }, z.coerce.number().int().min(0).max(365).optional()),
  paymentTerms: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  earlyPaymentDiscountTerms: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  latePaymentPenaltyTerms: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  recoveryFeeMention: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
}).superRefine(assertSirenSiretPair);
export const createOrganizationAddressSchema = addressSchema;
export const updateOrganizationAddressSchema = addressSchema.extend({ addressId: customerIdSchema });
export const createCustomerSchema = customerFieldsSchema;
export const updateCustomerSchema = customerFieldsSchema.and(z.object({ customerId: customerIdSchema }));
export const customerIdInputSchema = z.object({ customerId: customerIdSchema });
export const changeStageSchema = z.object({ customerId: customerIdSchema, stage: pipelineStageSchema });
export const addActivitySchema = z.object({
  customerId: customerIdSchema,
  type: activityEntrySchema,
  message: z.string().trim().min(2).max(2000),
});
export const createAddressSchema = addressSchema.extend({ customerId: customerIdSchema });
export const updateAddressSchema = addressSchema.extend({ addressId: customerIdSchema });
export const addressIdInputSchema = z.object({ addressId: customerIdSchema });

export const challengeTokenSchema = z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
export const mobileChallengeSchema = z.object({ challengeToken: challengeTokenSchema });
export const mobileVerifySchema = mobileChallengeSchema.extend({ code: verificationCodeSchema });
export const mobileRefreshSchema = z.object({ refreshToken: challengeTokenSchema });

export const appointmentStatusSchema = z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "DONE"]);
export const appointmentStatusLabels = {
  SCHEDULED: "Planifié",
  CONFIRMED: "Confirmé",
  CANCELLED: "Annulé",
  DONE: "Terminé",
} as const;
export const appointmentDurations = [15, 30, 45, 60, 90, 120] as const;
const parisDateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function dateParts(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(parisDateTime.formatToParts(date).map(part => [part.type, part.value]));
}
export function formatDateTime(value: Date | string | number) {
  const parts = dateParts(value);
  return parts ? `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}` : "";
}
export function formatDate(value: Date | string | number) {
  return formatDateTime(value).slice(0, 10);
}
const isoLocalDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
const frenchLocalDateTime = /^\d{2}-\d{2}-\d{4}[ T]\d{2}:\d{2}$/;
const localDateTimeSchema = z.string().trim().refine(value => isoLocalDateTime.test(value) || frenchLocalDateTime.test(value));
export const createAppointmentSchema = z.object({
  title: z.string().trim().min(2).max(120),
  startsAt: localDateTimeSchema,
  durationMinutes: z.preprocess((value) => {
    if (value === "" || value === undefined || value === null) return 30;
    return value;
  }, z.coerce.number().int().min(15).max(480)),
  customerId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
  location: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
});
export const appointmentIdInputSchema = z.object({ appointmentId: customerIdSchema });

export const documentKindSchema = z.enum(["QUOTE", "INVOICE", "CREDIT_NOTE"]);
export const documentKindLabels = { QUOTE: "Devis", INVOICE: "Facture", CREDIT_NOTE: "Avoir" } as const;
export const documentStatusSchema = z.enum(["DRAFT", "SENT", "ACCEPTED", "REFUSED", "CANCELLED"]);
export const documentStatusLabels = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REFUSED: "Refusé",
  CANCELLED: "Annulé",
} as const;
export const vatRates = [
  { bps: 0, label: "0 %" },
  { bps: 550, label: "5,5 %" },
  { bps: 1000, label: "10 %" },
  { bps: 2000, label: "20 %" },
] as const;
export const vatBpsSchema = z.union([z.literal(0), z.literal(550), z.literal(1000), z.literal(2000)]);
export const lineItemKindSchema = z.enum(["PRODUCT", "SERVICE"]);
export const lineItemKindLabels = { PRODUCT: "Bien", SERVICE: "Service" } as const;
export const operationCategorySchema = z.enum(["GOODS", "SERVICES", "MIXED"]);
export const operationCategoryLabels = { GOODS: "Biens", SERVICES: "Services", MIXED: "Mixte" } as const;
export const lineUnits = ["unité", "heure", "jour", "kg", "pièce", "forfait"] as const;
export const lineUnitSchema = z.enum(lineUnits);
export const lineUnitOptions = [
  { value: "unité", label: "Unité", code: "C62" },
  { value: "heure", label: "Heure", code: "HUR" },
  { value: "jour", label: "Jour", code: "DAY" },
  { value: "kg", label: "Kilogramme", code: "KGM" },
  { value: "pièce", label: "Pièce", code: "H87" },
  { value: "forfait", label: "Forfait", code: null },
] as const;
export type LineUnitValue = (typeof lineUnits)[number];
export const lineUnitLabels: Record<LineUnitValue, string> = {
  unité: "Unité",
  heure: "Heure",
  jour: "Jour",
  kg: "Kilogramme",
  pièce: "Pièce",
  forfait: "Forfait",
};
export const uneceUnitByLineUnit: Record<LineUnitValue, string | null> = {
  unité: "C62",
  heure: "HUR",
  jour: "DAY",
  kg: "KGM",
  pièce: "H87",
  forfait: null,
};
export function unitCodeFromUnit(unit: string | null | undefined) {
  const key = unit?.trim().toLowerCase() ?? "";
  if (!key) return uneceUnitByLineUnit.unité;
  if (key in uneceUnitByLineUnit) return uneceUnitByLineUnit[key as LineUnitValue];
  return null;
}
export const lineTaxCategories = ["STANDARD", "ZERO_RATED", "EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"] as const;
export const lineTaxCategorySchema = z.enum(lineTaxCategories);
export type LineTaxCategory = (typeof lineTaxCategories)[number];
export const lineTaxCategoryLabels: Record<LineTaxCategory, string> = {
  STANDARD: "TVA standard",
  ZERO_RATED: "Taux zéro",
  EXEMPT: "Exonération",
  REVERSE_CHARGE: "Autoliquidation",
  OUT_OF_SCOPE: "Hors champ",
};
export const zeroTaxCategories = ["ZERO_RATED", "EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"] as const;
export type ZeroTaxCategory = (typeof zeroTaxCategories)[number];
export function taxCategoryNeedsExemptionReason(category: string | null | undefined) {
  return category === "EXEMPT" || category === "REVERSE_CHARGE" || category === "OUT_OF_SCOPE";
}
export const taxExemptionReasonCodes = ["FRANCE_FRANCHISE"] as const;
export const taxExemptionReasonCodeSchema = z.enum(taxExemptionReasonCodes);
export const taxExemptionReasonCodeLabels = {
  FRANCE_FRANCHISE: "Franchise en base",
} as const;
export function defaultTaxCategory(vatBps: number, category?: LineTaxCategory | null) {
  if (category) return category;
  return vatBps > 0 ? "STANDARD" as const : null;
}
const eurosToCents = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return Number.NaN;
  const amount = Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN;
  return Math.round(amount * 100);
}, z.number().int().nonnegative().max(1_000_000_000_00));
const quantitySchema = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return Number.NaN;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}, z.number().gt(0).max(100_000));
const optionalDiscountBps = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return 0;
  return value;
}, z.coerce.number().int().min(0).max(10_000));
function assertLineTax(input: {
  vatBps: number;
  taxCategory?: LineTaxCategory;
  taxExemptionReason?: string;
  taxExemptionReasonCode?: string;
}, ctx: z.RefinementCtx) {
  if (input.taxCategory === "STANDARD" && input.vatBps <= 0) {
    ctx.addIssue({ code: "custom", path: ["taxCategory"], message: "La TVA standard exige un taux positif." });
  }
  if (input.taxCategory && zeroTaxCategories.includes(input.taxCategory as ZeroTaxCategory) && input.vatBps !== 0) {
    ctx.addIssue({ code: "custom", path: ["taxCategory"], message: "Cette qualification fiscale exige un taux à 0 %." });
  }
  if (taxCategoryNeedsExemptionReason(input.taxCategory) && !input.taxExemptionReason) {
    ctx.addIssue({ code: "custom", path: ["taxExemptionReason"], message: "Indiquez le motif d’exonération ou de hors champ. Aucune mention n’est générée automatiquement." });
  }
  if (input.taxExemptionReasonCode === "FRANCE_FRANCHISE" && input.taxCategory !== "EXEMPT") {
    ctx.addIssue({ code: "custom", path: ["taxExemptionReasonCode"], message: "La franchise en base n’est disponible que pour une exonération." });
  }
}
const lineFields = {
  description: z.string().trim().min(2).max(200),
  quantity: quantitySchema,
  unit: z.preprocess((value) => blankToUndefined(value) ?? "unité", lineUnitSchema),
  unitPriceCents: eurosToCents,
  discountBps: optionalDiscountBps,
  vatBps: z.preprocess((value) => Number(value), vatBpsSchema),
  itemKind: z.preprocess((value) => blankToUndefined(value) ?? "SERVICE", lineItemKindSchema),
  taxCategory: z.preprocess(blankToUndefined, lineTaxCategorySchema.optional()),
  taxExemptionReason: z.preprocess(blankToUndefined, z.string().trim().min(2).max(500).optional()),
  taxExemptionReasonCode: z.preprocess(blankToUndefined, taxExemptionReasonCodeSchema.optional()),
};
export const createQuoteSchema = z.object({
  customerId: customerIdSchema,
  title: z.string().trim().min(2).max(160),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  validUntil: optionalDate,
  supplyDate: optionalDate,
  customerOrderNumber: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  catalogItemId: z.preprocess(blankToUndefined, customerIdSchema.optional()),
  ...lineFields,
}).superRefine(assertLineTax);
export const addQuoteLineSchema = z.object({
  documentId: customerIdSchema,
  catalogItemId: z.preprocess(blankToUndefined, customerIdSchema.optional()),
  ...lineFields,
}).superRefine(assertLineTax);
export const documentIdInputSchema = z.object({ documentId: customerIdSchema });
export const creditNoteModeSchema = z.enum(["TOTAL", "PARTIAL"]);
export const createCreditNoteSchema = z.object({
  invoiceId: customerIdSchema,
  creditReason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  mode: z.preprocess((value) => blankToUndefined(value) ?? "PARTIAL", creditNoteModeSchema),
});
export const updateCreditNoteSchema = z.object({
  documentId: customerIdSchema,
  creditReason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  mode: z.preprocess((value) => blankToUndefined(value) ?? "PARTIAL", creditNoteModeSchema),
});
export const catalogKindLabels = { PRODUCT: "Produit", SERVICE: "Service" } as const;
export const catalogItemFields = {
  itemKind: z.preprocess((value) => blankToUndefined(value) ?? "SERVICE", lineItemKindSchema),
  reference: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
  name: z.string().trim().min(2).max(120),
  description: z.preprocess(blankToUndefined, z.string().trim().min(2).max(200).optional()),
  unit: z.preprocess((value) => blankToUndefined(value) ?? "unité", lineUnitSchema),
  unitPriceCents: eurosToCents,
  vatBps: z.preprocess((value) => Number(value), vatBpsSchema),
  taxCategory: z.preprocess(blankToUndefined, lineTaxCategorySchema.optional()),
  taxExemptionReason: z.preprocess(blankToUndefined, z.string().trim().min(2).max(500).optional()),
  taxExemptionReasonCode: z.preprocess(blankToUndefined, taxExemptionReasonCodeSchema.optional()),
};
export const createCatalogItemSchema = z.object(catalogItemFields).superRefine(assertLineTax);
export const updateCatalogItemSchema = z.object({
  catalogItemId: customerIdSchema,
  ...catalogItemFields,
}).superRefine(assertLineTax);
export const catalogItemIdInputSchema = z.object({ catalogItemId: customerIdSchema });
export const paymentMethodSchema = z.enum(["BANK_TRANSFER", "CARD", "CASH", "CHECK", "DIRECT_DEBIT", "PAYPAL", "OTHER"]);
export const paymentMethodLabels = {
  BANK_TRANSFER: "Virement",
  CARD: "Carte",
  CASH: "Espèces",
  CHECK: "Chèque",
  DIRECT_DEBIT: "Prélèvement",
  PAYPAL: "PayPal",
  OTHER: "Autre",
} as const;
export const paymentStatusSchema = z.enum(["CONFIRMED", "CANCELLED"]);
export const paymentStatusLabels = { CONFIRMED: "Confirmé", CANCELLED: "Annulé" } as const;
export const paymentProviderSchema = z.enum(["MANUAL", "STRIPE", "PAYPAL"]);
export const settlementStateSchema = z.enum(["UNPAID", "PARTIALLY_PAID", "PAID", "CREDITED"]);
export const settlementStateLabels = {
  UNPAID: "À payer",
  PARTIALLY_PAID: "Partiellement encaissé",
  PAID: "Soldée",
  CREDITED: "Soldée par avoirs",
} as const;
const paymentAmountCents = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return Number.NaN;
  const amount = Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return Number.NaN;
  return Math.round(amount * 100);
}, z.number().int().positive().max(1_000_000_000_00));
export const recordPaymentSchema = z.object({
  invoiceId: customerIdSchema,
  amountCents: paymentAmountCents,
  paidAt: z.preprocess((value) => (value === "" || value === undefined || value === null ? undefined : value), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  method: z.preprocess((value) => blankToUndefined(value) ?? "BANK_TRANSFER", paymentMethodSchema),
  reference: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  note: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
});
export const paymentIdInputSchema = z.object({ paymentId: customerIdSchema });
export const paymentProviderLabels = {
  MANUAL: "Saisie manuelle",
  STRIPE: "Stripe",
  PAYPAL: "PayPal",
} as const;
export const electronicInvoicingProviderSchema = z.enum(["MOCK"]);
export const electronicInvoicingProviderLabels = {
  MOCK: "Fournisseur de test interne",
} as const;
export const electronicConnectionStatusSchema = z.enum(["INACTIVE", "READY", "ERROR", "DISABLED"]);
export const electronicConnectionStatusLabels = {
  INACTIVE: "Configurée (inactive)",
  READY: "Prête",
  ERROR: "En erreur",
  DISABLED: "Désactivée",
} as const;
export const electronicConnectionEnvironmentSchema = z.enum(["TEST", "PRODUCTION"]);
export const electronicConnectionEnvironmentLabels = {
  TEST: "Sandbox interne",
  PRODUCTION: "Production",
} as const;
export const electronicTransmissionStatusSchema = z.enum([
  "PENDING", "QUEUED", "SUBMITTED", "ACCEPTED", "DELIVERED", "REJECTED", "FAILED",
]);
export const electronicTransmissionStatusLabels = {
  PENDING: "En attente",
  QUEUED: "En file",
  SUBMITTED: "Soumise",
  ACCEPTED: "Acceptée",
  DELIVERED: "Délivrée",
  REJECTED: "Rejetée",
  FAILED: "Échec",
} as const;
export const upsertElectronicInvoicingConnectionSchema = z.object({
  connectorKey: z.preprocess((value) => blankToUndefined(value) ?? "MOCK", z.string().trim().min(2).max(40)),
  provider: z.preprocess((value) => blankToUndefined(value) ?? "MOCK", electronicInvoicingProviderSchema),
  status: z.preprocess((value) => blankToUndefined(value) ?? "INACTIVE", electronicConnectionStatusSchema),
  environment: z.preprocess((value) => blankToUndefined(value) ?? "TEST", electronicConnectionEnvironmentSchema),
  externalAccountId: z.preprocess(blankToUndefined, z.string().trim().min(2).max(120).optional()),
  connectionId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
  organizationId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
  apiKey: z.string().optional(),
  clientSecret: z.string().optional(),
  webhookSecret: z.string().optional(),
});
export const documentEmailStatusSchema = z.enum(["QUEUED", "SENT", "FAILED"]);
export const documentEmailStatusLabels = {
  QUEUED: "En file",
  SENT: "Accepté par le fournisseur d’e-mail",
  FAILED: "Échec",
} as const;
export const sendDocumentEmailSchema = z.object({
  documentId: customerIdSchema,
  toEmail: z.string().trim().toLowerCase().max(254).pipe(z.email("Vérifiez l’adresse du destinataire.")),
  subject: z.string().trim().min(3).max(180),
  message: z.string().trim().min(10).max(5000),
  idempotencyKey: z.string().trim().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "La demande d’envoi est invalide.",
  ),
});
export function defaultDocumentEmailCopy(input: {
  kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE";
  number: string | null;
  issuerName: string;
  customerName: string;
}) {
  const kind = documentKindLabels[input.kind];
  const number = input.number ?? kind;
  const attached = input.kind === "CREDIT_NOTE" ? "l’avoir" : input.kind === "QUOTE" ? "le devis" : "la facture";
  return {
    subject: `${kind} ${number} — ${input.issuerName}`,
    message: [
      "Bonjour,",
      "",
      `Veuillez trouver ci-joint ${attached} ${number} émis par ${input.issuerName} à l’attention de ${input.customerName}.`,
      "",
      "Ce PDF correspond au document historique. Une modification ultérieure de la fiche client ne le change pas.",
      "",
      "Pour toute question, vous pouvez répondre à cet e-mail.",
      "",
      "Cordialement,",
      input.issuerName,
    ].join("\n"),
  };
}
export function formatMoney(cents: number, currency = "EUR") {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code }).format(cents / 100);
}

export const forgotPasswordSchema = loginSchema.pick({ email: true });
export const newPasswordSchema = z.string().min(12, "Utilisez au moins 12 caractères.").max(128);
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/),
  password: newPasswordSchema,
  confirmation: newPasswordSchema,
}).refine(input => input.password === input.confirmation, {
  message: "Les mots de passe ne correspondent pas.", path: ["confirmation"],
});
