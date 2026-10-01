# Schéma CII Mombongo (sous-ensemble)

Ce fichier n’est **pas** le schéma officiel UN/CEFACT CII D22B ni le package
Factur-X FNFE (XSD + Schematron, inscription requise).

Il décrit la structure XML réellement émise par Mombongo A13.1, à partir des
noms d’éléments CII utilisés par Factur-X 1.09 profil EN 16931.

Provenance : rédigé pour Mombongo le 2026-09-29, aligné sur les namespaces
`urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100` et
`ReusableAggregateBusinessInformationEntity:100`.

Le validateur exécuté par les tests et la CI est
`validateCiiXsdSubset` (`apps/web/src/lib/einvoice/xsd.ts`). Il refuse un XML
hors de ce sous-ensemble. Il ne démontre pas une validation XSD UN/CEFACT
complète.
