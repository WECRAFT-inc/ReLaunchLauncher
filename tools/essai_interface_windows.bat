@echo off
rem Ouvre l'interface de WeCraft dans un BAC A SABLE : APPDATA et le dossier utilisateur sont
rem rediriges vers le dossier « bac_a_sable ». Vos vrais .minecraft, .wecraft, CurseForge,
rem Modrinth et Prism ne sont ni lus ni modifies.
rem ATTENTION : le bouton LANCER ferme le VRAI launcher officiel s'il est ouvert (il vous le demande
rem avant de le forcer) et telecharge Minecraft dans le bac a sable (plusieurs centaines de Mo).
chcp 65001 >nul
cd /d "%~dp0.."
set "BAC=%CD%\bac_a_sable"
set "MC=%BAC%\AppData\Roaming\.minecraft"
set "WC=%BAC%\AppData\Roaming\.wecraft"
if not exist "%MC%" mkdir "%MC%"
if not exist "%WC%\instances\Pack de test" mkdir "%WC%\instances\Pack de test"
if not exist "%MC%\launcher_profiles.json" (echo {"profiles": {"perso": {"name": "WeCraft Survie (perso)", "gameDir": "D:/MesMondes", "lastVersionId": "1.21.1"}}}> "%MC%\launcher_profiles.json")
if not exist "%WC%\instances\Pack de test\wecraft.json" (echo {"version": "1.20.1", "loader": "Fabric", "ram": "beaucoup"}> "%WC%\instances\Pack de test\wecraft.json")
rem Fichier de reglages volontairement casse : WeCraft doit le mettre de cote et prevenir.
if not exist "%WC%\instances_meta.json" (echo {"casse": > "%WC%\instances_meta.json")
set "APPDATA=%BAC%\AppData\Roaming"
set "LOCALAPPDATA=%BAC%\AppData\Local"
set "USERPROFILE=%BAC%"
set "PY=python"
where py >nul 2>&1 && set "PY=py -3"
%PY% wecraft_launcher.py --no-splash > "%CD%\resultats_interface.txt" 2>&1
echo CODE_RETOUR=%ERRORLEVEL%>> "%CD%\resultats_interface.txt"
type "%CD%\resultats_interface.txt"
pause
