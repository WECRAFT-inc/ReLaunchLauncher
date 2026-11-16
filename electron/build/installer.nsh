; ReLaunch - personnalisation de l'installeur (electron-builder, NSIS).
;
; Pendant la transition, la version Python installe CET installeur à la place de son WeCraft.exe
; (mise à jour signée Ed25519). Les raccourcis et épingles existants pointent donc vers l'installeur.
; Pour qu'ils restent utilisables, l'installeur ne réinstalle pas une version déjà présente :
; si la même version (ou une plus récente) est installée pour cet utilisateur, il la lance et s'arrête.
; Les mises à jour lancées par ReLaunch passent /reinstall : elles s'installent toujours (rc, retour arrière).
; Une version plus ancienne est mise à jour normalement. Les réglages (%APPDATA%\.wecraft) ne sont
; jamais touchés, ni ici ni par la désinstallation (deleteAppDataOnUninstall: false).

!include WordFunc.nsh
!include FileFunc.nsh
!include LogicLib.nsh

!macro customInit
  ; Option de ligne de commande /reinstall : force l'installation (dépannage).
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/reinstall" $R1
  ${IfNot} ${Errors}
    Goto wecraft_install
  ${EndIf}

  ReadRegStr $R2 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $R3 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R2 == ""
  ${OrIf} $R3 == ""
    Goto wecraft_install
  ${EndIf}
  ${IfNot} ${FileExists} "$R3\${APP_EXECUTABLE_FILENAME}"
    Goto wecraft_install
  ${EndIf}

  ; Exactement la même version : simple lancement.
  ${If} $R2 == "${VERSION}"
    Goto wecraft_present
  ${EndIf}
  ; VersionCompare ne lit que les nombres : « 2.0.27-rc1 » et « 2.0.27-rc5 » lui semblent égaux (0).
  ; Seule une version installée plus récente sur les nombres (1) évite l'installation ; toute autre version
  ; différente (plus ancienne, ou même numéro avec un autre suffixe -rcN) est installée.
  ; 0 = mêmes nombres, 1 = installée plus récente, 2 = installée plus ancienne
  ${VersionCompare} "$R2" "${VERSION}" $R4
  ${If} $R4 != 1
    Goto wecraft_install
  ${EndIf}

  wecraft_present:
  ; Déjà installée (même version ou plus récente) : simple lancement, aucune écriture.
  ${IfNot} ${Silent}
    Exec '"$R3\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
  SetErrorLevel 0
  Quit

  wecraft_install:
!macroend
