# Intégrations — registre et configuration des connecteurs

État : **socle A14.1 livré**. Mombongo sait décrire et configurer des
connecteurs **sans brancher de prestataire réel**. Stripe, PayPal et toute
plateforme agréée réelle restent hors périmètre.

## Intention

Deux familles métier restent distinctes :

```text
Mombongo
├── Facturation électronique
│   └── EInvoiceGateway → EInvoiceProviderAdapter
└── Paiements
    └── PaymentGateway → PaymentProviderAdapter
```

Il n’existe pas d’`UniversalConnectorAdapter`. On mutualise seulement les
mécanismes techniques communs : registre, capacités, configuration non
sensible, environnement, état de connexion, référence de secret, diagnostics
et briques webhook (signature, anti-replay, logs).

## Deux niveaux

| Niveau | Source | Qui décide |
| --- | --- | --- |
| Mombongo | registre TypeScript | le logiciel, pas l’utilisateur |
| Organisation | connexions persistées | OWNER / ADMIN du tenant |

Un utilisateur ne peut pas inventer un fournisseur en saisissant une URL
d’API. Un connecteur visible dans l’interface correspond forcément à un
descripteur (et, s’il est `available`, à un adapter installé).

## Registre

Le registre vit dans `apps/web/src/lib/integrations/registry.ts`. Ce n’est
pas une table SQL : ajouter un connecteur est une décision de code.

Un descripteur porte :

- `key` unique (`MOCK`, `STRIPE`, `PAYPAL`)
- `family` (`ELECTRONIC_INVOICING` ou `PAYMENT`)
- `displayName`, `description`
- `availability` (`available` ou `coming_soon`)
- `enabled`
- `environments` réellement proposés
- `capabilities` (`supportedByProvider` × `implementedByMombongo`)
- `configurationFields` non sensibles, validés côté serveur

A14.1 enregistre :

| Clé | Famille | Disponibilité | Environnements | Adapter |
| --- | --- | --- | --- | --- |
| `MOCK` | facturation électronique | disponible | `TEST` seulement | `mockEInvoiceAdapter` |
| `STRIPE` | paiements | bientôt disponible | `SANDBOX`, `PRODUCTION` | aucun |
| `PAYPAL` | paiements | bientôt disponible | `SANDBOX`, `PRODUCTION` | aucun |

`MOCK` s’affiche comme **Connecteur interne de test**. Ce n’est pas une
plateforme agréée.

## Capacités

Une capacité `supportedByProvider` sans `implementedByMombongo` n’est jamais
opérationnelle. L’UI peut l’annoncer comme prévue ; le backend refuse
l’invocation (`409`). Exemple : `DIRECTORY_LOOKUP` sur `MOCK`,
`CARD_PAYMENT` sur `STRIPE`.

Pour une PA, les capacités réellement implémentées aujourd’hui sont celles
du MOCK A14 (émission facture / avoir, e-reporting, reporting de paiement
préparé, inbound de test, webhooks). L’annuaire n’est pas implémenté.

Pour un PSP, aucune capacité n’est implémentée par Mombongo.

## Configuration par organisation

### Facturation électronique

Le contrat A14 est conservé : **une** connexion PA principale par
organisation (`ElectronicInvoicingConnection.organizationId` unique).

Champs utiles A14.1 : `connectorKey`, `provider` (historique), `status`,
`environment`, `externalAccountId`, `credentialRef`, `lastCheckedAt`,
`lastCheckOk`.

Une transmission copie `provider` **et** `connectorKey` au moment de
l’opération. Changer la connexion active ne réécrit pas l’historique.

`MOCK` n’accepte que `TEST` (affiché « Sandbox interne »). Un passage
silencieux vers `PRODUCTION` est refusé (`422`).

### Paiements

`PaymentConnection` prépare **plusieurs** PSP par organisation
(`organizationId` + `connectorKey` + `environment`). A14.1 n’enregistre
jamais une connexion Stripe/PayPal : l’upsert refuse (`409`).

`Payment.method` (virement, carte, …) reste le moyen d’encaissement A10.
`Payment.provider` (`MANUAL` / `STRIPE` / `PAYPAL`) reste l’étiquette
historique d’un paiement. Ce n’est pas le connecteur technique
`PaymentConnection`.

