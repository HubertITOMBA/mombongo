# Équipe, invitations et rôles

## Disponible

Un compte entreprise accède à `/espace/equipe`. Le propriétaire et
l’administrateur peuvent inviter un collaborateur par email, avec un rôle
**Administrateur**, **Membre** ou **Comptable**. Le rôle Propriétaire n’est
jamais attribué par invitation : il est créé uniquement à l’inscription
entreprise.

Le lien, valable sept jours, voyage dans le fragment d’URL. La base ne conserve
qu’un HMAC. Une nouvelle invitation pour la même adresse invalide la précédente.
Un échec d’envoi consomme le lien. Les POST web passent par des Server Actions.

## Acceptation

- Aucun compte : le destinataire choisit un nom et un mot de passe. Le compte
  créé est **BUSINESS**, sans entreprise propre, avec l’appartenance invitée.
  L’email est considéré comme vérifié par le lien. La connexion à deux étapes
  reste obligatoire ensuite.
- Compte entreprise existant : il faut être connecté avec cette adresse, puis
  rouvrir le lien. L’entreprise d’origine est conservée ; la nouvelle apparaît
  dans les organisations accessibles et un basculement A ↔ B est possible.
- Compte particulier : l’invitation est refusée. Une adresse identifie un seul
  profil.

## Matrice métier

Les rôles restent OWNER, ADMIN, MEMBER et ACCOUNTANT. Les permissions sont
des fonctions métier (`canWriteCustomers`, `canWriteAppointments`,
`canWriteQuotes`, `canManageCatalog`, `canIssueInvoices`, `canCancelInvoices`,
`canIssueCreditNotes`, `canRecordPayments`, `canCancelPayments`,
`canManageTeam`, `canManageOrganizationProfile`,
`canManageElectronicInvoicing`, `canSubmitElectronicInvoicing`,
`canManagePaymentIntegrations`, `canSendDocuments`).
Elles ne remplacent pas l’appartenance à l’organisation.

| Permission | Propriétaire | Administrateur | Membre | Comptable |
| --- | --- | --- | --- | --- |
| CRM (écriture) | oui | oui | oui | non |
| Agenda (écriture) | oui | oui | oui | non |
| Devis (écriture) | oui | oui | oui | non |
| Catalogue (écriture) | oui | oui | oui | non |
| Émettre une facture | oui | oui | oui | non |
| Abandonner un brouillon de facture | oui | oui | non | non |
| Émettre un avoir | oui | oui | non | non |
| Enregistrer un paiement | oui | oui | non | oui |
| Annuler un paiement | oui | oui | non | oui |
| Gérer l’équipe | oui | oui | non | non |
| Identité légale de l’émetteur | oui | oui | non | non |
| Configurer la connexion PA | oui | oui | non | non |
| Transmettre une pièce à une PA | oui | oui | non | non |
| Gérer les intégrations de paiement | oui | oui | non | non |
| Envoyer un document par e-mail | oui | oui | oui | oui |

`canManageCatalog` suit la création des devis : le comptable consulte le
catalogue, il ne le crée pas, ne le modifie pas et ne le désactive pas. Il
ne reçoit pas cette écriture du seul fait qu’il lit les factures.

`canIssueCreditNotes` est volontairement plus restrictif que
`canIssueInvoices` : MEMBER émet une facture, pas un avoir. ACCOUNTANT lit
les factures et les avoirs, il n’émet pas. Ce droit n’est pas déduit de
`canCancelInvoices`.

`canCancelInvoices` n’annule plus une facture émise. Il abandonne seulement
un brouillon de facture (`DRAFT`). La correction d’une pièce `SENT` est un
avoir (`canIssueCreditNotes`).

`canRecordPayments` / `canCancelPayments` : OWNER, ADMIN, ACCOUNTANT. MEMBER
n’enregistre pas les encaissements. C’est la première écriture métier du
comptable, limitée aux paiements.

`canManageElectronicInvoicing` / `canSubmitElectronicInvoicing` : OWNER et
ADMIN uniquement. MEMBER peut émettre une facture (`canIssueInvoices`) sans
configurer ni transmettre vers une plateforme agréée. Ces droits ne sont
pas déduits de l’émission de facture.

`canManagePaymentIntegrations` : OWNER et ADMIN uniquement, **jamais**
déduit de `canRecordPayments`. Le comptable enregistre un virement ; il ne
configure pas Stripe. Détail : [Plateforme agréée](19-plateforme-agreee.md),
[Intégrations](20-integrations.md).

`canSendDocuments` : OWNER, ADMIN, MEMBER **et** ACCOUNTANT. Droit explicite
d’envoyer un devis / une facture / un avoir émis par e-mail. Il n’est déduit
ni de `canIssueInvoices` ni de `canRecordPayments`. Détail :
[E-mails de documents](21-emails-documents.md).

`canManageTeam` n’autorise pas un administrateur à modifier ou retirer le
propriétaire. Les règles contextuelles d’invitation et de rôle restent.

| Action équipe | Propriétaire | Administrateur | Membre / Comptable |
| --- | --- | --- | --- |
| Voir l’équipe | oui | oui | oui |
| Inviter ADMIN | oui | non | non |
| Inviter MEMBER / ACCOUNTANT | oui | oui | non |
| Modifier / retirer ADMIN | oui | non | non |
| Modifier / retirer MEMBER / ACCOUNTANT | oui | oui | non |
| Retirer le propriétaire | non | non | non |

Un particulier qui ouvre `/espace/equipe` est renvoyé vers son espace personnel.

## Vérifications

Tests backend : invitation et création de compte sans organisation propre,
refus particulier / membre déjà présent / rôle interdit, rotation du lien,
jeton modifié, changement de rôle, révocation, retrait, acceptation d’un
compte existant uniquement s’il est connecté, matrice `canRecordPayments` /
`canCancelPayments` (comptable oui, membre non).

Test navigateur : invitation depuis l’espace, création du collaborateur,
connexion, affichage du rôle, retrait, absence du menu Équipe pour un
particulier, saisie d’encaissement par le comptable, absence de l’action
pour un membre.
