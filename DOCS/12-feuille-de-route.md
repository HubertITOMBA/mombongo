# Feuille de route

## Lot 0 — Socle initial
Page française responsive, guide prédéfini, toasts, Next.js/TypeScript, Tailwind 4, configuration shadcn, contrats Zod, schéma Prisma, configuration PostgreSQL 18 et documentation.
Livré ensuite : ESLint plat Next 16, CI GitHub Actions, composants UI (Button, Input, Label, Card, Alert), jetons Tailwind 4, Server Actions pour l’inscription, la connexion, le renvoi de code et la récupération de mot de passe, dépôt Git (le dossier `SAVES/` est ignoré).

## Lot 1 — Identité et entreprises (en cours)

Livré : inscription, code email, connexion NextAuth, session révocable, déconnexion,
entreprise et propriétaire, migration PostgreSQL 18, espace privé et tests.
La récupération de compte et les boutons afficher/masquer sont également livrés.
Restent notamment les invitations et la gestion des rôles.

NextAuth, inscription, vérification email, mot de passe, validation six chiffres, récupération, sessions, rôles et invitations. Connexion effective PostgreSQL, migrations et tests d’isolation. Prérequis : canal du code et domaine d’envoi confirmés.

## Extension livrée — Profils

Choix Particulier/Entreprise à l’inscription, type conservé pendant la validation
et en base, espace personnel sans entreprise et compatibilité des comptes existants.
Les factures personnelles, paiements et rappels seront développés dans les lots
facturation et paiements, avec une isolation par utilisateur.

## Lot 2 — Clients et prospects
CRUD clients, adresses multiples, pipeline, historique et permissions.

## Lot 3 — Facturation
Brouillons, calculs, documents, avoirs et raccordement au prestataire électronique après validation du pays et des obligations applicables.

## Lot 4 — Frais et rendez-vous
Justificatifs privés, circuit de validation, calendrier, réservations et rappels.

## Lot 5 — Monétisation et communications
Offres, droits et quotas, Stripe, PayPal, paiements unitaires, webhooks, centre de notifications, Resend puis Gmail OAuth.

## Lot 6 — Assistant IA
Base documentaire, évaluations et usages IA validés. Contrôles de coûts et confidentialité.

## Lot 7 — Android puis iOS
API stabilisée, Expo/React Native/Metro, authentification mobile, tests sur appareils, comptes et publication boutiques.

## Décisions ouvertes
Pays et types de clients, tarifs, prestations facturées à l’usage, prestataire électronique, nombre de collaborateurs, canal de validation six chiffres, règles de rendez-vous et identité visuelle. Le nom Facturia est déduit du dossier et reste provisoire.

Chaque lot doit actualiser sa documentation et préciser les tests réellement exécutés. Une fonctionnalité planifiée ne doit pas être présentée comme livrée.
