# Politique de confidentialité de ReLaunch

> Brouillon à compléter. Chaque `TODO` doit être rempli par l'éditeur. Ce texte décrit ce que fait le code
> de ReLaunch (branche New-Relaunch) ; il doit être relu et mis à jour à chaque changement des données traitées.
> Il ne remplace pas l'avis d'un professionnel du droit.

Dernière mise à jour : TODO (date)

## Qui est responsable de vos données

Responsable du traitement : TODO (nom ou raison sociale, adresse).
Contact pour toute question sur vos données : TODO (adresse e-mail).

## Ce que ReLaunch fait sans compte

ReLaunch fonctionne sans connexion. Sans compte, il garde ces données **sur votre PC uniquement**,
dans le dossier `%APPDATA%\.wecraft` :

- vos réglages (thème, langue, mémoire allouée, dossiers) ;
- vos statistiques de jeu (temps de jeu, lancements, instances les plus jouées), chiffrées par Windows ;
- les journaux de lancement, pour vous aider à comprendre un problème.

ReLaunch tire aussi au hasard un identifiant d'installation (`relaunch_install.json`). Il sert à répartir
les mises à jour par vagues. Il n'est relié ni à votre nom ni à votre compte.

## Compte ReLink (facultatif, connexion par Discord)

Si vous vous connectez à ReLink, ReLaunch vous envoie sur la page de Discord. Discord transmet au serveur
ReLink votre identifiant et votre pseudo Discord. Votre mot de passe n'est jamais vu par ReLaunch.

Le serveur ReLink reçoit alors, pour faire fonctionner le compte :

- votre présence : si vous êtes actif, le jeu ou l'instance en cours (nom, version de Minecraft) et, **si vous
  l'activez**, le titre écouté (désactivé par défaut) ;
- votre temps de jeu, compté par minute, pour la série de jours et les quêtes ;
- vos amis, demandes d'ami, quêtes, Éclats et skins débloqués ;
- le skin Minecraft que vous choisissez d'envoyer et votre pseudo hors ligne, si vous en choisissez un.

Le jeton de session dure 30 jours, il est chiffré par Windows sur votre PC et vous pouvez le révoquer
depuis le site. Durée de conservation des données du compte sur le serveur : TODO.

## Compte Microsoft (facultatif)

Pour lancer une instance avec votre compte Minecraft officiel, ReLaunch se connecte à Microsoft, Xbox Live et
Mojang. Les jetons reçus restent chiffrés sur votre PC. L'identifiant Minecraft (UUID) est associé à votre
compte ReLink si vous êtes connecté. TODO : préciser ce que le serveur ReLink garde de cette association et combien de temps.

## Services tiers contactés

Selon ce que vous utilisez, ReLaunch contacte : Microsoft, Xbox Live et Mojang (connexion et jeu),
Discord (connexion et statut Rich Presence), Modrinth (mods et modpacks), Fabric, Quilt, Forge et NeoForge
(installation des loaders), GitHub (mises à jour), Cloudflare (hébergement du serveur ReLink et des fichiers),
Twitch (lives des partenaires). Chacun applique sa propre politique de confidentialité.

## Vos droits

Vous pouvez demander l'accès, la rectification ou la suppression de vos données, ainsi que la limitation
du traitement, en écrivant à : TODO (adresse e-mail). Vous pouvez aussi saisir la CNIL (www.cnil.fr).

Base légale de chaque traitement : TODO (par exemple exécution du service pour le compte ReLink,
consentement pour le partage de la musique).
