# Comptes particuliers et entreprises

## Disponible

L’inscription demande un choix explicite : **Particulier** ou **Entreprise**.
Le serveur valide ce choix avec une union discriminée Zod. Le nom d’entreprise
est obligatoire uniquement pour une entreprise ; une valeur envoyée en plus
pour un particulier est ignorée.

Le type est enregistré dans le challenge de vérification puis dans `User.accountType` :
`INDIVIDUAL` ou `BUSINESS`. Aucun compte n’est créé avant validation du code email.
Un particulier n’a ni entreprise artificielle ni rôle de propriétaire. Une
entreprise obtient une Organization et une Membership OWNER comme auparavant.

La connexion reste commune : email, mot de passe et code à six chiffres.
Le type envoyé éventuellement à la connexion est ignoré : le profil enregistré
fait autorité. Le serveur relit ce type lors de l’accès à l’espace.

## Espaces

Le compte particulier affiche un espace personnel avec les futurs modules
Mes factures, Mes paiements, Mes échéances et Mes rappels. Ils sont marqués
« À venir » : aucun import, paiement, solde ou historique fictif n’est présenté
comme opérationnel.

Le compte entreprise conserve Facturation, Notes de frais, Clients et prospects
et Rendez-vous. Les accès réservés aux entreprises doivent utiliser
`requireMembership` (pages) ou un contrôle équivalent côté API. Un particulier
n’obtient aucun accès professionnel en modifiant son navigateur.

## Migration et compatibilité

La migration `individual_accounts` ajoute deux colonnes avec la valeur par défaut
BUSINESS pour préserver tous les comptes et challenges existants. Aucune donnée,
entreprise, appartenance ou session n’est supprimée. Les comptes créés avant ce
changement restent donc des comptes entreprise.

Le type n’est pas modifiable en libre-service pour l’instant. Une adresse email
identifie toujours un seul compte. L’utilisation simultanée d’un espace personnel
et d’entreprises avec un même compte pourra faire l’objet d’un futur sélecteur
d’espaces ; elle n’est pas implémentée dans cette étape.

## Factures et paiements particuliers : suite prévue

Distinguer les factures reçues par un particulier, les factures commerciales
émises par une entreprise et les factures d’abonnement Facturia.
Les futurs documents personnels devront être liés à leur propriétaire utilisateur,
avec contrôle serveur systématique de userId et accès privé aux pièces.
Aucun rattachement automatique à une facture sur la seule correspondance email.

Le règlement concernera les factures éligibles selon le fournisseur et les moyens
de paiement acceptés. L’import d’un PDF ne rend pas automatiquement sa facture
payable par Stripe ou PayPal. Il faudra définir le lien au créancier, la référence
de facture, le montant dû, les statuts et le rapprochement du paiement. Ne pas
confondre le paiement d’une facture et le paiement de l’abonnement au SaaS.

Tarifs particuliers, frais éventuels et offre entreprise restent à définir.
Aucun paiement réel ni conservation de coordonnées bancaires dans cette étape.

## Vérifications

Tests backend : création et reconnexion d’un particulier sans entreprise,
validation du type et du nom d’entreprise côté serveur, maintien du parcours
entreprise et ignorance d’un faux type fourni lors de la connexion.

Tests navigateur : inscription et code, espace adapté, absence des modules
professionnels pour le particulier, déconnexion et reconnexion des deux profils,
affichage mobile et révocation serveur des sessions.

Validation réalisée : 11 tests backend, 2 parcours navigateur (Entreprise et
Particulier), vérification TypeScript et compilation de production Webpack.
