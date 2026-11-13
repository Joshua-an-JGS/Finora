; FINORA Custom NSIS Installer & Uninstaller Script
; Completely deletes all FINORA databases, application data, documents, and credentials on uninstallation.
; Ensures that reinstalling provides a 100% clean start with the First-Time Administrator Account Setup screen.

!include "LogicLib.nsh"

!macro customUnInstall
  ; Terminate running FINORA desktop and backend processes
  nsExec::Exec 'taskkill /F /IM FINORA.exe /T'
  nsExec::Exec 'taskkill /F /IM PaySlipStudio.Api.exe /T'

  ; Delete ProgramData\FINORA (SQLite database, backups, logs, documents)
  ReadEnvStr $R0 "ProgramData"
  ${If} $R0 != ""
    RMDir /r "$R0\FINORA"
  ${EndIf}

  ; Delete LocalAppData\FINORA (fallback database and logs)
  RMDir /r "$LOCALAPPDATA\FINORA"

  ; Delete AppData\Roaming\FINORA (Electron localStorage, session tokens, cached accounts)
  RMDir /r "$APPDATA\FINORA"
!macroend

!macro customRemoveFiles
  ReadEnvStr $R0 "ProgramData"
  ${If} $R0 != ""
    RMDir /r "$R0\FINORA"
  ${EndIf}

  RMDir /r "$LOCALAPPDATA\FINORA"
  RMDir /r "$APPDATA\FINORA"
!macroend
