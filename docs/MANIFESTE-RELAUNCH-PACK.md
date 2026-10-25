# Manifeste des modpacks ReLaunch (`relaunch-pack` v1)

Une version de modpack officiel se compose de :

- un **manifeste** `<id>-<version>.relaunch.json` : la liste des fichiers à télécharger, avec leurs empreintes ;
- une **archive overrides** `<id>-<version>-overrides.zip`, facultative : les configs et les fichiers qui ne sont pas sur Modrinth ;
- une **signature Ed25519** pour chacun des deux fichiers.

C'est l'idée du `.mrpack` de Modrinth, avec trois différences :

- le manifeste et l'archive sont **séparés** et **signés** chacun par WeCraft ;
- le launcher sait ce que le joueur a le droit de modifier sans que la mise à jour suivante l'écrase (`editable`) ;
- une liste `remove` supprime proprement les fichiers d'une ancienne version.

Les mods ne sont **jamais** hébergés par WeCraft s'ils sont sur Modrinth : le launcher les télécharge directement sur le CDN de Modrinth. Il vérifie alors l'empreinte écrite dans le manifeste signé. Seuls le manifeste (quelques Ko) et les overrides sont stockés, sur GitHub (gratuit) ou dans R2.

## 1. Le manifeste

```json
{
  "format": "relaunch-pack",
  "formatVersion": 1,
  "pack": { "id": "terres-brulees", "name": "Terres Brûlées", "version": "1.2.0", "event": "evt_terres", "locked": true },
  "minecraft": "1.21.1",
  "loader": { "type": "fabric", "version": "0.16.9" },
  "java": { "major": 21 },
  "files": [
    {
      "path": "mods/sodium-fabric-0.6.0+mc1.21.1.jar",
      "hashes": { "sha512": "<128 hex>", "sha1": "<40 hex>" },
      "size": 1048576,
      "downloads": ["https://cdn.modrinth.com/data/AANobbMI/versions/…/sodium-fabric-0.6.0+mc1.21.1.jar"],
      "side": "client",
      "required": true,
      "project": "AANobbMI",
      "versionId": "…"
    }
  ],
  "overrides": { "sha256": "<64 hex>", "size": 52311 },
  "remove": ["mods/ancien-mod-1.0.jar"],
  "editable": ["shaderpacks"],
  "defaults": { "shader": "ComplementaryReimagined_r5.3.zip" }
}
```

