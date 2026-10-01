# Mombongo — contexte de passation

**Source de vérité de reprise du projet.**

**Avant toute intervention Mombongo, Cursor doit lire `DOCS/PROJECT-CONTEXT.md`.**

Dans un nouveau chat ChatGPT, fournir ce fichier comme contexte de référence.

Ne remplace pas les fiches détaillées de `DOCS/` : il les indexe. En cas d’écart avec une fiche plus ancienne, **ce document fait autorité** pour les décisions listées ici.

---

## 1. Identité du projet

| Élément | Valeur |
| --- | --- |
| Nom produit | **Mombongo** |
| Packages npm | `@mombongo/web`, `@mombongo/mobile`, `@mombongo/contracts` |
| Chemin DEV | `/soft/dev/nextjs/facturia` |
| Nom historique du clone | `facturia` — **ne pas renommer** le répertoire local (branding ≠ chemin) |
| PostgreSQL local (historiquement) | utilisateur / base encore nommés `facturia` |
| Monorepo | `apps/web` (Next.js 16, port **9070**), `apps/mobile` (Expo SDK 57), `packages/contracts` (Zod) |
| Données | Prisma 7, PostgreSQL **18** (cluster DEV : `127.0.0.1:5433`, `.local/postgres`) |
| Cadre réglementaire / fiscal | **France** en premier. Pas une limitation technique à l’EUR. |
| Devises | Devise **snapshotée** par pièce. Scénarios multi-devise documentés. **Pas de FX automatique.** |
| Clients facturés | **B2C et B2B** : particuliers (`PERSON`) et entreprises (`COMPANY`) |
| Domaine public prévu | `https://mombongo.fr` |
| Mot-signe | Mombongo |

**Facturia** n’est plus le nom produit. Il subsiste uniquement comme nom de dossier, d’utilisateur PostgreSQL local et, parfois, de chemins historiques (`facturia-challenge`, reprise temporaire `facturia.organization` côté mobile).

---

## 2. Règles de reprise

1. **Avant toute intervention Mombongo, Cursor doit lire `DOCS/PROJECT-CONTEXT.md`.**
2. Dans un **nouveau chat ChatGPT**, coller ce fichier (ou son extrait à jour) comme contexte de référence.
3. **Un lot marqué `LIVRÉ / VALIDÉ` ne doit pas être réaudité par défaut.** Un nouvel audit n’est justifié que par une anomalie, une régression, une contradiction nouvelle ou une demande explicite.
4. Ne pas confondre Mombongo avec un autre projet. Ne pas importer d’infra, SHA, migrations ou vocabulaire d’un autre dépôt.
5. Ne pas inventer une information d’infrastructure absente d’ici. L’architecture de production ci-dessous est **décidée** ; elle n’est **pas déployée**.
6. Une existence dans `DOCS/` n’implique pas toujours une implémentation : vérifier l’état. Les fonctionnalités et invariants **actuellement documentés** font autorité ; ne pas reconstruire une numérotation historique absente.
7. Le backend (services Next.js) est l’autorité. Une ID client n’est pas une autorisation. Prisma et secrets : jamais dans un composant client ni dans Expo.
8. Ne pas commencer A15.1, Stripe/PayPal réels, relances auto, webhooks Resend complets, module achats ou nouvelles fonctions fiscales **sauf décision explicite ultérieure**.

---

## 3. Architecture fonctionnelle actuelle

Synthèse des domaines **implémentés**. Détail dans les fiches liées.

