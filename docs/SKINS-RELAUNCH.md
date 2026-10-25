# Skins du launcher ReLaunch (`.rlskin`) — format v1

Un skin change tout le launcher : fond animé, couleurs, typographie, barres à motifs, cadres, bouton Jouer, transition entre pages et écran de lancement, avec des variantes Liquid Glass et Mat. Il se publie depuis le panneau d'administration et s'obtient dans ReLaunch **sans nouvelle version du launcher**.

Un skin ne contient **aucun code** : ni script, ni CSS libre, ni HTML. Il contient seulement des valeurs (couleurs, tailles, chemins d'images, images-clés d'animation limitées) que le launcher vérifie, puis applique lui-même. Un skin malveillant ne peut donc pas exécuter quoi que ce soit.

## 1. Fichier `.rlskin`

C'est une archive ZIP qui contient :

- `skin.json` à la racine, décrit plus bas ;
- les images : `.png`, `.jpg`, `.webp` ou `.gif`. Le `.svg` est accepté **seulement dans un skin signé publié par ReLink** et refusé en aperçu local ;
- les polices : `.woff2`, `.woff`, `.ttf` ou `.otf`.

Limites :
- 40 Mo par archive ;
- 12 Mo par fichier ;
- 300 fichiers ;
- chemins relatifs simples : pas de `..`, pas de `\`, pas de nom réservé Windows.

## 2. `skin.json`

```json
{
  "format": "relaunch-skin",
  "version": 1,
  "id": "grande-vague",
  "name": "La Grande Vague",
  "author": "Équipe ReLaunch",
  "skinVersion": "1.0.0",
  "description": "D'après l'estampe de Hokusai.",
  "followsTheme": false,
  "tokens": { "acc": "#38bdf8", "acc2": "#bae6fd", "accDeep": "#0369a1", "spark": "#e0f2fe", "night": "#06121f", "ink": "#f8fafc", "inkSoft": "#cbd5e1", "inkFaint": "#64748b", "line": "rgba(255,255,255,.12)", "card": "rgba(255,255,255,.05)" },
  "fonts": { "display": { "file": "fonts/titre.woff2", "family": "Titre" }, "body": { "file": "fonts/texte.woff2", "family": "Texte" } },
  "background": {
    "color": "#06121f",
    "gradient": "linear-gradient(180deg, #06121f, #0b2740)",
    "layers": [
      { "image": "img/ciel.webp", "size": "cover", "position": "center", "opacity": 1 },
      { "image": "img/vagues.webp", "size": "100% 55%", "position": "center bottom", "opacity": 0.9, "blend": "normal", "repeat": false, "animation": "houle" }
    ],
    "overlay": "vignette"
  },
  "bars": { "pattern": "img/motif.png", "patternOpacity": 0.3, "background": "linear-gradient(180deg, rgba(8,30,52,.82), rgba(4,14,26,.9))", "border": "rgba(125,211,252,.35)", "radius": 18 },
  "frames": { "radius": 18, "border": "rgba(125,211,252,.28)", "glow": "#38bdf8", "background": "rgba(8,30,52,.55)" },
  "playButton": { "image": "img/sceau.png", "background": "linear-gradient(180deg, #e0f2fe, #38bdf8)", "text": "#06121f", "radius": 999, "animation": "pouls" },
  "transition": { "type": "wave", "durationMs": 420 },
  "launchScreen": { "image": "img/lancement.webp", "text": "Le large t'attend", "animation": "houle" },
  "animations": {
    "houle": { "durationMs": 9000, "iterations": "infinite", "direction": "alternate", "easing": "ease-in-out", "delayMs": 0,
      "keyframes": [ { "offset": 0, "transform": "translateY(0px)" }, { "offset": 1, "transform": "translateY(-14px) scaleX(1.03)", "opacity": 0.95 } ] },
    "pouls": { "durationMs": 2400, "iterations": "infinite", "direction": "alternate",
      "keyframes": [ { "filter": "brightness(1)" }, { "filter": "brightness(1.15)" } ] }
  },
  "variants": {
    "liquidGlass": { "tokens": {}, "bars": { "background": "linear-gradient(180deg, rgba(186,230,253,.18), rgba(8,30,52,.35))" }, "cardBackground": "rgba(186,230,253,.08)" },
    "mat": { "bars": { "background": "linear-gradient(180deg, rgba(8,30,52,.95), rgba(4,14,26,.98))" } }
  }
}
```

Seuls `format`, `version`, `id` et `name` sont obligatoires. Tout le reste est facultatif : une valeur absente garde l'apparence normale du launcher.

| Champ | Valeurs permises |
|---|---|
| `id` | minuscules, chiffres et tirets, 2 à 60 caractères |
| couleurs | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()`, `hsl()` / `hsla()` |
| dégradés | `linear-gradient(<angle>deg, couleur [n%], …)` ou `radial-gradient(circle\|ellipse [at …], …)`, 2 à 8 couleurs |
| `followsTheme` | `true` : le skin garde les couleurs du thème choisi par le joueur et n'ajoute que le décor ; `false` : ses `tokens` s'appliquent et la rotation des thèmes se met en pause |
| `layers[].size` | `cover`, `contain`, `auto`, `120px`, `100% 55%` |
| `layers[].position` | `center`, `top`, `bottom`, `left`, `right`, `n%`, une ou deux valeurs |
| `layers[].blend` | `normal`, `screen`, `multiply`, `overlay`, `soft-light`, `lighten`, `darken`, `color-dodge` |
| `layers[]` | 8 calques au plus |
| `overlay` | `none`, `vignette`, `grain` |
| `transition.type` | `none`, `fade`, `slide`, `wave`, `zoom` ; durée de 0 à 3000 ms |
| `radius` | 0 à 40 px (bouton Jouer : jusqu'à 999) |

**Animations.** Chaque animation définit :
- 2 à 12 images-clés ;
- une durée de 100 ms à 10 min ;
- `iterations` : un nombre, ou `"infinite"` ;
- `direction` ;
- `easing` : `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`.

Seules ces propriétés sont animables :
- `transform`, avec `translate`, `translateX/Y`, `scale`, `scaleX/Y`, `rotate`, `skew`, `skewX/Y` (nombres en px, %, deg) ;
- `opacity`, de 0 à 1 ;
- `filter`, avec `hue-rotate`, `blur`, `brightness`, `saturate`, `contrast` ;
- `backgroundPosition`.

Une animation se relie à un calque de fond, au bouton Jouer ou à l'écran de lancement par son nom. Les animations sont coupées quand le joueur réduit les animations (dans les réglages ou dans Windows).

Une valeur invalide fait refuser **tout le skin**, avec un message qui dit laquelle. Un skin à moitié appliqué n'existe pas.

## 3. Créer, tester, publier

1. Crée un dossier avec `skin.json` et les images, sur le modèle de `tools/skin-exemple/`.
2. Fabrique l'archive :
   ```
   node tools/relaunch-skin.mjs pack tools/skin-exemple vague.rlskin
   ```
3. Teste-la dans ReLaunch : Réglages, Apparence, « Aperçu d'un fichier skin (.rlskin)… ». Le skin est installé en aperçu local, non signé, et s'applique tout de suite.
4. Signe-la, sur un PC de confiance, avec la clé privée correspondant à `RELAUNCH_SIGNING_PUBLIC_KEY` du Worker :
   ```
   set RELAUNCH_SIGNING_KEY=<clé privée Ed25519, 32 octets base64>
   node tools/relaunch-skin.mjs sign vague.rlskin
   ```
   Le script écrit `vague.rlskin.sig` (base64) et affiche le SHA-256. La signature porte sur les **octets exacts** du fichier, comme le Worker l'exige pour les releases et les modpacks.
5. Dans le panneau, ouvre **Skins du launcher**, puis « Modifier » sur la fiche. Dans « Fichier du skin », indique la version du fichier, puis envoie `vague.rlskin` et `vague.rlskin.sig`.

## 4. Côté Worker (fait)

- **Envoi du fichier.** La route `POST /admin/launcher-skins/{id}/file` reçoit un multipart :
  - `metadata` = `{ "version": "1.0.0", "sha256": "<hex>" }` ;
  - `file` = l'archive `.rlskin`, 40 Mo maximum ;
  - `signature` = la signature.

  Le Worker recalcule le SHA-256, vérifie Ed25519, contrôle que c'est un ZIP contenant `skin.json`, puis le stocke : dans GitHub si `RELAUNCH_GITHUB_TOKEN` et `RELAUNCH_GITHUB_REPO` sont configurés, sinon dans R2.
- **Retrait du fichier.** `DELETE /admin/launcher-skins/{id}/file` retire le fichier publié. Le fichier lui-même se supprime ensuite depuis « Stockage ».
- **Fichier dans la réponse publique.** `GET /launcher/bootstrap` → `skins[]` contient `"file": { "id", "sha256", "size", "version" }`, ou `null`. Le fichier se télécharge par `GET /launcher/assets/{id}`, et sa signature par `?signature=1` (base64).
- **Fiche protégée.** Enregistrer la fiche du skin depuis le panel ne peut pas écraser `file`.
- **Propriété des skins (reste à faire).** Pour les skins « à débloquer », il faut un endpoint authentifié qui dise quels skins le joueur possède, donc des comptes ReLink connectés au launcher. En attendant, ReLaunch n'installe que les skins **sans condition d'obtention** et qui ont un fichier.

Côté launcher, il reste à intégrer la **clé publique** `RELAUNCH_SIGNING_PUBLIC_KEY` dans `electron/src/main/skins/skins.ts` (`RELINK_SIGNING_PUBLIC_KEY`). Tant qu'elle vaut `null`, aucun skin téléchargé n'est installé, et le message le dit.

## 5. Sécurité, côté launcher

- **Skin publié par ReLink :** SHA-256 comparé à celui annoncé, **puis** signature Ed25519 vérifiée avec la clé épinglée, **avant** l'ouverture de l'archive. Le booléen `signatureVerified` du serveur n'est pas pris en compte.
- **Ouverture de l'archive :** chaque chemin, chaque type, chaque taille et chaque valeur de `skin.json` sont revérifiés. Le skin est extrait dans `%APPDATA%\.wecraft\skins\<clé>`.
- **Fichiers du skin :** l'interface ne lit que les fichiers listés à l'installation, servis par `app://wecraft/skin/<clé>/…` avec leur type réel. Un SVG est servi avec une politique qui bloque tout script.
- **Application :** le skin ne passe que par des variables CSS, des styles d'éléments précis et l'API Web Animations. Le skin ne fournit jamais de chaîne CSS ou HTML.
