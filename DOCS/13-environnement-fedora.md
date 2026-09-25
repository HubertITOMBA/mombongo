# Environnement Fedora 43

## Inventaire du 25 septembre 2026

Présents : Git, Node.js 22.15.0 via nvm, npm 11.18.0, Docker Desktop et Compose,
PostgreSQL 17.11, Java JDK 21, ADB, Android SDK avec plateforme 36 et build-tools
35.0.0 / 36.0.0. ANDROID_HOME pointe vers `/home/hubert/Android/Sdk`.

Les dépendances web sont installées localement au projet avec un lockfile npm.
Next.js, Prisma, Zod, Tailwind et Expo doivent être gérés par projet, pas par
une installation globale. Expo et Metro seront ajoutés avec le projet mobile.

## Installation système (historique du socle)

PostgreSQL 18 a ensuite été installé. Pour réinstaller les outils sur un autre poste,
l’installation par sudo nécessite le mot de passe administrateur dans un terminal
interactif. Depuis la racine du projet :

```bash
bash scripts/install-fedora.sh
```

Le script installe GCC, G++ et PostgreSQL 18 depuis les dépôts configurés.
Il conserve PostgreSQL 17 et ne modifie pas ses données ni ses services.
Sur un autre poste, PostgreSQL 18 doit être initialisé et configuré sur un port libre avant usage.
La configuration Docker Compose fournie est une autre option pour PostgreSQL 18 ;
vérifier que le port 5432 est libre avant de la démarrer.

## Android

Java 21 et le SDK 36 sont disponibles. L’émulateur Android a été installé dans le SDK existant. Le choix de la version Expo déterminera
les versions finales de Java, Gradle, NDK et SDK nécessaires. Un émulateur doit
être associé à une image système et à un appareil virtuel avant utilisation ;
un téléphone Android physique peut également servir pour les tests.

Référence : https://docs.expo.dev/workflow/android-studio-emulator/
PostgreSQL : https://www.postgresql.org/download/linux/redhat/

## État après le lot identité

PostgreSQL 18 installé et cluster propre à Facturia dans `.local/postgres`, sur
127.0.0.1:5433. PostgreSQL 17 continue sur 5432. Démarrage : `npm run db:local`.
La migration initiale et la génération Prisma sont appliquées.

Le build de production Webpack passe. Le premier blocage Turbopack était lié
à l’environnement d’exécution ; le serveur de développement est fonctionnel sur 9070.
Les tests de types, d’authentification PostgreSQL et du parcours navigateur passent.

L’audit npm signale encore quatre entrées de sévérité élevée dans les dépendances
de l’outillage Prisma. Leur résolution doit être validée avant production ;
ne pas appliquer de rétrogradation majeure automatique avec `npm audit fix --force`.
