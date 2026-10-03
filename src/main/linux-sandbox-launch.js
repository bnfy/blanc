'use strict';

// Keep packaging checks and early runtime enforcement on the same switch list.
const UNSAFE_SANDBOX_SWITCHES = Object.freeze([
  'no-sandbox', 'no-zygote-sandbox', 'disable-setuid-sandbox',
  'disable-gpu-sandbox', 'disable-namespace-sandbox',
  'disable-seccomp-filter-sandbox', 'disable-webnn-compiler-sandbox',
]);
const UNSAFE_EXEC_SWITCH = new RegExp(`(?:^|[\\s"'])--?(?:${UNSAFE_SANDBOX_SWITCHES.join('|')})(?=$|[\\s"'=])`);
const SETUP_GUIDE_URL = 'https://github.com/bnfy/blanc/blob/main/docs/linux-appimage-troubleshooting.md';
const REFUSAL = 'Blanc refused to start because Chromium sandboxing was disabled. Use a Linux environment that permits Chromium sandboxing and launch Blanc without sandbox-disabling options.';
const GUIDANCE = `${REFUSAL} Setup guidance: ${SETUP_GUIDE_URL}`;
const OPEN_GUIDE = 'Open Setup Guide';
const COPY_LINK = 'Copy Link';
const QUIT = 'Quit';

function unsafeSandboxSwitch(argv, commandLine) {
  return UNSAFE_SANDBOX_SWITCHES.find((name) => commandLine?.hasSwitch(name)
    || argv.some((argument) => new RegExp(`^--?${name}(?:=|$)`).test(argument))) ?? null;
}

// Wayland compositors such as GNOME accept clipboard writes only from the
// focused client. A refused launch has no window of its own (the GTK dialog is
// a separate client), so a copy would silently fail; offer it on X11 only.
function canCopyLink(env) {
  return !env.WAYLAND_DISPLAY && env.XDG_SESSION_TYPE !== 'wayland';
}

// Native dialogs cannot render links, so the guide is offered as buttons.
async function offerSetupGuide({ dialog, shell, clipboard, argv, env }) {
  const copyable = canCopyLink(env);
  // When Blanc is the default browser, opening the guide relaunches this same
  // refused build with the guide's URL; that launch never offers to open it.
  const relaunchedForGuide = argv.includes(SETUP_GUIDE_URL);
  const buttons = [...(relaunchedForGuide ? [] : [OPEN_GUIDE]), ...(copyable ? [COPY_LINK] : []), QUIT];
  const elsewhere = copyable ? 'Copy the link and open it in another browser.' : 'Open this address in another browser.';
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'Blanc',
    message: 'Blanc requires Chromium sandboxing',
    detail: relaunchedForGuide
      ? `${REFUSAL}\n\nBlanc can't open the setup guide itself while it can't start. ${elsewhere}\n\n${SETUP_GUIDE_URL}`
      : `${REFUSAL}\n\nSetup guide: ${SETUP_GUIDE_URL}`,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });
  const choice = buttons[response];
  // On Linux, openExternal resolves even when xdg-open is missing or fails, so
  // Blanc cannot detect a failed open; the dialog has already shown the URL.
  if (choice === OPEN_GUIDE) return shell.openExternal(SETUP_GUIDE_URL);
  if (choice !== COPY_LINK) return;
  clipboard.writeText(SETUP_GUIDE_URL);
  // Keep running until the user has pasted: on X11 the copied text disappears
  // when its owning process exits.
  await dialog.showMessageBox({
    type: 'info',
    title: 'Blanc',
    message: 'Setup guide link copied',
    detail: 'Paste it into another browser, then choose Quit.',
    buttons: [QUIT],
  });
}

function enforceLinuxSandbox({ app, dialog, shell, clipboard, platform = process.platform, argv = process.argv, env = process.env, report = (text) => console.error(text) }) {
  if (platform !== 'linux') return true;
  if (unsafeSandboxSwitch(argv, app.commandLine)) {
    report(GUIDANCE);
    // Linux needs readiness for native dialogs. The caller returns
    // immediately, so no browsing surfaces or service initialization can run.
    app.whenReady()
      .then(() => offerSetupGuide({ dialog, shell, clipboard, argv, env }))
      .catch(() => {})
      .finally(() => app.exit(1));
    return false;
  }
  app.enableSandbox(); // Official Electron API, before app readiness.
  return true;
}

module.exports = { UNSAFE_SANDBOX_SWITCHES, UNSAFE_EXEC_SWITCH, SETUP_GUIDE_URL, unsafeSandboxSwitch, enforceLinuxSandbox };
