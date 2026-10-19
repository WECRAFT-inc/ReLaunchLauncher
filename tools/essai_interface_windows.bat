@echo off
rem Ouvre l'interface de WeCraft dans un BAC A SABLE : APPDATA et le dossier utilisateur sont
rem rediriges vers le dossier « bac_a_sable ». Vos vrais .minecraft, .wecraft, CurseForge,
rem Modrinth et Prism ne sont ni lus ni modifies.
rem ATTENTION : le bouton LANCER ferme le VRAI launcher officiel s'il est ouvert (il vous le demande
rem avant de le forcer) et telecharge Minecraft dans le bac a sable (plusieurs centaines de Mo).
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
set "LOG=%CD%\resultats_interface.txt"
echo WeCraft - essai de l'interface> "%LOG%"

rem 1) AVANT toute redirection (sinon le gestionnaire Python de Windows, qui range ses installations dans
rem LOCALAPPDATA, ne trouve plus votre Python et en installe un nouveau dans le bac a sable) : quel Python, et ou sont ses bibliotheques ?
set "PY=python"
where py >nul 2>&1 && set "PY=py -3"
set "PYEXE="
for /f "usebackq delims=" %%i in (`%PY% -c "import sys; print(sys.executable)"`) do set "PYEXE=%%i"
if not defined PYEXE (echo PYTHON INTROUVABLE>> "%LOG%" & goto fin)
set "PYPATHS="
for /f "usebackq delims=" %%i in (`call "%PYEXE%" -c "import site, os; print(os.pathsep.join([site.getusersitepackages()] + site.getsitepackages()))"`) do set "PYPATHS=%%i"
>> "%LOG%" echo Python : %PYEXE%
>> "%LOG%" echo Bibliotheques : %PYPATHS%

"%PYEXE%" -c "import minecraft_launcher_lib" >nul 2>&1
if errorlevel 1 (
  echo.
  echo La bibliotheque minecraft-launcher-lib, necessaire a WeCraft, n'est pas installee.
  choice /c ON /m "L'installer maintenant depuis PyPI (site officiel des paquets Python)"
  if errorlevel 2 (>> "%LOG%" echo minecraft-launcher-lib absent, installation refusee& goto fin)
  "%PYEXE%" -m pip install minecraft-launcher-lib >> "%LOG%" 2>&1
  "%PYEXE%" -c "import minecraft_launcher_lib" >nul 2>&1 || (>> "%LOG%" echo Installation echouee& goto fin)
)

rem 2) Bac a sable
set "BAC=%CD%\bac_a_sable"
set "MC=%BAC%\AppData\Roaming\.minecraft"
set "WC=%BAC%\AppData\Roaming\.wecraft"
if not exist "%MC%" mkdir "%MC%"
if not exist "%WC%\instances\Pack de test" mkdir "%WC%\instances\Pack de test"
if not exist "%MC%\launcher_profiles.json" (echo {"profiles": {"perso": {"name": "WeCraft Survie (perso)", "gameDir": "D:/MesMondes", "lastVersionId": "1.21.1"}}}> "%MC%\launcher_profiles.json")
if not exist "%WC%\instances\Pack de test\wecraft.json" (echo {"version": "1.20.1", "loader": "Fabric", "ram": "beaucoup"}> "%WC%\instances\Pack de test\wecraft.json")
rem Fichier de reglages volontairement casse : WeCraft doit le mettre de cote et prevenir.
if not exist "%WC%\instances_meta.json" (echo {"casse": > "%WC%\instances_meta.json")

rem 3) Redirection puis lancement avec le MEME Python et ses bibliotheques
set "PYTHONPATH=%PYPATHS%"
set "PYTHONNOUSERSITE=1"
set "APPDATA=%BAC%\AppData\Roaming"
set "LOCALAPPDATA=%BAC%\AppData\Local"
set "USERPROFILE=%BAC%"
"%PYEXE%" wecraft_launcher.py --no-splash >> "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo CODE_RETOUR=%RC%
:fin
type "%LOG%"
pause
