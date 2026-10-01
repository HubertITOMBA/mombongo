# Facturation électronique et Factur-X

État : **A13.1** livré (qualification TVA, unités UNECE, pipeline de
validation). Socle A13 conservé. **A14** livre le transport vers une
plateforme agréée (gateway, MOCK, webhooks) **sans connecteur réel**.
Mombongo n’est pas une plateforme agréée.
Ce document n’est **pas** une attestation de conformité réglementaire.
Une validation technique réussie n’autorise pas les mentions « Conforme
DGFiP », « Certifié Factur-X » ou « Conforme EN 16931 ».

## Sources réglementaires utilisées

Versions relues pour A13.1 (sources officielles / organismes de
normalisation, pas d’articles secondaires) :

| Référence | Version retenue | Usage A13.1 |
| --- | --- | --- |
| EN 16931-1 | EN 16931:2017 (modèle sémantique) + codes TVA du profil Factur-X EN 16931 | Catégories S/Z/E/AE/O, BT-120/BT-121, BRs listées ci-dessous |
| UN/CEFACT Cross Industry Invoice | syntaxe CII, namespaces `…:100` (D16B/D22B) | XML `rsm:CrossIndustryInvoice` |
| Factur-X / ZUGFeRD | **1.09.2 / 2.5.2** (FNFE-MPE) | Conteneur PDF/A-3 + `factur-x.xml`, guideline BT-24 |
| AFNOR XP Z12-012 | v1.4 (juin 2026) | Contexte français, EXTENDED-CTC-FR **non produit** |
| DGFiP — spécifications externes réforme facture électronique | v3.2 (30/04/2026), impots.gouv.fr | Périmètre e-invoicing / e-reporting, **sans connexion** |
| FNFE_RFE_INVOICE | 1.4.0.04 | Besoins CTC-FR documentés, **non implémentés** |
| UNECE Rec. 20 | codes d’unité | Mapping explicite uniquement |
| ISO 19005-3 | PDF/A-3 | Objectif de conteneur Factur-X |
| CEF VATEX | codes utilisés : `VATEX-EU-AE`, `VATEX-EU-O`, `VATEX-FR-FRANCHISE` | Uniquement lorsqu’une qualification métier explicite le permet |

Les XSD / Schematron officiels UN/CEFACT et FNFE ne sont pas redistribués
dans le dépôt (volume, licence, inscription). A13.1 exécute un **sous-ensemble
documenté**, pas le package officiel.

## Architecture

```text
Document (snapshots A7 + DocumentLine historiques)
        │
        ├── DocumentPrintModel  →  PDF humain A12 (pdfkit)
        │
        └── ElectronicInvoiceModel
                ↓
          1. validation métier
                ↓
          CII XML (xmlbuilder2)
                ↓
          2. XML bien formé
                ↓
          3. XSD sous-ensemble CII Mombongo
                ↓
          4. règles EN 16931 (sous-ensemble testé)
                ↓
          Factur-X PDF/A-3 visé (pdf-lib)
                ↓
          5. PDF/A-3 structurel
                ↓
          6. cohérence PDF / XML
                ↓
          ElectronicInvoiceArtifact
```

Une facture électronique n’est générable que si les validateurs **requis**
(1 à 6) passent. Source exclusive : document émis → snapshots → lignes
historiques. Jamais `Organization` / `Customer` / `Address` / `CatalogItem`
live.

## Périmètre documentaire

`INVOICE` et `CREDIT_NOTE` **émis** (`SENT`). Un devis conserve le PDF A12
(`DOCUMENT_KIND_UNSUPPORTED`).

## Modèle TVA

`vatBps` seul ne représente pas la nature fiscale. Champs métier (pas des
enums CII copiés dans Prisma) :

| Champ | Rôle |
| --- | --- |
| `taxCategory` | `STANDARD`, `ZERO_RATED`, `EXEMPT`, `REVERSE_CHARGE`, `OUT_OF_SCOPE` |
| `taxExemptionReason` | Motif **saisi** (jamais généré depuis un taux 0 %) |
| `taxExemptionReasonCode` | Optionnel : `FRANCE_FRANCHISE` uniquement si `EXEMPT` |

Copie `CatalogItem` → `DocumentLine` à la saisie. Une facture émise ne relit
jamais le catalogue.

### Cas fiscaux

