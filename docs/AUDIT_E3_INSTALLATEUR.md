# Audit E3 : bibliothèque d'installation (`@xmcl/installer`)

Date : 20/10/2026. Lot E3 du plan de migration (`docs/AUDIT_MIGRATION_ELECTRON.md`, §7) : risque **critique**,
validation = audit écrit + double validation + essai en bac à sable Windows. Ce document est l'audit écrit ;
aucune ligne d'installation n'est encore branchée dans l'appli.

## 1. Ce que fait la version Python (référence)

`wecraft_launcher.py` s'appuie sur `minecraft_launcher_lib` (mll), dans le `.minecraft` officiel :

| Étape | Python (mll) |
|---|---|
| Liste des versions | `utils.get_version_list()` (manifeste Mojang), hors ligne : versions installées |
| Vanilla | `install.install_minecraft_version()` : json, jar client, bibliothèques, natives, assets |
| Loaders | `mod_loader.get_mod_loader("fabric"\|"forge"\|"neoforge"\|"quilt")` : versions compatibles, dernière version ou version exacte de l'instance, installation |
| Java | `runtime.install_jvm_runtime()` (Java de Mojang), utilisé pour l'installeur Forge/NeoForge |
| Hors ligne | réutilise un loader déjà installé (`installed_loader_ids`) |

mll vérifie le SHA-1 **après** chaque téléchargement quand il est connu (erreur sinon).

## 2. La bibliothèque étudiée

- Dépôt `Voxelum/minecraft-launcher-core-node` (moteur du launcher « X Minecraft Launcher »), licence **MIT**.
  Paquet `@xmcl/installer` 6.1.2 dans le dépôt (dernier changement du dossier : 08/04/2026), Node ≥ 20.
- Dépendances : `@xmcl/core`, `@xmcl/file-transfer`, `@xmcl/unzip`, `@xmcl/asm`, `@xmcl/forge-site-parser`
  (même dépôt), `undici` **7.18.2 (version figée)**, `yauzl`, `yazl`, `tar-stream`.
- Couverture : Vanilla, Fabric, Quilt, Forge (ancien et nouveau format), NeoForge, Java de Mojang, LabyMod,
  OptiFine. Utile pour nous : les 5 premiers + Java.
- Maintenance : 41 commits depuis octobre 2025, dont 36 par un seul mainteneur (ci010). **Un seul mainteneur
  actif** : risque de dépendance à une personne.
- Publication npm : `pnpm publish` avec un jeton npm stocké dans les secrets GitHub, **sans provenance**
  (pas de lien vérifiable entre le paquet publié et le code du dépôt).

Code relu (dépôt cloné, commit `154e271`) : `installer/{minecraft,libraries,assets,java-runtime,forge,neoforge,
fabric,quilt,profile,utils,diagnose}.ts`, `file-transfer/{download,agent}.ts`.

## 3. Constats

