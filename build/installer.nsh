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
