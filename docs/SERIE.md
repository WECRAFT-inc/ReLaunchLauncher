# Série de jours de jeu : module du Worker `relink-auth`

Le launcher affiche déjà la série (page Profil, page Quêtes, liste d'amis), mais c'est le Worker qui la
compte et verse les Éclats. Sans ce module, la série reste figée (rien n'écrit la table `streaks`).

## Coller le module (2 minutes)

1. Ouvre le Worker **relink-auth** dans le tableau de bord Cloudflare → *Modifier le code*.
2. Cherche la ligne `const ROUTES = [` **suivie de** `...EXTRA_ROUTES,` (il y a deux `const ROUTES = [` dans le fichier :
   c'est celle-là, le vrai tableau des routes).
3. **Juste au-dessus** de cette ligne, colle tout le contenu de `tools/worker/relink-streak.js`.
4. Dans le tableau, ajoute `...RL_STREAK_ROUTES,` comme **toute première entrée** :
   ```js
   const ROUTES = [
     ...RL_STREAK_ROUTES,
     ...EXTRA_ROUTES,
     // ── Site ReLaunch …
     ...RL_SITE_ROUTES,
   ```
   (en premier, pour que ses routes passent avant celles d'origine qu'elles enveloppent.)
5. *Déployer*. Rien à lancer dans D1 : les colonnes manquantes de `streaks` sont ajoutées toutes seules.

## Ce que fait le module

| Route | Rôle |
| --- | --- |
| `POST /launcher/me/playtick` | Envoyé chaque minute par le launcher pendant une partie. Compte le temps de jeu du jour. |
| `PUT /launcher/me/presence` | Route d'origine, enveloppée : un signal « en jeu » compte aussi (anciens launchers). |
| `GET /launcher/quests` | Route d'origine, enveloppée : `streak` devient la vue complète (progression du jour, gels, prochain palier…). |
| `GET /launcher/friends` | Route d'origine, enveloppée : ajoute la série de chaque ami qui la partage. |
| `PUT /launcher/me/streak` | `{ "share": true/false }` : montrer ou non sa série à ses amis. |

Règles (modifiables en haut du module, objet `RL_STREAK`) :

- **Jour validé** : 15 minutes de jeu dans la journée (heure de Paris). Les signaux trop rapprochés sont ignorés et
  au plus 75 s comptent par signal : impossible de gonfler le compteur.
- **Récompense quotidienne progressive** : 5 Éclats, puis 8 dès 7 jours, 10 dès 14, 12 dès 30, 15 dès 60, 20 dès 100.
- **Paliers** : 3 (+15), 7 (+40), 14 (+80), 30 (+150), 50 (+250), 75 (+350), 100 (+500), 150 (+750), 200 (+1000), 365 (+2000).
- **Gels de série** : 1 gel gagné tous les 7 jours de série, 2 au maximum. Un jour manqué est couvert automatiquement
  par un gel ; s'il manque plus de jours que de gels, la série repart à 1 (le record reste).
- Les Éclats passent par `grantEclatsInternal` avec les motifs `streak_daily` et `streak_milestone` (déjà prévus).

## Côté launcher (déjà fait)

- Page **Profil** (bouton tête en haut à droite) : vraie tête du joueur, série, statistiques de jeu.
- **Partager ma série** : copie une image (et un texte) dans le presse-papiers, à coller sur Discord.
- Case **Visible par mes amis** ; 🔥N à côté du pseudo des amis dans la liste.
- Statistiques de jeu : comptées sur le PC uniquement (`play-stats.json`), rien n'est envoyé.
