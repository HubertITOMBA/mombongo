# Facturation et devis

État : devis, conversion **devis → facture**, snapshots A7, catalogue A8,
avoirs A9, paiements métier A10, consolidation A11, PDF humain A12, socle
Factur-X A13 (génération / validation / préparation), socle A14 de
transmission multi-provider **sans connecteur réel**. L’envoi manuel par
e-mail A16 est livré. A15.0 est validé ; A15.1 (PA réelle) reste différé.
Stripe et PayPal restent hors de cette version.

## Disponible

Un compte entreprise accède à `/espace/devis`, `/espace/factures` et
`/espace/catalogue`. Le propriétaire, l’administrateur et le membre créent un
brouillon lié à une fiche, ajoutent des lignes (quantité décimale, unité,
nature bien/service, prix HT, TVA 0 / 5,5 / 10 / 20 %), envoient, acceptent,
refusent ou annulent. Une ligne peut être saisie librement **ou** préremplie
depuis le catalogue. Un devis **accepté** peut devenir une facture. Un membre
peut encore convertir un devis accepté en facture, mais ne peut pas **émettre
un avoir** ni **enregistrer un paiement**. Une facture **émise** ne s’annule
pas par un changement de statut : la correction économique passe par un avoir.
`canCancelInvoices` ne sert qu’à abandonner un éventuel brouillon de facture.
Le comptable consulte les documents et **saisit / annule les encaissements**. Un
particulier est renvoyé vers son espace personnel.

L’envoi d’un devis attribue `DEV-AAAA-0001`, fige le snapshot A7 et
`issuedAt`. La conversion attribue `FA-AAAA-0001`, copie lignes, totaux et
snapshot du devis, calcule `dueDate` depuis `issuedAt` + délai émetteur
(`invoiceDueDays` ou 30 jours), et lie la facture au devis
(`sourceDocumentId` unique : une seule facture par devis). Un devis accepté
sur un **prospect** le convertit en client (étape Gagné) avant la facture.

Un avoir lié à une facture émise attribue `AV-AAAA-0001` à l’émission. Plusieurs
avoirs peuvent porter sur la même facture (`creditedInvoiceId`, 1:N). La
facture originale reste intacte.

Un brouillon de devis affiche encore la fiche courante. Un document émis, et
un brouillon d’avoir (déjà copié depuis la facture), affichent le snapshot.
Les montants sont formatés avec la devise du document
(`issuerCurrencySnapshot`, sinon devise live de l’Organization). Pas de
conversion de devises : une pièce a une seule devise.

Le détail d’un devis, d’une facture ou d’un avoir propose **Télécharger le
PDF**. Le fichier est généré côté serveur à partir du snapshot et des lignes
historiques (`GET /api/v1/documents/:id/pdf`). Un brouillon est filigrané
BROUILLON et n’invente pas de numéro. Un paiement ultérieur ne réécrit pas le
PDF de la facture émise. Détail : [PDF des documents](17-pdf-documents.md).

Une facture ou un avoir **émis** peut aussi proposer **Télécharger le Factur-X**
si le snapshot suffit au profil EN 16931. Sinon le PDF A12 reste disponible et
le refus est structuré. Détail : [Facturation électronique](18-facturation-electronique.md).

Un document **émis** propose aussi **Envoyer par e-mail** : PDF A12 en pièce
jointe, destinataire par défaut = snapshot, historique `DocumentEmailDelivery`.
Cet envoi ne change ni le statut du document, ni le solde, ni une transmission
PA. `SENT` côté e-mail signifie « accepté par le fournisseur », pas « délivré ».
Détail : [E-mails de documents](21-emails-documents.md).

## États : document ≠ paiement ≠ échéance

`Document.status` décrit uniquement le cycle documentaire :

```text
DRAFT
SENT          (devis envoyé / facture émise)
ACCEPTED / REFUSED   (devis)
CANCELLED
```

