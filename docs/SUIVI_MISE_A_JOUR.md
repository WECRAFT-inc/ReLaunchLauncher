# Suivi de la mise à jour générale de WeCraft

Référence : audit du 19/10/2026 (`claude/AUDIT_WECRAFT_2026-10-19.md` dans le projet Claude).
Branche : `audit/securite-donnees` (non fusionnée, rien publié).

## Ce qui a été fait (lot 1)

| Constat | Correction | Fichiers |
|---|---|---|
| S3 profils du launcher officiel | Sauvegarde horodatée avant chaque écriture (15 gardées, `%APPDATA%\.wecraft\backups\launcher_profiles`), écriture atomique + relecture, profil retrouvé par identifiant mémorisé (`managed_profiles.json`), profils de l'utilisateur jamais repris, BOM accepté, fichier illisible jamais réécrit. | `wecraft_launcher.py` (`set_profile`, `backup_profiles_file`) |
| S4 fermeture forcée | Fermeture normale d'abord ; arrêt forcé seulement si l'utilisateur répond Oui ; sinon le lancement est annulé **sans rien écrire**. | `close_official_launcher`, `play_worker`, `ask_from_worker` |
| S5 réglages écrasés | Fichier illisible copié en `<nom>.invalide-<date>` (une seule copie), avertissement au démarrage, écritures atomiques, valeurs abîmées ignorées une par une. | `read_json_file`, `quarantine`, `atomic_write_text`, `load_meta`, `apply_meta`, `load_config` |
| S1 authenticité des mises à jour | Signature Ed25519 de « version + SHA-256 ». **Inactive tant que `UPDATE_PUBLIC_KEY` est vide.** Ensuite : signature invalide = refus ; signature absente = acceptée tant que `UPDATE_SIGNATURE_REQUIRED = False`. | `verify_update_signature`, `check_update_signature`, `tools/sign_release.py` |
| S6 retour arrière | `.old` gardé jusqu'à un démarrage réussi (`update_pending.json`) ; sinon, au démarrage suivant, proposition de revenir à l'ancienne version (la défaillante est gardée en `.echec`). | `apply_update`, `update_startup_check`, `mark_update_healthy`, `restore_previous_version` |
| S2 chaîne de publication | Tests bloquants avant compilation ; nom du tag vérifié et passé par variable d'environnement ; permissions minimales ; signature si secret présent ; **release publique en brouillon** ; Dependabot. | `.github/workflows/release.yml`, `requirements-build.txt`, `.github/dependabot.yml` |
| S7 vie privée | Discord désactivé par défaut ; question à chaque premier démarrage d'une nouvelle version (Non par défaut) ; PowerShell ne renvoie plus qu'un nombre (le jeton de session n'entre plus dans WeCraft). | `ask_discord_consent`, `minecraft_running` |
| S8 chemin | Seul le dernier dossier est renommé ; reprise par copie des réglages d'un ancien chemin. | `sibling_dir`, `migrate_old_settings` |
| S9 suppression | Uniquement des sous-dossiers des dossiers d'instances connus ; chemin Modrinth hors `profiles/` ignoré. | `safe_to_delete`, `is_inside`, `instance_roots` |
| S10 mods | Nom `.jar` simple sans caractère interdit, SHA-512 obligatoire. | `safe_mod_filename`, `resolve_modpack` |
| S12 hors ligne | Loader choisi pour la version exacte. | `installed_loader_ids` |
| Divers | Pré-versions comparées correctement, `update.log` limité, `build.bat` aligné, `SECURITY.md` à jour, `release.yml` racine marqué obsolète. | |

## Tests

`python -m unittest discover -s tests -v` : 51 tests, bac à sable temporaire, `minecraft_launcher_lib`
toujours remplacé par un substitut (aucun vrai `.minecraft` n'est touché).
Contrôle : les mêmes tests lancés sur le code d'origine échouent sur les comportements corrigés et
passent sur les comportements à préserver.

**Windows (PC du développeur, Windows 11 build 26200, Python 3.14.8, 19/10/2026) :**
- `tools/test_windows.bat` : 40/40 tests réussis (avant la revue ; à refaire avec les 50 tests) (dont signature, `cryptography` 50.0.2), code retour 0.
- `tools/essai_interface_windows.bat` (bac à sable, APPDATA/USERPROFILE redirigés) : l'interface démarre
  et se ferme sans erreur (code retour 0) ; `instances_meta.json` volontairement cassé mis de côté en
  `.invalide-<date>` sans être écrasé ; question Discord posée, réponse Non enregistrée
  (`discord: false`, `discord_asked_version: 1.2.0`) ; aucun fichier de profils modifié (LANCER non cliqué).
- Incident de test : au premier essai, la redirection de LOCALAPPDATA a fait installer par le gestionnaire
  Python de Windows un Python 3.15 dans `bac_a_sable` (aucun effet hors du dossier de test). Script corrigé.

**Non testé à ce stade :** bouton LANCER (fermeture du launcher officiel, écriture du profil en conditions réelles), exe PyInstaller,
fenêtres de retour arrière et de mise à jour, installation réelle de versions/loaders, relance après mise à jour.

## Restant à faire / à décider

1. **Tests sous Windows** : tests automatiques et démarrage de l'interface faits ; restent LANCER (bac à sable) et l'exe compilé.
2. **Revue indépendante** des changements sensibles (profils, mise à jour, exécution) par une autre IA (§13).
3. **Clé de signature** : générée par le développeur sur son PC le 19/10/2026 ; clé publique intégrée
   (`UPDATE_PUBLIC_KEY = "pELCCH6C...hx5Q="`). Reste : clé privée en secret GitHub `UPDATE_SIGNING_KEY`,
   puis `UPDATE_SIGNATURE_REQUIRED = True` dans la version qui suivra la première version signée.
4. **Épinglage** des actions GitHub (SHA) et des dépendances (`pip-compile --generate-hashes`) depuis un
   poste connecté.
5. **`RELEASES_TOKEN`** : vérifier qu'il s'agit d'un jeton fine-grained limité à `WeCraft-Releases`.
6. Audit de `minecraft-launcher-lib` (S11) ; découpage progressif du monofichier.

## Revue indépendante (19/10/2026) et corrections (lot 1b)

Revue faite par une autre IA, en lecture seule, sans contexte de l'écriture. Verdict : « fusionnable
après corrections ». Constats et suite donnée :

| Constat | Gravité | Suite |
|---|---|---|
| B1 fichier de réglages non UTF-8 -> plantage au démarrage (régression) | bloquant | Corrigé : lecture en octets, décodage dans le bloc qui met de côté. Test qui plantait sur l'ancien code. |
| B2 l'ancien processus validait la mise à jour en se fermant : retour arrière jamais proposé | bloquant | Corrigé : drapeau `_UPDATE_HANDED_OFF` + suivi limité à la version cible (`to == APP_VERSION`). Vérifié sur l'ancien et le nouveau code. |
| I1 transition sans signature = protection contournable | important | Corrigé : `UPDATE_SIGNATURE_REQUIRED = True` dès cette version ; la CI échoue sans clé. |
| I2 clé privée visible de toutes les étapes de la CI | important | Corrigé : secret donné à la seule étape « Signature » ; `persist-credentials: false`. |
| I3 aucune vérification clé privée / clé publique | important | Corrigé : étape « Vérification de la signature » avec la clé lue dans le code. |
| I4 `cryptography` absent de l'exe = faux message de falsification | important | Corrigé : message distinct, `--hidden-import`, auto-test `WeCraft.exe --self-test-signature` en CI. |
| I5 `os.replace` bloqué par un antivirus | important | Corrigé : 10 essais espacés de 100 ms ; `save_config` n'empêche plus de lancer en cas d'échec. |
| I6 fichier verrouillé réécrit avec des réglages vides | important | Corrigé : `SettingsUnreadable`, aucune écriture tant que le fichier ne peut pas être lu. |
| M1 `update_pending.json` mal formé -> plantage | mineur | Corrigé (types validés, contrôle dans un try). |
| M2 retour arrière limité ; double-clic ; `.echec` jamais nettoyés ; version défaillante reproposée | mineur | Corrigé en partie : double-clic < 30 s compté une fois, `.echec` nettoyés après validation, version abandonnée plus reproposée automatiquement. Reste : un exe qui ne démarre pas du tout n'est pas détecté. |
| M3 reprise d'un ancien profil nommé « WECRAFT - … » / « Mon lanceur » par l'utilisateur | mineur | Non corrigé (comportement d'origine, cas limite à la première utilisation). |
| M4 fichiers mis de côté après le démarrage non signalés | mineur | Corrigé (vérifié toutes les 3 s). |
| M5 sauvegardes contenant d'anciens jetons de connexion | mineur | Corrigé : jetons retirés des copies horodatées. |
| M7 instance hors des dossiers connus non supprimable | mineur | Voulu ; à documenter pour les utilisateurs. |
| M9 fermeture normale du launcher officiel peut-être inefficace | mineur | À vérifier sous Windows (bouton LANCER en bac à sable). |
| M11 tests faibles / manquants | mineur | Ajoutés : B1, B2, I4, I5, I6, M1, M5, double-clic. Reste : le script PowerShell n'est testé que sur son texte. |

Seconde validation (§13) : le contrôle des corrections par la coordinatrice reste à faire par le développeur
ou par une nouvelle revue.

## Essais Windows après corrections (19/10/2026, 06:02 - 06:17)

- `tools/test_windows.bat` : 50/50 tests réussis (après correction d'un test qui lisait un fichier sans
  préciser l'encodage : défaut du test, pas de WeCraft).
- Bouton LANCER en bac à sable (« Pack de test », Fabric, 1.20.1), launcher officiel ouvert au départ :
  - launcher officiel fermé sans demander de fermeture forcée (rapporté par le développeur) ;
  - Minecraft 1.20.1, `fabric-loader-0.19.5-1.20.1` et Java installés dans le bac à sable ;
  - `launcher_profiles.json` : profil « WECRAFT - Pack de test » créé (bon `gameDir`, bonne version,
    `-Xmx4G`) puis réutilisé (même identifiant) sur 3 lancements ; « WeCraft Survie (perso) » intact ;
  - `managed_profiles.json` mémorise l'identifiant ; 3 sauvegardes horodatées présentes, `.bak_wecraft` conservé ;
  - vérification faite par lecture des fichiers du bac à sable.
- Défaut trouvé : un fichier resté invalide était recopié à chaque démarrage (3 copies). Corrigé :
  pas de nouvelle copie si une copie identique existe (test ajouté, 51 tests).

Reste non vérifié : exe compilé par la CI, première release signée, fenêtres de mise à jour et de
retour arrière en conditions réelles.
