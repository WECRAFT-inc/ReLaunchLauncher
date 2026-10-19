@echo off
rem Compilation locale (test) : donne dist\WeCraft.exe
rem Proche de la CI (memes dependances, --noupx) ; la CI recompile en plus le bootloader de PyInstaller
rem et ajoute les informations de version : l'exe local n'est donc pas identique a celui des releases.
python -m pip install -r requirements-build.txt pyinstaller || goto :erreur
python -m unittest discover -s tests || goto :erreur
if not exist fonts mkdir fonts
pyinstaller --onefile --windowed --noupx --icon assets/wecraft.ico --name WeCraft --add-data "assets;assets" --add-data "fonts;fonts" wecraft_launcher.py || goto :erreur
pause
exit /b 0
:erreur
echo Echec : voir les messages ci-dessus.
pause
exit /b 1
