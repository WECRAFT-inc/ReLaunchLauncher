# Musique dans ReLaunch

## Ce que fait le launcher

ReLaunch pilote **l'appli qui joue de la musique sur le PC**, quelle qu'elle soit : Spotify, Deezer, YouTube ou YouTube Music dans un navigateur, Apple Music, TIDAL, etc. Il passe par les **commandes multimédias de Windows** (les mêmes que celles qui s'affichent quand on appuie sur une touche de volume). Il n'y a donc aucune connexion à un service de musique, ni clé, ni compte Premium.

| Fonction | Où |
|---|---|
| Morceau en cours, pochette, lecture / pause / suivant / précédent | Mini-lecteur de la barre (il n'apparaît que lorsqu'une appli a un morceau en cours) ; un clic ouvre le panneau « Musique » |
| Choix de l'appli pilotée si plusieurs jouent | Panneau « Musique » → « Appli pilotée » (« Suivre Windows » par défaut) |
| Ouvrir Spotify, Deezer, YouTube Music, Apple Music, TIDAL, SoundCloud, Amazon Music | Panneau « Musique » et Paramètres → Musique (l'appli installée si Windows la connaît, sinon la version web) |
| Raccourcis clavier globaux (marchent aussi en jeu) | Paramètres → Musique. **Aucun par défaut.** Ctrl ou Alt obligatoire, pour ne jamais voler une touche à Minecraft |
| « Écoute … » visible des amis ReLink | Paramètres → Musique → « Partager ma musique avec mes amis ». **Désactivé par défaut** |
| Comportement quand Minecraft est lancé | La musique continue, rien ne change |

Réglages enregistrés dans `launcher_config.json` : `relaunch_music` (`enabled`, `share`, `shortcuts`) et `relaunch_music_source` (appli choisie).

### Fonctionnement technique

- `electron/src/main/media/music.ts` démarre **un seul** processus Windows PowerShell 5.1 (chemin fixe dans System32), caché, qui reste ouvert. Il répond en JSON d'une ligne aux commandes `state`, `thumb`, `play`, `pause`, `toggle`, `next` et `prev`, en passant par l'API WinRT `GlobalSystemMediaTransportControlsSessionManager`.
- Ce processus n'est lancé que si le mini-lecteur est activé et que l'interface demande l'état (relevé toutes les 2,5 s quand la fenêtre est visible). Il est arrêté à la fermeture du launcher, ou quand on désactive le mini-lecteur.
- Une commande n'est envoyée que pour une appli vue dans le dernier état : l'interface ne peut pas faire passer de texte libre.
- S'il plante, il est relancé à la demande suivante. Si c'est son démarrage qui échoue, le délai avant un nouvel essai augmente (jusqu'à 5 min).

## Partage aux amis : module à ajouter au Worker `relink-auth`

Sans ce module, le reste marche : le Worker ignore simplement le champ `music`.

1. Tableau de bord Cloudflare → Workers → **relink-auth** → Modifier le code.
2. Colle **tout** le fichier `tools/worker/relink-music.js` **à la fin** du code.
3. Dans `handleLauncherPresencePut`, juste **après** la ligne :
   ```js
   ).bind(payload.discord_id, now, idleMs, gameJson, detail ? JSON.stringify(detail) : null, startedAt).run();
   ```
   ajoute :
   ```js
   await rlMusicPut(env, payload.discord_id, body.music).catch(() => undefined);
   ```
4. À la fin de `relinkedPresenceOf`, remplace la dernière ligne `return out;` de la fonction par :
   ```js
   await rlMusicAttach(env, out);
   return out;
   ```
   (C'est le `return out;` qui suit `out.set(r.discord_id, { status, game, detail, lastSeen: … });`.)
5. Dans `handleLauncherFriendsListWithPresence`, sur la ligne :
   ```js
   status: p ? p.status : 'offline', game: p ? p.game : null, detail: p ? p.detail : null, lastSeen: p ? p.lastSeen : null,
   ```
   ajoute à la fin :
   ```js
   music: p ? p.music || null : null,
   ```
6. Déploie.

La table `relinked_presence_music` se crée toute seule. Un morceau n'est montré que si l'ami est en ligne ou absent et que son dernier signal date de moins de 3 minutes. Si le joueur coupe le partage, le launcher envoie `music: null` et la ligne est supprimée.

## Dépannage

- **Paramètres → Musique → État** indique ce que voit le launcher : les applis détectées, ou la raison exacte si les commandes multimédias de Windows ne répondent pas.
- Le journal (Paramètres → Logs, catégorie « Musique ») contient le message d'erreur de PowerShell si le pont s'arrête.
- Correctif du 14/11/2026 : le pont plantait dès son démarrage, parce qu'il modifiait l'encodage de la console alors qu'il est lancé sans console. Il lit et écrit désormais directement ses flux standard.
