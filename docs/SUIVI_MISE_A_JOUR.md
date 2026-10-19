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

`python -m unittest discover -s tests -v` : 40 tests, bac à sable temporaire, `minecraft_launcher_lib`
toujours remplacé par un substitut (aucun vrai `.minecraft` n'est touché).
Contrôle : les mêmes tests lancés sur le code d'origine échouent sur les comportements corrigés et
passent sur les comportements à préserver.

**Windows (PC du développeur, Windows 11 build 26200, Python 3.14.8, 19/10/2026) :**
- `tools/test_windows.bat` : 40/40 tests réussis (dont signature, `cryptography` 50.0.2), code retour 0.
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
3. **Clé de signature** : la générer (`tools/sign_release.py generate`), mettre la clé publique dans
   `UPDATE_PUBLIC_KEY`, la clé privée en secret `UPDATE_SIGNING_KEY`. Passer `UPDATE_SIGNATURE_REQUIRED`
   à `True` une version plus tard.
4. **Épinglage** des actions GitHub (SHA) et des dépendances (`pip-compile --generate-hashes`) depuis un
   poste connecté.
5. **`RELEASES_TOKEN`** : vérifier qu'il s'agit d'un jeton fine-grained limité à `WeCraft-Releases`.
6. Audit de `minecraft-launcher-lib` (S11) ; découpage progressif du monofichier.
