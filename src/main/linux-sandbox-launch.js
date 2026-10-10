'use strict';

// Keep packaging checks and early runtime enforcement on the same switch list.
const UNSAFE_SANDBOX_SWITCHES = Object.freeze([
  'no-sandbox', 'no-zygote-sandbox', 'disable-setuid-sandbox',
  'disable-gpu-sandbox', 'disable-namespace-sandbox',
  'disable-seccomp-filter-sandbox', 'disable-webnn-compiler-sandbox',
]);
const UNSAFE_EXEC_SWITCH = new RegExp(`(?:^|[\\s"'])--?(?:${UNSAFE_SANDBOX_SWITCHES.join('|')})(?=$|[\\s"'=])`);
const SETUP_GUIDE_URL = 'https://github.com/bnfy/blanc/blob/main/docs/linux-appimage-troubleshooting.md';
// This check runs first in main.js, before settings load and the profile path
// is final, so the interface language cannot be known: the refusal is always
// English, from the catalog.
const { createTranslator } = require('../renderer/pages/i18n.js');
const t = createTranslator({ locale: 'en', messages: require('../renderer/pages/strings.en.js').messages });
const REFUSAL = t('linuxSandbox.refusal');
const GUIDANCE = `${REFUSAL} Setup guidance: ${SETUP_GUIDE_URL}`;
const OPEN_GUIDE = t('linuxSandbox.openGuide');
const COPY_LINK = t('linuxSandbox.copyLink');
const QUIT = t('linuxSandbox.quit');

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
  const params = { refusal: REFUSAL, url: SETUP_GUIDE_URL };
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'Blanc',
    message: t('linuxSandbox.message'),
    detail: !relaunchedForGuide ? t('linuxSandbox.detail', params)
      : t(copyable ? 'linuxSandbox.detailCopy' : 'linuxSandbox.detailOpenElsewhere', params),
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
    message: t('linuxSandbox.copied.message'),
    detail: t('linuxSandbox.copied.detail'),
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
