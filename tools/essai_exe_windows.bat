@echo off
rem Essai de l'EXE compile (WeCraft.exe place a la racine de ce dossier) dans le BAC A SABLE :
rem APPDATA et le dossier utilisateur sont rediriges vers « bac_a_sable ». Vos vrais .minecraft,
rem .wecraft, CurseForge, Modrinth et Prism ne sont ni lus ni modifies.
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
set "LOG=%CD%\resultats_exe.txt"
echo WeCraft - essai de l'exe> "%LOG%"
if not exist "WeCraft.exe" (echo WeCraft.exe absent de ce dossier>> "%LOG%" & goto fin)
set "BAC=%CD%\bac_a_sable"
set "APPDATA=%BAC%\AppData\Roaming"
set "LOCALAPPDATA=%BAC%\AppData\Local"
set "USERPROFILE=%BAC%"
if not exist "%APPDATA%" mkdir "%APPDATA%"

rem 1) Le module de verification des signatures est-il dans l'exe ?
start "" /wait "WeCraft.exe" --self-test-signature
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo AUTO_TEST_SIGNATURE=%RC%  (0 = module present et cle publique integree)

rem 2) Ouverture normale de l'exe (fermez-le quand vous avez regarde)
start "" /wait "WeCraft.exe"
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo CODE_RETOUR_EXE=%RC%
if exist "%APPDATA%\.wecraft\update.log" (>> "%LOG%" echo --- update.log --- & type "%APPDATA%\.wecraft\update.log" >> "%LOG%")
:fin
type "%LOG%"
pause
