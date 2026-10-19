# WeCraft — Audit de migration vers Electron + TypeScript

**Date :** 19/10/2026 · **Statut :** lecture et analyse uniquement — **aucune modification du code, aucun commit.**
**Base examinée :** `main` @ `9f22320` (lots 1 et 1b fusionnés, release de test `v1.2.7-rc2`), branche `ui/relaunch-style` (PR #10, non fusionnée), documents du projet (`AUDIT_WECRAFT_2026-10-19.md`, `SUIVI_MISE_A_JOUR.md`, `Projet ReLaunch × WeCraft.html`), prompt maître.
**Couvre les étapes 1 à 4 du prompt maître (§20)** : audit de l'existant, inventaire, audit du mécanisme de mise à jour sous l'angle de la migration, proposition d'architecture. Les constats de sécurité S1–S14 de l'audit initial ne sont pas répétés : ils restent la référence.

---

## 0. Ce qui a changé depuis l'audit initial

- L'audit initial concluait qu'aucun problème concret ne justifiait de quitter Python/Tkinter. Le prompt maître rend désormais la migration **obligatoire** : cette décision appartient au développeur et n'est pas remise en cause ici. Elle a en revanche un coût précis, détaillé en §2 et §4.
- Les corrections des lots 1/1b (profils, configurations, signature Ed25519, retour arrière, CI) sont **le comportement de référence à reproduire**. Elles sont couvertes par 51 tests Python (58 sur la branche UI), qui servent de spécification pour les tests TypeScript.
- La branche `ui/relaunch-style` (Tkinter, Liquid Glass) n'est pas fusionnée. Toute nouvelle heure passée sur l'interface Tkinter sera perdue : voir décision D2.
- Le dossier local `C:\Users\lesci\OneDrive\Documents\Wecraft-test-new` est **vide** (vérifié). Son rôle reste à préciser (D7).

---

## 1. Inventaire fonctionnel et correspondance avec l'architecture cible

`wecraft_launcher.py` : ~4 760 lignes, 92 fonctions de premier niveau, classe `Launcher` (~180 méthodes, interface et orchestration mêlées). Colonne « Processus » : **M** = processus principal Electron (Node, accès système), **R** = rendu (interface, aucun accès système).

| Domaine | Fonctions Python actuelles | Composant cible | Proc. | Risque migration |
|---|---|---|---|---|
| Chemins et migration de dossiers | `sibling_dir`, `migrate_old_settings`, `MC_DIR`, `_BUGGY_DIRS` | `main/paths.ts` | M | **Élevé** : Electron range ses données dans `%APPDATA%\<nom de l'app>` par défaut ; il faut viser explicitement `%APPDATA%\.wecraft` sinon tous les réglages « disparaissent ». |
| Lecture/écriture sûre des réglages | `atomic_write_text`, `_replace_with_retry`, `quarantine`, `read_json_file`, `SettingsUnreadable` | `main/storage/jsonStore.ts` | M | Moyen : reproduire à l'identique (copie `.invalide-<date>`, jamais réécrire un fichier illisible, 10 essais anti-antivirus). |
| Détection d'instances | `detect_instances`, `read_local_instance`, `read_curseforge`, `read_prism`, `read_modrinth_db`, `scan_instances`, cache par mtime | `main/instances/*` (un lecteur par source) | M | Moyen : `app.db` Modrinth lu en SQLite **lecture seule** → besoin d'un moteur SQLite côté Node (§2). |
| Métadonnées d'instances | `load_meta`, `update_meta`, `forget_meta`, `apply_meta`, `parse_ram` | `main/instances/meta.ts` | M | Faible : même fichier `instances_meta.json`, même format. |
| Suppression d'instance | `safe_to_delete`, `is_inside`, `instance_roots`, `remove_tree` | `main/instances/delete.ts` | M | **Élevé (données)** : garde-fou S9 à reproduire mot pour mot ; confirmation obligatoire côté interface, vérification **refaite** côté M (ne jamais faire confiance au chemin envoyé par R). |
| Profils du launcher officiel | `set_profile`, `backup_profiles_file`, `profile_name_for`, `managed_profiles.json`, retrait des jetons des sauvegardes | `main/official/profiles.ts` | M | **Critique** : donnée d'un tiers. Double validation (§15). Tests de non-régression Python à porter un par un. |
| Launcher officiel | `close_official_launcher`, `open_official_launcher`, `_win_running` | `main/official/process.ts` | M | Moyen : `taskkill`/`tasklist` via `child_process.execFile` (jamais `exec` avec une chaîne). |
| Installation versions / loaders / Java | `minecraft-launcher-lib` : `install_minecraft_version`, `get_mod_loader`, `install_jvm_runtime`, `get_installed_versions`, `get_version_list` ; `ensure_loader`, `installed_loader_ids`, `install_java` | `main/minecraft/installer.ts` | **Critique** : aucune équivalence directe (§2). C'est le poste le plus risqué de la migration. |
| Lancement | `play_worker`, `start_official`, `ask_from_worker` | `main/launch/orchestrator.ts` + événements IPC | M | Moyen : machine à états explicite (préparation → fermeture launcher → installation → profil → ouverture). Empêche les lancements multiples (§11.3). |
| Mises à jour | `fetch_latest_release`, `download_update`, `verify_update_signature`, `check_update_signature`, `apply_update`, `update_startup_check`, `mark_update_healthy`, `restore_previous_version`, `cleanup_update_leftovers` | `main/update/*` | M | **Critique** : voir §4 (transition Python → Electron). |
| Modrinth (recherche, modpacks) | `modrinth_get`, `modrinth_search`, `resolve_modpack`, `build_modpack`, `apply_modpack_edit`, `download_mod_file`, `safe_mod_filename`, `pack_graph`, `pack_rows` | `main/modrinth/*` | M | Moyen : SHA-512 obligatoire et CDN unique à conserver. |
| Lecture des mods `.jar` | `read_mod_jar`, `list_pack_mods`, `count_mod_files` | `main/mods/jar.ts` | M | Faible : bibliothèque zip en lecture (§2). |
| Détection du jeu en cours | `minecraft_running`, `_PS_COUNT_MINECRAFT` | `main/game/running.ts` | M | Faible : garder le script PowerShell qui ne renvoie qu'un nombre (S7 : le jeton ne doit pas entrer dans WeCraft). |
| Discord | `DiscordPresence`, consentement par version | `main/discord.ts` (facultatif) | M | Faible : opt-in conservé. |
| Interface | `SplashScreen`, `GradientButton`, `TileGrid`, `build_ui`, onglets Mes instances / WePack / Modpacks (+ Favoris sur la branche UI), vues tuiles/tableau/liste, pagination, filtres, dialogues | `renderer/*` | R | Moyen : réécriture complète, mais c'est l'objet de la refonte. |
| Polices, icône, AppUserModelID | `load_local_fonts` (`gdi32`), `SetCurrentProcessExplicitAppUserModelID` | CSS `@font-face` / `app.setAppUserModelId` | M/R | Faible. |
| Installation de Pillow à la volée | `install_pillow` (`pip install` depuis l'appli) | **Supprimé** | — | Gain de sécurité : plus aucune installation de paquet à l'exécution. |

**Fonctionnalités à préserver (§9 du prompt maître) — état vérifié dans le code :** détection d'instances (4 sources), reconnaissance version/loader (Forge, NeoForge, Fabric, Quilt), métadonnées, profils officiels, mémoire, ouverture du launcher officiel, mise à jour signée avec retour arrière, modpacks Modrinth. **Vérifié à l'exécution sous Windows** (suivi du 19/10) : tests automatiques, LANCER en bac à sable, exe signé. **Non vérifié** : vraie mise à jour 1.2.7 → 1.2.8, fenêtre de retour arrière en conditions réelles.

---

## 2. Dépendances : équivalents Node.js

| Besoin | Python aujourd'hui | Option Node / Electron | Évaluation |
|---|---|---|---|
| Installer Minecraft, loaders, Java | `minecraft-launcher-lib` (non audité, S11) | **`@xmcl/installer`** (+ `@xmcl/core`), utilisé par X Minecraft Launcher ; prend en charge Forge, NeoForge, Fabric, Quilt et les runtimes Java Mojang | Candidat principal. **À auditer avant adoption** : vérification des empreintes des bibliothèques Mojang, exécution des installeurs Forge/NeoForge, version et maintenance au moment de l'implémentation. Alternative : `minecraft-launcher-core` (moins complet pour les loaders). |
| Lire `app.db` Modrinth | `sqlite3` (standard) | `node:sqlite` (intégré à Node 22+/24) ou `better-sqlite3` (module natif) | Préférer `node:sqlite` si la version de Node embarquée par l'Electron retenu l'expose sans option expérimentale ; sinon module natif (recompilation pour Electron). |
| Signature Ed25519 | `cryptography` | `crypto.verify(null, …)` intégré à Node | Aucune dépendance. La clé publique actuelle (32 octets bruts en base64) doit être enveloppée en SPKI DER (préfixe fixe `302a300506032b6570032100`) : **même clé, même format de message signé** (`WeCraft-update-v1\n<version>\n<sha256>\n`). |
| Lire les `.jar` | `zipfile` | `yauzl` (lecture seule, mature) | Faible risque. |
| HTTP | `urllib` | `fetch` / `net` d'Electron | Aucune dépendance ; TLS par défaut. |
| Discord | `pypresence` | `@xhayper/discord-rpc` ou équivalent | Facultatif ; à évaluer (maintenance). |
| Compilation / distribution | PyInstaller | **electron-builder** ou Electron Forge | Voir §4 : le choix dépend de la stratégie de transition (exe unique « portable » ou installeur). |

Toutes les versions (Electron, Node embarqué, bibliothèques) doivent être **vérifiées au moment de l'implémentation** (§4.1). Electron suit un cycle rapide : seules les 3 dernières versions majeures reçoivent les correctifs de sécurité, d'où une mise à jour d'Electron à prévoir régulièrement (Dependabot).

---

## 3. Données utilisateur : contrat de compatibilité

La nouvelle application doit lire et écrire **exactement** les mêmes fichiers, au même endroit, au même format, pour qu'un joueur passe de la version Python à la version Electron sans rien perdre et puisse revenir en arrière.

| Fichier | Emplacement | Exigence |
|---|---|---|
| `launcher_config.json` | `%APPDATA%\.wecraft` | Même schéma ; clés inconnues conservées telles quelles. |
| `instances_meta.json` | idem | Même schéma (clé = chemin du dossier, cf. `meta_key`). |
| `managed_profiles.json` | idem | Même schéma : sinon WeCraft recréerait un nouveau profil officiel au lieu de réutiliser le sien. |
| `backups\launcher_profiles\` | idem | Même rotation (15). |
| `update_pending.json`, `update_skip.json`, `update.log` | idem | Voir §4. |
| `instances\` | idem | Inchangé. |
| `.minecraft\launcher_profiles*.json` | dossier officiel | Même logique d'écriture (sauvegarde, atomique, relecture, BOM accepté). |

**Règle de migration :** aucune réécriture « de nettoyage » au premier démarrage d'Electron. Une conversion de format éventuelle se fera plus tard, avec sauvegarde et retour arrière (§7).

---

## 4. Mécanisme de mise à jour : le point critique de la migration

### 4.1 Constat

Tous les joueurs en v1.2.7+ ont un updater Python qui :
1. lit `…/WeCraft-Releases/releases/latest` ;
2. prend **le premier fichier dont le nom finit par `.exe`** ;
3. vérifie le SHA-256 puis la **signature Ed25519** (obligatoire) ;
4. renomme `WeCraft.exe` en `WeCraft.exe.old`, met le nouvel exe à sa place, écrit `update_pending.json` (`exe`, `old`, `from`, `to`, `starts`) et le relance ;
5. c'est **la nouvelle version** qui valide la mise à jour (`mark_update_healthy`) ou propose le retour arrière au 2ᵉ démarrage raté.

Conséquence : la première version Electron sera installée **par l'updater Python** et devra elle-même assumer l'étape 5. Si elle ignore `update_pending.json`, aucun retour arrière ne sera jamais proposé et `WeCraft.exe.old` restera indéfiniment.

### 4.2 Pourquoi ne pas utiliser `electron-updater` tel quel

Sous Windows, `electron-updater` s'appuie sur une empreinte publiée **dans la même release** et, pour l'authenticité, sur la signature Authenticode de l'éditeur. Sans certificat Authenticode, on perdrait la protection Ed25519 obtenue au lot 1 (régression de S1). **Recommandation :** conserver le mécanisme maison (déjà audité, testé, double-validé) et le porter en TypeScript dans le processus principal, ou n'utiliser `electron-updater` que si un certificat Authenticode est acquis **et** que la vérification Ed25519 est ajoutée en plus.

### 4.3 Deux stratégies de transition

| | **A. Exe unique « portable »** | **B. Installeur (NSIS par utilisateur)** |
|---|---|---|
| Principe | La 1ʳᵉ version Electron est publiée comme un seul `WeCraft.exe` signé Ed25519 ; l'updater Python l'installe comme n'importe quelle mise à jour. | Une dernière version Python « passerelle » télécharge, vérifie puis lance l'installeur Electron. |
| Changement côté Python | **Aucun** | Nouvelle version Python à publier d'abord, nouveau code d'exécution d'installeur (zone critique, double validation). |
| Retour arrière | Natif : `WeCraft.exe.old` reste la version Python fonctionnelle. | À construire (désinstallation, ancien exe à conserver). |
| Inconvénients | Exe lourd (~100 Mo+) qui se décompresse dans `%TEMP%` à chaque démarrage (lenteur, antivirus) ; `process.execPath` désigne la copie temporaire : il faut utiliser le chemin d'origine (`PORTABLE_EXECUTABLE_FILE` avec electron-builder) pour `update_pending.json` et le remplacement. | Plus de travail initial ; dépend que tous les joueurs passent d'abord par la passerelle. |
| Suite | Possible de basculer plus tard vers un installeur, une fois le parc migré. | Mises à jour Electron classiques ensuite. |

> **Mise à jour du 20/10/2026 — décision D1 révisée : installeur complet (B), livré par le même chemin que A.** L'essai de l'exe portable sur le PC du développeur a mesuré ~15 s de démarrage, dues à la décompression à chaque lancement (le même programme décompressé dans un dossier démarre rapidement). L'updater Python installe désormais **l'installeur** (`WeCraft-Setup.exe`, signé Ed25519) à la place de `WeCraft.exe` ; celui-ci installe l'appli par utilisateur et, si elle est déjà installée, la lance simplement : aucun changement côté Python n'est nécessaire. Le retour arrière immédiat vers `WeCraft.exe.old` (version Python) reste possible. Vérifié en CI : installation, raccourcis, relance sans réinstallation, désinstallation sans toucher aux réglages.

**Recommandation initiale (19/10) : A pour la transition**, éventuellement suivie d'un passage à B. C'est la seule option qui ne touche pas au code d'exécution de fichiers déjà en production et qui garde un retour arrière immédiat vers la version Python. **À valider sur un vrai poste Windows avant toute publication** : démarrage de l'exe portable sous Smart App Control / Defender, durée de démarrage, comportement du renommage pendant l'exécution.

### 4.4 Exigences pour la version Electron (quelle que soit la stratégie)

- Lire et écrire `update_pending.json` / `update_skip.json` avec la même sémantique (comptage des démarrages, double-clic < 30 s, retour arrière proposé au 2ᵉ échec, version abandonnée non reproposée).
- Même clé publique, même format de message signé, signature obligatoire : un exe non signé ou mal signé est refusé avant tout remplacement.
- Ne valider la mise à jour qu'après affichage réel de la fenêtre principale (événement `ready-to-show` + premier rendu confirmé par le rendu).
- La CI doit produire **un seul** `.exe` dans la release (l'updater prend le premier), plus `.sha256` et `.sig`.
- Test de bout en bout obligatoire avant publication : Python v1.2.7 → Electron (succès), Python → Electron défaillant (retour arrière vers Python), Electron → Electron.

---

## 5. Architecture cible proposée

```
wecraft/
├─ src/
│  ├─ main/            # Node : seul processus qui touche au disque, au réseau et aux processus
│  │  ├─ paths.ts, storage/, instances/, official/, minecraft/, launch/, update/, modrinth/, mods/, discord.ts
│  │  ├─ ipc/          # un fichier par domaine ; chaque handler valide ses arguments (schéma) avant d'agir
│  │  └─ security.ts   # CSP, blocage navigation / nouvelles fenêtres, permissions refusées
│  ├─ preload/         # contextBridge : expose window.wecraft.{instances,launch,settings,update,modpacks}
│  ├─ renderer/        # interface (HTML/CSS/TS), aucun accès Node
│  └─ shared/          # types et schémas partagés (contrats IPC)
├─ tests/              # unitaires (Vitest) + bout en bout (Playwright pour Electron)
└─ legacy/             # (rien) : le code Python reste dans l'historique Git et sur une branche dédiée
```

**Sécurité Electron (§4.4), dès le premier commit :** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload minimal ; aucune API générique (« lire un fichier », « exécuter une commande ») exposée au rendu, uniquement des actions métier (`instances.list()`, `launch.start(id)`, `instances.delete(id)`…) ; les identifiants d'instance sont résolus côté M, jamais un chemin fourni par R ; `will-navigate` et `setWindowOpenHandler` bloquent tout sauf l'ouverture explicite de liens externes approuvés via `shell.openExternal` (liste blanche : modrinth.com, github.com) ; CSP stricte sans `unsafe-eval` ; fuses Electron (désactivation de `RunAsNode`, `EnableNodeCliInspectArguments`, vérification d'intégrité de l'archive asar).

**Interface :** TypeScript + HTML/CSS sans framework au départ ; React seulement si la complexité des vues (tuiles/tableau/liste, filtres, pagination, éditeur de modpack) le justifie après le premier écran (décision D4). Direction artistique : thème sombre noir/anthracite, accent orange, barre latérale, carte « Jouer » mise en avant, thèmes Phénix/ReLink/Aurore/Glace déjà définis dans la maquette ReLaunch × WeCraft. **La capture de référence visuelle citée au §10.1 du prompt maître n'est pas dans le projet** ; la maquette ReLaunch × WeCraft et la référence NationsGlory qu'elle contient sont utilisées à défaut.

**Tests :** les 51 tests Python actuels sont convertis en cas de test TypeScript **avant** de porter chaque domaine (ils deviennent la spécification). Tests de compatibilité croisée : fichiers écrits par Python lus par Electron et inversement.

---

## 6. Points de vigilance hors code

1. **Proposition ReLaunch (fusion, comptes ReLink, connexion Microsoft dans le launcher, changement de skin via l'API Mojang)** : elle contredit le §6 du prompt maître (le launcher officiel reste seul responsable de la connexion Microsoft ; aucun système parallèle d'identifiants). Elle relève du §3.2 (« modification sensible du modèle d'authentification ») et d'une migration majeure supplémentaire : **hors périmètre tant que le développeur ne l'autorise pas explicitement**. La remarque de la maquette sur l'accès sans licence vérifiée et le CLUF Minecraft est un vrai point bloquant juridique à trancher avant tout développement de cette zone. La migration proposée ici ne ferme aucune porte : l'architecture M/R permet d'ajouter un module d'authentification plus tard.
2. **`minecraft-launcher-lib` → `@xmcl/installer`** : on remplace une bibliothèque non auditée par une autre non auditée. Leur audit (S11) devient un prérequis du lot de lancement.
3. **Taille et démarrage** : un exe Electron est ~10× plus gros que l'exe PyInstaller actuel ; à annoncer aux joueurs.
4. **Signature Authenticode** : non obligatoire pour la migration, mais c'est le seul moyen d'améliorer SmartScreen ; décision de coût (D5).

---

## 7. Découpage proposé en lots (pour la coordination multi-IA, §12–13)

| ID | Objectif | Dépend de | Risque | Validation |
|---|---|---|---|---|
| E0 | Squelette Electron + TS strict, sécurité Electron, CI de build Windows (sans publication) | — | Moyen | Revue + test de démarrage Windows |
| E1 | Chemins, stockage JSON sûr, lecture/écriture des réglages existants | E0 | Élevé (données) | Double validation, tests croisés Python ↔ Electron |
| E2 | Détection d'instances (4 sources) + métadonnées | E1 | Moyen | Mêmes résultats que Python sur un jeu d'instances de test |
| E3 | Audit `@xmcl/installer` puis installation versions/loaders/Java | E0 | Critique | Audit écrit + double validation + bac à sable Windows |
| E4 | Profils officiels + fermeture/ouverture du launcher officiel + orchestration du lancement | E1, E3 | Critique | Double validation, LANCER en bac à sable, tests portés |
| E5 | Mise à jour (port TS, compatibilité `update_pending.json`, stratégie A ou B) | E0, E1 | Critique | Double validation + 3 scénarios de bout en bout (§4.4) |
| E6 | Interface : accueil, instances, paramètres (puis modpacks Modrinth) | E2 | Moyen | Revue UX, tailles de fenêtre, accessibilité |
| E7 | Modpacks Modrinth (recherche, création, édition) | E2, E6 | Moyen | Tests portés |
| E8 | Suppression d'instance | E2 | Élevé (données) | Double validation |
| E9 | Discord (opt-in), finitions, documentation, retrait des dépendances Python | tous | Faible | Revue |

E0, E1 et l'audit de E3 peuvent avancer en parallèle. Rien n'est publié avant E5 validé et l'autorisation explicite du développeur.

---

## 8. Décisions nécessaires du développeur

| ID | Décision | Recommandation |
|---|---|---|
| D1 | Stratégie de transition des mises à jour (A exe portable / B installeur) | ~~A~~ → **Décidé : installeur complet** (20/10/2026, voir §4.3) |
| D2 | Branche `ui/relaunch-style` : fusionner telle quelle (les joueurs en profitent pendant la migration) ou geler l'interface Tkinter | Fusionner après l'essai Windows prévu, puis geler Tkinter |
| D3 | Nom et identité : WeCraft ou ReLaunch pour l'appli Electron ? (impacte `appId`, dossier de données, nom de l'exe — l'updater cherche « un » .exe, donc renommer est possible mais le chemin `%APPDATA%\.wecraft` doit rester) | Garder WeCraft tant que la fusion ReLaunch n'est pas décidée |
| D4 | Framework d'interface : TS natif ou React | TS natif au départ |
| D5 | Certificat Authenticode | Optionnel, à budgéter |
| D6 | Périmètre ReLaunch (comptes, auth Microsoft, skins) | Hors périmètre de cette migration |
| D7 | Rôle du dossier `Wecraft-test-new` | **Décidé : bac à sable de test** (19/10/2026) |
| D8 | Référence visuelle (§10.1) | **Décidé : maquette ReLaunch × WeCraft + capture de l'accueil** (19/10/2026) |

---

## 9. Compte rendu (§19)

1. **Changements :** aucun dans le code ni le dépôt.
2. **Fichiers créés :** ce document (projet Claude).
3. **Décisions techniques proposées :** porter le mécanisme de mise à jour existant plutôt qu'adopter `electron-updater` ; transition par exe portable signé ; mêmes fichiers de données au même endroit ; tests Python convertis en spécification.
4. **Tests réellement exécutés :** aucun nouveau test. Vérifications faites : lecture du code sur `main` @ `9f22320`, comparaison avec la branche UI, contenu du dossier local (vide).
5. **Risques :** traités — aucun ; identifiés — transition des mises à jour (§4), remplacement de `minecraft-launcher-lib` (§2), perte du dossier de données (§1), conflit ReLaunch / §6 (§6).
6. **Conséquences fonctionnelles :** aucune pour l'instant.
7. **Régressions :** aucune (rien modifié).
8. **Autorisations nécessaires :** D1 à D8 ; démarrage de E0.
9. **Statut :** analyse réalisée ; **non testée et non validée** ; à relire par le développeur.
