# API et mobile

## Disponible
`GET /api/v1/health` renvoie le nom du service, `status: ok` et `apiVersion: v1`. Endpoint public de disponibilité du processus, sans contrôle PostgreSQL.

Le parcours web d’identité expose également `/api/v1/auth/register`, `/login` et
`/resend`. Ces routes exigent l’origine web configurée et utilisent un cookie de
challenge ; elles ne constituent pas encore un flux d’authentification mobile.

## API cible
Routes versionnées, entrées validées par Zod, contrat d’erreur stable avec code, message et identifiant de requête. Pagination et limites explicites. Documentation OpenAPI à ajouter en même temps que les endpoints métier. Contrôle de session, entreprise et permissions à chaque requête ; CORS ne remplace pas une authentification.

## Mobile
Expo, React Native et Metro. Android / Google Play en premier, iOS / App Store ensuite. Seuls les contrats et utilitaires purs sont partagés ; les composants DOM et Prisma restent dans le web.

Le dossier mobile est réservé, aucune application native n’est générée pour l’instant. Créer le projet Expo lors du lot mobile avec les versions compatibles recommandées par Expo.

Prévoir un échange d’authentification dédié avec jetons courts, rafraîchissement tournant révocable et stockage dans SecureStore. Aucun token dans AsyncStorage. Les liens de retour d’authentification doivent être vérifiés. Le choix final doit être compatible avec le parcours NextAuth et la validation en deux étapes.

Vérifier les règles de paiement Google Play et App Store applicables au service avant d’intégrer un checkout dans le mobile. Ne pas supposer que Stripe/PayPal sont autorisés pour tous les achats natifs.

Validation : installation Android réelle, réseau interrompu, reprise de session, notifications, liens profonds et changements de fuseau horaire. Publication et comptes développeur à préparer séparément.
