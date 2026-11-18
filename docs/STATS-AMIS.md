# Stats de jeu visibles par les amis : module du Worker `relink-auth`

Dans ReLaunch, un clic sur le nom d'un ami (panneau Amis) ouvre sa fiche : skin en 3D, statut, partie, musique,
série, temps joué ensemble (compté sur ton PC). Ses **statistiques de jeu** (temps cumulé, jours joués,
lancements, session moyenne, plus longue session, 3 modpacks les plus joués) n'y apparaissent que si :

1. ce module est collé dans le Worker ;
2. l'ami a coché « Série et stats visibles par mes amis » (page Statistiques de ReLaunch).

Sans le module, la fiche marche quand même et indique que ses stats ne sont pas partagées.

## Coller le module

1. Ouvre le Worker **relink-auth** → *Modifier le code*.
2. Cherche `const ROUTES = [` **suivi de** `...EXTRA_ROUTES,` (c'est le second `const ROUTES = [` du fichier).
3. **Juste au-dessus**, colle tout `tools/worker/relink-friend-stats.js`.
4. Ajoute `...RL_FRIEND_STATS_ROUTES,` comme **toute première entrée** du tableau :
   ```js
   const ROUTES = [
     ...RL_FRIEND_STATS_ROUTES,
     ...EXTRA_ROUTES,
   ```
5. *Déployer*. Rien à créer dans D1 (le module range les résumés dans `kv_store`, clé `stats:<id>`).

## Ce que fait le module

| Route | Rôle |
| --- | --- |
| `PUT /launcher/me/stats` | Le launcher envoie son résumé (au plus toutes les 15 min, et après chaque partie). Refusé (`not_shared`) si le joueur n'a pas coché le partage. 30 envois par heure au plus, 4 Ko au plus, chaque champ revérifié. |
| `GET /launcher/friends` | Route d'origine, enveloppée : ajoute `stats` à chaque ami qui partage (réglage relu à chaque fois : décocher masque aussitôt). |

Le réglage de partage est celui de la série (`kv_store` « `streak:share:<id>` »), déjà en place dans le Worker.
