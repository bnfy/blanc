# Blanc's one-window/many-WebContentsView architecture can leave an old
# renderer or GPU process alive a little longer than electron-builder's
# default NSIS close loop allows. Retry used to work because it simply gave
# that process another loop. An updater starts NSIS before electron-updater
# asks the running app to quit, so an update must first wait for that normal
# handoff instead of racing it with an immediate kill. Keep the exact-path
# process checks and bounded kill fallback supplied by electron-builder.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  !insertmacro IS_POWERSHELL_AVAILABLE
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      # electron-updater has launched this installer and will now ask Blanc to
      # quit. Poll first: killing the app while its own before-quit handlers
      # tear down Chromium caused the v1.4.0 -> v1.5.0 crash dialog.
      StrCpy $R1 0

    blancGracefulUpdateQuitLoop:
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 != 0
        Goto blancProcessClosed
      ${endIf}

      IntOp $R1 $R1 + 1
      Sleep 250
      # Two seconds covers the old 1.4.0 app.exit backstop without waiting
      # long enough for Windows to present its own not-responding dialog.
      ${if} $R1 < 8
        Goto blancGracefulUpdateQuitLoop
      ${endIf}
    ${else}
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK blancStopProcess
        Quit
      ${else}
        Goto blancProcessClosed
      ${endIf}
    ${endIf}

    # A stuck/crashed process still gets the existing bounded kill recovery.
    blancStopProcess:
      DetailPrint "$(appClosing)"
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      Sleep 500
      StrCpy $R1 0

    blancCloseLoop:
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 != 0
        Goto blancProcessClosed
      ${endIf}

      IntOp $R1 $R1 + 1
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
      Sleep 1000

      # Fifteen automatic retries cover slow Chromium teardown and the
      # observed case where the stock installer's first manual Retry worked.
      ${if} $R1 < 15
        Goto blancCloseLoop
      ${endIf}

      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY blancStopProcess
      Quit

    blancProcessClosed:
  ${endIf}
!macroend

# Windows only offers an app as a *browser* (Settings > Apps > Default apps,
# and the http/https choosers) when it is registered under the Default
# Programs contract: a RegisteredApplications pointer to a Capabilities key
# that claims the http/https URL and .htm/.html file associations through a
# ProgId, plus a StartMenuInternet client entry. Electron's
# setAsDefaultProtocolClient only writes a bare protocol handler, which
# Windows 10+ ignores for http, so without these keys Blanc never appears in
# the chooser at all. SHELL_CONTEXT follows the per-user/per-machine install
# mode that electron-builder's multiUser init already selected, for both the
# installer and the uninstaller.
!define BLANC_CLIENT_KEY "Software\Clients\StartMenuInternet\${PRODUCT_NAME}"
!define BLANC_HTML_PROGID "BlancHTML"

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}" "" "Blanc HTML Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}" "FriendlyTypeName" "Blanc HTML Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}\Application" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}\Application" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}" "" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities" "ApplicationDescription" "Blanc Browser"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\StartMenu" "StartMenuInternet" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\URLAssociations" "http" "${BLANC_HTML_PROGID}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\URLAssociations" "https" "${BLANC_HTML_PROGID}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\FileAssociations" ".htm" "${BLANC_HTML_PROGID}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\FileAssociations" ".html" "${BLANC_HTML_PROGID}"
  WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\FileAssociations" ".xhtml" "${BLANC_HTML_PROGID}"
  WriteRegDWORD SHELL_CONTEXT "${BLANC_CLIENT_KEY}\InstallInfo" "IconsVisible" 1

  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}" "${BLANC_CLIENT_KEY}\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey SHELL_CONTEXT "${BLANC_CLIENT_KEY}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}"
!macroend
