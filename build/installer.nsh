; FINORA Custom NSIS Installer & Uninstaller Script
; Protects all user data, databases, documents, and company configurations during updates and uninstallation.

!include "LogicLib.nsh"

!macro customUnInstall
  ; Terminate running FINORA desktop and backend processes safely
  nsExec::Exec 'taskkill /F /IM FINORA.exe /T'
  nsExec::Exec 'taskkill /F /IM PaySlipStudio.Api.exe /T'
!macroend
