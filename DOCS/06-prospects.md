# Prospects et CRM

## Disponible

Le pipeline `/espace/pipeline` affiche les prospects actifs en Kanban :
Nouveau → Contacté → Qualifié → RDV → Proposition → Négociation → Gagné / Perdu.

Chaque fiche porte une source, un responsable (membre de l’entreprise), une
valeur potentielle, une probabilité, une prochaine action et un historique
chronologique (création, notes, e-mails, appels, rendez-vous, changements
d’étape, conversion). Passer à **Gagné** convertit le prospect en client sans
doublon. Les POST web passent par des Server Actions.

L’API mobile expose `GET /api/v1/mobile/pipeline`, le détail d’une fiche, le
changement d’étape et l’ajout d’une activité.

## Hors lot

Documents joints, tags, rappels automatiques, consentements de contact et
suggestions IA : non livrés.

## Vérifications

Tests backend : déplacement d’étape, journal, conversion à Gagné, isolation
existante des fiches.

Test navigateur : création d’un prospect, changement d’étape depuis le Kanban,
apparition dans l’historique.
