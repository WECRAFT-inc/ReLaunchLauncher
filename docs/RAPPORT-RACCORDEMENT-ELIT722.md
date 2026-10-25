# Rapport de raccordement ReLaunch ↔ Worker ReLink — pour Elit722

Date : 25/10/2026 · branche `electron/e10-grosse-maj` du dépôt `Rexidelamort/WeCraft-Launcher`.
Rédigé selon le contrat `INTEGRATION-LAUNCHER-IA.md`. Ce rapport ne contient aucun secret ni aucune donnée personnelle.

## 0. Conditions de ce raccordement (à lire d'abord)

- **Sources absentes.** `workeradmin.js` et `adminpanel.html` n'ont **pas été fournis** au développeur. Tout ce qui suit s'appuie sur trois choses :
  - le contrat `INTEGRATION-LAUNCHER-IA.md` ;
  - les réponses publiques réellement renvoyées le 25/10/2026 par `GET /launcher/bootstrap`, `GET /launcher/catalog` et `GET /launcher/notifications` sur `https://relink-auth.refugeemeraudien-direction.workers.dev` (lecture seule, aucune route `/admin/*` appelée) ;
  - le prototype `Prototype ReLaunch × WeCraft (5).html`.

  Les formes des objets que le Worker ne renvoyait pas encore (cartes, news, events, modpacks : tableaux vides) sont donc **décodées de façon tolérante, sans garantie**. Voir le tableau de la section 2.
- **Aucune route admin dans le launcher.** Le launcher n'appelle aucune route `/admin/*` et ne contient ni `ADMIN_SECRET`, ni jeton admin, ni clé privée.
- **URL du Worker.** Elle est inscrite dans `electron/src/main/relink/worker.ts` (`WORKER_URL`). C'est l'URL connue du contrat, à **confirmer avant publication**.
- **Non testé en conditions réelles.** Le code a été vérifié par la compilation TypeScript stricte, par les tests existants du launcher, et dans l'interface avec des données simulées. Il n'a pas été essayé dans le launcher installé sous Windows contre le Worker.

## 1. Fonctions branchées, partielles, non branchées

Légende : ✅ branchée · 🟡 partielle · ❌ non branchée

