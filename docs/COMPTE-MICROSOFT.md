# Compte Minecraft officiel (Microsoft) dans ReLaunch

Décision validée par l'auteur le 26/10/2026 : ReLaunch se connecte lui-même à Microsoft. Cela lui permet de :
- **lancer le jeu sans ouvrir le launcher officiel** ;
- **lier automatiquement l'UUID Minecraft officiel au compte ReLink**, ce qui remplace `/link` pour les joueurs qui ont un compte officiel.

## Fonctionnement

1. Dans Réglages > Compte ReLink > « Compte Minecraft (Microsoft) », le joueur clique sur « Se connecter avec Microsoft ». Son navigateur s'ouvre sur la page de connexion de Microsoft.
   - Le flux est OAuth 2.0 « application native », avec PKCE S256 et un `state` à usage unique.
   - Le retour se fait sur `http://localhost:47322/relaunch/microsoft`, qui n'écoute que sur la boucle locale, pendant 5 minutes au plus.
   - Aucun mot de passe ne passe par ReLaunch.
2. ReLaunch enchaîne Microsoft, Xbox Live, XSTS puis Minecraft. Il vérifie que le compte possède Minecraft Java, puis chiffre le jeton de renouvellement et le jeton Minecraft avec le système (DPAPI). Ils sont rangés dans `.wecraft\microsoft_session.bin`.
3. **Liaison avec ReLink :** ReLaunch envoie **une fois** le jeton Minecraft au Worker (`POST /launcher/me/minecraft`). Le Worker lit le profil officiel chez Mojang, enregistre l'UUID et le pseudo dans le compte ReLink (identité `minecraft_msa`), puis oublie le jeton, qui n'est jamais enregistré ni journalisé.
4. **Au lancement :**
   - il faut un compte ReLink **et** un compte Minecraft officiel vérifié et lié (depuis le launcher ou depuis le site) ;
   - par défaut, ReLaunch installe ce qui manque, télécharge le Java de Mojang, puis démarre le jeu lui-même ;
   - l'option « Ouvrir le launcher officiel pour jouer » garde l'ancien fonctionnement.
5. **Reconnexion :** le joueur ne se reconnecte que si Microsoft refuse le renouvellement, par exemple après environ 90 jours sans jouer ou un changement de mot de passe.

ReLaunch **ne lit jamais** les comptes enregistrés dans le launcher officiel. Ce serait une extraction de jeton, ce qui reste interdit. Modrinth App fait pareil : il a sa propre connexion Microsoft.

**Exceptions :**
- Les instances « ReLaunch Event » sans compte Microsoft (fonctionnement à la Nations Glory) seront traitées plus tard.
- Pour les participants d'event qui n'ont pas de compte officiel, `/link` reste nécessaire.

## À configurer (une seule fois)

1. **Application Azure.** Va sur portal.azure.com, puis Microsoft Entra ID, puis Inscriptions d'applications, puis Nouvelle inscription.
   - **Nom :** WeCraft.
   - **Types de comptes :** « Comptes Microsoft personnels uniquement ».
   - **URI de redirection :** plateforme « Client public / natif (mobile et bureau) », valeur `http://localhost/relaunch/microsoft`. Le port est ignoré pour `localhost`.
   - Dans **Authentification**, active « Autoriser les flux clients publics ».