| Cas | Catégorie métier | EN 16931 | Support A13.1 | Validé |
| --- | --- | --- | --- | --- |
| TVA standard (20 %, 10 %, 5,5 %, …) | `STANDARD` | S | supporté | oui |
| Taux zéro | `ZERO_RATED` | Z | supporté | oui |
| Exonération | `EXEMPT` + motif saisi | E | supporté | oui |
| Franchise en base | `EXEMPT` + motif saisi, code optionnel `FRANCE_FRANCHISE` → `VATEX-FR-FRANCHISE` | E | supporté (pas de phrase 293 B CGI auto) | partiel |
| Autoliquidation | `REVERSE_CHARGE` + motif saisi | AE (`VATEX-EU-AE`) | supporté | oui |
| Hors champ | `OUT_OF_SCOPE` + motif saisi | O (`VATEX-EU-O`) | supporté | oui |
| Livraison intra-UE (K) | — | K | **non supporté** | — |
| Export (G) | — | G | **non supporté** | — |
| `vatBps = 0` sans qualification | — | — | **refusé** (`VAT_ZERO_CATEGORY_UNKNOWN`) | oui |

`Organization.vatOnDebits` n’est pas une qualification de ligne. Aucun champ
`vatRegime` n’a été créé : le besoin n’est pas démontré pour le CII EN 16931
produit ici.

Un taux positif sans `taxCategory` historique est lu comme `STANDARD` (seul
mapping EN 16931 cohérent). Un taux 0 historique **n’est jamais** déduit.

## Unités

L’UI affiche Heure, Jour, Kilogramme, Pièce, Unité, Forfait. Le backend
conserve `unit` (libellé métier) et `unitCode` UNECE Rec. 20.

| UI | `unit` | `unitCode` |
| --- | --- | --- |
| Unité | unité | C62 |
| Heure | heure | HUR |
| Jour | jour | DAY |
| Kilogramme | kg | KGM |
| Pièce | pièce | H87 |
| Forfait | forfait | **null** → `UNIT_CODE_UNMAPPED` |

`forfait` n’est **pas** mappé vers une unité UNECE. Choisir une unité
compatible (pièce, unité, heure, …) pour le message électronique.

## Assujettissement destinataire

`Customer.taxablePerson` (`true` / `false` / `null`), snapshoté
`customerTaxablePersonSnapshot`. `COMPANY` n’implique pas l’assujettissement.
Un particulier (`PERSON`) ne porte pas ce flag.

## Classification

Données réellement utilisées :

```text
document.status
seller.countryCode (snapshot)
buyer.partyKind
buyer.countryCode
buyer.taxablePerson
```

Non utilisées comme règle fiscale unique : `vatOnDebits`, `companyNumber`,
données live.

| Marché | Condition | Route |
| --- | --- | --- |
| B2B France | émetteur FR, COMPANY FR, `taxablePerson = true` | `E_INVOICING` |
| B2B France | COMPANY FR, assujettissement `null` ou `false` | `REVIEW_REQUIRED` |
| B2C France | PERSON FR | `E_REPORTING` |
| B2B international | COMPANY hors FR, `taxablePerson = true` | `E_REPORTING` |
| B2B international | COMPANY hors FR, assujettissement inconnu | `REVIEW_REQUIRED` |
| B2C international | PERSON hors FR | `E_REPORTING` |
| Inconnu | pays ou `partyKind` manquant | `REVIEW_REQUIRED` |
| Hors envoi | statut ≠ `SENT` | `OUT_OF_SCOPE` |

`REVIEW_REQUIRED` est préféré à une route inventée. Ce n’est pas un moteur
fiscal DGFiP. Les codes CTC-FR / BT-23 ne sont pas émis.

## Profil Factur-X

```text
urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931
```

**EXTENDED-CTC-FR n’est pas produit.**

## CII

Builder déterministe `xmlbuilder2`. Mapping A13 inchangé, plus :

| Concept | CII |
| --- | --- |
| `taxCategory` | `ApplicableTradeTax/CategoryCode` S/Z/E/AE/O |
| motif saisi | `ExemptionReason` |
| code métier explicite | `ExemptionReasonCode` VATEX listés ci-dessus |
| `unitCode` | `BilledQuantity/@unitCode` — **jamais** C62 inventé |

Les avoirs restent en magnitudes positives (type 381).

## Validation

Résultat structuré `ElectronicValidationResult` :

```text
valid
errors[]
warnings[]
validators[]  { id, name, status, issues }
```

Identifiants : `business-model`, `xml-wellformed`, `xsd-subset`,
`en16931-subset`, `pdfa-3-structure`, `pdf-xml-consistency`.

### 1. Modèle métier

`validateElectronicInvoice` — erreurs `{ code, field, message, severity }`.

### 2. XML bien formé

Parse `xmlbuilder2`, racine CII.

### 3. XSD

Validateur **sous-ensemble** `validateCiiXsdSubset` + fichier documentaire
`apps/web/src/lib/einvoice/xsd/mombongo-cii-en16931.xsd`.

