# Architecture

## État
Socle Next.js et module identité connectés à PostgreSQL 18 local (port 5433).
Migration initiale appliquée ; modules métier encore planifiés.

## Organisation
- `apps/web` : Next.js App Router, React, TypeScript strict, Tailwind 4, composants shadcn et Sonner.
- `packages/contracts` : schémas Zod partagés entre web et mobile, sans secrets ni dépendances serveur.
- `prisma` : modèle de données et futures migrations versionnées.
- `apps/mobile` : emplacement réservé à Expo, React Native et Metro.

Le backend est porté par Next.js. Les formulaires web privilégient les Server Actions. Les routes `/api/v1` restent pour le mobile, le healthcheck et les contrôles d’origine. Actions et API appellent les mêmes services métier côté serveur. Prisma et les clés fournisseurs ne doivent jamais être importés dans un composant client ou le mobile.

ESLint plat (`eslint-config-next` + TypeScript) et une CI GitHub Actions (lint, types, migrations, tests d’auth, build Webpack) accompagnent le socle. Tailwind 4 expose les jetons shadcn ; les pages marketing restent des Server Components, le guide étant le seul îlot client de l’accueil.

## Isolation
Un User possède un type INDIVIDUAL ou BUSINESS. Un particulier possède un espace
personnel sans Organization. Une Organization représente une entreprise ; un User
BUSINESS peut appartenir à plusieurs entreprises via Membership. Toute lecture et mutation métier vérifie la session, l’appartenance et le rôle côté serveur. Les requêtes Prisma filtrent explicitement organizationId. Un identifiant fourni par le client n’est jamais une autorisation.

Les relations composites doivent empêcher les liens entre entreprises. Des tests d’accès inter-entreprises seront requis avant la première API métier.

## Exploitation cible
PostgreSQL 18 local, migrations Prisma contrôlées, sauvegardes et essais de restauration. Stockage objet privé pour justificatifs et pièces jointes ; URLs temporaires. Travaux asynchrones persistants pour emails, rappels, OCR et webhooks, avec reprises et idempotence. Journal d’audit sans secrets ni contenu personnel inutile.

Montants en unités monétaires mineures ou Decimal avec règles d’arrondi explicites, jamais en Float. Dates stockées en UTC et affichées dans le fuseau de l’entreprise. Les documents émis conservent un instantané des coordonnées et lignes.

## Références techniques
- https://nextjs.org/docs/app/getting-started/installation
- https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction

Les versions effectivement installées sont figées dans package-lock.json.

Les futurs documents personnels seront isolés par userId ; les documents professionnels
restent isolés par organizationId. Voir [les profils](14-particuliers-entreprises.md).