| Domaine | Rôle | Fiche |
| --- | --- | --- |
| Organisations / multi-tenant | `Organization` = tenant + entité facturante. Org active : cookie web `mombongo-active-org`, en-tête mobile `X-Organization-Id`, puis Membership. | [01](01-architecture.md), [03](03-clients.md) |
| Utilisateurs / memberships / permissions | Argon2id, code e-mail 6 chiffres, NextAuth, rôles OWNER/ADMIN/MEMBER/ACCOUNTANT, invitations. Permissions métier explicites (`can*`), jamais déduites. | [02](02-authentification.md), [16](16-equipe.md) |
| Particuliers / entreprises (comptes) | `User.accountType` INDIVIDUAL / BUSINESS. Particulier : espace perso sans org. Entrepreneur : facture via Organization. Distinct du B2C/B2B **client**. | [14](14-particuliers-entreprises.md) |
| Clients / prospects | CRUD, adresses, archivage, Kanban, activités. `partyKind` PERSON/COMPANY, `kind` CLIENT/PROSPECT. Mombongo facture des particuliers **et** des entreprises. | [03](03-clients.md), [06](06-prospects.md) |
| Identité émetteur | Champs légaux Organization + adresses d’émetteur ; snapshotés à l’émission. | [03](03-clients.md) |
| Devis | Brouillon → envoi (`DEV-AAAA-NNNN`) → accepté/refusé/annulé ; conversion unique vers facture. | [04](04-facturation.md) |
| Factures | Nées `SENT` depuis un devis accepté (`FA-AAAA-NNNN`). Émise : pas d’annulation de statut. | [04](04-facturation.md) |
| Avoirs | Depuis facture émise (`AV-AAAA-NNNN`), 1:N, sur-crédit refusé. | [04](04-facturation.md) |
| Paiements | Entité `Payment` distincte ; solde **calculé**. | [04](04-facturation.md), [08](08-paiements.md) |
| Catalogue | Aide à la saisie ; copie vers la ligne ; **pas** de `catalogItemId` historique. | [04](04-facturation.md) |
| Snapshots | Figés à l’émission du devis, recopiés facture → avoir. Jamais relus live. Devise snapshotée. | [04](04-facturation.md) |
| PDF | Un seul moteur A12 (`pdfkit`). | [17](17-pdf-documents.md) |
| Factur-X / e-facture | `ElectronicInvoiceModel` distinct du PDF. | [18](18-facturation-electronique.md) |
| Plateforme agréée (socle) | Gateway + adapter **MOCK**. Mombongo n’est pas une PA. Aucune PA réelle intégrée. | [19](19-plateforme-agreee.md) |
| Registre d’intégrations | Descripteurs TS (MOCK disponible ; Stripe/PayPal `coming_soon`, non intégrés). | [20](20-integrations.md) |
| E-mails de documents | Envoi manuel PDF A12 ; historique `DocumentEmailDelivery`. | [21](21-emails-documents.md) |
| Fixtures DEMO | Dataset marqué, seed/purge dédiés, interdits en production. | [22](22-fixtures-demo.md) |
| Web | App Router, Server Actions, `/espace/*`. | [01](01-architecture.md) |
| Mobile | Expo, `/api/v1/mobile/*`, SecureStore. PDF/Factur-X en téléchargement. E-mail documents **web-only**. | [11](11-api-mobile.md) |
| Agenda | Création, overlap verrouillé, API mobile. | [07](07-rendez-vous.md) |
| Identité (codes, reset) | Resend ou boîte locale. | [02](02-authentification.md), [15](15-recuperation-mot-de-passe.md), [09](09-messagerie.md) |

---

## 4. État des lots

La nomenclature historique n’est **pas totalement homogène** : lots produit 0–7 ([12](12-feuille-de-route.md)) et phases facturation **A7–A16** ([04](04-facturation.md)) coexistent. Les codes A1–A6 ne sont **pas** reconstruits ici. Les fonctionnalités et invariants actuellement documentés font autorité.

