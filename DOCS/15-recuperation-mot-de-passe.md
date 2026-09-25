# Mot de passe oublié et visibilité de saisie

## Disponible

Depuis `/connexion`, le lien **Mot de passe oublié ?** ouvre
`/mot-de-passe-oublie`. L’utilisateur renseigne son email ; le message de réponse
reste identique pour une adresse existante ou inconnue. Les deux profils,
Particulier et Entreprise, utilisent ce même parcours.

L’email contient un lien vers `/reinitialiser-mot-de-passe` valable quinze minutes.
Le formulaire demande un nouveau mot de passe de 12 à 128 caractères et sa
confirmation. Après validation, l’utilisateur revient à la connexion classique,
puis saisit le code à six chiffres. La réinitialisation ne crée pas de session.

Les champs de mot de passe de l’inscription, de la connexion et de la
réinitialisation ont chacun un bouton afficher/masquer. Ils sont masqués par
défaut. Les boutons ne soumettent pas le formulaire, possèdent un libellé
accessible et conservent la valeur saisie. Les deux champs de réinitialisation
peuvent être affichés indépendamment.

## Protection des liens

Chaque lien contient un identifiant UUID et un secret aléatoire de 256 bits.
La base ne conserve qu’un HMAC lié à cet identifiant, avec expiration et date de
consommation. Une nouvelle demande invalide les anciens liens de ce compte.
Un lien expiré, modifié ou utilisé est refusé ; une simple ouverture ne le consomme
pas, afin que les scanners d’emails n’empêchent pas son utilisation.

Le jeton voyage dans le fragment du lien (`#…`), qui n’est pas envoyé au serveur
lors de la navigation. La page le lit en mémoire et retire ce fragment de la barre
d’adresse, puis le transmet uniquement dans le corps du POST de validation.
La page utilise `no-referrer` et n’est pas indexable. Après actualisation avant
validation, rouvrir le lien reçu par email. Ne pas ajouter d’analytics ni de scripts
externes susceptibles de lire ce jeton.

Les POST `/api/v1/auth/forgot-password` et `/api/v1/auth/reset-password` utilisent
le contrôle d’origine, la limite de corps JSON de 8 Ko et les validations Zod.
Les limites PostgreSQL sont de vingt demandes par origine réseau et quinze minutes,
trois emails par compte sur la même période et vingt tentatives de validation par
origine. Le quota par email produit la même réponse générique, sans nouvel envoi.
Le mode de confiance IP reste celui décrit dans le module authentification.

## Révocation atomique

La mise à jour du hash Argon2id, la consommation des liens, la suppression de
toutes les sessions et l’invalidation des codes de connexion en attente font
partie d’une seule transaction PostgreSQL. Un verrou par email sérialise aussi
les connexions et renvois concurrents. Le démarrage d’une connexion revérifie
sous ce verrou que le hash du mot de passe n’a pas changé depuis sa validation.
Ainsi, un ancien mot de passe ou code en cours ne peut recréer une session après
la réinitialisation. Le rôle, le type du compte et ses données métier sont conservés.

## Email local et Resend

En développement, `npm run mail:local` affiche le dernier message, y compris
le lien de réinitialisation. Aucun email réel n’est envoyé avec le transport local.
Resend utilise le même adaptateur et une clé d’idempotence propre à chaque lien.
Un échec d’envoi invalide le lien sans révéler publiquement l’existence du compte.
Le mode local reste interdit en production. Les emails locaux contiennent le lien
en clair, sont privés et exclus du versionnement.

## Vérifications

Tests backend : consommation concurrente unique, lien expiré/modifié/ancien,
confirmation différente, compte inconnu, suppression des sessions et challenges,
refus de l’ancien mot de passe, connexion avec le nouveau et concurrence entre
validation d’un code et réinitialisation.

Tests navigateur pour Particulier et Entreprise : boutons afficher/masquer,
parcours depuis le lien « Mot de passe oublié », confirmation, modification,
révocation d’une session dans une autre page et reconnexion avec nouveau mot de
passe et code email.

L’envoi Resend réel reste à vérifier avec le domaine expéditeur configuré. Le
nettoyage périodique des liens expirés reste à ajouter au travail d’exploitation.
