# Application mobile Mombongo

Expo SDK 57, React Native, Android en premier. L’app parle à l’API
`/api/v1/mobile/*` du serveur web. Les jetons sont stockés dans **SecureStore**,
jamais dans AsyncStorage.

## Démarrage

Le serveur web doit tourner sur le port 9070.

```bash
npm install
npm run db:local
npm run dev
npm run dev:mobile
```

L’app utilise automatiquement l’IP du PC vue par Expo Go (celle du QR code)
et le port 9070. Le serveur web écoute sur toutes les interfaces
(`0.0.0.0:9070`). Téléphone et PC doivent être sur le même Wi-Fi ; le pare-feu
doit autoriser le port 9070. Pour forcer l’API en local :
`EXPO_PUBLIC_API_URL=http://<ip-du-pc>:9070`. Pour une build de production :
`EXPO_PUBLIC_API_URL=https://mombongo.fr`.

Le parcours est le même que sur le web : email / mot de passe, puis code à six
chiffres. En local, `npm run mail:local` affiche le code.

## Livré

Connexion, inscription, rafraîchissement tournant, déconnexion et tableau de
bord (compteurs clients/prospects réels ; CA, factures et rendez-vous à zéro
tant que ces modules n’existent pas).