`PAID`, `PARTIALLY_PAID` et `OVERDUE` **n’existent pas** sur `Document.status`.
L’échéance reste `dueDate`. Le retard UI est `remainingTtcCents > 0` et
`dueDate < maintenant`. Une facture `remaining = 0` n’est jamais en retard.
Les paiements sont une collection `Payment` liée à la facture.

### Cycle documentaire

```text
QUOTE
  DRAFT → SENT → ACCEPTED | REFUSED | CANCELLED
  DRAFT → CANCELLED
  ACCEPTED, REFUSED, CANCELLED : terminaux

INVOICE
  née SENT depuis un devis accepté (pas de brouillon produit)
  DRAFT → CANCELLED   (abandon d’un brouillon, s’il existe)
  SENT  : aucune transition de statut
          correction économique = CREDIT_NOTE
  CANCELLED : terminal, **legacy** seulement

CREDIT_NOTE
  DRAFT → SENT
  DRAFT peut être abandonné (suppression physique du brouillon)
  SENT : immutable, pas d’annulation
```

Une facture `CANCELLED` déjà en base reste lisible comme **legacy cancelled
invoice**. Pas de backfill en faux avoir. Elle refuse un nouveau paiement et
un nouvel avoir (`status !== SENT`). Aucune nouvelle facture émise ne peut
passer à `CANCELLED`.

Le verrou transactionnel est `docs:${organizationId}` (advisory lock
PostgreSQL). Il est organisationnel parce que les séquences DEV/FA/AV et le
solde (avoirs + paiements) partagent le même tenant : un verrou par facture
laisserait deux écritures concurrentes avancer deux séquences ou un avoir et
un paiement hors invariant. Une évolution future vers un verrou
document/facture n’est justifiée que si la contention le mesure.

Seule suppression physique runtime : `discardCreditNoteDraft` sur un avoir
`DRAFT` (lignes en cascade). Aucun `document.delete` / `payment.delete` sur
une pièce émise.

## Avoirs

`DocumentKind.CREDIT_NOTE` réutilise `Document` (numéro, organisation, client,
lignes, snapshots, devise, TVA, dates). Pas de table parallèle. Un avoir n’existe
pas sans facture source de la **même** organisation.

```text
QUOTE  --sourceDocumentId unique-->  INVOICE
INVOICE --creditedInvoiceId 1:N-->  CREDIT_NOTE[]
INVOICE --Payment 1:N-->            PAYMENT[]
```

`sourceDocumentId` n’est **pas** réutilisé : son unicité reste « un devis → une
facture ». `creditedInvoiceId` + `organizationId` forme une FK composite
`ON DELETE RESTRICT` vers `(Document.id, Document.organizationId)`.

Chaîne historique :

```text
CatalogItem  → copie →  QuoteLine  → copie →  InvoiceLine  → copie →  CreditNoteLine
```

L’avoir ne relit jamais `CatalogItem`, `Customer` ni `Organization` live. Il
copie le snapshot A7 de la **facture**, puis recalcule `vatBreakdownSnapshot`
et `operationCategory` à partir de **ses** lignes.

### Numérotation

Séquence `DocumentSequence` (`CREDIT_NOTE`, année), verrou `docs:${organizationId}`.
Format `AV-AAAA-NNNN`. Un numéro émis n’est jamais réutilisé. Un échec d’émission
(sur-crédit, validation) n’incrémente pas la séquence.

### Signe et lignes

Les lignes d’avoir stockent des **magnitudes positives** (quantité, PU, HT, TVA,
TTC). Le sens économique vient de `DocumentKind = CREDIT_NOTE`. Pas de quantité
et PU négatifs simultanés.

`DocumentLine.sourceInvoiceLineId` rattache chaque ligne d’avoir à la ligne de
facture correspondante (`ON DELETE RESTRICT`, pas de cascade vers l’historique
facture). La ligne d’avoir conserve ses propres description, quantité, unité,
PU, remise, TVA, `itemKind` et montants. Un avoir partiel crédite une quantité
inférieure (y compris décimale) ; le backend refuse une quantité supérieure au
reste **émis** de cette ligne.

