# Architecture

## État
Socle Next.js et module identité connectés à PostgreSQL 18 local (port 5433).
Migrations appliquées jusqu’aux paiements A10 (`Payment`) et à la
consolidation A11 (cycle documentaire, facture émise immuable hors avoir).
Le PDF humain A12 est livré. Le socle de facture électronique A13 + A13.1
(modèle canonique, qualification TVA, unités UNECE, CII, Factur-X EN 16931,
pipeline de validation) est livré. Le socle A14 de **transmission** vers une
plateforme agréée est livré **sans connecteur réel** (gateway, adapter MOCK,
webhooks génériques). Le registre A14.1 décrit aussi les PSP futurs (Stripe /
PayPal) **sans les brancher**. L’envoi manuel par e-mail A16 est livré
(`DocumentEmailDelivery`, PDF A12 en pièce jointe). A15.0 est validé ; A15.1
(connecteur PA réel) reste différé. Stripe/PayPal et les frais restent
planifiés. Les fixtures DEMO (`DemoDataset`) ne s’exécutent jamais au
démarrage ni en production.

## Organisation
- `apps/web` : Next.js App Router, React, TypeScript strict, Tailwind 4, composants shadcn et Sonner.
- `packages/contracts` : schémas Zod partagés entre web et mobile, sans secrets ni dépendances serveur.
- `prisma` : modèle de données et futures migrations versionnées.
- `apps/mobile` : Expo SDK 57, React Native, authentification par jetons et tableau de bord.

Le backend est porté par Next.js. Les formulaires web privilégient les Server Actions. Les routes `/api/v1` restent pour le mobile, le healthcheck et les contrôles d’origine. Actions et API appellent les mêmes services métier côté serveur. Prisma et les clés fournisseurs ne doivent jamais être importés dans un composant client ou le mobile.

ESLint plat (`eslint-config-next` + TypeScript) et une CI GitHub Actions (lint, types, migrations, tests d’auth, build Webpack) accompagnent le socle. Tailwind 4 expose les jetons shadcn ; les pages marketing restent des Server Components, le guide étant le seul îlot client de l’accueil.

## Isolation
Un User possède un type INDIVIDUAL ou BUSINESS. Un particulier possède un espace
personnel sans Organization. Une Organization représente le **tenant** et
l’**entité facturante** ; un User BUSINESS peut appartenir à plusieurs
entreprises via Membership. L’organisation active est résolue explicitement
(cookie web `mombongo-active-org`, en-tête mobile `X-Organization-Id`) puis
revalidée par un Membership `(userId, organizationId)`.
Un identifiant fourni par le client n’est jamais une autorisation. Toute lecture
et mutation métier vérifie la session, l’appartenance et le rôle côté serveur.
Les requêtes Prisma filtrent explicitement organizationId.

`User.accountType` n’est pas l’identité légale de l’émetteur. Un entrepreneur
en nom propre facture via une Organization (`entityKind` SOLE_TRADER ou
COMPANY, raison sociale, SIREN/SIRET/TVA, adresses d’émetteur). Un client
particulier est un `Customer` `PERSON`, distinct du compte INDIVIDUAL.

Les relations composites doivent empêcher les liens entre entreprises. Les fiches clients et les articles du catalogue filtrent `organizationId` à chaque lecture et mutation.
Des tests d’accès inter-entreprises couvrent déjà ces modules.

`CatalogItem` est une aide à la saisie, pas une source historique. Il appartient
à une seule Organization (`ON DELETE CASCADE` : ce n’est pas un document).
`DocumentLine` ne porte **pas** de `catalogItemId` : à la sélection, les valeurs
sont copiées (description, unité, PU HT, TVA, `itemKind`). Modifier ou
désactiver le catalogue ne touche jamais un devis ou une facture déjà enregistré.
Une ID catalogue d’une autre organisation est refusée à l’insertion.
Détail : [Facturation](04-facturation.md).