| Lot | Objet | État | Document(s) | Remarque |
| --- | --- | --- | --- | --- |
| Lot 0 | Socle Next/TS/Tailwind/Prisma/CI | LIVRÉ | [12](12-feuille-de-route.md), [01](01-architecture.md) | |
| Lot 1 | Auth, org, rôles, invitations | LIVRÉ | [02](02-authentification.md), [16](16-equipe.md) | Isolation multi-tenant |
| Profils | INDIVIDUAL / BUSINESS | LIVRÉ | [14](14-particuliers-entreprises.md) | Factures perso **NON COMMENCÉ** |
| Lot 2 / CRM | Clients, prospects, Kanban | LIVRÉ | [03](03-clients.md), [06](06-prospects.md) | B2C + B2B. Joints, tags, relances auto : hors lot |
| A7 | Snapshots identité / TVA / conditions | LIVRÉ | [04](04-facturation.md) | |
| A8 | Catalogue | LIVRÉ | [04](04-facturation.md) | |
| Devis / conversion | Cycle devis → facture | LIVRÉ | [04](04-facturation.md) | |
| A9 | Avoirs | LIVRÉ | [04](04-facturation.md) | Pas d’annulation d’avoir émis |
| A10 | Encaissements `Payment` | LIVRÉ | [04](04-facturation.md), [08](08-paiements.md) | Manuels uniquement. Le schéma **ne s’arrête pas** à A10. |
| A11 | Facture émise immuable hors avoir | LIVRÉ | [04](04-facturation.md), [01](01-architecture.md) | |
| A12 | PDF humain | LIVRÉ | [17](17-pdf-documents.md) | |
| A13 | Factur-X / CII | LIVRÉ | [18](18-facturation-electronique.md) | Pas une certification |
| A13.1 | TVA, unités, validateurs | LIVRÉ | [18](18-facturation-electronique.md) | Sous-ensemble testé |
| A14 | Gateway PA, MOCK, webhooks génériques | LIVRÉ | [19](19-plateforme-agreee.md) | MOCK ≠ PA réelle |
| A14.1 | Registre connecteurs, `PaymentConnection` | LIVRÉ | [20](20-integrations.md) | Stripe/PayPal `coming_soon`, non intégrés |
| A15.0 | Socle PA + registre | **LIVRÉ / VALIDÉ** | [19](19-plateforme-agreee.md), [12](12-feuille-de-route.md), [21](21-emails-documents.md) | MOCK / gateways / adapters / registry **acquis** |
| A15.1 | Premier connecteur PA réel | **DIFFÉRÉ** | [19](19-plateforme-agreee.md), [12](12-feuille-de-route.md) | Aucune PA réelle intégrée. Raison : pas d’accès sandbox professionnel. |
| A16 | E-mail manuel devis/factures/avoirs | **LIVRÉ / VALIDÉ** | [21](21-emails-documents.md) | |
| Lot 4 agenda | Rendez-vous | LIVRÉ (v1) | [07](07-rendez-vous.md) | |
| Lot 4 frais | Notes de frais | **NON COMMENCÉ** | [05](05-notes-de-frais.md) | Fiche « planifié » |
| Lot 5 | Abonnement Mombongo, Stripe, PayPal, notif | **NON COMMENCÉ** (hors A10 manuel / A16 mail) | [08](08-paiements.md), [09](09-messagerie.md) | Stripe/PayPal ne sont **pas** la prochaine phase par défaut |
| Lot 6 | Assistant IA | Guide local LIVRÉ ; IA **NON COMMENCÉ** | [10](10-assistant-ia.md) | |
| Lot 7 mobile | API + Expo | LIVRÉ (socle) | [11](11-api-mobile.md) | iOS, stores, notif push : ouverts |

---

## 5. Invariants métier critiques

Un agent futur **ne doit pas** les casser.

