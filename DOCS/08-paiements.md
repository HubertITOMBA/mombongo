# Abonnements et paiements

État : spécification, aucun SDK installé et aucun encaissement possible.

Abonnement mensuel et paiement au service. Définir offres, quotas, essai éventuel, devise, prix, TVA, résiliation, impayés et remboursement avant mise en ligne. Ne pas inventer de prix dans l’interface.

Interface serveur commune pour Stripe, PayPal puis d’autres prestataires : création de checkout, état de paiement, remboursement, gestion des abonnements et normalisation des événements. Identifier les capacités propres à chaque fournisseur.

Le retour du navigateur ne prouve jamais le paiement. Seuls les événements vérifiés côté serveur mettent à jour les droits. Vérifier signatures et destinataire, stocker un identifiant d’événement unique par fournisseur, traiter les événements dans des transactions, prévoir doublons, ordre inversé et réconciliation. Tarifs et produits sont déterminés côté serveur.

Un registre de consommation idempotent permettra la tarification au service. Aucun numéro de carte stocké dans Facturia. Séparer paiements d’abonnements et futurs paiements de factures clients.

Validation : sandbox des deux fournisseurs, doublons de webhook, interruption de checkout, impayé, remboursement et absence de double attribution de droits.

## Particuliers

Le périmètre inclut désormais le futur règlement de factures reçues par les
particuliers, séparé des abonnements SaaS. Définir les créanciers pris en charge
et les factures éligibles avant le checkout. Le compte particulier est disponible,
mais le paiement n’est pas encore activé. Voir [le périmètre](14-particuliers-entreprises.md).