## Exploitation cible
PostgreSQL 18 local, migrations Prisma contrôlées, sauvegardes et essais de restauration. Stockage objet privé pour justificatifs et pièces jointes ; URLs temporaires. Travaux asynchrones persistants pour emails, rappels, OCR et webhooks, avec reprises et idempotence. Journal d’audit sans secrets ni contenu personnel inutile.

Montants en centimes entiers ; quantités en `Decimal(12,3)`. Les calculs de
ligne utilisent des milli-quantités `BigInt` et un arrondi half-up, jamais
`number` IEEE pour le financier. Dates stockées en UTC et affichées dans le
fuseau de l’entreprise.

Un document émis fige un snapshot A7 (émetteur, destinataire, adresses,
conditions, TVA par taux). Il est pris à l’envoi du devis, recopié sur
la facture issue de ce devis, puis recopié de la facture vers chaque avoir —
jamais relu depuis les fiches live. Le PDF A12 est rendu uniquement depuis
ce snapshot et les lignes historiques. Le Factur-X A13 est construit sur le
même snapshot via un `ElectronicInvoiceModel` distinct du PDF. La transmission
A14 est un cycle **séparé** (`ElectronicTransmission`), consommé via
`EInvoiceGateway` : le métier de facturation n’importe aucun SDK fournisseur.
Le registre des connecteurs (A14.1) décrit les PA et les PSP sans mélanger
leurs adapters. L’e-mail A16 réutilise le PDF A12 et n’écrit aucune
`ElectronicTransmission`. Détail : [Facturation](04-facturation.md),
[PDF](17-pdf-documents.md),
[Facturation électronique](18-facturation-electronique.md),
[Plateforme agréée](19-plateforme-agreee.md),
[Intégrations](20-integrations.md) et
[E-mails de documents](21-emails-documents.md).

`Document.status` reste documentaire (`DRAFT`, `SENT`, `ACCEPTED` /
`REFUSED`, `CANCELLED`). Une **facture émise** (`INVOICE` + `SENT`) ne passe
plus à `CANCELLED` : la correction est un avoir. `CANCELLED` reste légitime
pour un devis, un brouillon de facture, et les factures legacy déjà annulées.
L’échéance est `dueDate`. Le solde
(`gross` / `credited` / `net` / `paid` / `remaining`) et `settlementState`
(`UNPAID` / `PARTIALLY_PAID` / `PAID` / `CREDITED`) sont calculés, jamais
stockés sur `Document`. Un retard UI se déduit de `remaining > 0` et
`dueDate < maintenant`. Détail : [Facturation](04-facturation.md).

Les FK `Organization → Document`, `Customer → Document`,
`Document.sourceDocumentId` (devis → facture),
`Document.creditedInvoiceId` (facture → avoir, composite avec `organizationId`)
et `Payment` → `Document` / `Organization` (composite facture, `RESTRICT`)
sont en `ON DELETE RESTRICT`. Une organisation, une fiche, un devis source, une
facture liée à un avoir **ou à un paiement** ne peut pas être effacée, y compris
hors de l’application. Les lignes d’un document restent en cascade sur leur parent ;
`DocumentLine.sourceInvoiceLineId` (ligne d’avoir → ligne de facture) est
`RESTRICT`. Le catalogue ne crée aucune cascade vers `Document` / `DocumentLine`.
`Payment` n’est pas un `Document` : c’est l’encaissement d’une facture client,
distinct d’un futur abonnement Mombongo. `Payment.provider` (saisie manuelle /
futurs Stripe-PayPal) n’est pas une plateforme agréée.

## Références techniques
- https://nextjs.org/docs/app/getting-started/installation
- https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction

Les versions effectivement installées sont figées dans package-lock.json.

Les futurs documents personnels seront isolés par userId ; les documents professionnels
restent isolés par organizationId. Voir [les profils](14-particuliers-entreprises.md).