- Isolation : toute lecture/écriture métier filtre `organizationId` + Membership. Une ID étrangère → 404/403, jamais de fuite.
- **User ≠ Organization ≠ Customer.** `accountType` n’est pas l’identité légale de l’émetteur. Un particulier **client** est `Customer` + `partyKind = PERSON`.
- **B2C et B2B** : Mombongo facture des particuliers et des entreprises (`PERSON` / `COMPANY`). Assujettissement `taxablePerson` snapshoté ; `REVIEW_REQUIRED` si l’info manque pour le routage électronique.
- France : premier cadre réglementaire/fiscal. Le moteur n’est **pas** limité à l’EUR. Une pièce = une devise snapshotée. Pas de conversion FX automatique.
- Snapshots : émission du devis → copie facture → copie avoir. PDF et Factur-X ne relisent pas les fiches live.
- Catalogue = aide à la saisie. Pas de FK historique `catalogItemId` sur `DocumentLine`.
- Un devis accepté → **une** facture (`sourceDocumentId` unique).
- Facture `INVOICE` + `SENT` : correction = avoir, pas `CANCELLED`.
- `Document.status` ≠ settlement. Pas de `PAID` / `OVERDUE` sur le document. Solde calculé : `UNPAID` / `PARTIALLY_PAID` / `PAID` / `CREDITED`.
- Avoir ≠ paiement. `CREDITED` si net = 0 par avoirs et paid = 0.
- `Payment` n’est pas un `Document`. Distinct d’un futur abonnement SaaS Mombongo.
- Montants en **centimes entiers** ; quantités `Decimal(12,3)` ; calculs en milli-quantités `BigInt`, arrondi half-up.
- Permissions : fonctions `can*` explicites (matrice [16](16-equipe.md)). MEMBER émet une facture, pas un avoir. ACCOUNTANT encaisse, n’émet pas. `canSendDocuments` n’est déduit d’aucune autre.
- Facture électronique : cycle `ElectronicTransmission` **séparé** de `Document.status`.
- Connecteurs : registre + adapters. Interdit : `if (provider === …)` dans le métier facturation. Aucun SDK PA/PSP dans `invoices/service` / `credit-notes/service`.
- Secrets d’intégration : jamais en clair dans la config persistée ; `credentialRef` opaque ; JSON `apiKey` / secrets refusés.
- Dates UTC en base ; affichage fuseau org / navigateur.
- Codes de connexion et tokens : jamais dans les logs.

---

## 6. Facturation électronique

Chaîne documentée :

```text
Snapshots + lignes
  → DocumentPrintModel → PDF A12
  → ElectronicInvoiceModel → CII → Factur-X (PDF/A-3 visé)
  → (A14) EInvoiceGateway → adapter (MOCK uniquement)
```

- **A13 / A13.1** : génération et validation **sous-ensemble**. Pas d’attestation DGFiP / « certifié Factur-X » / EN 16931 opposable. Pas de XSD UN/CEFACT officiel ni Schematron CEN complet, pas de veraPDF. [18](18-facturation-electronique.md)
- Classification e-invoicing / e-reporting : **routage**, `REVIEW_REQUIRED` si données manquantes — pas un moteur fiscal. Cadre de travail : France.
- **MOCK** : connecteur **interne de test**, environnement `TEST` seulement. Ce n’est **pas** une plateforme agréée. Aucune PA réelle n’est intégrée.
- Gateway / adapters / registry / capacités : [19](19-plateforme-agreee.md), [20](20-integrations.md). Capacités `supportedByProvider` sans `implementedByMombongo` → refus 409. Socle **acquis** (A15.0).
- Premier connecteur PA réel : **A15.1 DIFFÉRÉ**. MOCK **conservé**.
- E-mail A16 n’écrit **aucune** `ElectronicTransmission`.

---

## 7. Paiements

Trois couches distinctes :

| Couche | Rôle actuel |
| --- | --- |
| `Payment` métier | Encaissement **manuel** d’une facture client (A10). `method` = virement, carte, chèque, etc. |
| `Payment.provider` | `MANUAL` aujourd’hui ; `STRIPE` / `PAYPAL` prévus au schéma, **non intégrés**. ≠ PA. |
| `PaymentConnection` + `PaymentGateway` | Socle A14.1. Appels gateway → **501**. Stripe/PayPal au registre : `coming_soon`, aucun adapter. |

