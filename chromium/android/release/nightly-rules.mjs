// The Android nightly's rules: whether a night starts, and whether it passed. No I/O here; the
// server's nightly.mjs gathers the facts and acts on the answers.
import { releaseArgs } from './record.mjs';

// A night is never a release: this name fails versions.mjs's NAME, so no ledger, tag or upload takes it.
export const NIGHTLY_NAME = '0.0.0-nightly';
export const nightlyArgs = template => releaseArgs(template, NIGHTLY_NAME, 1);

// US Eastern wall-clock minutes since midnight.
function easternMinutes(iso) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const value = type => Number(parts.find(part => part.type === type).value);
  return value('hour') * 60 + value('minute');
}

// The desktop lane comes first on the shared server: the Windows nightly starts at 04:00 Eastern and
// skips while any Siso build runs, so an Android night starts only between midnight and 03:15.
export function skipReason({ desktopLock, sisoRunning, androidLock, startedAt, unchangedSinceLastPass, appliedUnknown }) {
  if (desktopLock) return 'the desktop checkout is locked (the desktop lane goes first)';
  if (sisoRunning) return 'a build is running on the server';
  if (androidLock) return 'the Android checkout is in use (a release build or another night)';
  if (easternMinutes(startedAt) >= 3 * 60 + 15) return 'too late: an Android night starts only before 03:15 US Eastern';
  if (unchangedSinceLastPass) return 'main is unchanged since the last passing night';
  if (appliedUnknown) return 'no record of the last applied Blanc commit (~/chromium-android/.blanc-applied-commit); a release build writes it';
  return null;
}

export function nightVerdict({ buildOk, apkSHA256, gate }) {
  return buildOk && gate?.schema === 1 && gate.verdict === 'pass' && gate.apkSHA256 === apkSHA256 ? 'pass' : 'fail';
}
