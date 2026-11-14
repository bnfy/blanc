// /download's segmented control (redesign of 2026-11-14). The radios switch the
// panels in CSS, so the page works without scripting (Mac is checked in the
// markup); this only preselects the visitor's own system. iPadOS asks for
// desktop sites with a Mac user agent, so touch decides it is an iPad. Nothing
// is stored or sent. Android preselects the Android tab, which leads only to
// the beta signup until Blanc for Android is released.

export function detectSystem(userAgent, maxTouchPoints = 0) {
  if (/Windows/i.test(userAgent)) return 'win';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iphone';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return maxTouchPoints > 1 ? 'iphone' : 'mac';
  if (/Linux/i.test(userAgent)) return 'linux';
  return null;
}

export function initDownloadSwitcher(view = window) {
  const chooser = view.document.querySelector('[data-download-chooser]');
  if (!chooser) return null;
  const system = detectSystem(view.navigator.userAgent, view.navigator.maxTouchPoints);
  const radio = system && chooser.querySelector(`input[name="dl-os"][value="${system}"]`);
  if (radio) radio.checked = true;
  return system;
}