Stripe / PayPal restent **préparés / `coming_soon`**. Ils **ne deviennent pas** automatiquement la prochaine phase.

Abonnement / billing **Mombongo** (offres, quotas, checkout adhérent) : **NON COMMENCÉ**, distinct des `Payment` clients.

Remboursements (refunds) métier et PSP : **HORS SCOPE** actuel (409 « remboursement pas encore disponible » côté avoir trop payé ; gateway `refund` = 501).

Paiements des **particuliers** (factures reçues par un compte INDIVIDUAL) : **NON COMMENCÉ**. Cela n’empêche pas de **facturer** un client particulier (B2C).

---

## 8. E-mails / Resend

A16 **LIVRÉ / VALIDÉ**. Couche unique `sendOutboundMail`.

- Documents : devis `SENT`/`ACCEPTED`/`REFUSED` ; factures et avoirs `SENT`. Brouillon refusé.
- PDF joint = moteur A12 uniquement ; non stocké en base.
- Destinataire par défaut = `customerEmailSnapshot` (jamais `Customer.email` live en silence).
- `From` = `EMAIL_FROM` (Resend) ou repli local `Mombongo <dev@localhost>`. **Aucune** adresse `@mombongo.fr` en dur.
- `Reply-To` = `issuerEmailSnapshot` s’il existe.
- Historique `DocumentEmailDelivery` : append-only ; double POST via `idempotencyKey` ; réexpédition explicite = nouvelle clé.
- `SENT` e-mail = **accepté par le fournisseur**, pas `DELIVERED`.
- DEV : `MAIL_TRANSPORT=local` + `LOCAL_MAIL_DIR`. Prod visée : `resend` + `RESEND_API_KEY` + `EMAIL_FROM`.
- **HORS SCOPE A16** : webhooks Resend, relances auto, templates par org, workflow mobile.

Adresse de **réception** de test personnel documentée : `mombongo.devo@gmail.com` (pas le `From`, pas un secret). Tests Resend : `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`.

---

## 9. Fixtures DEMO

- Identité : table `DemoDataset`, clé **`mombongo-demo`**. Orgs/users : `demoDatasetKey`. **Pas** d’heuristique « demo » dans un nom ou `@resend.dev`.
- Commandes : `npm run db:seed:demo` (purge puis recrée ce dataset), `npm run db:purge:demo`.
- Seed : **aucun e-mail envoyé**.
- Volumes documentés : 40 contacts (15 PERSON, 25 COMPANY), mélange CLIENT/PROSPECT ; catalogue ; devis/factures/avoirs/paiements via services métier ; une pièce **CHF** (multi-devise, pas de FX).
- Comptes DEV (dataset `mombongo-demo`) — mot de passe **uniquement fixtures locales**, prévu par [22](22-fixtures-demo.md) : `motdepasse`.

| Rôle | E-mail |
| --- | --- |
| OWNER | `owner@mombongo.demo.test` |
| ADMIN | `admin@mombongo.demo.test` |
| MEMBER | `member@mombongo.demo.test` |
| ACCOUNTANT | `accountant@mombongo.demo.test` |

- Connexion : toujours le code e-mail (`npm run mail:local` en local).
- Tests : clé isolée `mombongo-demo-test-<uuid>` pour ne pas effacer le jeu développeur.
- Production : refus si `NODE_ENV`, `VERCEL_ENV` ou `MOMBONGO_ENV` = `production`. Jamais au boot, migrations, build, deploy, `postinstall`.

---

## 10. DEV / production

### DEV (établi dans le dépôt)

- Chemin : `/soft/dev/nextjs/facturia` — **ne pas renommer** à cause du branding Mombongo
- Web : `http://localhost:9070` (`0.0.0.0:9070`)
- PostgreSQL 18 projet : **5433** ; PostgreSQL 17 système éventuel : 5432 (ne pas mélanger)
- `npm run db:local`, `db:generate`, `db:migrate`, `dev` / `dev:mobile`
- Mail local : `LOCAL_MAIL_DIR`, `npm run mail:local`
- `compose.yaml` : option Docker PostgreSQL 18 (port 5432) — une seule base à la fois
- CI GitHub Actions : lint, types, migrate, `test:auth`, build Webpack (Playwright **non** exécuté en CI)