2. **Accord de Mojang.** Demande l'accès à l'API Minecraft avec le formulaire de Mojang pour les applications tierces (https://aka.ms/mce-reviewappid), en donnant l'ID de l'application.
   - Tant que l'accord n'est pas donné, la connexion échoue avec le message « Mojang n'a pas encore autorisé l'application WeCraft ».
3. **Worker.** Ajoute la variable `MICROSOFT_CLIENT_ID`, avec l'ID d'application (client) Azure. Ce n'est pas un secret.
4. **Liaison depuis le site (facultatif).**
   - Dans la même application Azure, ajoute la plateforme « Web » avec l'URI de retour du site, crée un secret client, puis ajoute-le au Worker : `MICROSOFT_CLIENT_SECRET`.
   - Le site envoie ensuite `{ code, redirect_uri }` à `POST /me/minecraft/microsoft`, avec la session ReLink du joueur.

## Sans l'accord de Mojang, ou si l'accès est bloqué : repli prévu dans le code

ReLaunch n'utilise **pas** l'identifiant de l'application Microsoft officielle. Ce serait se faire passer pour Microsoft, et la page de connexion afficherait « Minecraft Launcher » au joueur.

**Repli au lancement.** Quand la connexion directe n'est pas possible, les instances WeCraft se lancent **automatiquement par le launcher officiel**, avec un message. C'est le cas :
- si l'application WeCraft n'est pas configurée (`MICROSOFT_CLIENT_ID` absent) ;
- si Mojang ne l'a pas autorisée ou la bloque ;
- si le joueur n'est pas connecté à Microsoft dans ReLaunch.

**Liaison et vérification de la licence sans Microsoft.** Le joueur passe par `/link` sur un serveur ReLink en mode online (`online-mode=true`) :
1. Le plugin appelle `POST /mc/link/request` avec `{ mc_uuid, mc_username, online_mode: true }`.
2. Le joueur entre le code dans ReLaunch (Réglages > Compte ReLink > « Lier avec /link ») ou sur le site.
3. Le Worker enregistre l'identité `minecraft_online`. Le compte compte alors comme « licence vérifiée », au même titre qu'une liaison Microsoft.

**À faire côté plugin :** n'ajouter `online_mode: true` que si le serveur tourne réellement en mode online. Un serveur en mode offline ne vérifie pas la licence : sa liaison reste valable pour les events, mais ne compte pas comme « licence vérifiée ».

## Tant que Mojang n'a pas validé l'application

- Dans Réglages, l'option « Ouvrir le launcher officiel pour jouer » est **forcée et grisée** tant que le joueur n'est pas connecté à Microsoft dans ReLaunch.
- L'accueil affiche une petite carte « Joue en tant que » : le compte Minecraft lié, ou une invitation à le lier, avec la récompense.

## Quête « Compte Minecraft officiel » (1000 Éclats)

- Elle est versée par le Worker, une seule fois par compte ReLink **et** une seule fois par compte Minecraft. Délier puis relier le même compte Minecraft à un autre profil ne rapporte rien.
- Elle est validée uniquement par la première liaison d'un compte Microsoft (connexion dans le launcher ou sur le site), avec le compte ReLink connecté. `/link` ne compte pas.
- Les comptes déjà liés à Microsoft avant l'arrivée de la quête la reçoivent à leur prochaine ouverture de « Avantages & Quêtes » ou de l'accueil.
- Route : `GET /launcher/quests` (Bearer). Elle renvoie les quêtes, la série de jours (tables `streaks` et `streak_config` existantes) et `reward` si une récompense vient d'être versée.
- Les réclamations sont enregistrées dans `launcher_records`, collection `quest_claims`. La ligne d'Éclats a la raison `quest_custom`, avec `meta.quest = official_account`.

## Connexions exigées (décision du 26/10/2026)

- **ReLaunch :** aucune connexion exigée, ni ReLink ni Microsoft.
- **Instances WeCraft (Minecraft normal, moddé ou non) :** un compte Minecraft officiel est obligatoire, mais c'est Microsoft qui le vérifie.
  - Connecté à Microsoft dans ReLaunch : lancement direct.
  - Sinon : le launcher officiel s'ouvre et authentifie le joueur. ReLaunch ne vérifie rien lui-même.
- **Compte ReLink :** facultatif pour jouer. Il sert aux skins, à la boutique, aux quêtes, à l'envoi du skin et aux events.
- **`/link` :** retiré du launcher. Il reste disponible côté serveurs, avec le plugin, pour les events.
