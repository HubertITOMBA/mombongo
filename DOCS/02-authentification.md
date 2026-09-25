# Authentification et sécurité

## Disponible

NextAuth `5.0.0-beta.32` avec provider Credentials, schémas Zod, hachage Argon2id,
vérification email à l’inscription, connexion en deux étapes, choix Particulier/Entreprise, entreprise créée
avec un propriétaire uniquement pour le profil entreprise, espace privé et déconnexion. La version NextAuth est encore
bêta ; une vérification de sa stabilité et des mises à jour reste requise avant production.

Routes : `/inscription`, `/connexion`, `/verification`, `/espace`.
API : `POST /api/v1/auth/register`, `/login`, `/resend` et routes NextAuth `/api/auth/*`.

## Parcours et garanties

Le compte et, pour le profil BUSINESS, l’entreprise ne sont créés qu’après validation
du premier code. Le profil INDIVIDUAL ne crée aucune entreprise.
Les demandes en attente stockent un hash Argon2id, jamais le mot de passe en clair.
Une inscription pour un compte existant renvoie la même réponse sans modifier
son mot de passe. La récupération de compte par lien email est disponible ; voir le module dédié.

La connexion vérifie le mot de passe puis crée un challenge lié au navigateur
par cookie HttpOnly, SameSite Strict, Secure en production. Le code est généré
cryptographiquement, comporte six chiffres, expire après cinq minutes et n’est
stocké en base que sous HMAC avec secret serveur et identifiant de challenge.
La comparaison est à temps constant. Cinq erreurs bloquent le challenge.

Renvoi : délai d’une minute, trois envois maximum par challenge et durée totale
de quinze minutes. Le nouveau code diffère du précédent, les erreurs précédentes
restent comptées. Une nouvelle demande invalide les challenges précédents de
l’adresse. Un échec d’envoi invalide le challenge.

La consommation du challenge, la création éventuelle du compte et de l’entreprise,
et l’enregistrement de la session sont une transaction PostgreSQL avec verrou de
ligne. Le cookie NextAuth est ensuite émis ; si cette émission échoue, il faut
recommencer la connexion. Le code consommé ne peut pas être rejoué.

Les cookies NextAuth contiennent un JWT chiffré relié à une session en base de
huit heures maximum. À chaque lecture de session, NextAuth vérifie que cette
session existe encore et n’est pas expirée. La déconnexion supprime la session.
Les accès à l’espace rechargent l’appartenance à l’entreprise côté serveur.

Compteurs de limitation persistants et atomiques PostgreSQL, par email et origine
réseau. Par défaut, l’origine réseau est un compteur global partagé : l’application
ne fait pas confiance à un en-tête IP fourni librement. Derrière un proxy qui
**écrase** `X-Real-IP`, activer `AUTH_TRUST_PROXY=true` pour limiter par IP.
Valider les seuils pour la volumétrie réelle avant ouverture publique.

Les mutations vérifient l’Origin contre `AUTH_URL`. NextAuth conserve sa protection
CSRF. Les corps JSON de démarrage sont limités à 8 Ko.

## Messagerie et exploitation locale

`MAIL_TRANSPORT=local` écrit des emails dans `.local/mail` (dossier privé 0700,
fichiers 0600). Ils contiennent nécessairement le code en clair pour tester,
ne sont ni servis par HTTP ni inscrits dans les logs. Lecture volontaire avec
`npm run mail:local`. Ce mode est refusé en production.

Resend est implémenté avec une clé d’idempotence par challenge et numéro d’envoi.
Son activation exige une clé API et un expéditeur autorisé. Les envois réels n’ont
pas été testés sans ces paramètres. Un timeout fournisseur peut invalider un code
déjà reçu : recommencer la connexion dans ce cas.

Ne pas qualifier le code email de mécanisme résistant au phishing. TOTP ou passkeys
pourront compléter cette validation en deux étapes.

## Validation et travaux restants

Les tests PostgreSQL passent : compte absent avant validation, consommation concurrente unique,
expiration, liaison au navigateur, verrouillage après cinq erreurs, renvoi,
invalidation du code précédent, mauvais mot de passe, compteurs atomiques,
protection du compte existant et interdiction des adresses entre entreprises.
Test navigateur : accès protégé, inscription, validation, déconnexion, reconnexion,
révocation serveur, rejet d’une origine étrangère, limite de taille des requêtes
et affichage mobile. TypeScript, validation Prisma et build Webpack réussis.

À développer avant une ouverture publique : invitation et gestion des rôles, interface des sessions, nettoyage périodique des
challenges/compteurs expirés et des emails locaux, journal d’audit et tests de charge.
Aucune politique de conservation automatique n’est encore activée.

Référence : https://authjs.dev/getting-started/providers/credentials

Les parcours des deux profils sont décrits dans [Particuliers et entreprises](14-particuliers-entreprises.md).

La [récupération de mot de passe](15-recuperation-mot-de-passe.md) est disponible
pour les deux profils, avec révocation des sessions et affichage/masquage des champs.