### Production — architecture cible

**VALIDÉ — architecture cible décidée, NON DÉPLOYÉE**

Décidée hors dépôt ; conservée ici. **Ne pas présenter comme déjà présente sur un VPS.**

| Élément | Cible |
| --- | --- |
| Chemin | `/sites/mombongo` |
| Domaine | `https://mombongo.fr` |
| Reverse proxy | nginx |
| Processus Node | PM2 avec ecosystem |
| Maintenance | mécanisme on/off, sur le principe déjà utilisé pour Amakifr |

`APP_URL` / `AUTH_URL` / `EXPO_PUBLIC_API_URL` = `https://mombongo.fr` en release.

Le déploiement production est **distinct** du clone DEV. Ne pas y pousser les fixtures.

---

## 11. Variables et secrets (noms uniquement)

Jamais de valeurs secrètes ici.

| Famille | Noms |
| --- | --- |
| Base | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Auth | `AUTH_SECRET` (≥ 32 caractères), `AUTH_URL`, `AUTH_TRUST_PROXY` |
| URL publique | `APP_URL` (repli liens mail : `AUTH_URL`) |
| Mail | `MAIL_TRANSPORT` (`local` / `resend`), `LOCAL_MAIL_DIR`, `RESEND_API_KEY`, `EMAIL_FROM` |
| Mobile | `EXPO_PUBLIC_API_URL` (obligatoire en release) |
| Fixtures | `MOMBONGO_ENV` (garde-fou, avec `NODE_ENV` / `VERCEL_ENV`) |
| Intégrations | pas de secret PA/PSP requis pour MOCK ; interdiction de poser des secrets fournisseur en clair |

Fichiers exemple : `.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example`. Secrets dans `.env` / `apps/web/.env.local` (non versionnés).

---

## 12. Base / migrations

- ORM : Prisma 7, client généré dans `apps/web/src/generated/prisma`
- Base : PostgreSQL 18
- Migrations **additives** versionnées sous `prisma/migrations/` ; pas de wipe métier. Les phases A7+ ont ajouté des colonnes (souvent nullables) sans backfill live destructif.
- Le schéma **ne s’arrête pas à A10**. Dernière migration documentée ici : `20260930100000_document_email_and_demo` (A16 + `DemoDataset`), après A13.1 / A14 / A14.1.

Migrations notables (noms de dossiers) :

| Migration | Sujet |
| --- | --- |
| `20260925065039_identity_foundation` | User, Organization, Membership |
| `20260925071413_individual_accounts` | INDIVIDUAL / BUSINESS |
| `20260925072554_password_recovery` | Reset |
| `20260925085000_team_invitations` | Invitations |
| `20260925091000_customer_kind_status` | CRM |
| `20260925101000_mobile_refresh_tokens` | Refresh mobile |
| `20260925123000_customer_pipeline` | Pipeline |
| `20260925141000_appointments` | Agenda |
| `20260925150000_quotes` / `25163000_invoices` | Devis / factures |
| `20260927160000_document_snapshots` | Snapshots documentaires |
| `20260927180000_document_referential_integrity` | FK `RESTRICT` |
| `20260929190000_legal_commercial_identity` | Émetteur / B2B-B2C |
| `20260929200000_document_v2_snapshots` | A7 |
| `20260929210000_catalog_items` | A8 |
| `20260929220000_credit_notes` | A9 |
| `20260929230000_payments` | A10 |
| `20260929240000_electronic_tax_units` | A13.1 |
| `20260929250000_electronic_invoicing_platform` | A14 |
| `20260929260000_connector_registry` | A14.1 |
| `20260930100000_document_email_and_demo` | A16 + `DemoDataset` |

