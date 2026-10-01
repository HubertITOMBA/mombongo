# PDF des documents

État : livré pour A12. PDF humain professionnel des devis, factures et
avoirs. Le Factur-X A13 est un pipeline **séparé** (voir
[Facturation électronique](18-facturation-electronique.md)).

## Architecture

```text
Document (organizationId)
        ↓
getPrintableDocument(...)
        ↓
buildDocumentPrintModel(...)
        ↓
DocumentPrintModel
        ↓
renderDocumentPdf(...)
        ↓
PDF A4
```

Un seul moteur serveur (`pdfkit`, Node, `runtime = "nodejs"`). Aucun rendu
navigateur, aucun renderer Expo. Le mobile consomme le PDF déjà généré.

Le modèle d’impression (`DocumentPrintModel`) reste dédié au rendu humain.
A13 construit séparément un `ElectronicInvoiceModel` puis un XML CII, sans
mélanger ce XML dans le PDF A12. Le Factur-X réutilise le PDF A12 comme
représentation visuelle, puis embarque le XML.

## Source des données

Un document **émis** (`SENT`, `ACCEPTED`, `REFUSED`, `CANCELLED` historique)
est rendu exclusivement depuis :

- snapshots émetteur / destinataire / adresses ;
- lignes `DocumentLine` ;
- devise et ventilation TVA snapshotées (à défaut, totaux déjà stockés sur
  les lignes historiques) ;
- numéro, dates, conditions snapshotées.

Le renderer ne relit jamais `Organization`, `Customer`, `Address` ni
`CatalogItem` live pour compléter un champ absent. Une information manquante
reste manquante. Le site web émetteur n’est pas snapshoté : il n’apparaît pas.

Un **brouillon** (`DRAFT`) peut être prévisualisé. Le PDF porte la mention
**BROUILLON**, n’invente pas de numéro définitif (`devis-brouillon.pdf`) et
reste clairement distinct d’une pièce émise.

L’envoi par e-mail A16 réutilise **ce même** PDF. Il ne crée pas de second
moteur. Joindre un PDF n’est pas transmettre à une PA.
Détail : [E-mails de documents](21-emails-documents.md).

## Identités

- Émetteur : nom commercial, raison sociale, forme juridique, adresse,
  SIREN / SIRET / TVA, e-mail, téléphone, pays — si snapshotés.
- Destinataire `PERSON` : civilité, prénom, nom, adresse, e-mail / téléphone.
  Aucun SIREN / SIRET / TVA destinataire.
- Destinataire `COMPANY` : raison sociale, nom commercial, adresse, identifiants
  professionnels snapshotés.
- Legacy A2 : champs A7 absents tolérés ; pas de complément live.

`Organization` n’a pas de logo. Le renderer accepte `issuerLogo` (toujours
`null` en A12). Le logo Mombongo n’est jamais utilisé comme logo de l’émetteur.
Mombongo n’apparaît que dans les métadonnées PDF (`Creator` / `Producer`).

## Devis, factures, avoirs

| Type | Titre | Spécificités |
| --- | --- | --- |
| `QUOTE` | DEVIS | Date d’émission, validité, commande client, prestation |
| `INVOICE` | FACTURE | Échéance, conditions de règlement snapshotées |
| `CREDIT_NOTE` | AVOIR | Référence `Facture concernée : FA-…`, motif, totaux **crédités** |

Les avoirs stockent des magnitudes positives (A9). Le PDF les présente comme
un crédit (`Total TTC crédité`) sans inverser les montants persistés.

Le PDF de facture est la **pièce émise**, pas un relevé de compte. Un paiement
ultérieur ne change ni les totaux ni le contenu fiscal de ce PDF.

## Tableau et totaux

Colonnes : description, quantité, unité, PU HT, remise, TVA, total HT.
Quantités formatées `1` / `1,5` / `2,75` (jusqu’à 3 décimales métier).
Totaux : HT, TVA, TTC, plus ventilation `Base HT | Taux | TVA`.
Les montants viennent des helpers A7 (`formatMoney`, totaux stockés,
`vatBreakdown` historique). Pas de recalcul parallèle, pas de FX, pas de `€`
codé en dur.

## Pagination et format

A4 portrait, marges 48 pt, texte sélectionnable (pas une image). L’en-tête
du tableau se répète en cas de saut de page. Pied de page : numéro du
document et `Page n / N`. Police embarquée Liberation Sans (OFL), jamais
téléchargée au runtime. Caractères français (`é è ê à ç œ`) supportés.

## Fichiers

```text
devis-DEV-2026-0001.pdf
facture-FA-2026-0001.pdf
avoir-AV-2026-0001.pdf
devis-brouillon.pdf
```

Le nom est sanitizé (`A-Z a-z 0-9 . _ -`). Pas de nom de client dans le fichier.

## Endpoint et sécurité

- Web : `GET /api/v1/documents/:id/pdf` (session + organisation active).
- Mobile : `GET /api/v1/mobile/documents/:id/pdf` (Bearer + `X-Organization-Id`).

Membership obligatoire. Un identifiant connu hors organisation répond `404`.
`Content-Type: application/pdf`. `Content-Disposition: attachment` (bouton
« Télécharger le PDF »). `Cache-Control: private, no-store`.

Toute lecture filtre `organizationId`.

## Déterminisme

Le contenu textuel et visuel est fonction des données historiques. `Date.now()`
n’entre pas dans le corps. Les métadonnées `CreationDate` / `ModDate` reprennent
`issuedAt` (à défaut `createdAt`). L’identifiant interne du fichier PDF peut
varier d’une génération à l’autre : on ne compare pas les octets bruts.

## Conformité

Ce PDF n’est pas à lui seul un Factur-X. A12 = document humain professionnel.
Le conteneur Factur-X est décrit dans [18](18-facturation-electronique.md).
