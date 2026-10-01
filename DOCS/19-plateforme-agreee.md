# Plateforme agréée — socle multi-provider (A14)

État : **socle A15.0 livré et validé**. Mombongo est une **solution compatible**
de facturation. Une **plateforme agréée (PA)** est un opérateur réglementaire
externe. Mombongo n’est pas une PA, n’appelle aucun prestataire réel et
n’embarque aucun SDK Sage / Docoon / WeInvoice. **A15.1** (connecteur WeInvoice
réel / sandbox professionnel) est **différé**. L’adapter **MOCK** est conservé.

L’e-mail A16 n’écrit aucune `ElectronicTransmission` et ne déclenche ni PA
ni e-reporting.

## Chaîne

```text
Mombongo
  → ElectronicInvoiceModel / artifact (A13.1)
  → EInvoiceGateway
  → EInvoiceProviderAdapter (registry)
  → Plateforme agréée (futur connecteur)
```

Les services de facturation (`invoices/service.ts`, `credit-notes/service.ts`)
n’importent aucun client fournisseur. Ils restent propriétaires du cycle
documentaire. A14 consomme les artefacts A13.1 ; il ne régénère pas le Factur-X.

## Cycles d’état distincts

`Document.status` reste documentaire (`DRAFT`, `SENT`, …). On n’y ajoute pas
`SUBMITTED` / `DELIVERED` / `REJECTED`.

Une facture peut être `Document.status = SENT` et pourtant :

- transmission `PENDING` / `QUEUED` / `SUBMITTED` / `ACCEPTED` / `DELIVERED`
- ou `REJECTED` / `FAILED`

Ces noms sont **internes Mombongo**. Ce ne sont pas des statuts DGFiP.

Trois axes UI, jamais fusionnés :

| Axe | Source | Exemple |
| --- | --- | --- |
| Document | `Document.status` | Émise |
| Paiement | solde calculé A10 | Partiellement encaissé |
| Transmission électronique | `ElectronicTransmission.status` | En attente |

## Persistance

Migration additive `20260929250000_electronic_invoicing_platform`.

### ElectronicInvoicingConnection

Une organisation peut préparer **une** connexion (`organizationId` unique) :

- `provider` (A14 : `MOCK` uniquement) et `connectorKey` (A14.1, défaut `MOCK`)
- `status` `INACTIVE` / `READY` / `ERROR` / `DISABLED`
- `environment` : le MOCK n’accepte que `TEST` (sandbox interne). `PRODUCTION`
  est refusé, pas substitué.
- `externalAccountId` optionnel, identifiant de compte **de test**, pas un secret
- `credentialRef` optionnel : référence opaque, jamais un secret en clair

Aucun credential fournisseur n’est stocké. Le choix de provider est lu ici,
puis résolu par le registre A14.1. L’historique d’une transmission **copie**
le `provider` et le `connectorKey` au moment de l’opération : un changement
ultérieur de PA ne réécrit pas le passé.

La configuration UI vit dans `/espace/integrations`. Voir
[Intégrations](20-integrations.md).

### ElectronicTransmission

Appartient à `organizationId` (+ `documentId` et/ou `paymentId`). Porte
`direction`, `kind`, `route`, `operation`, `status`, `idempotencyKey`,
identifiants provider, horodatages et dernière erreur (classe / code /
message utilisateur). Isolation composite document
`[documentId, organizationId]`.

### ElectronicTransmissionEvent

Historique **append-only**. Types internes : `CREATED`, `VALIDATED`, `QUEUED`,
`SUBMITTED`, `ACCEPTED`, `DELIVERED`, `REJECTED`, `ERROR`, `WEBHOOK_RECEIVED`.
Champs prévus pour plus tard : `providerEventId`, `providerStatus`,
`occurredAt`, `receivedAt`, `metadata` (jamais de secret). Unicité
`(organizationId, providerEventId)` pour l’idempotence webhook.

### ElectronicInboundDocument

Frontière **réception** : une facture fournisseur transportée n’est **pas** un
`Document INVOICE` client. Pas de module achats en A14. Déduplication
`(organizationId, provider, providerDocumentId)`.

## Gateway et adapters