| # | Gravité | Constat (fichier) | Conséquence |
|---|---|---|---|
| X1 | **Critique** | Le SHA-1 n'est vérifié qu'**avant** de télécharger (« le fichier est-il déjà bon ? »), jamais **après** (`minecraft.ts`, `libraries.ts`, `assets.ts`, `java-runtime.ts` ; `download.ts` ne vérifie rien). | Un fichier abîmé ou modifié en route est installé et l'installation se déclare réussie. mll, lui, vérifie après. |
| X2 | **Critique** | Java de Mojang : la vérification SHA-1 du manifeste a été **retirée** le 02/02/2026 (commit `115257a`, « Ignore the sha1 issue »). | Le manifeste qui donne l'empreinte de chaque fichier de Java n'est plus contrôlé ; combiné à X1, Java n'est protégé que par HTTPS. |
| X3 | **Critique** | Forge : adresse par défaut **en HTTP** (`DEFAULT_FORGE_MAVEN = 'http://files.minecraftforge.net/maven'`, toujours ajoutée en secours) ; liste des versions Forge aussi en HTTP. | L'installeur Forge (un .jar **exécuté** avec Java) peut être remplacé sur un réseau hostile. |
| X4 | **Critique** | NeoForge : l'installeur .jar est téléchargé sans aucune empreinte (`sha1: ''`) puis exécuté. Forge : empreinte seulement si l'appelant la fournit. | Même risque que X3, sur HTTPS. |
| X5 | Important | Redirections suivies vers n'importe quelle adresse (jusqu'à 5, `agent.ts`), y compris HTTP. Secours automatique vers `repo1.maven.org`. | Il faut imposer HTTPS et une liste de serveurs autorisés. |
| X6 | Important | Bibliothèques sans SHA-1 (Fabric : loader et intermediary) : seul un contrôle « zip bien formé ». | Fichier remplacé non détecté. Les dépôts Maven publient pourtant un `.sha1` à côté de chaque fichier. |
| X7 | Important | `undici` figé en 7.18.2 : vulnérable à CVE-2026-1527 (injection CRLF via l'option `upgrade`, corrigée en 7.24.0). | Non exploitable ici (option jamais utilisée), mais `npm audit` le signalera ; à forcer en ≥ 7.24 (`overrides`) si compatible. |
| X8 | Important | Sans chemin Java fourni, le traitement Forge lance `java` trouvé dans le PATH. | Toujours fournir le Java vérifié. |
| X9 | Mineur | Téléchargement écrit directement à l'emplacement final (pas de fichier temporaire par défaut) ; fichier supprimé en cas d'erreur. | Un arrêt brutal peut laisser un fichier partiel ; rattrapé par une vérification finale (voir §4). |
| X10 | Mineur | Option `strict` au sens inversé (`strict: true` = contrôle de taille seulement). | Ne jamais passer `strict: true`. |

Points corrects : HTTPS pour Mojang, Fabric, Quilt, NeoForge ; écriture limitée au dossier `.minecraft`
donné ; versions et chemins calculés comme le launcher officiel ; annulation possible (`AbortSignal`) ;
progression réelle (octets reçus), compatible avec la règle « jamais de fausse progression » (§10.4).

## 4. Recommandation : `@xmcl/installer` encadré (option A)

Garder la bibliothèque pour ce qu'elle fait bien (lecture des versions, calcul des fichiers, traitement des
profils Forge/NeoForge) et ajouter nos propres garde-fous autour :

1. **Couche réseau à nous** (`src/main/net/`) : HTTPS seulement, liste fermée de serveurs (Mojang
   `piston-meta`, `piston-data`, `launchermeta`, `libraries.minecraft.net`, `resources.download.minecraft.net`,
   `meta.fabricmc.net`, `maven.fabricmc.net`, `meta.quiltmc.org`, `maven.quiltmc.org`,
   `maven.minecraftforge.net`, `files.minecraftforge.net` en HTTPS, `maven.neoforged.net`), chaque redirection
   revérifiée, taille maximale, fichier temporaire puis renommage, **empreinte vérifiée après réception**.
   Passée à xmcl par `dispatcher` et `libraryHost` (corrige X3, X5).
2. **Vérification finale obligatoire** : après chaque installation, nouveau passage en mode `diagnose`
   (empreintes SHA-1 de tous les fichiers) ; le moindre écart = échec affiché, jamais « prêt » (X1, X9).
3. **Java de Mojang installé par notre code** (manifeste `all.json` → manifeste de la version, SHA-1 vérifié
   à chaque étape, même emplacement que mll et le launcher officiel :
   `runtime/<composant>/windows-x64/<composant>`) (X2, X8).
4. **Installeurs Forge/NeoForge téléchargés par notre code** avec contrôle du `.sha1`/`.sha256` publié par le
   dépôt Maven, puis traités par les fonctions exportées `unpackForgeInstaller` + `installByProfile`, avec
   notre Java (X3, X4, X8).
5. **Bibliothèques sans SHA-1** : contrôle du `.sha1` publié par le dépôt Maven (X6).
6. Versions figées, `package-lock.json` avec empreintes d'intégrité, `undici` forcé ≥ 7.24 si les tests passent
   (X7) ; toute mise à jour de xmcl = relecture du diff.

Alternatives écartées pour l'instant :
- **B. Tout écrire nous-mêmes** (port de mll) : aucune dépendance, mais beaucoup plus de code critique à
  écrire et tester (format des versions, natives, règles par OS, processeurs Forge).
- **C. Copier le code xmcl dans le dépôt** (MIT) : supprime le risque de publication npm, mais on perd les
  correctifs ; le verrouillage des versions + `package-lock.json` donne déjà l'essentiel de cette protection.

