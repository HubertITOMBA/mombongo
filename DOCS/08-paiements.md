# Abonnements et paiements

État : le modèle métier d’encaissement **des factures clients** (A10) est
livré. L’abonnement Mombongo, Stripe et PayPal ne le sont pas.

Les `Payment` d’une facture émise par l’adhérent à son client sont distincts
d’un futur `Subscription` / billing Mombongo. Ne jamais mélanger les deux.
Détail métier : [Facturation](04-facturation.md). `remainingTtcCents` sur
l’API mobile est le reste **après avoirs et paiements** ; `netTtcCents` est
le net après avoirs seulement.

Abonnement mensuel et paiement au service. Définir offres, quotas, essai éventuel, devise, prix, TVA, résiliation, impayés et remboursement avant mise en ligne. Ne pas inventer de prix dans l’interface.

Interface serveur commune pour Stripe, PayPal puis d’autres prestataires : création de checkout, état de paiement, remboursement, gestion des abonnements et normalisation des événements. Identifier les capacités propres à chaque fournisseur.

Le retour du navigateur ne prouve jamais le paiement. Seuls les événements vérifiés côté serveur mettent à jour les droits. Vérifier signatures et destinataire, stocker un identifiant d’événement unique par fournisseur, traiter les événements dans des transactions, prévoir doublons, ordre inversé et réconciliation. Tarifs et produits sont déterminés côté serveur.

Un registre de consommation idempotent permettra la tarification au service. Aucun numéro de carte stocké dans Mombongo. Le schéma A10 prévoit `provider` / `providerPaymentId` (unicité organisation) pour une future idempotence webhook sur les **factures clients** ; aucun SDK, aucun webhook, aucun PaymentIntent n’est branché. Ce `Payment.provider` (`MANUAL` / `STRIPE` / `PAYPAL`) n’est **pas** une plateforme agréée et n’est **pas** le connecteur technique. A14.1 prépare `PaymentConnection` et `PaymentGateway` (501) sans enregistrer Stripe/PayPal. `Payment.method` (virement, carte, …) reste distinct du PSP. A14 prépare une transmission `PAYMENT_REPORTING` distincte, sans envoi réel. Voir [Plateforme agréée](19-plateforme-agreee.md) et [Intégrations](20-integrations.md).

Validation : sandbox des deux fournisseurs, doublons de webhook, interruption de checkout, impayé, remboursement et absence de double attribution de droits.

## Particuliers

Le périmètre inclut désormais le futur règlement de factures reçues par les
particuliers, séparé des abonnements SaaS **et** des encaissements A10 d’un
adhérent envers ses clients. Définir les créanciers pris en charge
et les factures éligibles avant le checkout. Le compte particulier est disponible,
mais le paiement n’est pas encore activé. Voir [le périmètre](14-particuliers-entreprises.md).