## États

Trois vocabulaires distincts :

| Concept | Exemples |
| --- | --- |
| Connexion | PA : `INACTIVE`, `READY`, `ERROR`, `DISABLED` — PSP : `DISABLED`, `CONFIGURED`, `READY`, `ERROR` |
| Paiement A10 | `CONFIRMED`, `CANCELLED`, … |
| Transmission électronique | `QUEUED`, `ACCEPTED`, `REJECTED`, … |

`INACTIVE` (PA) signifie « configurée mais pas prête à transmettre ».
`lastCheckOk` distingue « configurée » de « connexion réellement vérifiée ».

## Secrets

Aucun secret fournisseur n’est accepté dans un JSON de configuration
(`apiKey`, `clientSecret`, `webhookSecret`, mot de passe, clé privée,
jeton). Le backend refuse (`400`).

`credentialRef` est une référence opaque (`mombongo:famille:clé:org:uuid`).
Elle n’est jamais renvoyée telle quelle : les DTO exposent
`credentialState = configured | null`. A14.1 ne branche pas de coffre
externe. Les tests peuvent poser une référence fictive en mémoire.

Aucun secret réel dans Prisma, Git, logs ou UI.

## PaymentGateway futur

`PaymentGateway` expose `createPayment`, `getPaymentStatus`, `refund`.
Chaque appel lève `501` : aucun prestataire n’est branché, les
encaissements restent manuels A10. Aucun SDK Stripe/PayPal.

`PaymentProviderAdapter` et sa factory existent pour accueillir plus tard
`StripePaymentAdapter` / `PayPalPaymentAdapter` sans modifier les services
métier. Aucun adapter réel n’est enregistré.

## Registry / factory

```text
connectorRegistry
  → requireAvailableConnector(key, family)
  → getEInvoiceAdapterForKey / getPaymentAdapter
  → adapter
```

Les `switch` restent dans les registries, exhaustifs. Les services de
facturation et de paiement n’écrivent pas `if (provider === "X")`.

## Permissions

| Permission | OWNER | ADMIN | MEMBER | ACCOUNTANT |
| --- | --- | --- | --- | --- |
| `canManageElectronicInvoicing` | oui | oui | non | non |
| `canSubmitElectronicInvoicing` | oui | oui | non | non |
| `canManagePaymentIntegrations` | oui | oui | non | non |
| `canRecordPayments` | oui | oui | non | oui |

`canManagePaymentIntegrations` n’est **pas** déduit de `canRecordPayments`.
Enregistrer un virement n’autorise pas à poser des credentials Stripe.

## Interface

`/espace/integrations` : deux sections (facturation électronique, paiements).
`/espace/organisation` pointe vers cet écran. Navigation : **Intégrations**.

MOCK : état, environnement, capacités réellement implémentées, test de
connexion. Stripe / PayPal : « Bientôt disponible », bouton Connecter
refusé par le backend.

## Webhooks

Les routes restent propres à leur famille :

- `/api/v1/e-invoicing/webhooks/:provider` (A14, MOCK)
- `/api/v1/payments/webhooks/:provider` (non créé : aucun PSP)

Mécanismes communs extraits : comparaison HMAC à temps constant, fenêtre
d’horodatage, logs structurés. Pas d’endpoint universel.

## Observabilité

Logs `integrations` : `organizationId`, `connectorFamily`, `connectorKey`,
`connectionId`, `operation`, `result`. Jamais de secret, d’en-tête
`Authorization` ni de payload financier complet.

## Isolation

Toute connexion persistée appartient à une organisation. Un identifiant
fourni par le client (connexion, organisation tierce) n’est pas une
autorisation. Les tests forgent des IDs et vérifient le `404`.

## Hors périmètre A14.1

Stripe réel, PayPal réel, Mollie, GoCardless, Adyen, Sage PA, Docoon,
WeInvoice, OAuth fournisseur, checkout, PaymentIntent, refund, webhook
PSP réel, e-reporting réel, transmission externe réelle, annuaire,
Peppol, marketplace de plugins.