## 5. Ordre de réalisation proposé

1. Couche réseau sûre + Java de Mojang (sans dépendance, testables hors ligne).
2. Ajout de xmcl (le `package-lock.json` sera produit par la CI Windows, relu, puis versionné) ; Vanilla
   avec vérification finale.
3. Fabric / Quilt, puis Forge / NeoForge.
4. Essai en bac à sable Windows (dossier `.minecraft` de test, jamais le vrai) + double validation.

Le branchement au bouton Jouer, la fermeture du launcher officiel et l'écriture du profil restent au lot E4.

## 6. Décision

**D9 = A** (xmcl encadré), décidée par le développeur le 20/10/2026.

## 7. Mise à jour : version publiée 6.3.6 (20/10/2026, soir)

Le code relu aux §2–3 (dépôt `minecraft-launcher-core-node`, avril 2026) **n'est plus celui publié** : la
bibliothèque a déménagé dans `Voxelum/x-minecraft-launcher` (dossier `packages/`) et six versions sont sorties
depuis juillet 2026. Relecture de la 6.3.6 (17/10/2026, commit `1b4c985`, versions identiques à npm) :

| # | État en 6.3.6 |
|---|---|
| X1 | **Corrigé en amont** : nouveau moteur « plan → exécution » (`installManifest.ts`) qui revérifie chaque fichier après téléchargement et supprime les fichiers faux. Il garde des raccourcis de confiance (date `validatedAt`, `trustExistingSize` pour les ressources) : **désactivés chez nous** (`hardenFiles`). |
| X2 | **Corrigé** : le manifeste Java est de nouveau vérifié (`javaWorkflow.ts`). Notre `javaRuntime.ts` reste utilisé. |
| X3 | **Corrigé** : Forge en `https://maven.minecraftforge.net`. |
| X4 | **Amélioré** : l'installeur NeoForge est vérifié par le `.sha1` publié, mais **sans vérification si ce fichier manque** ; chez nous, refus. |
| X5 | Sans objet : xmcl ne télécharge plus rien lui-même, le téléchargement est fourni par l'appelant (`InstallRuntime.download`) : c'est **notre** couche réseau. |
| X6 | Traité chez nous : `.sha1` Maven obligatoire pour tout fichier sans empreinte. |
| X7 | **Corrigé** : `undici ^7.29` (7.30.1 verrouillé). |
| X8 | Les commandes Java passent par `InstallRuntime.java` : pour une version de base, toute commande est refusée. |
| — | **Provenance npm présente** (attestation SLSA) : le paquet publié est relié à son code source. |
| X12 (nouveau) | `@xmcl/unzip` 2.2.0 : `main` pointe vers `./index.ts`, absent du paquet (le code publié est dans `dist/`). Corrigé à chaque compilation par `scripts/fix-dependencies.mjs` (seul ce champ change ; arrêt en erreur si la version change). |
| X13 (nouveau) | `@xmcl/installer` 6.3.6 importe `@xmcl/core/utils`, absent du paquet `@xmcl/core` 2.16.2 publié (n'existe que dans le dépôt source). Le seul élément utilisé (`isNotNull`, une ligne) est ajouté par `scripts/fix-dependencies.mjs`. |
| X11 (nouveau) | `@xmcl/unzip` 2.2.0 publié avec une dépendance interne invalide (`workspace:^*` vers `@xmcl/yauzl`) : imposée à `@xmcl/yauzl` 2.10.0 (`overrides` dans `package.json`). |

`package-lock.json` produit le 20/10/2026 sur le PC du développeur (`--package-lock-only --ignore-scripts`) :
34 paquets d'exécution ajoutés, tous depuis `registry.npmjs.org` avec empreinte d'intégrité, licences MIT /
BSD / ISC / Apache-2.0, aucune version existante modifiée, `npm audit` : 0 faille.

Branchement retenu : xmcl **planifie** (fichier de version lu par `Version.parse`, listes jeu / bibliothèques /
index / ressources) ; ReLaunch **télécharge et vérifie** (`src/main/install/xmcl.ts`, `vanilla.ts`). Le fichier
de version lui-même est vérifié par l'empreinte de la liste officielle Mojang (xmcl ne le fait pas).
