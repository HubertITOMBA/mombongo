# API et mobile

## Disponible

`GET /api/v1/health` renvoie le nom du service, `status: ok` et `apiVersion: v1`.

Le parcours web d’identité expose `/api/v1/auth/register`, `/login` et
`/resend`. Ces routes exigent l’origine web configurée et un cookie de
challenge.

Le mobile utilise un flux dédié, sans cookie :

- `POST /api/v1/mobile/auth/register` et `/login` → `{ challengeToken }`
- `POST /api/v1/mobile/auth/resend` → `{ challengeToken }`
- `POST /api/v1/mobile/auth/verify` → `{ accessToken, refreshToken, expiresIn, user }`
- `POST /api/v1/mobile/auth/refresh` → nouvelle paire (rotation)
- `POST /api/v1/mobile/auth/logout` (Bearer + refresh)
- `GET /api/v1/mobile/me` et `GET /api/v1/mobile/dashboard` (Bearer)

L’accès mobile dure quinze minutes. Le refresh, valable trente jours, est
stocké sous HMAC et tourne à chaque usage. Réutiliser un refresh déjà consommé
révoque toute la famille. Une requête native n’envoie pas d’origine ; une
origine présente doit correspondre à `AUTH_URL` (ou `APP_URL`). Une réinitialisation de mot de
passe révoque aussi les refresh mobiles.

En développement, le client Expo reprend l’hôte du QR (`http://<lan>:9070`) ou
`EXPO_PUBLIC_API_URL`. En production, `EXPO_PUBLIC_API_URL=https://mombongo.fr`
est obligatoire (les chemins restent `/api/v1/mobile/*`). Aucune IP LAN n’est
codée en dur.

Le tableau de bord renvoie le profil, les organisations accessibles, les
compteurs clients/prospects actifs, les rendez-vous à venir, les devis ouverts,
les factures émises, et des zéros pour CA et dépenses tant que ces modules ne
sont pas livrés. Le pipeline, l’agenda, les devis et les factures mobiles
listent et créent les objets correspondants.

Les listes mobile de devis et de factures exposent `currency` (et `dueDate`
pour une facture). Les factures ajoutent `grossTtcCents`, `creditedTtcCents`,
`netTtcCents`, `paidTtcCents`, `remainingTtcCents` (reste à payer) et
`settlementState`. Pas de création d’avoir ni de saisie de paiement mobile.
Le détail documentaire web n’est pas reproduit sur mobile. Le backend reste
l’autorité des montants, des snapshots, du **PDF** et du **Factur-X** :
`GET /api/v1/mobile/documents/:id/pdf` et
`GET /api/v1/mobile/documents/:id/factur-x` (Bearer + organisation). Aucun
renderer PDF dans Expo. L’envoi manuel par e-mail A16 est **web-only** : pas
d’endpoint mobile dédié. Les factures listées exposent aussi
`electronicTransmissionStatus` et `electronicTransmissionRoute` en lecture.
Pas de configuration de plateforme agréée sur mobile, pas de logique
fournisseur dans Expo. Les compteurs CA du tableau de bord restent à zéro :
A10 n’agrège pas encore le chiffre d’affaires.

Les routes métier lisent l’en-tête `X-Organization-Id`. Il n’est pas une
preuve d’autorisation : le serveur relit le Membership après le jeton d’accès.
Sans en-tête, une seule appartenance est utilisée ; un identifiant étranger,
inexistant ou sans appartenance est refusé. L’application mémorise le choix
dans SecureStore (`mombongo.organization`, avec reprise temporaire de
`facturia.organization`).

`GET /api/v1/mobile/customers` renvoie `displayName` calculé (PERSON/COMPANY
ou fiche historique) et `partyKind` optionnel. Le mobile ne crée pas de fiche
et n’administre pas l’identité fiscale de l’émetteur.

`GET /api/v1/mobile/catalog` liste les articles actifs de l’organisation
courante (isolation Membership) : unité, TVA, qualification fiscale et
`unitCode` lorsqu’ils existent. Le POST devis accepte une `catalogItemId`
optionnelle ; les valeurs de ligne restent copiées et indépendantes. Pas
d’API publique externe, pas d’administration catalogue mobile complète.

Application Expo SDK 57 dans `apps/mobile` : SecureStore uniquement, mêmes
contrats Zod que le web.

## API cible

Routes versionnées, erreurs stables, pagination. OpenAPI à ajouter avec les
endpoints métier restants. CORS ne remplace pas une authentification.

## Suite mobile

iOS / App Store ensuite. Notifications, liens profonds, paiements boutiques :
non livrés. Vérifier les règles Google Play et App Store avant tout checkout
natif.

## Vérifications

Tests backend : inscription mobile, jetons, tableau de bord, rotation et
réutilisation du refresh, déconnexion.
