@echo off
rem ============================================================================================
rem  ReLaunch (version Electron) - essai en BAC A SABLE
rem
rem  Lance ReLaunch installe avec un dossier de reglages SEPARE : %APPDATA% est redirige vers
rem  "bac_a_sable\AppData\Roaming" a cote de ce script. Vos vrais reglages (%APPDATA%\.wecraft)
rem  ne sont ni lus ni modifies, sauf option /copier qui en fait une COPIE dans le bac a sable.
rem
rem  Options (une seule a la fois) :
rem    /copier   copie vos vrais launcher_config.json et instances_meta.json dans le bac a sable
rem              (seulement s'ils n'y sont pas deja ; les originaux ne sont jamais modifies)
rem    /casse    remplace le launcher_config.json DU BAC A SABLE par un fichier abime, pour verifier
rem              qu'il est mis de cote (copie .invalide-...) et signale au demarrage
rem
rem  Note : Electron range son cache technique dans le vrai %APPDATA%\ReLaunch (ce n'est pas un
rem  reglage WeCraft).
rem ============================================================================================
setlocal
chcp 65001 >nul
set "EXE=%LOCALAPPDATA%\Programs\ReLaunch\ReLaunch.exe"
set "BAC=%~dp0bac_a_sable"
set "REAL=%APPDATA%\.wecraft"

if exist "%EXE%" goto installe
echo ReLaunch n'est pas installe sur ce PC : lancez d'abord ReLaunch-Setup.exe.
pause
exit /b 1

:installe
rem Si ReLaunch est deja ouvert, un second lancement ouvrirait la fenetre existante,
rem qui utilise VOS VRAIS reglages : on refuse.
powershell -NoProfile -NonInteractive -Command "if (Get-Process -Name ReLaunch -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:EXE }) { exit 1 } else { exit 0 }"
if not errorlevel 1 goto libre
echo ReLaunch est deja ouvert : fermez-le avant l'essai en bac a sable.
pause
exit /b 1

:libre
set "APPDATA=%BAC%\AppData\Roaming"
set "CFG=%APPDATA%\.wecraft"
if not exist "%CFG%" mkdir "%CFG%"

if /i "%~1"=="/copier" goto copier
if /i "%~1"=="/casse" goto casse
goto lancer

:copier
for %%F in (launcher_config.json instances_meta.json) do (
  if exist "%REAL%\%%F" if not exist "%CFG%\%%F" copy /y "%REAL%\%%F" "%CFG%\%%F" >nul && echo Copie dans le bac a sable : %%F
)
goto lancer

:casse
> "%CFG%\launcher_config.json" echo {"theme": "glace", "fichier": "abime volontairement"
echo launcher_config.json du bac a sable remplace par un fichier abime.
goto lancer

:lancer
echo.
echo Reglages utilises pour cet essai : %CFG%
echo Vos vrais reglages ne sont pas touches : %REAL%
echo.
start "" "%EXE%"
endlocal
