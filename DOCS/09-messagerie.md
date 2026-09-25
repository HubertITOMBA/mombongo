# Notifications et messagerie

État : toasts Sonner et envoi de codes implémentés. Adaptateur Resend et boîte
locale de développement disponibles ; Resend doit encore être configuré et testé
avec une clé API et un expéditeur autorisé. Notifications persistantes à développer.

Les toasts informent d’une action à l’écran. Le centre de notifications conservera les événements destinés à un utilisateur avec lecture, catégorie et préférences. Les notifications mobiles seront ajoutées avec Expo.

Resend : emails transactionnels (vérification, codes, invitations, rappels). Gmail : connexion OAuth consentie pour une messagerie liée à l’utilisateur ; aucun mot de passe Gmail stocké. Les périmètres OAuth, quotas et éventuelles validations Google seront vérifiés lors de l’intégration. Les jetons de rafraîchissement doivent être chiffrés et révocables.

Adaptateurs de messagerie distincts, modèles français, file d’envoi persistante, retries et protection contre doublons. Ne jamais inscrire les codes de connexion ou tokens dans les logs. Configurer le domaine d’envoi et traiter rebonds et préférences.

Validation : destinataires, entreprise, expiration des codes pendant une reprise, désabonnement des messages facultatifs et révocation OAuth.
