# Entreprises, clients et adresses

## Disponible

Un compte entreprise accède à `/espace/clients` et à `/espace/organisation`.
Le propriétaire, l’administrateur et le membre peuvent créer, modifier,
archiver et restaurer une fiche, ainsi qu’ajouter plusieurs adresses client.
Le comptable consulte les fiches sans les modifier. Un particulier inscrit
est renvoyé vers son espace personnel.

## Identités distinctes

```text
User            = personne authentifiée (INDIVIDUAL ou BUSINESS)
Organization    = tenant + entité facturante / espace de travail
Customer        = partie commerciale destinataire
```

`User.accountType` ne décrit pas l’émetteur. Jean Martin EI facture via une
Organization ; Marie Dupont est un `Customer` `PERSON`.

L’émetteur (`Organization`) peut être une **activité en nom propre**
(`entityKind = SOLE_TRADER`) ou une **personne morale** (`COMPANY`). Un
libellé libre `legalFormLabel` (EI, SAS, micro-entrepreneur…) complète cette
distinction sans enum juridique français. Les champs live préparés pour la
facturation V2 et l’e-invoicing sont : `legalName`, `tradeName`, `siren`,
`siret`, `vatNumber`, email, téléphone, site, `countryCode`, devise, fuseau,
adresses d’émetteur, option TVA sur les débits, délai et conditions de
règlement. Ils restent optionnels : aucune valeur légale n’est inventée à la
migration. Ces paramètres d’émetteur sont copiés sur le document à
l’émission ; ils ne s’appliquent pas aux pièces déjà émises.

Une fiche `Customer` est un **client** ou un **prospect** (`kind`), et un
**particulier** (`partyKind = PERSON`) ou un **professionnel** (`COMPANY`).
Un prospect incomplet reste possible : SIREN, SIRET et TVA ne sont pas
exigés à la création. Un particulier n’a jamais à fournir d’identifiant
d’entreprise. Un professionnel peut indiquer s’il est **assujetti à la TVA**
(`taxablePerson`) ; `COMPANY` ne l’implique pas. L’information est snapshotée
à l’émission pour le routage électronique (`REVIEW_REQUIRED` si elle manque).

Le nom d’affichage est centralisé (`customerDisplayName`) :

- PERSON → prénom + nom ;
- COMPANY → nom commercial, sinon raison sociale ;
- fiche historique (`partyKind` null) → `displayName` existant.

La valeur calculée est persistée dans `displayName` pour la recherche et les
listes.

## Compatibilité `companyNumber`

Le champ `companyNumber` est **conservé** comme identifiant d’entreprise
ambigu (SIREN ou SIRET non distinguable). Aucun backfill vers `siren` /
`siret` n’est effectué. Les nouvelles fiches professionnelles utilisent les
champs explicites.

## Adresses

Adresses : personnelle, facturation, livraison (`SHIPPING`), bureau ou autre.
Pays : ISO à deux lettres du contrat Zod (France par défaut). Plusieurs
adresses du même type sont autorisées.

`Address.customerId` est nullable : une adresse sans client appartient à
l’Organization émettrice (facturation / livraison de l’émetteur). Les
adresses client restent liées par la relation composite existante. Modifier
une fiche ou l’identité live ne réécrit pas un document déjà émis. Le
snapshot A7 (voir [Facturation](04-facturation.md)) fige aussi l’adresse
d’émetteur et, le cas échéant, l’adresse de livraison client.

## Matrice

| Action | Propriétaire / Admin / Membre | Comptable |
| --- | --- | --- |
| Voir les fiches | oui | oui |
| Créer / modifier / convertir | oui | non |
| Ajouter / modifier / supprimer une adresse client | oui | non |
| Archiver / restaurer | oui | non |
| Voir l’identité de l’émetteur | oui | oui |
| Modifier l’identité / adresses de l’émetteur | propriétaire / admin uniquement | non |

Un User INDIVIDUAL n’est pas une fiche Customer. Aucun partage de coordonnées
n’existe entre un particulier inscrit et une fiche tenue par une entreprise.

Le pipeline commercial et l’historique d’activités sont décrits dans
[Prospects](06-prospects.md).

## Vérifications

Tests backend : création et conversion, unicité d’email, pays inconnu,
isolation inter-entreprises, refus du comptable en écriture, archivage puis
restauration, particulier PERSON sans identifiants fiscaux, professionnel
COMPANY, fiche legacy, identité émetteur A/B.

Test navigateur : création professionnel et particulier, adresse, archivage,
identité de l’émetteur, absence du menu Clients pour un particulier.
