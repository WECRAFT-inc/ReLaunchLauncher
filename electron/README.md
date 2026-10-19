# WeCraft — version Electron + TypeScript (migration en cours)

Ce dossier contient la future version de WeCraft. La version Python (`../wecraft_launcher.py`) reste la
version distribuée tant que la migration n'est pas terminée et validée.

Références : `docs/AUDIT_MIGRATION_ELECTRON.md` (audit, plan des lots E0 à E9, décisions) et
`docs/SUIVI_MISE_A_JOUR.md` (avancement).

## Lot E0 : ce que fait cette version

- Ouvre la fenêtre WeCraft (accueil, instances, modpacks, paramètres) dans le style de la maquette
  ReLaunch × WeCraft.
- Affiche des informations **réelles** : version, chemin des réglages WeCraft et leur présence, thème
  enregistré par la version Python.
- **N'écrit rien** dans les données de l'utilisateur et ne lance rien. Le bouton « Jouer » est désactivé
  et l'interface dit pourquoi.

## Commandes

```
npm install          # dépendances de développement (aucune dépendance d'exécution)
npm run typecheck    # TypeScript strict, processus principal et interface
npm test             # compilation + tests (node:test)
npm start            # lance l'application en développement
npm run dist:win     # exe portable Windows dans release/ (aucune publication)
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/main/` | Processus principal : seul à accéder au disque, au réseau et aux processus. |
| `src/preload/` | Pont minimal : expose `window.wecraft` (actions métier uniquement). |
| `src/renderer/` | Interface (HTML, CSS, TypeScript), sans accès Node. |
| `src/shared/` | Contrat d'API et noms des canaux IPC. |
| `tests/` | Tests sans Electron (chemins, sécurité, réglages, canaux). |

## Sécurité (§4.4 du prompt maître)

- `contextIsolation`, `sandbox` (pour tous les processus de rendu), `nodeIntegration` désactivé.
- Interface servie par un protocole privé `app://wecraft` (pas `file://`) ; chaque fichier demandé est
  vérifié pour rester dans le dossier de l'interface ; types de fichiers limités.
- Content Security Policy stricte (en-tête + balise) : pas d'eval, pas de script en ligne, aucune
  connexion réseau depuis l'interface (et toute requête qui n'est pas `app://` est bloquée).
- Navigation, redirections, fenêtres secondaires et `<webview>` refusées ; permissions du navigateur
  (caméra, micro, notifications…) refusées.
- Messages IPC acceptés seulement depuis la fenêtre principale affichant `app://wecraft` ; arguments
  validés ; liens externes par identifiant, jamais par adresse.
- Un seul WeCraft à la fois. Outils de développement désactivés dans l'exe distribué.
- Fuses Electron : `RunAsNode`, `NODE_OPTIONS` et `--inspect` désactivés, intégrité de l'archive
  `app.asar` vérifiée, chargement uniquement depuis l'archive.

## Données

Les réglages restent dans `%APPDATA%\.wecraft`, partagés avec la version Python (même calcul de chemin,
testé). Electron range ses propres fichiers techniques (cache Chromium) à part, dans
`%APPDATA%\WeCraft` : ce dossier ne contient aucun réglage WeCraft.
