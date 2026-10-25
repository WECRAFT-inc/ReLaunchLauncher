# Stockage des fichiers ReLaunch

## Aujourd'hui

| Contenu | Où | Limite |
|---|---|---|
| Installeur du launcher (`ReLaunch.exe`, environ 110 Mo) | GitHub, `Rexidelamort/WeCraft-Releases` : compilé et signé par la CI, publié depuis le panel | aucune |
| Skins du launcher, manifestes et overrides de modpacks, mods d'event, skins Minecraft des joueurs, bannières | R2 privé `relaunchr2`, servi par le Worker (`/launcher/assets/…`, `/launcher/mcskin/…`, `/launcher/banners/…`) | 10 Go au total, 94 Mo par envoi |

Le launcher lit ses mises à jour directement sur GitHub :
- canal stable : la release « Latest » ;
- « Participer à la bêta » : aussi les préversions.

Depuis le panel, publier une release sur le canal stable la rend « Latest ». Sur les canaux bêta et interne, elle devient une préversion.

## Le jour de la machine de stockage dédiée

Le Worker est prêt : il suffit de changer la configuration. Le code reste le même, parce que le Worker voit la machine comme s'il s'agissait de R2.

**Variables et secrets du Worker :**

| Nom | Valeur |
|---|---|
| `RELAUNCH_STORAGE` (variable) | `remote` |
| `RELAUNCH_STORAGE_URL` (variable) | `https://stockage.exemple.fr`, en HTTPS obligatoirement |
| `RELAUNCH_STORAGE_TOKEN` (secret) | jeton long et aléatoire, connu seulement du Worker et de la machine |
| `RELAUNCH_STORAGE_QUOTA_GB` (variable) | quota en Go, par exemple `500` |
| `RELAUNCH_KEEP_VERSIONS` (variable) | `5` : 5 versions gardées au maximum par modpack, par skin et par canal |

Avec `RELAUNCH_KEEP_VERSIONS`, chaque publication supprime les plus anciennes versions au-delà de ce nombre. Une version active n'est jamais supprimée, une release GitHub non plus.

**API que la machine doit fournir.** Toutes les requêtes portent `Authorization: Bearer <RELAUNCH_STORAGE_TOKEN>`. Une requête sans ce jeton est refusée (401).

| Requête | Effet |
|---|---|
| `PUT /o/<clé>` | Enregistre le corps. Reçoit `Content-Type` et des en-têtes `X-Meta-*` facultatifs. Répond 200 ou 201. |
| `GET /o/<clé>` | Renvoie le fichier avec `Content-Type`, `Content-Length` et `ETag`. Accepte `Range: bytes=a-b` (réponse 206). Répond 404 si le fichier est absent. |
| `HEAD /o/<clé>` | Comme `GET`, sans le corps. |
| `DELETE /o/<clé>` | Supprime le fichier. Répond 200, ou 404 s'il est déjà absent. |
| `GET /list?limit=1000&cursor=…&prefix=…` | Répond `{ "objects": [{ "key", "size", "uploaded" }], "truncated": bool, "cursor": "…" }`. |

Les clés ressemblent à `launcher/<type>/<id>/<fichier>`, par exemple `launcher/mcskin/<sha256>/skin.png`.

N'importe quel serveur S3 compatible, MinIO par exemple, derrière un petit proxy qui traduit ces 5 routes, fait l'affaire.

**Migration :**
1. Copier tous les objets de `relaunchr2` vers la machine, en gardant les mêmes clés.
2. Passer `RELAUNCH_STORAGE` à `remote`.
3. Vérifier que « Stockage » dans le panel liste les mêmes fichiers.
4. Seulement ensuite, vider R2.

Les adresses vues par les joueurs ne changent pas : elles passent toujours par le Worker.

**Installeurs.** Une fois la machine en place, ils pourront quitter GitHub. Il faudra alors faire lire les mises à jour au launcher depuis le Worker (`/launcher/updates`), ce qui permet le déploiement progressif et l'arrêt d'urgence. C'est une modification du launcher, à valider le moment venu.

**Limite de taille.** Cloudflare limite le corps d'une requête à 100 Mo (plan gratuit). Envoyer un fichier plus gros par le panel demandera de l'envoyer directement à la machine (adresse signée) ou de passer à un plan Workers payant.
