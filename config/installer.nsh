!macro customInstall
  ${if} ${FileExists} "$INSTDIR\Komorebi.ico"
    ${if} "$newStartMenuLink" != ""
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\Komorebi.ico" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${endIf}

    ${if} "$newDesktopLink" != ""
    ${andIfNot} ${isNoDesktopShortcut}
      CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\Komorebi.ico" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endIf}
  ${endIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
