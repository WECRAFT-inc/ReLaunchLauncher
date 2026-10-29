# Compte hors-ligne (offline)

Porté du launcher **Cubic** (UUID `OfflinePlayer:<pseudo>`, jeton factice, services Mojang coupés), puis relié au **Worker ReLink**.

## Règles
1. **Réservé aux events.** Un compte hors-ligne actif ne peut lancer **aucune instance normale** (`offline-event-only`) :
   seulement un event dont le staff a autorisé les comptes hors-ligne (`offline-not-allowed` sinon).
2. **Réglé dans le panel admin, par event** : `allowOffline` (booléen) et `offlineHost` (adresse du serveur, `domaine[:port]`).
   Si `allowOffline` est vrai, `offlineHost` est **obligatoire** (le Worker refuse l'enregistrement sinon). Incompatible avec `requireMicrosoft`.
3. **Connexion automatique.** Au lancement, le joueur est connecté tout de suite à `offlineHost` (Quick Play `--quickPlayMultiplayer` dès la 1.20,
   `--server/--port` avant). Aucun écran de choix ni bouton d'annulation dans ReLaunch.
4. **Compte ReLink requis** pour choisir/changer/oublier le pseudo et pour lancer un event en hors-ligne.

## Pseudo (géré par le Worker, `GET|PUT|DELETE /launcher/me/offline`)
- 3 à 16 caractères : lettres, chiffres, `_`.
- Refusé s'il appartient à un compte Minecraft officiel (API Mojang appelée par le Worker) ; impossible de vérifier = refusé.
- Unique entre comptes ReLink (sans tenir compte de la casse).
- Premier pseudo libre ; ensuite **90 jours** sans changement, « Oublier » compris. Horloge du Worker.
- Support : `DELETE /admin/launcher/offline/:discordId` libère le pseudo et remet le délai à zéro (journalisé).
- Table D1 `launcher_offline_names`, créée automatiquement.

## Côté launcher
- Réglages > Compte ReLink > « Type de compte Minecraft » : Microsoft / Hors-ligne.
- Copie locale (pseudo + date) dans `launcher_config.json` (`relaunch_offline_name`, `relaunch_offline_active`, `relaunch_offline_changed_at`) pour jouer sans connexion ; le Worker reste la référence.
- Code : `src/main/auth/offline.ts`, `src/main/relink/account.ts` (`offline()`), `src/main/main.ts` (handlers + règle de lancement),
  `src/main/launch/launch.ts`, `src/renderer/ui/Settings.tsx`, `tests/offline.test.ts`.

## Limites
- Le launcher ne peut pas empêcher un joueur de quitter le serveur une fois en jeu. Pour réellement restreindre les comptes hors-ligne,
  le serveur d'event doit les contrôler (whitelist, ou plugin interrogeant ReLink).
- La restriction « events uniquement » est appliquée par le launcher ; un launcher modifié pourrait la contourner.
