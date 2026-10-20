# ReLaunch — version Electron + TypeScript (migration de WeCraft en cours)

Ce dossier contient la future version du launcher, nommée **ReLaunch** (décision D3). La version Python
(`../wecraft_launcher.py`) reste la version distribuée tant que la migration n'est pas terminée et validée.

Références : `docs/AUDIT_MIGRATION_ELECTRON.md` (audit, plan des lots E0 à E9, décisions) et
`docs/SUIVI_MISE_A_JOUR.md` (avancement).

## Interface (20/10/2026) : base du prototype ReLaunch × WeCraft

L'interface reprend le prototype HTML « Prototype ReLaunch × WeCraft » (`src/renderer/prototype.css`,
`prototype.js`, `index.html`). Elle est maintenant modifiée directement (plus de script d'import) ; un
portage en React est décidé (D4) et sera la prochaine étape.

Modifications, marquées `[WeCraft]` ou `[ReLaunch]` dans le code :
- polices locales (pas de Google Fonts ; Inter remplace Manrope) ;
- outils de la page de démonstration retirés (annotations, vues premium / staff) ;
- **aucune donnée fictive** : instances, serveurs, amis, lives, actualités, captures, compte… sont vides et
  chaque page affiche « Pas encore disponible » ; les vraies données arriveront lot par lot (E2 instances,
  E4 lancement, E7 modpacks…) ;
- bouton Jouer et actions non branchées : un message, jamais de progression simulée ni de faux succès (§10.4) ;
- thème : les 4 thèmes de base sont lus et enregistrés dans `launcher_config.json` (lot E1) ;
- Réglages > Navigation : taille des barres latérales (5 tailles, de 60 à 116 px) ;
- la fenêtre Electron remplace le cadre de fenêtre dessiné par la page.

Les réglages d'interface (barres, taille, style) restent dans le stockage local d'Electron.

## Réglages (lot E1)

`launcher_config.json` est lu et écrit avec les mêmes garde-fous que la version Python
(`src/main/storage/jsonStore.ts`) : copie des fichiers invalides, jamais d'écriture dans un fichier
illisible, écriture atomique, seule la clé modifiée change, reprise des anciens dossiers.

## Essai en bac à sable (Windows)

`tools\essai_bac_a_sable.bat` lance ReLaunch installé avec un dossier de réglages séparé, à côté du script
(`bac_a_sable\AppData\Roaming\.wecraft`). Vos vrais réglages ne sont pas touchés. Options : `/copier`
(copie vos vrais réglages dans le bac à sable) et `/casse` (fichier abîmé pour vérifier la mise de côté).

## Commandes

```
npm install          # dépendances de développement (aucune dépendance d'exécution)
npm run typecheck    # TypeScript strict, processus principal et interface
npm test             # compilation + tests (node:test)
npm start            # lance l'application en développement
npm run dist:win     # installeur Windows release/ReLaunch-Setup.exe (aucune publication)
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
- Content Security Policy stricte (en-tête + balise) : pas d'eval, pas de script ni de balise `<style>` en
  ligne, aucune connexion réseau depuis l'interface (et toute requête qui n'est pas `app://` est bloquée).
  Seule exception : les attributs `style="…"`, utilisés par l'interface pour ses couleurs.
- Navigation, redirections, fenêtres secondaires et `<webview>` refusées ; permissions du navigateur
  (caméra, micro, notifications…) refusées.
- Messages IPC acceptés seulement depuis la fenêtre principale affichant `app://wecraft` ; arguments
  validés ; liens externes par identifiant, jamais par adresse.
- Un seul ReLaunch à la fois. Outils de développement désactivés dans l'exe distribué.
- Fuses Electron : `RunAsNode`, `NODE_OPTIONS` et `--inspect` désactivés, intégrité de l'archive
  `app.asar` vérifiée, chargement uniquement depuis l'archive.

## Installation (décision du 20/10/2026)

Installeur complet (`ReLaunch-Setup.exe`, NSIS via electron-builder) : installation pour l'utilisateur seul,
sans droits administrateur, dans `%LOCALAPPDATA%\Programs\ReLaunch`, raccourcis Bureau et menu Démarrer.
`build/installer.nsh` : si la même version (ou une plus récente) est déjà installée, l'installeur lance
simplement l'appli. Ainsi, pendant la transition, l'ancien `WeCraft.exe` remplacé par l'installeur via la
mise à jour Python continue de fonctionner. `/reinstall` force la réinstallation. La désinstallation retire
l'appli et les raccourcis, jamais les réglages.

## Données

Les réglages restent dans `%APPDATA%\.wecraft`, partagés avec la version Python (même calcul de chemin,
testé). Electron range ses propres fichiers techniques (cache Chromium) à part, dans
`%APPDATA%\ReLaunch` : ce dossier ne contient aucun réglage.
