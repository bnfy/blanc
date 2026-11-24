// The verdict on the online installer's taskbar icon, from what
// chromium/windows/installer-window-icon.ps1 read off the install window:
// its ICON_BIG, compared pixel for pixel with its own IDI_APP at that size.
// Chromium's badged icon (the logo at 3/4 size plus IDI_INSTALLER_BADGE)
// differs from it on most pixels; the plain app icon is the same image.
export const MAX_MEAN_DIFFERENCE = 1;

export function iconVerdict(probe) {
  if (!probe?.seen) return {ok: false, reason: 'the install window never showed its logo, so its taskbar icon was not read'};
  if (!Number.isFinite(probe.size) || !Number.isFinite(probe.meanDifference))
    return {ok: false, reason: 'the probe did not report the icon\'s size and difference'};
  return probe.meanDifference <= MAX_MEAN_DIFFERENCE
    ? {ok: true, reason: `the taskbar icon is the window's own app icon (${probe.size} px)`}
    : {ok: false, reason: `the taskbar icon differs from the app icon (mean difference ${probe.meanDifference} per channel, ${probe.size} px)`};
}
