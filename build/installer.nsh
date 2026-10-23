; IBRA CROM - register as a Windows browser (Default Apps)
; Developed by Ibrahim Al-Khazraji
!macro customInstall
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM" "" "IBRA CROM"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\DefaultIcon" "" "$INSTDIR\IBRA CROM.exe,0"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\shell\open\command" "" '"$INSTDIR\IBRA CROM.exe"'
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities" "ApplicationName" "IBRA CROM"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities" "ApplicationIcon" "$INSTDIR\IBRA CROM.exe,0"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities" "ApplicationDescription" "IBRA CROM web browser - Developed by Ibrahim Al-Khazraji"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities\URLAssociations" "http" "IbraCromURL"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities\URLAssociations" "https" "IbraCromURL"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities\FileAssociations" ".htm" "IbraCromHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities\FileAssociations" ".html" "IbraCromHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities\FileAssociations" ".pdf" "IbraCromHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities\StartMenu" "StartMenuInternet" "IBRA CROM"
  WriteRegStr SHCTX "Software\RegisteredApplications" "IBRA CROM" "Software\Clients\StartMenuInternet\IBRA CROM\Capabilities"

  WriteRegStr SHCTX "Software\Classes\IbraCromURL" "" "IBRA CROM URL"
  WriteRegStr SHCTX "Software\Classes\IbraCromURL" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\IbraCromURL\DefaultIcon" "" "$INSTDIR\IBRA CROM.exe,0"
  WriteRegStr SHCTX "Software\Classes\IbraCromURL\shell\open\command" "" '"$INSTDIR\IBRA CROM.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\IbraCromHTML" "" "IBRA CROM HTML Document"
  WriteRegStr SHCTX "Software\Classes\IbraCromHTML\DefaultIcon" "" "$INSTDIR\IBRA CROM.exe,0"
  WriteRegStr SHCTX "Software\Classes\IbraCromHTML\shell\open\command" "" '"$INSTDIR\IBRA CROM.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Clients\StartMenuInternet\IBRA CROM"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "IBRA CROM"
  DeleteRegKey SHCTX "Software\Classes\IbraCromURL"
  DeleteRegKey SHCTX "Software\Classes\IbraCromHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
