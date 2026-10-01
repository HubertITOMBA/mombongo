# Rendez-vous

État : première version livrée (agenda interne).

Un compte entreprise accède à `/espace/agenda`. Le propriétaire, l’administrateur
et le membre planifient un rendez-vous (titre, début, durée, lieu, notes, fiche
optionnelle). Le comptable consulte sans modifier. Un particulier est renvoyé
vers son espace personnel.

Les horaires sont stockés en UTC. L’affichage utilise le fuseau local du
navigateur. Un verrou transactionnel PostgreSQL (`pg_advisory_xact_lock`) empêche
deux créneaux ouverts (`SCHEDULED` / `CONFIRMED`) de se chevaucher dans la même
entreprise. Deux rendez-vous qui se touchent (fin = début) restent possibles.
Annuler un rendez-vous libère le créneau.

Lier une fiche client ou prospect journalise un événement `MEETING` sur
l’historique. La fiche affiche aussi ses rendez-vous.

Hors première version : disponibilités publiques, récurrence, rappels, couleurs,
pièces jointes et synchronisation Google Calendar / Outlook.

## Mobile

`GET /api/v1/mobile/appointments` liste les rendez-vous à venir.
`POST /api/v1/mobile/appointments` crée un créneau (mêmes règles d’overlap).
Le tableau de bord expose `appointments.upcoming`.

## Vérifications

Tests backend : création, chevauchement refusé, créneaux adjacents, libération
après annulation, liaison fiche + historique, isolation inter-entreprises,
refus du comptable en écriture.

Tests navigateur : création, message de chevauchement, créneau adjacent,
refus d’accès particulier.
