# Fixtures DEMO (environnement de développement)

État : **livré**. Jeu de données fictif, déterministe, rejouable, **jamais**
chargé par une migration, un build, un démarrage d’application ou un
déploiement.

## Commandes

```bash
npm run db:seed:demo
npm run db:purge:demo
```

Le seed purge d’abord le dataset `mombongo-demo`, puis le recrée. Le seed
**n’envoie aucun e-mail**.

## Identification

Les fixtures ne sont **pas** reconnues par un nom contenant « demo » ni par un
e-mail `@resend.dev`. Elles appartiennent à une ligne `DemoDataset` (clé
primaire `mombongo-demo`). Les organisations et utilisateurs DEMO portent
`demoDatasetKey`. La purge ne lit que cette clé.

Les tests d’intégration utilisent une clé isolée
`mombongo-demo-test-<uuid>` pour ne pas effacer le jeu local du développeur.

## Garde-fou production

`assertDemoMutationsAllowed()` refuse toute mutation si `NODE_ENV`,
`VERCEL_ENV` ou `MOMBONGO_ENV` vaut `production`. Erreur explicite, aucune
écriture. Documenter `MOMBONGO_ENV=production` sur l’hôte réel en plus de
`NODE_ENV`.

## Comptes utilisateurs DEV

Mot de passe (fixtures locales uniquement) : `motdepasse`.

| Rôle | E-mail (dataset `mombongo-demo`) |
| --- | --- |
| OWNER | `owner@mombongo.demo.test` |
| ADMIN | `admin@mombongo.demo.test` |
| MEMBER | `member@mombongo.demo.test` |
| ACCOUNTANT | `accountant@mombongo.demo.test` |

La connexion A1 demande toujours le code e-mail : en local, le lire avec
`npm run mail:local`. Les Customer/Prospect ne sont pas des comptes et n’ont
pas de mot de passe.

## Contenu

- organisation émettrice complète (identité, adresse, conditions)
- 40 contacts : 15 `PERSON`, 25 `COMPANY`, mélange CLIENT / PROSPECT
- identifiants SIREN/SIRET **fictifs** (préfixe 9…)
- catalogue produits et services
- devis DRAFT / SENT / ACCEPTED / REFUSED / CANCELLED
- factures SENT : impayée, en retard, partielle, soldée, soldée par avoir,
  B2C, B2B, TVA mixte, quantités décimales, une pièce CHF
- avoirs partiel et total émis
- paiements manuels

E-mails CRM : adresses `@mombongo.demo.test` (non délivrables) et, pour les
scénarios Resend, `delivered@resend.dev`, `bounced@resend.dev`,
`complained@resend.dev`. Une fiche PERSON porte une note pour remplacer
manuellement le destinataire par `mombongo.devo@gmail.com`.

## Purge

`db:purge:demo` supprime uniquement les lignes liées à `demoDatasetKey`, dans
un ordre compatible avec les FK A4 (transmissions, e-mails, paiements, avoirs,
factures, devis, CRM, puis organisation et utilisateurs). Idempotente.
Résumé JSON des volumes retirés. Jamais de `deleteMany({})` global.

## Interdiction production

Ne pas exécuter ces commandes sur une base réelle. Ne pas les ajouter au
démarrage Next.js, aux migrations Prisma, à la CI de déploiement ni au
`postinstall`. La CI d’intégration peut exécuter le seed de **test** sur une
base éphémère via une clé dédiée, jamais `mombongo-demo` en production.