### Sur-crédit

À la création d’un brouillon et à l’émission, sous le même verrou documentaire :

1. revalider la facture source (`SENT`, même organisation) ;
2. pour chaque ligne, quantité demandée ≤ reste des avoirs **émis** sur cette ligne ;
3. TTC de l’avoir ≤ TTC facture − somme TTC des avoirs **émis**.

Les brouillons **ne consomment pas** le reste. Deux brouillons peuvent donc se
chevaucher ; le premier émis passe, le second est refusé en `409` sans numéro.
Un brouillon déjà plus grand que le reste émis est aussi refusé en `409`.

Helpers A9 `netAfterCredits.remainingTtcCents` = **net avant paiements**.
Le solde exposé (`invoiceSettlement.remainingTtcCents`, API mobile) est le
**reste à payer** après avoirs **et** paiements confirmés. `netTtcCents` est
le net après avoirs.

```text
gross TTC
− avoirs émis
= net facturé

net facturé
− paiements CONFIRMED
= reste à payer
```

Les écritures garantissent `remaining >= 0`, `credits <= gross`, `paid <= net`.
Un remaining négatif n’est pas un cas métier : c’est une incohérence.

`settlementState` calculé, non persisté :

| Condition | État |
| --- | --- |
| net > 0, paid = 0 | `UNPAID` |
| 0 < paid < net | `PARTIALLY_PAID` |
| paid = net > 0 | `PAID` (y compris après avoirs : net 800, paid 800) |
| net = 0, credits = gross, paid = 0 | `CREDITED` (pas `PAID`) |

Un avoir ne peut pas rendre `paid > net`. Contrôle sous le verrou
`docs:${organizationId}` à la création/mise à jour/émission. Message 409 :
remboursement pas encore disponible.

`dueDate` n’est pas utilisé sur un avoir (forcé à `null` à l’émission).
`createdAt` / `issuedAt` suffisent. Motif libre `creditReason` (500 caractères).

### États avoir

`DRAFT` (brouillon, abandonnable) → `SENT` (émis, immutable, numéro AV).
`ACCEPTED` / `REFUSED` n’ont pas de sens ici : aucune action ne les pose.
Pas d’annulation d’avoir émis en A9.

### Web

Les avoirs n’ont pas de liste dédiée : ils apparaissent sur le détail de la
facture (`/espace/factures/[id]`, section Avoirs) et en détail
`/espace/avoirs/[id]`. Création : `/espace/factures/[id]/avoir` (total ou
partiel, identité non resaisie). OWNER/ADMIN voient « Créer un avoir » si un
reste à payer (`settlement.remainingTtcCents`) existe.

## Paiements

`Payment` est une entité distincte, pas un `Document`. Une facture `SENT` de
la **même** organisation reçoit `0..n` paiements.

Champs : `amountCents` (entier > 0, CHECK SQL), `currency` copiée de la
facture (jamais du navigateur), `paidAt` (date d’encaissement déclarée,
distincte de `createdAt`), `method` (`BANK_TRANSFER`, `CARD`, `CASH`,
`CHECK`, `DIRECT_DEBIT`, `PAYPAL`, `OTHER`), `reference` / `note`
optionnels, `status` (`CONFIRMED` | `CANCELLED`), `provider`
(`MANUAL` par défaut, `STRIPE` / `PAYPAL` réservés), `providerPaymentId`
nullable. Unique `(organizationId, provider, providerPaymentId)` pour une
future idempotence webhook ; les paiements manuels laissent l’ID nulle
(plusieurs `NULL` PostgreSQL).

Un enregistrement web est immédiatement `CONFIRMED` / `provider = MANUAL`.
`CARD` ou `PAYPAL` comme **moyen déclaré** n’appellent aucun PSP.

`cancelPayment` : `CONFIRMED` → `CANCELLED`. Le rang reste ; il sort de
`paidTtcCents`. Pas de suppression physique.

