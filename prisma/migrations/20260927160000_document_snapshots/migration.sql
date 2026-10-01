-- Snapshot historique des parties au moment de l’émission.
-- Colonnes nullable : les brouillons n’ont pas encore de photographie.
ALTER TABLE "Document" ADD COLUMN "issuerNameSnapshot" TEXT;
ALTER TABLE "Document" ADD COLUMN "issuerCurrencySnapshot" CHAR(3);
ALTER TABLE "Document" ADD COLUMN "customerNameSnapshot" TEXT;
ALTER TABLE "Document" ADD COLUMN "customerEmailSnapshot" TEXT;
ALTER TABLE "Document" ADD COLUMN "customerPhoneSnapshot" TEXT;
ALTER TABLE "Document" ADD COLUMN "customerCompanyNumberSnapshot" TEXT;
ALTER TABLE "Document" ADD COLUMN "customerAddressSnapshot" TEXT;

-- Legacy backfill : documents déjà émis. Ce n’est PAS une reconstitution historique.
UPDATE "Document" AS document
SET
  "issuerNameSnapshot" = organization.name,
  "issuerCurrencySnapshot" = organization.currency,
  "customerNameSnapshot" = customer."displayName",
  "customerEmailSnapshot" = customer.email,
  "customerPhoneSnapshot" = customer.phone,
  "customerCompanyNumberSnapshot" = customer."companyNumber",
  "customerAddressSnapshot" = (
    SELECT concat_ws(
      E'\n',
      address.line1,
      NULLIF(address.line2, ''),
      concat_ws(' ', address."postalCode", address.city),
      address."countryCode"
    )
    FROM "Address" AS address
    WHERE address."customerId" = document."customerId"
      AND address."organizationId" = document."organizationId"
    ORDER BY CASE WHEN address.type = 'BILLING' THEN 0 ELSE 1 END, address."createdAt" ASC
    LIMIT 1
  )
FROM "Organization" AS organization, "Customer" AS customer
WHERE document."organizationId" = organization.id
  AND document."customerId" = customer.id
  AND document.status <> 'DRAFT';