*(Des fiches plus anciennes peuvent encore écrire « migrations jusqu’à A10 » : c’est **obsolète**. Ce tableau fait autorité.)*

FK historiques : `Organization`/`Customer` → `Document`, devis → facture, facture → avoir, `Payment` → facture, lignes d’avoir → lignes facture : **RESTRICT**. Catalogue : cascade org, **pas** vers les documents.

---

## 13. Tests et qualité

Commandes de référence (racine) :

```bash
npm run lint
npm run typecheck
npm run db:validate
npm run db:generate
npx prisma migrate deploy   # CI / apply
npm run test:auth           # intégration Node (y compris A16 + fixtures)
npm run test:browser        # Playwright, Chrome `/usr/bin/google-chrome`, serveur 9070
npm run build --workspace @mombongo/web -- --webpack
```

CI : `.github/workflows/ci.yml` (pas de Playwright, pas de seed DEMO `mombongo-demo`).

Dernier **chiffre de suite** : non figé dans `DOCS/` (pas de compteur officiel). Ne pas inventer un score.

Playwright : une suite longue peut saturer le rate-limit d’inscription (`AuthRateLimit`) — comportement déjà observé en DEV, pas une spec produit.

NextAuth : version bêta documentée ; revue de stabilité **avant production** ([02](02-authentification.md)).

---

## 14. Ouvert (depuis les DOCS, sans roadmap inventée)

| Sujet | État |
| --- | --- |
| A15.1 connecteur PA réel | **DIFFÉRÉ** — ne pas lancer sans décision explicite |
| Stripe / PayPal réels, checkout, PaymentIntent | préparés / `coming_soon`, **non intégrés** — pas la prochaine phase par défaut |
| Webhooks Resend (DELIVERED, BOUNCED, …) | HORS SCOPE A16 |
| Relances automatiques | HORS SCOPE A16 / CRM |
| Refunds PSP / métier | NON COMMENCÉ |
| E-reporting DGFiP réel, Peppol, annuaire | NON COMMENCÉ |
| Certification Factur-X / PDF/A / XSD officiels | NON COMMENCÉ (limites A13.1) |
| Module achats / inbound comme facture client | HORS SCOPE A14 |
| Notes de frais | NON COMMENCÉ |
| Abonnement SaaS Mombongo, tarifs, quotas | NON COMMENCÉ |
| Centre de notifications, Gmail OAuth | NON COMMENCÉ |
| Assistant IA (au-delà du guide local) | NON COMMENCÉ |
| Factures / paiements reçus (compte particulier) | NON COMMENCÉ |
| Mobile : avoirs, paiements, e-mail docs, config PA, iOS, stores, push | ouvert / web-only selon cas |
| Disponibilités publiques, récurrence agenda | hors v1 |
| Changement de profil INDIVIDUAL ↔ BUSINESS | NON COMMENCÉ |
| Agrégation CA tableau de bord | NON COMMENCÉ |
| Déploiement VPS (`/sites/mombongo`, nginx, PM2) | architecture **VALIDÉE**, **NON DÉPLOYÉE** |

---

## 15. Prochaine étape

**À DÉCIDER**

Ne choisir **ni A15.1**, **ni Stripe/PayPal**, sans décision explicite ultérieure.

A16 et A15.0 sont **LIVRÉ / VALIDÉ**. A15.1 reste **DIFFÉRÉ**. L’infra production est **décidée, non déployée**.

---

## Contrôle anti-mélange

Ce document ne décrit que Mombongo et l’historique Facturia du clone local.

**Absents** (aucune contamination) : HARP, Launcher, Citrix, `portaltech`, SHA ou migrations d’un autre dépôt, Apache/systemd d’une autre infrastructure.

La seule mention d’un autre produit est **Amakifr**, uniquement comme **référence de principe** du mécanisme maintenance on/off — pas d’import d’infra, de code ou de chemins Amakifr.