Seule une facture `INVOICE` + `SENT` reçoit un paiement. `QUOTE`,
`CREDIT_NOTE`, brouillon et facture `CANCELLED` (legacy) sont refusés. Le
surpaiement est refusé en 409 sous le verrou `docs:${organizationId}` :
recharger facture, avoirs émis, paiements confirmés, calculer le reste,
créer. Deux requêtes concurrentes ne peuvent pas dépasser le solde.

`Payment` n’est **pas** l’abonnement Mombongo.

Web : section Paiements sur `/espace/factures/[id]`, résumé de solde,
formulaire prérempli du reste, OWNER/ADMIN/ACCOUNTANT. MEMBER ne voit pas
l’action.

## Snapshot A7

À l’émission seulement. Compatible A2 : `issuerNameSnapshot` et les colonnes
client A2 sont conservées. Les nouvelles colonnes sont nullables ; un
document A2 déjà émis n’est pas recalculé depuis les fiches live.

### Émetteur (Organization)

Nom affichable (`tradeName` sinon `legalName` sinon `name`), `entityKind`,
raison sociale, nom commercial, forme juridique, SIREN, SIRET, TVA, e-mail,
téléphone, pays, devise, adresse choisie, option TVA d’après les débits,
conditions de règlement / escompte / pénalités / indemnité de recouvrement.

### Destinataire (Customer)

`partyKind`, civilité / prénom / nom (PERSON), raison sociale / nom
commercial / SIREN / SIRET / TVA (COMPANY), nom d’affichage, e-mail,
téléphone, pays, identifiant historique `companyNumber` s’il existe.

Un `Customer PERSON` n’exige jamais SIREN, SIRET ni TVA pour émettre. Un
`COMPANY` peut être émis avec les informations professionnelles disponibles ;
A7 ne qualifie pas encore e-invoicing / e-reporting / hors champ.

### Adresses

Règle émetteur, centralisée (`pickIssuerAddress`) : uniquement les adresses
`customerId = null` de **cette** organisation. Ordre : première `BILLING`
(plus ancienne), sinon première `OFFICE`, sinon la plus ancienne adresse
émetteur. Jamais une adresse client, jamais une autre organisation.

Règle facturation client (`pickBillingAddress`, inchangée dans l’esprit A2) :
première `BILLING` de la fiche, sinon la plus ancienne adresse **client**.

Règle livraison (`pickDeliveryAddress`) : première `SHIPPING` client, sans
repli sur la facturation. Snapshots distincts
(`customerAddressSnapshot` / `customerDeliveryAddressSnapshot` et JSON
associé). Une adresse de livraison n’écrase jamais la facturation.

Le texte et le JSON suffisent à reconstruire l’adresse historique sans
relire `Address` live.

### Fiscalité snapshotée

`issuerVatOnDebitsSnapshot` copie `Organization.vatOnDebits` (paramètre
d’émetteur, pas une case à cocher par facture). `vatBreakdownSnapshot`
fige la TVA par taux. `operationCategory` (`GOODS` / `SERVICES` / `MIXED`)
est calculé à l’émission depuis `DocumentLine.itemKind` (`PRODUCT` /
`SERVICE`). Le catalogue A8 réutilise ce même enum ; il n’introduit pas un
second type parallèle.

## Dates

| Champ | Rôle |
| --- | --- |
| `createdAt` | création du brouillon |
| `issuedAt` | émission (numéro définitif) |
| `validUntil` | validité du devis, distincte de l’émission |
| `dueDate` | échéance de la facture |
| `supplyDate` | date de prestation / livraison si renseignée |

`customerOrderNumber` est optionnel.

## Lignes, TVA, totaux, arrondis

`DocumentLine.quantity` est `Decimal(12,3)` (1,5 h, 2,75 kg). Unité libre
parmi une liste courte (`unité`, `heure`, `jour`, `kg`, `pièce`, `forfait`)
pour un futur mapping UBL/CII, sans taxonomie réglementaire. Remise
`discountBps`. Nature `itemKind`.

