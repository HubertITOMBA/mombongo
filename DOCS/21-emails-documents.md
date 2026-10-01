# Envoi des documents par e-mail (A16)

État : **livré**. Un utilisateur autorisé peut envoyer manuellement le PDF
historique d’un devis, d’une facture ou d’un avoir **émis**.

A15.0 (socle plateforme agréée + registre) est **validé**. A15.1 (connecteur
réel WeInvoice / sandbox professionnel) reste **différé**. Le MOCK PA est
conservé. L’e-mail A16 n’est pas une transmission réglementaire.

## Périmètre

Documents éligibles :

| Type | Statuts pouvant être envoyés |
| --- | --- |
| Devis | `SENT`, `ACCEPTED`, `REFUSED` |
| Facture | `SENT` |
| Avoir | `SENT` |

Un brouillon (`DRAFT`) est refusé. L’envoi d’un e-mail **ne modifie jamais** :

- `Document.status`
- le solde / les paiements
- une `ElectronicTransmission`
- une logique PA / e-reporting

PDF par e-mail et transmission à une plateforme agréée sont deux domaines
distincts.

## PDF

Le fichier joint est produit uniquement par le moteur A12
(`buildOrganizationDocumentPdf`). Pas de second renderer. Le contenu vient du
snapshot historique, pas de la fiche client live.

Noms :

- `devis-DEV-AAAA-NNNN.pdf`
- `facture-FA-AAAA-NNNN.pdf`
- `avoir-AV-AAAA-NNNN.pdf`

Le PDF n’est pas stocké en base : A12 le régénère à chaque envoi.

## Destinataire, expéditeur, message

Le destinataire proposé par défaut est `customerEmailSnapshot`. La fiche live
`Customer.email` n’est **jamais** substituée silencieusement. L’utilisateur
peut modifier l’adresse avant l’envoi ; l’adresse réellement utilisée est
écrite dans l’historique.

`From` = `EMAIL_FROM` (Resend) ou `Mombongo <dev@localhost>` en transport
local. Aucune adresse `@mombongo.fr` n’est codée en dur. `Reply-To` = e-mail
snapshoté de l’émetteur (`issuerEmailSnapshot`) lorsqu’il existe.

Sujet et corps ont un texte professionnel par défaut, modifiable avant envoi.
Les valeurs réellement envoyées sont historisées. Pas de templates par
organisation en A16.

## Historique `DocumentEmailDelivery`

Chaque tentative crée ou réutilise une ligne, **sans écraser** un envoi
précédent réussi. Une réexpédition explicite (nouvelle `idempotencyKey`)
ajoute une entrée. Un double POST accidentel avec la même clé est ignoré.

Champs : organisation, document, destinataire, sujet, message, fournisseur
(`LOCAL` / `RESEND`), `providerMessageId`, statut, erreur utilisateur,
auteur, dates.

Statuts A16 :

| Statut | Signification |
| --- | --- |
| `QUEUED` | demande enregistrée, envoi en cours |
| `SENT` | le fournisseur d’e-mail **a accepté** la demande |
| `FAILED` | l’envoi a échoué ; le document reste inchangé |

`SENT` **n’est pas** `DELIVERED`. Les webhooks Resend (`DELIVERED`, `BOUNCED`,
`COMPLAINED`, …) sont hors A16.

## Resend

Couche unique : `sendOutboundMail` dans `apps/web/src/lib/auth/mail.ts`.

- `MAIL_TRANSPORT=local` : fichiers dans `LOCAL_MAIL_DIR`, aucun réseau.
- `MAIL_TRANSPORT=resend` : `RESEND_API_KEY` + `EMAIL_FROM` obligatoires.
- Les tests automatisés n’appellent jamais Resend (`setMailTestFailure` pour
  simuler un échec).

Adresses de test Resend utiles en DEV : `delivered@resend.dev`,
`bounced@resend.dev`, `complained@resend.dev`. Pour un essai personnel,
remplacer manuellement le destinataire par `mombongo.devo@gmail.com` (adresse
de réception, pas le `From`).

## Permissions

`canSendDocuments` : OWNER, ADMIN, MEMBER, ACCOUNTANT. Permission métier
**explicite**, jamais déduite de `canIssueInvoices`, `canRecordPayments` ou
de la PA. Le backend refuse une action forgée. Isolation `organizationId` +
Membership A1.

## UI

Pages devis, facture et avoir émis : formulaire destinataire / sujet /
message, historique, réessai ou réenvoi. Pas de relance automatique.

## Mobile

Aucun workflow d’envoi d’e-mail sur Expo en A16. Le PDF mobile existant
reste un téléchargement. L’envoi manuel est **web-only**.

## Tests

`tests/document-emails.integration.test.ts` et
`tests/browser/document-emails.spec.ts`. Aucun envoi Resend réel.
