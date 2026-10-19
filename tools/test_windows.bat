@echo off
rem Tests automatiques de WeCraft sous Windows. Aucune vraie donnee n'est touchee :
rem les tests travaillent dans un dossier temporaire avec un faux .minecraft.
rem Resultat : resultats_tests.txt a la racine du dossier.
chcp 65001 >nul
cd /d "%~dp0.."
set "OUT=%CD%\resultats_tests.txt"
echo WeCraft - tests Windows> "%OUT%"
echo Date : %DATE% %TIME%>> "%OUT%"
set "PY=python"
where py >nul 2>&1 && set "PY=py -3"
%PY% --version >> "%OUT%" 2>&1 || (echo PYTHON INTROUVABLE>> "%OUT%" & goto fin)
%PY% -c "import sys, tkinter; print('tkinter', tkinter.TkVersion, sys.platform, sys.getwindowsversion().build)" >> "%OUT%" 2>&1
%PY% -c "import cryptography; print('cryptography', cryptography.__version__)" >> "%OUT%" 2>&1
%PY% -c "import minecraft_launcher_lib as m; print('minecraft_launcher_lib', getattr(m, '__version__', '?'))" >> "%OUT%" 2>&1
echo.>> "%OUT%"
%PY% -m unittest discover -s tests -v >> "%OUT%" 2>&1
echo CODE_RETOUR_TESTS=%ERRORLEVEL%>> "%OUT%"
:fin
type "%OUT%"
echo.
echo Termine. Le resultat est dans resultats_tests.txt
pause