Prix et totaux restent en **centimes entiers**. Le backend recalcule HT /
TVA / TTC à partir des lignes ; le navigateur n’est pas une source. Une
facture peut porter plusieurs taux ; les totaux documentaires sont la somme
des lignes. À l’émission, `vatBreakdownSnapshot` persiste le détail par
taux (recalculable, mais figé pour l’historique et le PDF).

Règle d’arrondi : quantité → milli-unités entières ; HT =
`round_half_up(qty_milli × pu_centimes × (10000 − remise_bps) / 10_000_000)` ;
TVA = `round_half_up(HT × vat_bps / 10_000)` ; TTC = HT + TVA. Calculs en
`BigInt`.

## Validation d’émission

`validateDocumentForIssue` s’exécute à l’envoi du devis, à la conversion
en facture et à l’émission d’un avoir : au moins une ligne, montant HT positif,
noms émetteur et destinataire affichables. Pour un avoir, l’identité vérifiée
est celle du snapshot de la facture (client live archivé ou renommé : l’avoir
reste possible). Un prospect incomplet reste créable. Un particulier n’est pas
bloqué pour absence d’identifiants d’entreprise.

## Devis → facture

La facture reprend le snapshot A7 du devis et ses lignes (description,
quantité, unité, PU, remise, TVA, totaux, `itemKind`). Elle ne relit pas
`Organization`, `Customer` ni `CatalogItem` live. `dueDate` et `issuedAt` sont
ceux de l’émission de la facture.

## Catalogue

`CatalogItem` est un modèle **live** d’aide à la saisie. `DocumentLine` est
l’**historique**. Chaîne obligatoire :

```text
CatalogItem  → copie →  Quote DocumentLine  → copie →  Invoice DocumentLine  → copie →  CreditNote DocumentLine
```

Aucune relation `DocumentLine.catalogItemId` n’a été ajoutée : la copie des
valeurs suffit, et une FK historique risquerait une cascade contraire à A4
sans bénéfice documentaire. L’ID catalogue n’est acceptée qu’à
`createQuote` / `addQuoteLine` pour vérifier l’appartenance et le statut
actif, puis elle est abandonnée.

Champs : `organizationId`, `itemKind` (PRODUCT / SERVICE), `reference`
optionnelle unique par organisation lorsqu’elle est renseignée (plusieurs
`NULL` autorisés par PostgreSQL), `name`, `description` optionnelle, `unit`,
`unitPriceCents` (HT, même stratégie que les lignes), `vatBps`, `active`
(défaut `true`). Pas de suppression physique, pas de quantité permanente, pas
de `discountBps`, pas de coût interne, pas de tarif client.

Le prix catalogue est exprimé dans la **devise live de l’Organization**. Le
document continue d’utiliser sa devise snapshotée A7. Pas de conversion FX :
si la devise d’émetteur change plus tard, le catalogue live et les anciens
documents peuvent diverger ; c’est documenté, pas converti.

Un article inactif reste lisible sur sa fiche, disparaît du sélecteur par
défaut, et ne peut plus être injecté dans une nouvelle ligne. Les documents
déjà créés restent intacts.

Permissions : `canManageCatalog` = OWNER / ADMIN / MEMBER (comme la création
de devis). ACCOUNTANT lit le catalogue, n’écrit pas. Isolation A1 : une
organisation ne lit, ne modifie, ne désactive ni n’utilise le catalogue d’une
autre. Un même article sert PERSON et COMPANY : pas de catalogue B2B/B2C
distinct.

## Legacy

Les documents émis avant A7 gardent leurs colonnes A2. Les nouvelles
colonnes restent `null`. Aucun backfill live vers l’identité A7 : le
backfill A2 historique n’est toujours pas une reconstitution, et n’a pas
été étendu.

## E-invoicing (A13.1 — génération sans transmission)

