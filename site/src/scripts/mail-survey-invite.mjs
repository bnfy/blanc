// The Mail page's survey invitation card (components/MailSurveyInvite.astro)
// and the survey's preselection from its link. The card's only memory is one
// localStorage entry in the visitor's own browser, which the privacy page's
// #mail-survey section discloses; it never leaves the device.

export const INVITE_KEY = 'blanc-mail-survey-invite-v1';
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const ANSWERED = Object.freeze({ answered: true });
// The survey Worker's account ids (cloudflare/mail-survey-worker/src/survey.js);
// test/unit/mail-survey-invite.test.js keeps the two equal.
export const ACCOUNT_IDS = Object.freeze(['gmail', 'proton', 'both', 'other']);

export function shouldShow(state, now) {
  if (state?.answered === true) return false;
  const until = state?.snoozedUntil;
  return !(typeof until === 'number' && until > now);
}

export function snooze(now) {
  return { snoozedUntil: now + SNOOZE_MS };
}

// Reading localStorage itself throws in some browsers when site storage is
// blocked, so callers get it through here; null then just shows the card.
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readState(storage) {
  try {
    const value = JSON.parse(storage.getItem(INVITE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeState(storage, state) {
  try {
    storage.setItem(INVITE_KEY, JSON.stringify(state));
  } catch {
    // Best effort: blocked storage just means the card may show again.
  }
}

export function accountFromQuery(search) {
  const id = new URLSearchParams(search).get('account');
  return ACCOUNT_IDS.includes(id) ? id : null;
}

// True when two boxes (DOMRect-like) share any area. An empty box (a hidden
// form) never overlaps anything.
export function overlaps(a, b) {
  if (a.right <= a.left || a.bottom <= a.top) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
