'use strict';

// Keep packaging checks and early runtime enforcement on the same switch list.
const UNSAFE_SANDBOX_SWITCHES = Object.freeze([
  'no-sandbox', 'no-zygote-sandbox', 'disable-setuid-sandbox',
  'disable-gpu-sandbox', 'disable-namespace-sandbox',
  'disable-seccomp-filter-sandbox', 'disable-webnn-compiler-sandbox',
]);
const UNSAFE_EXEC_SWITCH = new RegExp(`(?:^|[\\s"'])--?(?:${UNSAFE_SANDBOX_SWITCHES.join('|')})(?=$|[\\s"'=])`);
const GUIDANCE = 'Blanc refused to start because Chromium sandboxing was disabled. Use a Linux environment that permits Chromium sandboxing and launch Blanc without sandbox-disabling options. Setup guidance: https://github.com/bnfy/blanc/blob/main/docs/linux-appimage-troubleshooting.md';

function unsafeSandboxSwitch(argv, commandLine) {
  return UNSAFE_SANDBOX_SWITCHES.find((name) => commandLine?.hasSwitch(name)
    || argv.some((argument) => new RegExp(`^--?${name}(?:=|$)`).test(argument))) ?? null;
}

function enforceLinuxSandbox({ app, dialog, platform = process.platform, argv = process.argv, report = (text) => console.error(text) }) {
  if (platform !== 'linux') return true;
  if (unsafeSandboxSwitch(argv, app.commandLine)) {
    report(GUIDANCE);
    // Linux needs readiness for the native error dialog. The caller returns
    // immediately, so no browsing surfaces or service initialization can run.
    app.whenReady().then(() => {
      try { dialog.showErrorBox('Blanc requires Chromium sandboxing', GUIDANCE); }
      finally { app.exit(1); }
    }, () => app.exit(1));
    return false;
  }
  app.enableSandbox(); // Official Electron API, before app readiness.
  return true;
}

module.exports = { UNSAFE_SANDBOX_SWITCHES, UNSAFE_EXEC_SWITCH, unsafeSandboxSwitch, enforceLinuxSandbox };