Le snapshot A7 alimente un `ElectronicInvoiceModel` distinct du PDF, avec
qualification TVA et unité structurée copiées sur la ligne, un XML CII et un
Factur-X EN 16931. Classification B2B/B2C/international ; `REVIEW_REQUIRED`
si l’assujettissement professionnel manque. Pipeline : métier → XML → XSD
sous-ensemble → EN 16931 sous-ensemble → PDF/A-3 structurel. Détail :
[Facturation électronique](18-facturation-electronique.md).

## Transmission plateforme agréée (A14)

Mombongo n’est pas une plateforme agréée. A14 prépare le transport
(`ElectronicTransmission`, gateway, adapter MOCK, webhooks génériques)
sans appeler Sage, Docoon, WeInvoice ni aucun autre prestataire. Une facture
émise n’est pas transmise automatiquement. Le cycle documentaire reste
indépendant du cycle électronique. La configuration se fait dans
`/espace/integrations`. Détail :
[Plateforme agréée](19-plateforme-agreee.md) et
[Intégrations](20-integrations.md).

## Mobile

`GET /api/v1/mobile/quotes` et `/invoices` exposent `currency` (et `dueDate`
pour les factures). Les factures ajoutent `grossTtcCents`, `creditedTtcCents`,
`netTtcCents`, `paidTtcCents`, `remainingTtcCents` (reste à payer) et
`settlementState`. Pas de création d’avoir ni de saisie de paiement mobile
en A10. `GET /api/v1/mobile/catalog` liste les articles **actifs**
de l’organisation résolue par Membership ; le mobile peut préremplir une ligne
de devis. Pas d’administration catalogue complète sur mobile. Le backend reste
l’autorité. Le détail documentaire web n’est pas reproduit. Le Factur-X A13
est exposé en lecture : `GET /api/v1/mobile/documents/:id/factur-x`.
Les factures mobiles lisent aussi `electronicTransmissionStatus` /
`electronicTransmissionRoute` lorsqu’une transmission existe. Pas de
configuration PA sur mobile.

## Vérifications

Tests backend : snapshots émetteur/PERSON/COMPANY, adresses distinctes,
devis → facture malgré données live B, multi-TVA, quantité décimale, USD,
legacy A2 lisible sans faux backfill, isolation, copie catalogue → devis →
facture malgré modification live, désactivation, permissions catalogue,
avoir total / partiel / multiples, sur-crédit 409 sans numéro, snapshot
facture → avoir malgré fiches live B, TVA d’avoir, devise, isolation
inter-entreprises, permissions d’émission d’avoir, FK facture → avoir,
paiement total/partiel, avoir+paiement, CREDITED ≠ PAID, PAID après avoir+solde
du net, surpaiement 409, concurrence, annulation de paiement, facture émise
non annulable par statut, legacy CANCELLED, isolation paiement,
permissions ACCOUNTANT/MEMBER, devise USD, FK facture → paiement,
séquences DEV/FA/AV et changement d’année, B2C, B2B, historique live,
ElectronicInvoiceModel / CII / Factur-X EN 16931, qualification TVA 0 %,
unités UNECE, snapshots fiscaux catalogue, isolation Factur-X, refus
structuré legacy, validateurs XSD / EN 16931 / PDF/A structurels,
isolation des transmissions, MOCK succès/rejet/retry/idempotence,
webhooks dupliqués et forgés, B2B e-invoicing, B2C e-reporting, avoir,
préparation du reporting de paiement distinct de `PaymentProvider`.

Tests navigateur : devis B2C et B2B, identité historique, devise, échéance,
création produit/service, sélection catalogue, ligne libre, historique,
désactivation, avoir total, avoir partiel et multiples, sur-crédit refusé,
absence de l’action d’avoir pour un membre, paiement total/partiel,
surpaiement, annulation de paiement, avoir+paiement, saisie comptable,
absence membre, consolidation devis→facture→avoir→paiement, résumé financier
sans bouton d’annulation de facture émise.
