# Notifications et messagerie

État : toasts Sonner, codes d’authentification, invitations, réinitialisation
de mot de passe, et **envoi manuel A16** des devis / factures / avoirs émis.
Adaptateur unique Resend + boîte locale de développement. Notifications
persistantes, relances automatiques et Gmail OAuth restent à développer.

Les toasts informent d’une action à l’écran. Le centre de notifications conservera les événements destinés à un utilisateur avec lecture, catégorie et préférences. Les notifications mobiles seront ajoutées avec Expo.

Resend : e-mails transactionnels d’identité **et** PDF de documents A16.
`From` = `EMAIL_FROM`. `Reply-To` documentaire = snapshot émetteur.
`SENT` signifie que Resend (ou la boîte locale) a accepté la demande, pas
que le message est délivré. Les webhooks Resend complets sont hors A16.
Détail : [E-mails de documents](21-emails-documents.md).

Gmail : connexion OAuth consentie pour une messagerie liée à l’utilisateur ;
aucun mot de passe Gmail stocké. Les périmètres OAuth, quotas et éventuelles validations Google seront vérifiés lors de l’intégration. Les jetons de rafraîchissement doivent être chiffrés et révocables.

Adaptateurs de messagerie distincts, modèles français, file d’envoi persistante, retries et protection contre doublons. Ne jamais inscrire les codes de connexion ou tokens dans les logs. Configurer le domaine d’envoi et traiter rebonds et préférences.

Validation : destinataires, entreprise, expiration des codes pendant une reprise, désabonnement des messages facultatifs et révocation OAuth.
