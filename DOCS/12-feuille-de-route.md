# Feuille de route

## Lot 0 — Socle initial
Page française responsive, guide prédéfini, toasts, Next.js/TypeScript, Tailwind 4, configuration shadcn, contrats Zod, schéma Prisma, configuration PostgreSQL 18 et documentation.
Livré ensuite : ESLint plat Next 16, CI GitHub Actions, composants UI (Button, Input, Label, Card, Alert), jetons Tailwind 4, Server Actions pour l’inscription, la connexion, le renvoi de code et la récupération de mot de passe, dépôt Git (le dossier `SAVES/` est ignoré).

## Lot 1 — Identité et entreprises

Livré : inscription, code email, connexion NextAuth, session révocable, déconnexion,
entreprise et propriétaire, migration PostgreSQL 18, espace privé et tests.
La récupération de compte, les boutons afficher/masquer, les invitations et la
gestion des rôles (propriétaire, administrateur, membre, comptable) sont livrés.

NextAuth, inscription, vérification email, mot de passe, validation six chiffres, récupération, sessions, rôles et invitations. Connexion effective PostgreSQL, migrations et tests d’isolation. Prérequis : canal du code et domaine d’envoi confirmés. L’organisation active est explicite (cookie web, en-tête mobile) et un sélecteur permet de basculer entre entreprises.

## Extension livrée — Profils

Choix Particulier/Entreprise à l’inscription, type conservé pendant la validation
et en base, espace personnel sans entreprise et compatibilité des comptes existants.
Les factures personnelles, paiements et rappels seront développés dans les lots
facturation et paiements, avec une isolation par utilisateur.

## Lot 2 — Clients et prospects
Livré : CRUD des fiches client/prospect, adresses multiples, archivage,
conversion prospect → client, pipeline Kanban, historique d’activités,
isolation par entreprise et permissions (écriture pour propriétaire,
administrateur et membre ; lecture pour le comptable). Identité B2B/B2C :
`Customer.partyKind` PERSON/COMPANY, champs légaux optionnels, identité
d’émetteur sur l’Organization, adresses d’émetteur. Documents joints,
tags et relances automatiques restent planifiés, voir [Prospects](06-prospects.md).

## Lot 3 — Facturation
Livré pour les devis, la conversion et le modèle V2 : brouillon, lignes
(quantité décimale, unité, TVA par taux), numérotation `DEV-AAAA-0001`,
snapshot A7 à l’émission, envoi, acceptation (conversion prospect → client),
refus/annulation, conversion d’un devis accepté en facture `FA-AAAA-0001`
avec échéance et conditions historiques, pages `/espace/devis` et
`/espace/factures`, catalogue `/espace/catalogue` (copie vers la ligne, jamais
l’inverse), avoirs depuis une facture émise (`AV-AAAA-NNNN`, 1:N, sur-crédit
refusé), encaissements métier (`Payment`, solde calculé, pas de `Document.status`
PAID), consolidation A11 (facture émise corrigée par avoir, pas par
`CANCELLED`), PDF humain A12 (devis / facture / avoir, snapshots uniquement),
socle Factur-X A13 puis qualification TVA / unités / validateurs A13.1
(CII + PDF/A-3 EN 16931, classification), socle A14 de plateforme agréée
(gateway multi-provider, MOCK, webhooks, sans connecteur réel), registre
A14.1 des connecteurs (PA et PSP, configuration par organisation, sans
Stripe/PayPal réel), envoi manuel des documents par e-mail A16 (PDF A12,
historique `DocumentEmailDelivery`, sans transmission PA).
Restent : Stripe/PayPal, premier connecteur PA réel (A15.1 différé).

## Lot 4 — Frais et rendez-vous
Livré pour l’agenda : création de rendez-vous, liaison fiche, verrou de
chevauchement, page `/espace/agenda` et API mobile. Restent : disponibilités
publiques, récurrence, rappels, justificatifs de frais et circuit de validation.

## Lot 5 — Monétisation et communications
Offres, droits et quotas, Stripe, PayPal, paiements unitaires, webhooks, centre de notifications, Resend puis Gmail OAuth.

## Lot 6 — Assistant IA
Base documentaire, évaluations et usages IA validés. Contrôles de coûts et confidentialité.

## Lot 7 — Android puis iOS
Livré en premier : API mobile d’identité (challenge, jetons courts, refresh
tournant), application Expo SDK 57, SecureStore et tableau de bord branché
sur les compteurs clients. Restent : tests sur appareils, notifications,
liens profonds, iOS et publication boutiques.

## Décisions ouvertes
Tarifs, prestations facturées à l’usage, prestataire électronique, nombre de collaborateurs, canal de validation six chiffres et règles avancées de rendez-vous. Le mot-signe visible est **Mombongo**. Les packages npm sont `@mombongo/*`.
Le dossier local du clone et PostgreSQL peuvent encore s’appeler facturia.
La qualification B2B/B2C/France/étranger/e-invoicing/e-reporting est un
classement de routage A13.1 (assujettissement snapshoté, `REVIEW_REQUIRED`
si l’information manque), pas un moteur fiscal opposable. Le premier
connecteur réel de plateforme agréée et Stripe/PayPal restent des phases
suivantes. A15.0 (socle PA + registre) est validé ; A15.1 est différé faute
d’accès sandbox professionnel ; le MOCK PA est conservé. A16 livre l’e-mail
manuel des documents (voir [E-mails de documents](21-emails-documents.md)).
A14 livre le socle de transport ; A14.1 livre le registre et
la configuration dynamique (voir
[Plateforme agréée](19-plateforme-agreee.md) et
[Intégrations](20-integrations.md)).
Un jeu DEMO local se charge uniquement via `npm run db:seed:demo`
([Fixtures DEMO](22-fixtures-demo.md)).

Chaque lot doit actualiser sa documentation et préciser les tests réellement exécutés. Une fonctionnalité planifiée ne doit pas être présentée comme livrée.
