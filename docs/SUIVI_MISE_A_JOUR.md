# Suivi de la mise à jour générale de WeCraft

Référence : audit du 19/10/2026 (`claude/AUDIT_WECRAFT_2026-10-19.md` dans le projet Claude).
Branche : `audit/securite-donnees` (non fusionnée, rien publié).

## Ce qui a été fait (lot 1)

| Constat | Correction | Fichiers |
|---|---|---|
| S3 profils du launcher officiel | Sauvegarde horodatée avant chaque écriture (15 gardées, `%APPDATA%\.wecraft\backups\launcher_profiles`), écriture atomique + relecture, profil retrouvé par identifiant mémorisé (`managed_profiles.json`), profils de l'utilisateur jamais repris, BOM accepté, fichier illisible jamais réécrit. | `wecraft_launcher.py` (`set_profile`, `backup_profiles_file`) |
| S4 fermeture forcée | Fermeture normale d'abord ; arrêt forcé seulement si l'utilisateur répond Oui ; sinon le lancement est annulé **sans rien écrire**. | `close_official_launcher`, `play_worker`, `ask_from_worker` |
| S5 réglages écrasés | Fichier illisible copié en `<nom>.invalide-<date>` (une seule copie), avertissement au démarrage, écritures atomiques, valeurs abîmées ignorées une par une. | `read_json_file`, `quarantine`, `atomic_write_text`, `load_meta`, `apply_meta`, `load_config` |
| S1 authenticité des mises à jour | Signature Ed25519 de « version + SHA-256 ». **Inactive tant que `UPDATE_PUBLIC_KEY` est vide.** Ensuite : signature invalide = refus ; signature absente = acceptée tant que `UPDATE_SIGNATURE_REQUIRED = False`. | `verify_update_signature`, `check_update_signature`, `tools/sign_release.py` |
| S6 retour arrière | `.old` gardé jusqu'à un démarrage réussi (`update_pending.json`) ; sinon, au démarrage suivant, proposition de revenir à l'ancienne version (la défaillante est gardée en `.echec`). | `apply_update`, `update_startup_check`, `mark_update_healthy`, `restore_previous_version` |
| S2 chaîne de publication | Tests bloquants avant compilation ; nom du tag vérifié et passé par variable d'environnement ; permissions minimales ; signature si secret présent ; **release publique en brouillon** ; Dependabot. | `.github/workflows/release.yml`, `requirements-build.txt`, `.github/dependabot.yml` |
| S7 vie privée | Discord désactivé par défaut ; question à chaque premier démarrage d'une nouvelle version (Non par défaut) ; PowerShell ne renvoie plus qu'un nombre (le jeton de session n'entre plus dans WeCraft). | `ask_discord_consent`, `minecraft_running` |
| S8 chemin | Seul le dernier dossier est renommé ; reprise par copie des réglages d'un ancien chemin. | `sibling_dir`, `migrate_old_settings` |
| S9 suppression | Uniquement des sous-dossiers des dossiers d'instances connus ; chemin Modrinth hors `profiles/` ignoré. | `safe_to_delete`, `is_inside`, `instance_roots` |
| S10 mods | Nom `.jar` simple sans caractère interdit, SHA-512 obligatoire. | `safe_mod_filename`, `resolve_modpack` |
| S12 hors ligne | Loader choisi pour la version exacte. | `installed_loader_ids` |
| Divers | Pré-versions comparées correctement, `update.log` limité, `build.bat` aligné, `SECURITY.md` à jour, `release.yml` racine marqué obsolète. | |

## Tests

`python -m unittest discover -s tests -v` : 51 tests, bac à sable temporaire, `minecraft_launcher_lib`
toujours remplacé par un substitut (aucun vrai `.minecraft` n'est touché).
Contrôle : les mêmes tests lancés sur le code d'origine échouent sur les comportements corrigés et
passent sur les comportements à préserver.

**Windows (PC du développeur, Windows 11 build 26200, Python 3.14.8, 19/10/2026) :**
- `tools/test_windows.bat` : 40/40 tests réussis (avant la revue ; à refaire avec les 50 tests) (dont signature, `cryptography` 50.0.2), code retour 0.
- `tools/essai_interface_windows.bat` (bac à sable, APPDATA/USERPROFILE redirigés) : l'interface démarre
  et se ferme sans erreur (code retour 0) ; `instances_meta.json` volontairement cassé mis de côté en
  `.invalide-<date>` sans être écrasé ; question Discord posée, réponse Non enregistrée
  (`discord: false`, `discord_asked_version: 1.2.0`) ; aucun fichier de profils modifié (LANCER non cliqué).
- Incident de test : au premier essai, la redirection de LOCALAPPDATA a fait installer par le gestionnaire
  Python de Windows un Python 3.15 dans `bac_a_sable` (aucun effet hors du dossier de test). Script corrigé.

**Non testé à ce stade :** bouton LANCER (fermeture du launcher officiel, écriture du profil en conditions réelles), exe PyInstaller,
fenêtres de retour arrière et de mise à jour, installation réelle de versions/loaders, relance après mise à jour.

## Restant à faire / à décider

1. **Tests sous Windows** : tests automatiques et démarrage de l'interface faits ; restent LANCER (bac à sable) et l'exe compilé.
2. **Revue indépendante** des changements sensibles (profils, mise à jour, exécution) par une autre IA (§13).
3. **Clé de signature** : générée par le développeur sur son PC le 19/10/2026 ; clé publique intégrée
   (`UPDATE_PUBLIC_KEY = "pELCCH6C...hx5Q="`). Reste : clé privée en secret GitHub `UPDATE_SIGNING_KEY`,
   puis `UPDATE_SIGNATURE_REQUIRED = True` dans la version qui suivra la première version signée.
4. **Épinglage** des actions GitHub (SHA) et des dépendances (`pip-compile --generate-hashes`) depuis un
   poste connecté.
5. **`RELEASES_TOKEN`** : vérifier qu'il s'agit d'un jeton fine-grained limité à `WeCraft-Releases`.
6. Audit de `minecraft-launcher-lib` (S11) ; découpage progressif du monofichier.

## Revue indépendante (19/10/2026) et corrections (lot 1b)

Revue faite par une autre IA, en lecture seule, sans contexte de l'écriture. Verdict : « fusionnable
après corrections ». Constats et suite donnée :

| Constat | Gravité | Suite |
|---|---|---|
| B1 fichier de réglages non UTF-8 -> plantage au démarrage (régression) | bloquant | Corrigé : lecture en octets, décodage dans le bloc qui met de côté. Test qui plantait sur l'ancien code. |
| B2 l'ancien processus validait la mise à jour en se fermant : retour arrière jamais proposé | bloquant | Corrigé : drapeau `_UPDATE_HANDED_OFF` + suivi limité à la version cible (`to == APP_VERSION`). Vérifié sur l'ancien et le nouveau code. |
| I1 transition sans signature = protection contournable | important | Corrigé : `UPDATE_SIGNATURE_REQUIRED = True` dès cette version ; la CI échoue sans clé. |
| I2 clé privée visible de toutes les étapes de la CI | important | Corrigé : secret donné à la seule étape « Signature » ; `persist-credentials: false`. |
| I3 aucune vérification clé privée / clé publique | important | Corrigé : étape « Vérification de la signature » avec la clé lue dans le code. |
| I4 `cryptography` absent de l'exe = faux message de falsification | important | Corrigé : message distinct, `--hidden-import`, auto-test `WeCraft.exe --self-test-signature` en CI. |
| I5 `os.replace` bloqué par un antivirus | important | Corrigé : 10 essais espacés de 100 ms ; `save_config` n'empêche plus de lancer en cas d'échec. |
| I6 fichier verrouillé réécrit avec des réglages vides | important | Corrigé : `SettingsUnreadable`, aucune écriture tant que le fichier ne peut pas être lu. |
| M1 `update_pending.json` mal formé -> plantage | mineur | Corrigé (types validés, contrôle dans un try). |
| M2 retour arrière limité ; double-clic ; `.echec` jamais nettoyés ; version défaillante reproposée | mineur | Corrigé en partie : double-clic < 30 s compté une fois, `.echec` nettoyés après validation, version abandonnée plus reproposée automatiquement. Reste : un exe qui ne démarre pas du tout n'est pas détecté. |
| M3 reprise d'un ancien profil nommé « WECRAFT - … » / « Mon lanceur » par l'utilisateur | mineur | Non corrigé (comportement d'origine, cas limite à la première utilisation). |
| M4 fichiers mis de côté après le démarrage non signalés | mineur | Corrigé (vérifié toutes les 3 s). |
| M5 sauvegardes contenant d'anciens jetons de connexion | mineur | Corrigé : jetons retirés des copies horodatées. |
| M7 instance hors des dossiers connus non supprimable | mineur | Voulu ; à documenter pour les utilisateurs. |
| M9 fermeture normale du launcher officiel peut-être inefficace | mineur | À vérifier sous Windows (bouton LANCER en bac à sable). |
| M11 tests faibles / manquants | mineur | Ajoutés : B1, B2, I4, I5, I6, M1, M5, double-clic. Reste : le script PowerShell n'est testé que sur son texte. |

Seconde validation (§13) : le contrôle des corrections par la coordinatrice reste à faire par le développeur
ou par une nouvelle revue.

## Essais Windows après corrections (19/10/2026, 06:02 - 06:17)

- `tools/test_windows.bat` : 50/50 tests réussis (après correction d'un test qui lisait un fichier sans
  préciser l'encodage : défaut du test, pas de WeCraft).
- Bouton LANCER en bac à sable (« Pack de test », Fabric, 1.20.1), launcher officiel ouvert au départ :
  - launcher officiel fermé sans demander de fermeture forcée (rapporté par le développeur) ;
  - Minecraft 1.20.1, `fabric-loader-0.19.5-1.20.1` et Java installés dans le bac à sable ;
  - `launcher_profiles.json` : profil « WECRAFT - Pack de test » créé (bon `gameDir`, bonne version,
    `-Xmx4G`) puis réutilisé (même identifiant) sur 3 lancements ; « WeCraft Survie (perso) » intact ;
  - `managed_profiles.json` mémorise l'identifiant ; 3 sauvegardes horodatées présentes, `.bak_wecraft` conservé ;
  - vérification faite par lecture des fichiers du bac à sable.
- Défaut trouvé : un fichier resté invalide était recopié à chaque démarrage (3 copies). Corrigé :
  pas de nouvelle copie si une copie identique existe (test ajouté, 51 tests).

Reste non vérifié : exe compilé par la CI, première release signée, fenêtres de mise à jour et de
retour arrière en conditions réelles.

## Première release de test signée (19/10/2026, 15:30 - 15:43)

- PR #5 (lot 1 + 1b) et PR #6 (CI : release déjà créée depuis l'interface GitHub) fusionnées dans `main`.
- `v1.2.7-rc1` : compilation, auto-test, signature et vérification réussies ; échec à l'étape « Release dans le
  dépôt privé » (release déjà créée depuis l'interface) -> corrigé par la PR #6. Release privée vide, sans effet.
- `v1.2.7-rc2` : workflow complet réussi ; brouillon dans `WeCraft-Releases` (pré-version, jamais proposée par la
  mise à jour automatique, qui ne lit que `/releases/latest`).
- Vérifié sur l'exe téléchargé : SHA-256 `6f607fe3…5d79d55` identique à l'empreinte GitHub ; signature valide pour
  1.2.7-rc2 avec `UPDATE_PUBLIC_KEY`, refusée pour toute autre version.
- `tools/essai_exe_windows.bat` (bac à sable) : `WeCraft.exe --self-test-signature` = 0, ouverture et fermeture
  de l'exe = 0, aucune erreur de mise à jour dans `update.log`.

## Reste à faire

1. Sortir la v1.2.7 (tag `v1.2.7`, puis publier le brouillon public après essai) : les joueurs en v1.2.6 la
   recevront ; seules les mises à jour suivantes seront vérifiées par signature.
2. Tester une vraie mise à jour 1.2.7 -> 1.2.8 (téléchargement, signature, remplacement, retour arrière) dès la
   prochaine version.
3. Épingler les actions GitHub (SHA) et les dépendances (`--require-hashes`).
4. Cas limites restants : M3 (nom de profil identique à ceux de WeCraft), exe qui ne démarre pas du tout,
   `minecraft-launcher-lib` non audité (S11), découpage progressif du monofichier.

## Migration Electron + TypeScript

Référence : `docs/AUDIT_MIGRATION_ELECTRON.md` (audit du 19/10/2026, lots E0 à E9).

**Décisions du développeur** : D1 transition des mises à jour par exe portable (19/10/2026), **révisée le
20/10/2026 : installeur complet** (voir ci-dessous) ; D7 `C:\Users\lesci\OneDrive\Documents\Wecraft-test-new` = **bac à sable de test** ;
D8 référence visuelle = maquette ReLaunch × WeCraft + capture de l'écran d'accueil (barre latérale, grand
titre, bouton Jouer, deux cartes).

### Lot E0 : squelette Electron sécurisé (branche `electron/e0-squelette`)

- Projet `electron/` : TypeScript strict, processus principal / preload / interface séparés, aucune
  dépendance d'exécution (dépendances de développement : electron 44.7.2, electron-builder, typescript,
  @types/node).
- Sécurité : contextIsolation, sandbox global, nodeIntegration désactivé, protocole privé `app://wecraft`
  avec contrôle des chemins, CSP stricte, navigation/fenêtres/webview/permissions refusées, IPC limité à la
  fenêtre principale, liens externes par identifiant, instance unique, fuses Electron.
- Interface : accueil d'après la maquette, pages Instances / Modpacks / Paramètres (thèmes Phénix, ReLink,
  Aurore, Glace), aucune information fictive (« Jouer » désactivé avec explication).
- Données : **lecture seule** ; chemin `%APPDATA%\.wecraft` calculé comme en Python (testé) ; thème repris
  de `launcher_config.json` ; aucun fichier écrit.
- CI `.github/workflows/electron.yml` (Windows) : typecheck, tests, exe portable, démarrage de 15 s avec
  APPDATA isolé, exe joint au run. **Aucune publication, aucun secret.**

Vérifié (Linux, 19/10/2026) : 20/20 tests (`node:test`) ; parité des chemins avec la règle Python ;
interface rendue dans Chromium (1180x760, 900x600, thèmes) sans erreur de console.
Non vérifié localement (registre npm inaccessible depuis l'environnement de développement) : typecheck des
fichiers qui importent `electron`, compilation de l'exe, démarrage réel d'Electron -> confiés à la CI.

CI Windows (run 39309109584, 19/10/2026, `windows-latest`) : **toutes les étapes réussies** — installation,
typecheck strict (y compris les fichiers qui importent `electron`), tests, compilation de l'exe portable
(~3 min 20 s), démarrage de 15 s avec APPDATA isolé (l'application tournait toujours). Artefact
`wecraft-electron-e0` (~100 Mo compressés, exe + `.sha256` + `package-lock.json`), conservé jusqu'au 02/11/2026.
Journal détaillé et artefact non relus par l'IA (stockage GitHub Actions inaccessible depuis son environnement).

Essai de l'exe portable sur le PC du développeur (19-20/10/2026) : avertissement SmartScreen
(exe sans signature Authenticode, attendu) ; réglages trouvés et thème correct ; **~15 s de démarrage**.
Comparaison : le même programme décompressé dans un dossier démarre rapidement -> la décompression à
chaque lancement est en cause.

**Installeur complet (20/10/2026)** : `WeCraft-Setup.exe` (NSIS, electron-builder), installation par
utilisateur sans droits administrateur dans `%LOCALAPPDATA%\Programs\WeCraft`, raccourcis Bureau et menu
Démarrer ; `build/installer.nsh` lance l'appli déjà installée (même version ou plus récente) au lieu de
réinstaller ; désinstallation sans toucher aux réglages. CI Windows (run 39337155061) : **réussie** —
installation silencieuse, raccourcis présents, appli installée démarrée, installeur relancé = appli lancée
sans réinstallation, désinstallation complète, `launcher_config.json` témoin intact.

Essai de l'installeur par le développeur (20/10/2026, bac à sable) : **tout fonctionne**. Défaut signalé :
infobulles de la barre latérale masquées par les panneaux de la page -> corrigé (barre latérale au premier
plan), vérifié après réinstallation (`/reinstall`).

`package-lock.json` produit par la CI, relu puis versionné (20/10/2026) : 285 paquets, tous de
développement (aucun embarqué dans l'appli), tous depuis registry.npmjs.org avec empreinte d'intégrité ;
electron 44.7.2, electron-builder 26.15.3, typescript 6.0.3, @types/node 24.19.2. Seul script
d'installation : `electron-winstaller` (dépendance d'electron-builder). La CI utilise désormais `npm ci`.

**Statut E0 : réalisé, testé (CI + PC du développeur) ; à fusionner après relecture de la PR.**
Points ouverts hors E0 : actions GitHub à passer en version Node 24 et à épingler par SHA (avertissement
de dépréciation de Node 20 sur `checkout@v4` / `setup-node@v4`) ; signature Authenticode (D5).

### Lot E1 : réglages (branche `electron/e1-reglages`, à partir d'E0 ; version 0.2.0)

- `storage/jsonStore.ts` : port de `read_json_file`, `quarantine` et `atomic_write_text` (constats S5, B1,
  I5, I6) — fichier invalide copié en `<nom>.invalide-<date>` (une copie par contenu, copies Python
  reconnues, date d'origine conservée), signalé, jamais supprimé ; fichier illisible jamais réécrit ;
  écriture temporaire + remplacement atomique, 10 essais espacés de 100 ms (antivirus).
- Différence volontaire avec Python : une modification relit le fichier juste avant d'écrire et ne change
  que la clé concernée (les autres réglages, même inconnus, sont conservés) ; écritures d'un même fichier
  faites l'une après l'autre.
- `storage/migrate.ts` : reprise par copie depuis les anciens dossiers (`mon_launcher`, ancien calcul S8),
  jamais d'écrasement.
- Thème enregistré dans `launcher_config.json` (clé `theme`, comme la branche UI Python) ; messages clairs
  si le fichier est verrouillé ; avertissement à l'écran des fichiers mis de côté et des réglages repris.
- `tools/essai_bac_a_sable.bat` : essais Windows avec `APPDATA` redirigé (options `/copier`, `/casse`) ;
  refuse de démarrer si WeCraft Electron est déjà ouvert (il utiliserait les vrais réglages). Déposé dans
  le bac à sable du développeur.

Vérifié (20/10/2026) : 43 tests (`node:test`) dont 3 de compatibilité croisée exécutant le vrai code
Python (lecture mutuelle, copies reconnues dans les deux sens ; obligatoires en CI) ; interface rendue
dans Chromium (avertissement, enregistrement réussi / fichier verrouillé). CI Windows (runs 39354026985,
39354436843) : **réussie**, y compris le scénario de bout en bout « réglages abîmés » sur l'appli
installée (copie créée, original intact, vrais réglages non touchés).

Risque : **élevé (données utilisateur)** -> double validation requise (§15) : revue indépendante par
une autre IA + validation coordinatrice, puis essai en bac à sable par le développeur.
Limite connue : si les versions Python et Electron sont ouvertes en même temps, la version Python peut
réécrire le thème avec la valeur qu'elle avait en mémoire (elle ne relit pas avant d'écrire).

### Interface : copie du prototype « Prototype ReLaunch × WeCraft » (branche `electron/interface-prototype`, version 0.3.0)

Demande du développeur (20/10/2026) : reprendre l'interface du prototype HTML (artifact Claude) en
copié-collé. Fait par `electron/scripts/import-prototype.py` (CSS et script repris tels quels, ~235 Ko).
Modifications limitées, marquées `[WeCraft]` : polices locales, outils de la page de démonstration retirés
(annotations, vues premium/staff), **lancement simulé remplacé par un message** (§10.4), thème relié à
`launcher_config.json` (E1), marque permanente « Aperçu · contenus fictifs ». CSP : seule ouverture,
les attributs `style="…"` (`style-src-attr 'unsafe-inline'`), scripts toujours limités aux fichiers de l'appli.

Vérifié : 43 tests ; rendu dans Chromium avec la même CSP (accueil, WeCraft, Réglages, 900x600) sans
aucune erreur de console ; thème enregistré repris au démarrage, thème choisi envoyé à l'enregistrement ;
bouton Jouer = message, aucune barre de progression.

À trancher : le prototype est aux couleurs **ReLaunch** (titre, comptes ReLink, amis, lives, shop, staff) ;
ces zones restent des maquettes tant que D3 (nom) et D6 (comptes, connexion Microsoft, hors §6 du prompt
maître) ne sont pas décidés.

### Interface vidée et nom ReLaunch (même branche, version 0.4.0)

Décisions du développeur (20/10/2026) : **D3 = ReLaunch**, **D4 = React**, retirer toutes les données
fictives, ajouter le réglage de taille des barres latérales.

- Nom : appli, fenêtre, exe, raccourcis et installeur `ReLaunch` (`ReLaunch-Setup.exe`,
  `%LOCALAPPDATA%\Programs\ReLaunch`, appId `fr.relaunch.launcher`). Les réglages restent dans
  `%APPDATA%\.wecraft` (inchangé). Comme l'appId change, une ancienne installation d'essai « WeCraft »
  ne sera pas remplacée : la désinstaller à la main.
- Données fictives retirées : instances, serveurs, téléchargements, amis, demandes, lives, actualités,
  captures, signalements, notifications, compte, épingles, compte à rebours. Chaque page affiche
  « Pas encore disponible » ; l'accueil indique qu'aucune instance n'est détectée ; les actions non
  branchées affichent un message au lieu d'un faux succès (§10.4). La marque « Aperçu » n'a plus lieu d'être.
- Réglages > Navigation : « Taille des barres » (Très fine 60 px → Très grande 116 px), enregistrée avec
  les autres réglages de navigation ; les anciennes épingles sont nettoyées.
- `scripts/import-prototype.py` supprimé : l'interface est maintenant modifiée directement.

Vérifié localement : 43 tests ; toutes les pages rendues dans Chromium avec la CSP sans erreur de console ;
plus aucun texte fictif ; tailles xs et xl appliquées.

Suite : portage de l'interface en React (D4), puis lot E2 (détection des instances).

### Lot E1 : revue indépendante et corrections (20/10/2026)

Revue par un agent séparé (n'ayant pas écrit le code). Verdict : validable après corrections. Corrigé sur
`electron/e1-reglages` (puis fusionné dans la branche interface) :
- **C1 (critique)** : un fichier abîmé dont la copie de côté échouait était quand même remplacé au premier
  changement de thème (perte des autres réglages + faux « enregistré »). Désormais : jamais remplacé sans copie
  vérifiée (refus « not-backed-up »), copie retentée.
- **I1** : remplacement d'un fichier abîmé signalé dans le bandeau, avec le nom de la copie.
- **M2** : la copie contient exactement les octets jugés invalides ; si la version Python écrit pendant une
  mise à jour, celle-ci recommence sur le nouveau contenu (3 fois, puis abandon sans écrire).
- **M3 / M4** : date non reprise ≠ copie ratée ; fichier anormalement gros jamais chargé ni réécrit.
- 7 tests ajoutés (50). Restent notés : **I2** (la version Python réécrit tout son fichier : ne pas faire tourner
  les deux versions en même temps), M1 (nombres `NaN` / très grands), M5 (liens symboliques), M7 (`.tmp`
  orphelins).

### Lot E3 : installation des versions, loaders et Java (branche `electron/e3-installation`)

Audit écrit : `docs/AUDIT_E3_INSTALLATEUR.md`. `@xmcl/installer` (MIT, un seul mainteneur actif) a quatre
défauts critiques pour nous : empreintes jamais vérifiées après téléchargement, vérification du manifeste Java
retirée en février 2026, Forge en HTTP, installeur NeoForge sans empreinte (alors qu'il est exécuté).
Recommandation (**D9, à décider**) : l'utiliser encadré par nos propres garde-fous.

Étape 1 faite (utile quelle que soit la décision, sans dépendance) :
- `src/main/net/download.ts` : HTTPS seulement vers une liste fermée de serveurs officiels, redirections
  revérifiées, tailles limitées, téléchargement en fichier temporaire **vérifié avant installation**.
- `src/main/install/javaRuntime.ts` : Java de Mojang, même emplacement que la version Python, chaîne
  d'empreintes vérifiée (liste → manifeste → chaque fichier), chemins du manifeste confinés au dossier Java.
- 19 tests avec un réseau simulé (69 au total) : falsifications, redirections, chemins piégés, reprise.

Rien n'est encore branché à l'interface ; aucun téléchargement réel n'a été fait ici (réseau du poste de travail
limité). Suite : ajout de xmcl selon D9, Vanilla avec vérification finale, loaders, essai en bac à sable.

**Étape 2 (D9 = A, 20/10/2026 soir)** :
- `package-lock.json` produit sur le PC du développeur (le registre npm n'est pas joignable depuis le poste de
  Claude) : `@xmcl/installer` 6.3.6 + `undici` 7.30.1, 34 paquets, 0 faille connue, aucune version existante
  changée ; `@xmcl/unzip` 2.2.0 mal publié, corrigé par `overrides`.
- Relecture de la 6.3.6 : la plupart des défauts critiques sont corrigés en amont (audit E3, §7).
- `src/main/install/xmcl.ts` : xmcl planifie, ReLaunch télécharge (HTTPS, serveurs officiels, SHA-1 obligatoire,
  `.sha1` Maven sinon refus, aucune confiance sur la taille ou la date).
- `src/main/install/vanilla.ts` : installation d'une version de base (liste Mojang → fichier de version vérifié →
  jeu, bibliothèques, index, ressources vérifiés).
- 13 tests de plus ; le test d'intégration avec la vraie bibliothèque tourne sur la CI Windows.

Toujours pas branché à l'interface. Suite : Fabric / Quilt, puis Forge / NeoForge, puis essai en bac à sable.

**Étape 2, suite (21/10/2026)** : deux autres paquets `@xmcl` sont mal publiés (X12 : `@xmcl/unzip` pointe vers
un `index.ts` absent ; X13 : `@xmcl/installer` importe `@xmcl/core/utils`, absent du paquet publié). Corrigés à
chaque compilation par `scripts/fix-dependencies.mjs` (arrêt en erreur si une version change). Le test
d'intégration avec la vraie bibliothèque ne peut plus être ignoré sur la CI ; **CI Windows verte avec ce test**
(installation d'une version simulée, seconde passe sans téléchargement, fichier abîmé réparé, contenu piégé
refusé).

**Étapes 3 et 4 (21/10/2026)** :
- `src/main/install/loaders.ts` : Fabric et Quilt depuis leurs serveurs officiels (profil vérifié dans sa forme ;
  empreintes du profil utilisées, sinon `.sha1` Maven) ; identifiants officiels `fabric-loader-x-mc` /
  `quilt-loader-x-mc` ; choix hors ligne `installed_loader_ids` porté et comparé à la version Python.
- `src/main/install/forge.ts` : Forge et NeoForge (Minecraft 1.13 et plus) avec l'installeur officiel ; chaque
  commande Java des « processeurs » est contrôlée avant exécution (seulement notre Java, classpath dans
  `libraries`, aucune option d'agent, dossier de travail dans `.minecraft`), sans shell, 15 min maximum.
  Forge avant 1.13 : non pris en charge pour l'instant (message clair).
- **Essai réel sur la CI Windows** (`scripts/e2e-install.mjs`, job `installation-reelle`) : Fabric, Quilt,
  Forge 1.20.1, NeoForge 1.21.1 et une seconde passe Forge, téléchargés depuis les vrais serveurs : vert.

Restent pour E3 : essai dans le dossier bac à sable du développeur, revue indépendante (lot critique).

### Lot E2 : détection des instances (branche `electron/e2-instances`, à partir d'E3)

Port de `launcher_dirs`, `detect_instances`, `scan_instances`, `read_local_instance`, `apply_meta`
(`src/main/instances/`). Lecture seule des dossiers d'instances ; base Modrinth `app.db` ouverte en lecture
seule (`node:sqlite`), un profil dont le chemin sort de `profiles/` est ignoré (comme en Python).
- Sources : dossier `instances` de WeCraft (cache par date de modification), CurseForge (2 emplacements),
  Modrinth, Prism ; formats `wecraft.json` (prioritaire), `mmc-pack.json`, `minecraftinstance.json`,
  `manifest.json`, `modrinth.index.json`.
- Réglages par instance lus dans `instances_meta.json` (même clé que Python) ; seul le **favori** peut être
  modifié depuis ReLaunch (seule la clé `fav` change, écriture sûre E1). Les instances masquées sont comptées.
- L'interface ne reçoit aucun chemin (identifiants opaques) ; valeurs lues dans les fichiers toujours échappées.
- Interface : liste réelle dans l'accueil et la page WeCraft (Jouer = lot E4 ; suppression = lot E8, bouton retiré).

**Validation (critère du plan)** : test qui construit un jeu d'instances (4 sources, fichiers abîmés, base
Modrinth avec chemin piégé, réglages abîmés) et compare la liste de ReLaunch à celle de la **vraie version
Python** : identiques. 7 tests de plus (88). Rendu vérifié dans Chromium avec la CSP (noms piégés affichés
comme texte, aucune erreur).


### Lot E4 : lancement (branche `electron/e4-lancement`, à partir d'E2)

Port de `set_profile`, `backup_profiles_file`, `close_official_launcher`, `open_official_launcher`,
`play_worker` et `ensure_loader` (`src/main/launch/`). Le launcher officiel reste seul à gérer le compte
Microsoft et à démarrer le jeu (§6) : ReLaunch ne lit ni ne copie aucun jeton.
- Ordre identique à Python : fermeture du launcher officiel (normale ; arrêt forcé **seulement si l'utilisateur
  le choisit**, sinon annulation sans rien modifier) → installation de ce qui manque (« Réparer » : tout
  réinstaller ; hors ligne, loader déjà installé pour exactement cette version) → profil « WECRAFT - <instance> »
  → ouverture du launcher officiel.
- Profil : sauvegarde horodatée avant chaque écriture (15 gardées, sans jetons ; `.bak_wecraft` conservée),
  écriture atomique, relecture de contrôle, profil retrouvé par son identifiant mémorisé
  (`managed_profiles.json`), profils de l'utilisateur jamais modifiés, fichier illisible jamais réécrit.
  Arguments Java changés seulement s'ils sont vides ou de la forme `-XmxNG`.
- Commandes Windows par chemin absolu (`System32`), sans shell ni fenêtre.
- Interface : bouton Jouer → choix de la RAM (1 à 16 Go, valeur de l'instance sinon celle de
  `launcher_config.json`, mémorisée comme en Python) et case « Réparer » ; suivi de l'état **réel** (la barre
  n'avance que sur des fichiers réellement téléchargés) ; question « forcer la fermeture ? » posée dans l'encart.
- L'interface envoie seulement l'identifiant opaque de l'instance ; dossier, version et loader sont relus côté
  processus principal.

**Validation** : le profil écrit par ReLaunch est **identique à celui de la vraie version Python** sur 3 jeux de
fichiers (anciens profils WeCraft, profil de l'utilisateur à ne pas toucher, jetons, BOM, deux fichiers, fichier
du Store sans `profiles`, arguments Java en liste) et sur 4 fichiers illisibles (même refus, rien d'écrit).
Seule différence connue : une clé purement numérique et courte est remise en tête de son objet (contenu
identique). 20 tests de plus (118 en local). Rendu vérifié dans Chromium avec la CSP (RAM, question, progression,
fin, noms piégés affichés comme texte).

Restent pour E4 : essai réel dans le bac à sable (le profil apparaît dans le launcher officiel et le jeu démarre),
revue indépendante (lot critique : écrit dans les fichiers du launcher officiel).

**Essai en bac à sable (24/10/2026)** : profil « WECRAFT - Pack Fabric » créé puis réutilisé (même identifiant,
6 Go puis 4 Go), Fabric 0.20.1 installé, « WeCraft Survie » intact, sauvegardes présentes. **Défaut trouvé** : le
launcher officiel (version Xbox, `C:\XboxGames`) ne s'ouvrait pas, et ReLaunch annonçait « prêt » sans le
vérifier. Corrigé : identifiant de l'application lu dans le paquet installé (`Get-AppxPackage`, sortie
vérifiée), succès annoncé seulement si le processus du launcher apparaît (20 s), journal
`.wecraft\logs\lancement.log`. À réessayer.

### Lot E8 : suppression d'instance (branche `electron/e8-suppression`, à partir d'E4)

Port de `safe_to_delete` / `delete_instance`. **Différence voulue** : le dossier part à la **corbeille de
Windows** (`shell.trashItem`), jamais d'effacement définitif ; si la corbeille refuse, rien n'est supprimé.
Mêmes garde-fous que Python (dossier réel, à l'intérieur d'un dossier d'instances connu, liens et « .. »
résolus, jamais le dossier personnel, `.minecraft` ou le dossier WeCraft ni un de leurs parents) ; refus pendant
un lancement ; confirmation dans l'interface (bouton « Annuler » sélectionné par défaut, source rappelée pour
CurseForge / Modrinth / Prism) ; réglages de l'instance oubliés ensuite. Tests portés de Python + pièges (lien
vers l'extérieur, dossier personnel à l'intérieur, racine). Reste : essai réel, revue indépendante (données).

### Lot E5 : mises à jour (branche `electron/e5-mise-a-jour`, à partir d'E8)

Port en TypeScript du mécanisme de la version Python (`src/main/update/`), mêmes fichiers dans `.wecraft` :
- **Signature** : même clé publique, même message signé, signature Ed25519 obligatoire ; vérifiée **avant** le
  téléchargement, puis empreinte SHA-256 vérifiée avant de garder le fichier. Une signature produite par Python
  est acceptée, toute modification (version, fichier, clé) refusée.
- **Versions** : même ordre que `version_key` (comparé à Python sur 144 couples).
- **Release** : premier `.exe` de `Rexidelamort/WeCraft-Releases`, empreinte (`digest` ou `.sha256`), `.sig` ;
  serveurs GitHub en HTTPS uniquement.
- **Retour arrière**, deux cas reconnus sans rien deviner :
  - *passage Python → ReLaunch* : `update_pending.json` écrit par la vraie fonction Python `apply_update` est
    relu (test croisé) ; validation au premier affichage réel de la fenêtre ; au 2ᵉ démarrage raté, retour à
    `WeCraft.exe.old` (version Python), version abandonnée notée dans `update_skip.json` ;
  - *ReLaunch → ReLaunch* : installeur vérifié gardé dans `.wecraft\updates`, lancé en silencieux
    (`/S --force-run`) ; retour arrière = réinstaller la version précédente avec son installeur.
- Chemins lus dans `update_pending.json` vérifiés (un fichier modifié ne peut pas faire renommer ou lancer
  n'importe quel programme). Double-clic < 30 s compté une fois. `update.log` au même format.
- Interface : vérification silencieuse au démarrage, à la main depuis Réglages (numéro de version) ; fenêtre
  « Mise à jour disponible » avec progression réelle (octets reçus).

**Rien n'est publié.** Restent, avant toute publication (autorisation explicite du développeur, §3.2) :
workflow de release ReLaunch (installeur signé + `.sha256` + `.sig`, un seul `.exe`), revue indépendante
(lot critique), et les 3 essais de bout en bout (§4.4) : Python → ReLaunch, Python → ReLaunch défaillant (retour
à Python), ReLaunch → ReLaunch. Point à vérifier lors de ces essais : réinstallation d'une version plus ancienne
par l'installeur (retour arrière ReLaunch → ReLaunch).

**E4 : essai réel validé (24/10/2026, 22:55)** sur les vrais fichiers du développeur (copie de sécurité faite
avant) : ReLaunch a repris **la configuration créée par WeCraft Python** (même identifiant dans
`managed_profiles.json`), l'a renommée « WECRAFT - All the Mods 10 - ATM10 » avec `neoforge-21.1.219` et le bon
dossier CurseForge ; les 9 autres configurations du launcher officiel sont identiques au caractère près, aucune
ajoutée ni retirée ; launcher officiel (version Xbox) ouvert et vérifié. Confirmé visuellement par le développeur.
En bac à sable : Fabric, Forge 47.4.28 + Java installés, suppression vers la corbeille faite.

### Lot E6 : interface en React (branche `electron/e6-interface`, à partir d'E5 ; décision D4)

- `react` / `react-dom` 19.3.1 (+ types 19.3.0), ajoutés au `package-lock.json` sur le PC du développeur
  (`preparer-e6.bat`), 0 faille connue, aucune version existante changée.
- L'interface du prototype (`prototype.js`, 960 lignes) et le pont `app.ts` sont réécrits en React + TypeScript
  strict (`src/renderer/ui/`) : barres de navigation (toutes les dispositions), épingles et groupes
  (glisser-déposer), réglages (6 onglets), accueil, WeCraft, favoris, panneau latéral, lancement, RAM,
  suppression, mises à jour. Aucune donnée lue dans un fichier n'est insérée comme HTML.
- Assemblage sans outil externe (`scripts/bundle-ui.mjs`) : un seul `ui.js`, versions de production de React
  uniquement, aucun `eval` (refusé à l'assemblage), mentions de licence gardées ; CSP inchangée.
- **Parité vérifiée** : 68 scénarios rejoués (`electron/tools/parite-ui/`) dans Chromium sur l'ancienne et la nouvelle interface, DOM comparé
  élément par élément (balises, classes, attributs, styles, textes, valeurs des champs) : identiques, sauf le
  contenu laissé dans des éléments **cachés** par l'ancienne version et les changements voulus ci-dessous.
- Changements voulus : « Mémoire par défaut » (Réglages > Jeu) est maintenant la vraie valeur de
  `launcher_config.json` (1 à 16 Go, comme la fenêtre de lancement) ; « Dossier de données > Ouvrir » ouvre
  vraiment `%APPDATA%\.wecraft` ; « Mises à jour » (Réglages > Comportement) a un bouton « Rechercher » ;
  une erreur de suivi du lancement est affichée au lieu de rester invisible.
- Restent : revue UX, tailles de fenêtre, accessibilité (critère du plan), et les réglages du prototype encore
  sans effet (Java automatique, Discord, rouvrir à la fermeture : traités au lot E9).

**E6 : CI Windows verte** (compilation, tests, installeur, installation réelle).

### Lot E7 : modpacks Modrinth (branche `electron/e7-modpacks`, à partir d'E6)

Port de la bibliothèque de mods de la version Python (`src/main/modpacks/`) : recherche, résolution des versions
et dépendances, création d'un WePack, modification (ajout / retrait, dépendances devenues inutiles retirées),
liste des mods d'un modpack (noms lus dans les `.jar`).
- Sécurité : API et CDN Modrinth seulement, en HTTPS ; empreinte **SHA-512 obligatoire**, vérifiée avant de garder
  un fichier ; noms de fichiers contrôlés (aucun dossier, aucun caractère interdit, aucun nom réservé Windows) ;
  création annulée sans reste si un téléchargement échoue ; modification : rien n'est supprimé si un
  téléchargement échoue, et seuls les fichiers notés dans `wecraft_modpack.json` peuvent être retirés.
- Lecture des `.jar` sans dépendance (petit lecteur ZIP limité en taille, rien n'est extrait sur le disque).
- Interface : page **Découvrir** (recherche, tri, catégories, « Mon modpack » avec les dépendances et leur
  raison, avertissement « À savoir » avant de télécharger, progression réelle) ; « Créer un WePack » y mène ;
  bouton ✎ « Modifier les mods » sur les WePacks de la page WeCraft.
- **Validation** : résolution des versions et dépendances, graphe « qui a besoin de qui », lignes et notes de
  « Mon modpack », **fichiers créés puis modifiés sur le disque**, liste des mods et lecture de `.jar` compressés
  par Python : **identiques à la vraie version Python** sur les mêmes données. Test Python porté (échec = rien
  ne change). Essai réel ajouté à la CI (recherche, création Sodium + dépendances, modification).
- Restent : essai sur le PC du développeur, revue indépendante.
- CI Windows : les tests comparaient les JSON écrits par Python octet par octet ; sous Windows, Python écrit
  `\r\n` en fin de ligne (contenu identique). Comparaison corrigée, délai d'attente des tests élargi.

### Lot E9 : statut Discord et finitions (branche `electron/e9-finitions`, à partir d'E7)

- **Statut Discord** (`src/main/discord/`) : port de `DiscordPresence`, sans dépendance (protocole local de
  l'appli Discord par canal nommé, même identifiant d'application). **Désactivé par défaut** ; question au premier
  démarrage de chaque version (« Non » par défaut), mêmes clés `discord` / `discord_asked_version` que la version
  Python ; interrupteur dans Paramètres > Comportement. Affiche « Dans le launcher », « Prépare … », puis
  « Joue à … » (version, loader, durée) quand le jeu est détecté, puis retour au launcher.
- Détection du jeu : **PowerShell ne renvoie qu'un nombre** de processus Java ; les lignes de commande (qui
  contiennent le jeton de session de Minecraft) ne sont jamais lues par ReLaunch. Discord fermé : rien ne se
  passe, nouvel essai après 30 s ; jamais bloquant.
- Finitions : l'interrupteur factice « Java géré automatiquement » devient une ligne d'information (rien à régler) ;
  « Rouvrir ReLaunch à la fermeture du jeu » retiré (ni ReLaunch ni la version Python ne se réduisent au lancement :
  le réglage ne faisait rien).
- **Validation** : textes du statut, commande PowerShell et identifiant **identiques à la vraie version Python** ;
  protocole testé contre un faux Discord local ; suivi lancement → jeu → fermeture, abandon après 5 min, Discord
  fermé. Interface vérifiée dans un navigateur (question, interrupteur).
- **Non fait volontairement** : retrait des dépendances Python (le code Python reste jusqu'à la validation de la
  migration, prompt maître).
- Restent : essai réel avec Discord sur le PC du développeur, revue indépendante.

### Revue indépendante des lots critiques (25/10/2026) et corrections

Relecture par un agent séparé (branche `electron/e9-finitions`, code lu en entier et comparé au Python, tests
lancés). Aucun constat critique. Verdicts : E3, E4, E8, E9 « OK pour fusion » ; E5 et E7 « OK après corrections ».
Corrections faites (même branche) :
- **E5 (important)** : un installeur gardé n'est plus jamais lancé sans preuve. `<installeur>.preuve.json`
  (version, empreinte, signature) est écrit après le téléchargement vérifié ; avant l'installation ET avant un
  retour arrière, l'empreinte est recalculée et la signature revérifiée (installeur remplacé = refusé, retour
  arrière pas proposé). Au passage Python → ReLaunch, l'installeur n'est gardé que si son empreinte est celle,
  signée, de la release de cette version (sinon : pas gardé, noté dans `update.log`).
- E5 : retour arrière noté AVANT de lancer l'installeur (remis en place s'il ne démarre pas) ; seul
  `ReLaunch-Setup-<version>.exe` est retenu dans une release (jamais un autre `.exe`, jamais un tag qui ne
  donne pas un nom de fichier sûr).
- E7 : seuls les WePacks créés dans WeCraft se modifient (comme Python) ; mods retirés envoyés à la
  **corbeille** (plus d'effacement définitif) ; création d'instance sans risque d'effacer un dossier apparu
  entre-temps ; noms de fichiers comparés sans tenir compte des majuscules (Windows).
- E3 : aucun fichier hors de `.minecraft`, même pour un profil de loader ; identifiants de version et chemins
  Java : refus des noms réservés de Windows (CON, NUL…), des flux cachés (« : ») et des points/espaces finaux ;
  progression réelle pendant le téléchargement de Java, plus de barre figée pendant l'installeur Forge/NeoForge.
- IPC : lancement et suppression refusés pendant un téléchargement de mods.
- Non corrigés (notés) : fermeture du launcher officiel non vérifiée hors Windows (comme Python, hors cible) ;
  NeoForge 1.20.1 peut-être réinstallé à chaque lancement (supposition, à vérifier avec xmcl en CI).

Workflow `release-relaunch.yml` ajouté : tag `relaunch-vX.Y.Z`, tests, installeur, signature (clé actuelle),
vérification avec les clés Python et ReLaunch, **brouillon** sur WeCraft-Releases (jamais publié automatiquement).
