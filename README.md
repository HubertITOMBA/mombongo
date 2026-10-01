# Mombongo

SaaS pour particuliers et entreprises : factures personnelles et paiements prévus,
facturation électronique, frais, prospects et rendez-vous professionnels.
Next.js 16 / TypeScript, Tailwind 4, conventions shadcn/ui, Sonner, Prisma 7,
PostgreSQL 18 et Zod. Le serveur web utilise le **port 9070**.

## Démarrage sur ce poste Fedora

```bash
npm install
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:seed:demo
npm run dev
```

`db:local` utilise les binaires `/usr/pgsql-18/bin`, initialise si nécessaire une
base privée dans `.local/postgres`, puis la démarre sur **127.0.0.1:5433**.
Il génère les paramètres locaux et les secrets manquants sans écraser une
configuration existante. PostgreSQL 17 sur 5432 n’est pas modifié.
Les fichiers `.local`, `.env` et `apps/web/.env.local` ne sont pas versionnés.
`db:seed:demo` / `db:purge:demo` sont **interdits en production** ; voir
[Fixtures DEMO](DOCS/22-fixtures-demo.md). `db:purge:demo` retire uniquement
le dataset marqué.

Ouvrir [localhost:9070](http://localhost:9070).

Pour l’application mobile Expo (Android en premier) :

```bash
npm run dev:mobile
```

Le serveur web doit déjà tourner et être joignable depuis le téléphone
(même Wi-Fi, port 9070 ouvert). L’app reprend l’IP d’Expo Go. Les jetons
restent dans SecureStore.

## Tester une inscription

1. Cliquer sur « Créer mon espace », choisir Particulier ou Entreprise, puis renseigner nom, email et mot de passe (12 caractères minimum). Le nom d’entreprise n’est demandé que pour une entreprise.
2. En mode local, lire le dernier email avec `npm run mail:local` dans le terminal.
3. Saisir le code à six chiffres pour créer le compte et accéder à l’espace adapté au profil.
4. Se déconnecter ; la prochaine connexion demandera à nouveau un code.

La boîte mail locale **n’envoie aucun email réel** et ne fonctionne jamais en
production. Pour Resend, configurer `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`
et `EMAIL_FROM` dans `apps/web/.env.local`, puis redémarrer Next.js.
`AUTH_URL` doit correspondre à l’origine ouverte dans le navigateur.
`APP_URL` (repli : `AUTH_URL`) construit les liens d’emails. En production :
`APP_URL=https://mombongo.fr` et `AUTH_URL=https://mombongo.fr`.

## Configuration manuelle et Docker

La configuration Docker Compose PostgreSQL 18 reste disponible sur le port 5432.
Choisir une seule base pour le projet. Adapter `DATABASE_URL` à la fois dans
`.env` (Prisma CLI) et `apps/web/.env.local` (Next.js) ; voir les fichiers exemple.
Le port 5432 est déjà occupé par PostgreSQL 17 sur ce poste.

## Vérification

```bash
npm run lint
npm run typecheck
npm run db:validate
npm run test:auth
# Nécessite le serveur sur 9070, la boîte locale et Google Chrome :
npm run test:browser
npm run build --workspace @mombongo/web -- --webpack
```

Les tests créent des comptes temporaires et nettoient leurs données. Ils doivent
être exécutés uniquement sur une base de développement. Le test navigateur
utilise `/usr/bin/google-chrome`, à adapter dans `playwright.config.ts` si nécessaire.

## Disponible

Inscription avec vérification email, connexion email/mot de passe puis code,
NextAuth (5.0.0-beta.32), sessions révocables, choix Particulier/Entreprise, création de l’entreprise et du rôle
propriétaire pour les professionnels, espace privé adapté, déconnexion, invitations et rôles d’équipe, fiches clients et adresses, pipeline CRM, API mobile d’identité, application Expo (connexion, tableau de bord et pipeline), guide prédéfini et endpoint health.

À venir : premier connecteur PA réel (A15.1 différé), paiements Stripe/PayPal,
notifications, Gmail, assistant IA. Aucun abonnement n’est facturé.

Lire [DOCS/README.md](DOCS/README.md).

Les comptes existants sont conservés comme entreprises. Le changement de profil
n’est pas encore proposé. Les paiements des particuliers restent à développer.

## Mot de passe oublié

Sur la connexion, cliquez sur « Mot de passe oublié ? », puis renseignez votre
email. En mode local, `npm run mail:local` affiche le lien (valable quinze minutes).
Choisissez et confirmez le nouveau mot de passe. Les anciennes sessions sont
déconnectées ; reconnectez-vous ensuite avec le nouveau mot de passe et le code email.
Tous les champs de mot de passe disposent d’un bouton afficher/masquer.
