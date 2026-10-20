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

