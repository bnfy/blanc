# Blanc's one-window/many-WebContentsView architecture can leave an old
# renderer or GPU process alive a little longer than electron-builder's
# default NSIS close loop allows. Retry used to work because it simply gave
# that process another loop. Keep the exact-path process checks and kill
# implementation supplied by electron-builder, but make the bounded retry
# automatic so an update does not strand users at a misleading dialog.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  !insertmacro IS_POWERSHELL_AVAILABLE
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${ifNot} ${isUpdated}
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK blancStopProcess
        Quit
      ${else}
        Goto blancProcessClosed
      ${endIf}
    ${endIf}

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