`EInvoiceGateway` : `submitOutbound`, `getTransmissionStatus`,
`preparePaymentReporting`. Réservé plus tard : e-reporting DGFiP réel,
annuaire, accusé/rejet inbound, reporting de paiement transmis.

`EInvoiceProviderAdapter` traduit Mombongo ↔ contrat fournisseur. Le registry
centralise le choix. Interdit : `if (provider === …)` dispersé dans le métier.

A14 n’enregistre qu’un adapter : **MOCK** (fournisseur de test interne, pas
une PA). Il simule succès, rejet, erreur temporaire, retry, webhook dupliqué
et inbound. Aucun appel réseau prestataire.

## Idempotence

Clé interne : `(organizationId, operation, idempotencyKey)`.

- Soumission d’une pièce : `idempotencyKey = documentId`.
- Reporting de paiement préparé : `idempotencyKey = paymentId`.
- Réception : `idempotencyKey = providerDocumentId`.

Deux appels identiques réutilisent la même transmission. Une erreur
`TEMPORARY` / `RATE_LIMIT` peut être rejouée sur la **même** clé. Un rejet
métier ou une erreur permanente ne boucle pas.

## Webhooks

`POST /api/v1/e-invoicing/webhooks/:provider` — générique, aucun endpoint
Sage/Docoon/WeInvoice.

- Authenticité : adapter (`timestamp` + HMAC, fenêtre 5 min).
- Compte résolu par l’en-tête de test `x-mombongo-account` → connexion
  persistée. **Jamais** `payload.organizationId`.
- Événement inconnu : 200 ignoré.
- Doublon `providerEventId` : traité une seule fois.
- Logs : `organizationId`, `documentId`, `transmissionId`, `provider`, `event`.
  Pas de payload facture, pas de secret.

Le HMAC MOCK dérive de `AUTH_SECRET` et de l’id de connexion. Aucun secret PA
dans le dépôt.

## Retry / erreurs

Classes : `TEMPORARY`, `PERMANENT`, `VALIDATION`, `AUTHENTICATION`,
`RATE_LIMIT`, `UNKNOWN`. L’UI affiche le message utilisateur ; le code
technique reste séparé. Pas de stack trace.

## B2B / B2C / international

A13.1 reste propriétaire de la classification.

- `E_INVOICING` (B2B France admissible) → `SUBMIT_INVOICE` / `SUBMIT_CREDIT_NOTE`.
- `E_REPORTING` (particulier `PERSON`, international admissible) →
  `SUBMIT_E_REPORTING`, jamais un e-invoicing B2B de confort.
- `REVIEW_REQUIRED` / `OUT_OF_SCOPE` : pas de soumission.
- Une pièce invalide A13.1 : aucune ligne de transmission, aucun appel adapter.

Aucune transmission réelle vers l’extérieur en A14. L’émission d’une facture
n’envoie pas automatiquement vers une PA.

## Paiements

`Payment.provider` (`MANUAL` / `STRIPE` / `PAYPAL`) n’est **pas** une PA.
`preparePaymentReporting` crée une transmission `PAYMENT_REPORTING` `PENDING`
sans appeler de provider. Stripe/PayPal restent hors périmètre.

## Permissions

| Permission | OWNER | ADMIN | MEMBER | ACCOUNTANT |
| --- | --- | --- | --- | --- |
| `canIssueInvoices` | oui | oui | oui | non |
| `canSubmitElectronicInvoicing` | oui | oui | non | non |
| `canManageElectronicInvoicing` | oui | oui | non | non |
| Lecture du statut de transmission | oui | oui | oui | oui |

`canManageElectronicInvoicing` et `canSubmitElectronicInvoicing` ne sont **pas**
déduits de `canIssueInvoices`. Configurer une PA est plus sensible que créer
un devis. Lecture : tout membre de l’organisation, jamais un tenant étranger.
Les credentials PSP relèvent de `canManagePaymentIntegrations` (même matrice
OWNER/ADMIN), jamais de `canRecordPayments`. Voir
[Intégrations](20-integrations.md).

## Hors périmètre (inchangé)

Connecteurs réels, credentials PA, e-reporting DGFiP, annuaire, Peppol,
Stripe/PayPal, Refund, module achats complet, abonnement Mombongo.