Ce n’est **pas** le XSD officiel UN/CEFACT D22B.

### 4. EN 16931

Sous-ensemble TypeScript, **pas** le Schematron CEN/FNFE :

`BR-01`, `BR-02`, `BR-03`, `BR-04`, `BR-06`, `BR-08`, `BR-16`,
`BR-CO-10`, `BR-CO-11`, `BR-CO-14`, `BR-S-01`, `BR-Z-01`, `BR-E-01`,
`BR-E-10`, `BR-AE-01`, `BR-AE-10`, `BR-O-01`, `BR-O-10`.

Les autres BR, listes CL et règles FR-CTC **ne sont pas prétendues**.

### 5. PDF/A-3

Validation **structurelle** automatisée (en-tête PDF, XMP `pdfaid:part=3`
et `conformance=B`, OutputIntent, `factur-x.xml`, `AFRelationship /Data`).

**veraPDF** évalué et **non intégré** : runtime Java, licence GPLv3,
maintenance hors stack Node, et le PDFKit A12 n’est pas un producteur PDF/A
certifié — veraPDF échouerait comme gate de génération. Un job CI Java
séparé n’apporterait pas un PASS honnête. A14 pourra changer de moteur PDF.

### 6. Cohérence PDF / XML

Le XML extrait du PDF doit être identique au CII généré.

## Vocabulaire UI

En cas de succès : **Validation technique réussie**. Pas de badge de
certification.

## Legacy

Anciennes lignes : `unit` + `vatBps` seulement.

- PDF A12 : inchangé.
- Factur-X : mapping sûr uniquement (`heure` → HUR, `vatBps > 0` → S).
  `forfait` et `vatBps = 0` sans qualification → refus structuré.
- Aucun backfill live qui réécrit l’histoire fiscale 0 %.

Migration `20260929240000_electronic_tax_units` : unités connues et TVA
positive uniquement.

## Artifact et plateforme (A14)

A13.1 reste propriétaire du modèle, de la validation et du Factur-X. A14
**consomme** ces artefacts via `EInvoiceGateway` ; il ne régénère pas le
CII. Voir [Plateforme agréée](19-plateforme-agreee.md).

## Fichiers et endpoints

- Web : `GET /api/v1/documents/:id/factur-x`
- Mobile : `GET /api/v1/mobile/documents/:id/factur-x`

422 + `issues` si un validateur requis échoue. Le PDF A12 reste sur `/pdf`.

## Matrice

| Fonction | Supportée | Validée | Limitation |
| --- | --- | --- | --- |
| Factur-X EN 16931 génération | oui | tests d’intégration | pas une certification |
| Multi-TVA standard | oui | oui | taux FR du contrat |
| TVA 0 % qualifiée (Z/E/AE/O) | oui | oui | motif saisi obligatoire pour E/AE/O |
| TVA 0 % non qualifiée | refus | oui | — |
| Unités UNECE listées | oui | oui | hors table = refus |
| Forfait | libellé PDF | refus électronique | pas de mapping inventé |
| Snapshot catalogue → ligne | oui | oui | pas de relecture live |
| Classification routage | oui | oui | REVIEW_REQUIRED si info manquante |
| XSD officiel D22B | non | — | sous-ensemble Mombongo |
| Schematron CEN complet | non | — | BRs listées uniquement |
| PDF/A-3 ISO certifié | non | structurel CI | veraPDF non intégré |
| EXTENDED-CTC-FR / BT-23 | non | — | hors profil |
| API plateforme agréée réelle | non | — | connecteur ultérieur |
| Socle gateway / MOCK / webhooks | oui | tests A14 | pas une PA |
| E-reporting réel / Peppol | non | — | phases ultérieures |

## Tests

`tests/einvoice.integration.test.ts` : conversions, B2B France, B2C, international,
avoir, legacy, unités / TVA 0, isolation, TVA qualifiée, historique catalogue,
REVIEW_REQUIRED sans assujettissement, B2C indépendant de la ligne, fixtures
XSD / EN 16931 / PDF/A invalides.

## Limites (ce qui n’est pas démontré conforme)

- Pas de conformité Factur-X / EN 16931 / PDF/A-3 **certifiée**.
- Pas de XSD UN/CEFACT ni Schematron CEN/FNFE officiels.
- Pas de veraPDF.
- Pas d’e-reporting effectif vers la DGFiP, pas d’annuaire Peppol.
- Pas de connexion PDP / PA / PPF réelle (socle A14 MOCK uniquement).
- Catégories K et G absentes.
- Classification de routage conservative, non opposable.