| Champ | Règle |
|---|---|
| `format`, `formatVersion` | `"relaunch-pack"` et `1`. Toute autre valeur fait refuser le fichier. |
| `pack.id` | identifiant de la fiche du modpack dans le panel. Le Worker refuse un manifeste dont l'`id` ne correspond pas. |
| `pack.version` | `x.y.z` ou `x.y.z-rc.1`. Doit être plus récente que la version publiée. |
| `pack.event` | facultatif : lie la version à un event (le launcher l'affiche dans le carrousel et les instances event). |
| `pack.locked` | facultatif. `true` = **pack d'event verrouillé** : le joueur ne peut ni ajouter, ni retirer, ni modifier de fichier, sauf les shaders. `editable` ne peut alors contenir que `shaderpacks`. Le launcher remet le pack d'origine à chaque lancement. |
| `minecraft` | version du jeu. |
| `loader.type` | `vanilla`, `fabric`, `quilt`, `forge` ou `neoforge`. `loader.version` est obligatoire sauf pour `vanilla`. |
| `java.major` | facultatif. Le launcher choisit sinon le Java adapté à la version du jeu. |
| `files[].path` | chemin relatif à l'instance, dans un dossier permis (voir plus bas). Pas de `..`, pas de `\`, pas de nom réservé Windows, pas d'exécutable (`.exe`, `.bat`, `.dll`…). |
| `files[].hashes` | `sha512` (de préférence, c'est celui de Modrinth) ou `sha256`. `sha1` est facultatif. Le launcher refuse un fichier dont l'empreinte diffère. |
| `files[].size` | taille exacte en octets. |
| `files[].downloads` | 1 à 5 adresses HTTPS, seulement sur `cdn.modrinth.com`, `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `edge.forgecdn.net`, `mediafilez.forgecdn.net`, ou `https://<Worker>/launcher/assets/<id>` pour un **mod hébergé par WeCraft** (voir §2 bis). |
| `files[].side` | `client` (par défaut), `both` ou `server`. Un fichier `server` n'est pas installé par le launcher. |
| `files[].required` | `false` : le joueur peut le désactiver (le launcher le range alors comme « inactif »). |
| `overrides` | `{ sha256, size }` de l'archive overrides, ou `null`. 90 Mio maximum. |
| `remove` | fichiers à supprimer lors de la mise à jour (anciens noms de mods). Mêmes règles que `path`. |
| `editable` | dossiers ou fichiers que le joueur peut modifier : la mise à jour n'y touche pas s'ils existent déjà. Permis : `resourcepacks`, `shaderpacks`, `options.txt`, `config` (et leurs sous-chemins). |
| `defaults.shader` | shader activé à la première installation (fichier de `shaderpacks/`). |

**Dossiers permis :** `mods`, `resourcepacks`, `shaderpacks`, `config`, `defaultconfigs`, `kubejs`, `scripts`, `datapacks`, `global_packs`, `emotes`, `options.txt` et `servers.dat`.

Les champs inconnus sont ignorés, ce qui permet d'en ajouter sans casser les anciens launchers.

## 2. L'archive overrides

C'est un ZIP dont les chemins sont **ceux de l'instance**, par exemple `config/sodium-options.json` ou `mods/mod-prive.jar`.

- Mêmes règles de chemins que `files[].path`.
- Elle s'extrait par-dessus les fichiers téléchargés, sauf sur ce qui est `editable` et existe déjà.
- Son SHA-256 est écrit dans le manifeste. Le launcher vérifie donc la signature du manifeste, puis l'empreinte **et** la signature de l'archive, avant de l'ouvrir.

Un mod absent de Modrinth peut aller dans les overrides **seulement si sa licence permet de le redistribuer**. L'outil le signale.

## 2 bis. Mods hébergés par WeCraft (mods d'event)

Un mod développé pour un event, et donc absent de Modrinth, peut être hébergé par le Worker au lieu d'aller dans les overrides :

1. **Signer.** `node tools/relaunch-pack.mjs sign mon-mod.jar` donne `mon-mod.jar.sig`.
2. **Envoyer.** Dans le panel, ouvre **Modpacks**, puis **Mods hébergés (events)**, puis **Héberger un mod**. Le Worker vérifie la signature, calcule SHA-512 et SHA-1, puis stocke le fichier.
3. **Fabriquer le manifeste.** `build` retrouve le mod tout seul par son empreinte et écrit son adresse `https://<Worker>/launcher/assets/<id>`.

À la publication du manifeste, le Worker refuse :
- un mod hébergé inconnu ;
- une empreinte ou une taille qui ne correspond pas.

Un mod hébergé ne peut pas être supprimé tant qu'une version de modpack l'utilise.

Les mods absents de Modrinth et non hébergés vont dans les overrides. Ils sont acceptés.

## 3. Fabriquer, signer, publier

1. **Préparer.** Prépare l'instance dans ReLaunch : mods, configs, shaders.
2. **Fabriquer le manifeste.**
   ```
   node tools/relaunch-pack.mjs build "%APPDATA%\.wecraft\instances\Terres Brulees" --id terres-brulees --version 1.2.0 --mc 1.21.1 --loader fabric:0.16.9 --event evt_terres --locked --out publier
   ```
   L'outil :
   - calcule les empreintes ;
   - demande à Modrinth, puis au Worker (mods hébergés), quels fichiers ils connaissent : seules les empreintes sont envoyées, jamais les fichiers ;
   - écrit le manifeste ;
   - range le reste dans l'archive overrides.

   Les journaux, fichiers cachés, `.disabled` et `.bak` sont ignorés.
3. **Signer.** Sur un PC de confiance, avec la clé privée qui correspond à `RELAUNCH_SIGNING_PUBLIC_KEY` du Worker :
   ```
   set RELAUNCH_SIGNING_KEY=<clé privée Ed25519, base64>
   node tools/relaunch-pack.mjs sign publier\terres-brulees-1.2.0.relaunch.json
   node tools/relaunch-pack.mjs sign publier\terres-brulees-1.2.0-overrides.zip
   ```
4. **Publier.** Dans le panel, ouvre **Modpacks**, puis « Nouvelle version » sur la fiche. Envoie :
   - le manifeste et sa `.sig` ;
   - puis l'archive et sa `.sig` si le manifeste en annonce une.

   Le Worker :
   - vérifie les deux signatures ;
   - recalcule les empreintes ;
   - revérifie **toutes** les règles du §1 (dossiers, hôtes, chemins) ;
   - stocke les fichiers et met à jour la fiche (version, loader, nombre de mods, taille).
5. **Afficher.** Rends le modpack visible : c'est impossible sans une version signée.

`node tools/relaunch-pack.mjs check <manifeste>` applique les mêmes règles que le Worker avant l'envoi.

## 4. Côté launcher (à faire, après validation)

Le launcher lit déjà le catalogue (`/launcher/catalog`). Pour chaque modpack, `latestVersion` donne :
- `downloadUrl` et `signatureUrl` du manifeste ;
- `overrides`, avec `downloadUrl`, `signatureUrl`, `sha256` et `size`, ou `null` ;
- `format: "relaunch-pack"`.

L'installation prévue :
1. Télécharger le manifeste et sa signature. Vérifier Ed25519 avec la clé **épinglée** dans le launcher, sans tenir compte de `signatureVerified`. Revérifier toutes les règles.
2. Créer ou mettre à jour l'instance dans `%APPDATA%\.wecraft\instances`. Télécharger chaque fichier depuis ses `downloads`, en vérifiant la taille et le SHA-512 ou SHA-256 ; un fichier faux est supprimé et l'installation échoue.
3. Télécharger l'archive overrides, vérifier son empreinte et sa signature, l'extraire en respectant `editable`, puis appliquer `remove`.
4. Garder le manifeste installé, pour la mise à jour suivante et pour la réparation de l'instance.

Rien de ceci n'est encore codé dans le launcher : c'est une modification critique, à valider avant de l'écrire.