| # | Fonction | État | Preuve | Raison / ce qui manque | Conséquence pour le joueur | Travail requis | Fichiers |
|---|---|---|---|---|---|---|---|
| 1 | Identifiant d'installation (`installId` / `deviceId`) | ✅ | UUID v4 créé une fois dans `%APPDATA%\.wecraft\relaunch_install.json`, réutilisé à chaque lancement | — | — | — | `main/relink/worker.ts` (`install`) |
| 2 | Bootstrap | ✅ | `GET /launcher/bootstrap?channel=stable&installId=…`, relevé au démarrage et toutes les 10 min ; cache horodaté `.wecraft\cache\relink_bootstrap.json` ; bandeau « données peut-être anciennes / service injoignable » | Canal fixé à `stable` (pas encore de choix beta ou interne dans l'interface) | — | Ajouter le choix du canal si voulu | `worker.ts`, `Relink.tsx` |
| 3 | Maintenance (`maintenance.*`) | ✅ | Bandeau en haut des pages (niveau info / warn / danger) ; si `blockLaunch`, le **processus principal refuse le lancement** (raison `maintenance`) | — | Lancement impossible pendant la maintenance, avec un message clair | — | `main.ts` (launchStart), `Relink.tsx` |
| 4 | Flags | 🟡 | Les flags `enabled: true` sont décodés, les `enabled: false` sont ignorés | Aucune fonction du launcher ne lit encore un flag : il faut connaître les clés et leur effet | Aucun | Fixer la liste des clés de flags et leur effet | `worker.ts` |
| 5 | Carrousel et encarts de l'accueil (`carousel`, `cards`) | 🟡 | Carrousel de l'accueil : les `cards` du Worker, sinon les `news` | **Forme des cartes inconnue** (tableau vide le 25/10) : champs lus au mieux (`id`, `title`/`t`/`n`, `body`/`text`/`d`, `cta`, `open`/`go`, `tag`). Pas d'image (voir n° 20). `carousel.count` et `speedSeconds` du panneau ne sont **pas** appliqués : les réglages du joueur (Réglages > Accueil) priment | Une carte avec d'autres noms de champs n'apparaît pas | Donner le schéma exact des cartes ; dire si le réglage admin doit primer sur celui du joueur | `Relink.tsx` (HomeCarousel), `worker.ts` (decodeCard) |
| 6 | Ciblage des cartes `premium` / `staff`, flags par rôle | ❌ | Le bootstrap public ne les renvoie pas (contrat, point 13) | Pas d'identité ReLink dans le launcher | Ces cartes et flags ne sont jamais vus | Comptes ReLink et filtrage côté Worker | — |
| 7 | Info & News (`news`) | ✅ | Page Info & News : carte principale, filtre par tag, « tout marquer comme lu », pastille non lu sur la cloche | Forme lue au mieux : `id`, `title`, `tags` (`[label, couleur]` ou objets), `date`, `body`, `cta`, `open`. Le corps est affiché en **texte brut** (pas de Markdown ni de HTML) | — | Confirmer le format de `tags` et de `body` | `Relink.tsx` (NewsPage) |
| 8 | Notifications (polling + ACK) | ✅ | Relevé toutes les 3 min (fenêtre visible). Chaque nouvelle notification est **enregistrée** dans `.wecraft\cache\relink_notifications.json`, **puis** `POST …/ack` avec le même `deviceId`. Affichage dans la cloche | Champs lus : `id`, `title`, `body`, `open`, `sendAt` / `createdAt`. Délai progressif après échec réseau : non, le relevé suivant réessaie simplement | — | Confirmer les champs ; ajouter un délai progressif si le volume le justifie | `worker.ts` (notifications, ack), `Relink.tsx` (NotifList) |
| 9 | Notifications `role` / `players` | ❌ | HTTP 501 côté admin (contrat) | Pas d'identité joueur. Le launcher ne fait pas passer `installId` pour une identité | Non reçues | Comptes ReLink authentifiés | — |
| 10 | Serveurs (`servers`) | 🟡 | Page ReLaunch : nom, description, version, état, joueurs / max, adresse ; total des joueurs en ligne | **« Rejoindre » désactivé** : il faut installer le modpack du serveur (`pack`), voir n° 13. État et joueurs = valeurs **saisies dans le panneau** (pas de ping Minecraft, contrat point 8) | Le joueur voit les serveurs mais ne peut pas les rejoindre depuis ReLaunch | Manifeste de modpack ; décider si un ping réel est voulu | `Relink.tsx` (RelinkServersEvents) |
| 11 | Events (`events`) | 🟡 | Page ReLaunch : grand encart du prochain event avec compte à rebours, et liste | **Forme inconnue** (tableau vide le 25/10) : champs lus `id`, `n`/`name`/`title`, `d`/`desc`, `status`, `start`/`startsAt`/`date`, `end`, `server`, `pack`. Pas d'inscription (n° 15) | — | Donner le schéma exact | `worker.ts` (decodeEvent), `Relink.tsx` |
| 12 | Partenaires (`partners`) | 🟡 | Page Diffusion Partenaires : `live` d'abord, puis `featured`, nombre de spectateurs | Le lecteur intégré et l'état live réel (Twitch / YouTube) ne sont pas branchés : on affiche l'état saisi dans le panneau | — | API Twitch / YouTube (hors contrat actuel) | `Relink.tsx` (LivePage) |
| 13 | Modpacks ReLaunch (`modpacks`, versions signées) | ❌ | Liste affichée, bouton « Installer » **désactivé** | **Schéma du manifeste non défini** (contrat, point 1 et section « Détails d'upload ») : impossible d'installer sans inventer un format | Aucune installation de modpack ReLaunch | Décider du schéma versionné du manifeste (fichiers, empreintes, chemins, ordre, dépendances, suppressions). Le launcher sait déjà installer et vérifier des fichiers (SHA-512 Modrinth, `.mrpack`) et peut le reprendre | `Relink.tsx`, futur `main/relink/modpack.ts` |
| 14 | Mises à jour du launcher via le Worker (`/launcher/updates`, releases R2, Range, Ed25519 sur les octets du fichier) | 🟡 | Le launcher se met toujours à jour par **GitHub** (`WeCraft-Releases`), avec SHA-256 et Ed25519 (contexte `WeCraft-update-v1`). Du Worker, il applique déjà : **kill switch** (installation refusée si `updates.kill`) ; **bandeau** si la version installée est inférieure à `minVersion` (avec `blockOld`) | Basculer la source des mises à jour est une **modification critique** (double validation exigée par le cahier des charges). Le format de signature du Worker (octets bruts) diffère de celui des releases GitHub. La clé publique `RELAUNCH_SIGNING_PUBLIC_KEY` n'est pas connue | — | Décider de la source unique (GitHub ou Worker) ; si c'est le Worker : fournir la clé publique, puis implémenter le téléchargement Range, la vérification SHA-256 + Ed25519 locale, `mandatory`, le rollout et le rollback | `main.ts` (updateInstall), `update/*`, `Relink.tsx` (VersionBanner) |
| 15 | Candidatures aux events, signalements de joueurs | ❌ | Actions admin seulement | Pas d'endpoint public de création ni d'identité joueur (contrat, point 6) | Impossible depuis le launcher | Endpoint public authentifié | — |
| 16 | Skins du launcher : catalogue (`skins`) | ✅ | Réglages > Apparence > Skins : nom, conditions d'obtention, versions LG / Mat | — | — | — | `Settings.tsx` (SkinsGroup), `worker.ts` (decodeSkin) |
| 17 | Skins du launcher : **fichiers** (`.rlskin`) | 🟡 | Format, outil (`tools/relaunch-skin.mjs` : pack, sign, verify), installation vérifiée (SHA-256 + Ed25519 sur les octets exacts) et application (fond animé, couleurs, polices, barres, cadres, bouton Jouer, transitions, écran de lancement) **faits côté launcher**. L'aperçu local d'un fichier marche | **Le Worker n'a pas de route d'envoi du fichier**, et le bootstrap ne renvoie pas de `file` pour un skin. **Clé publique de signature non intégrée** (`RELINK_SIGNING_PUBLIC_KEY = null`) | Aucun skin ReLink installable pour l'instant | Voir `docs/SKINS-RELAUNCH.md` §4 : `POST /admin/launcher-skins/{id}/file` et `skins[].file = {id, sha256, size, version}` ; fournir la clé publique | `main/skins/skins.ts`, `ui/Skin.tsx`, `docs/SKINS-RELAUNCH.md` |
| 18 | Propriété des skins (shop, event, succès, premium, octrois) | ❌ | `POST /admin/launcher-skins/{id}/grant` existe, mais aucun endpoint public ne donne la propriété d'un joueur (contrat, point 5) | Pas d'identité ReLink | Seuls les skins **gratuits** publiés avec un fichier sont obtenables ; les autres sont marqués « à débloquer, bientôt » | Endpoint d'entitlements authentifié | `Settings.tsx` |
| 19 | Télémétrie (adoption, crashs, actifs, téléchargements, ventes), statistiques de lancement | ❌ | Rien n'est envoyé | Aucun endpoint, consentement, durée de conservation ni schéma (contrat, points 7 et 9) | — | Définir l'endpoint et le consentement | — |
| 20 | Images des cartes, news, events et serveurs | ❌ | Dégradés de couleur à la place | Aucune image dans les réponses actuelles ; la politique de sécurité de l'interface n'autorise que des images servies par le launcher | Visuels génériques | Fournir des assets (id + sha256) servis par `/launcher/assets/{id}` : le launcher les téléchargera et vérifiera comme les skins | `Relink.tsx` |
| 21 | Stockage, quotas, nettoyage, kill switch et rollout côté admin | — | Fonctions du panneau seulement (le launcher n'y touche pas, conformément au contrat) | — | — | — | — |
| 22 | Activation et validation Cloudflare réelles (D1, R2, CORS, secrets, Range, quotas) | ❌ | Seules les lectures publiques ci-dessus ont été faites | Pas d'accès au déploiement ni à la configuration Wrangler (contrat, points 11 et 12) | — | Tests d'intégration sur le déploiement autorisé | — |

## 2. Formes décodées sans confirmation (à valider par Elit722)

Le launcher ignore un objet dont l'`id` ou le titre manque. Il ne fabrique jamais de valeur.

| Objet | Champs confirmés le 25/10 | Champs supposés (tolérés) |
|---|---|---|
| `skins[]` | `id`, `n`, `status`, `unlock.{event,shop,achievement,premium}`, `versions.{liquidGlass,mat}`, `followsTheme` | `d`, `file` / `asset` (n'existe pas encore) |
| `servers[]` | `id`, `n`, `host`, `state`, `players`, `max`, `pack`, `event` | `d`, `v` |
| `partners[]` | `id`, `n`, `ch`, `cat`, `featured`, `live`, `viewers` | — |
| `news[]` | (vide) | `id`, `title`, `tags`, `date`, `body` (d'après le contrat), `cta`, `open` |
| `cards[]` | (vide) | `id`, `title` / `t` / `n`, `body` / `text` / `d`, `cta`, `open` / `go`, `tag` |
| `events[]` | (vide) | `id`, `n` / `name`, `d` / `desc`, `status`, `start` / `startsAt`, `end`, `server`, `pack` |
| `modpacks[]` | (vide) | `id`, `n` / `name`, `d`, `mc`, `loader`, `version` |
| `notifications[]` | (vide) | `id`, `title`, `body`, `open`, `sendAt` / `createdAt` |
| `open` / `go` | — | une page du launcher : `home`, `wecraft`, `relaunch`, `welive`, `live`, `news`, `discover`, `favorites`, `settings`, `relink` ; toute autre valeur est ignorée |

## 3. Fonctions du prototype sans équivalent dans le Worker

Aucune fonction du prototype n'a été retirée. Celles-ci restent **non branchées**, affichées comme « pas encore disponible » ou vides, jamais avec des données d'exemple :

- **Comptes ReLink** (profil, connexion, captures, skins Minecraft du joueur, shop, crédits) : pas d'authentification joueur dans le contrat.
- **Amis et demandes d'amis, présence (« en jeu », « en live »)** : pas d'endpoint.
- **Gestionnaire de téléchargements** (file d'attente, pause, reprise) : local. Il sera branché avec l'installation des modpacks (n° 13).
- **Lecteur de lives intégré, filtres Event / Partenaires / Amis** : pas de source live réelle (n° 12).
- **Menu staff** (signalements, modération) : actions admin uniquement, réservées au panneau (n° 15).
- **Compteurs « joueurs connectés » et « amis en ligne » de l'accueil** : seul le total des joueurs saisi par serveur existe ; il est affiché dans ReLaunch, pas sur l'accueil.
- **Rejoindre un serveur, « Me prévenir » d'un event** : manifeste (n° 13) et notifications ciblées (n° 9).
- **Skins complets « La Grande Vague » et « Orient Express »** du prototype : le moteur et le format sont prêts. Il reste à les **produire** en fichiers `.rlskin` (images et animations) et à les publier (n° 17).

## 4. Décisions attendues

1. Schéma du **manifeste de modpack** (bloque les n° 10 et 13).
2. Route d'envoi des **fichiers de skin**, champ `file` public et **clé publique de signature** (bloque le n° 17).
3. **Source des mises à jour** du launcher : GitHub ou Worker (n° 14).
4. **Comptes ReLink** : authentification joueur, entitlements, notifications ciblées (bloquent les n° 6, 9, 15 et 18).
5. Schémas exacts de `cards`, `news`, `events`, `modpacks` et `notifications` (section 2).
