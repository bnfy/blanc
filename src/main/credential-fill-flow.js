'use strict';
// SPIKE (1Password fill feasibility) — remove before release.
//
// The post-consent decision sequence: choose a credential (picker if needed) and
// read it. Collaborators are injected so the security contracts — one survivor
// never decrypts, a failed focus restoration never reaches revealCredential, an
// enumeration failure never opens a picker — are asserted on CALLS rather than
// on log text.

/** Reasons where the user is demonstrably still in Blanc acting on the picker,
 * so returning focus to the page is right. Everything else may fire while Blanc
 * is in the background, where pulling it forward would be user-hostile. */
const RESTORE_ON_CANCEL = new Set(['dismissed', 'escape']);

async function chooseAndReveal({ kept, truncated, host, deps }) {
  let chosen = kept[0];

  if (kept.length > 1) {
    let rows;
    try {
      // FIRST DECRYPTION. Only reached on a page already judged fillable and
      // already consented to. A failure aborts the whole picker with a fixed
      // outcome — never a partial list, never the SDK's message.
      const revealed = await deps.revealUsernames(kept);
      rows = revealed.map((r) => ({
        username: r.username, title: r.title, host: r.host, vaultName: r.vaultName,
      }));
    } catch {
      return { outcome: 'fill-error' };
    }

    const { index, reason } = await deps.requestPick(rows, truncated, host);
    if (index === null) {
      if (RESTORE_ON_CANCEL.has(reason)) await deps.restoreTabFocus(); // best-effort, ungated
      return { outcome: 'chooser-cancel', detail: reason };
    }
    chosen = kept[index];

    // The overlay took focus. GATE on its return before any further decrypt.
    if (!(await deps.restoreTabFocus())) return { outcome: 'abort-wc-changed' };
    const aborted = deps.revalidate();
    if (aborted) return { outcome: aborted };
  }

  try {
    const credential = await deps.revealCredential(chosen);
    return { outcome: 'ok', chosen, credential };
  } catch {
    return { outcome: 'fill-error' };
  }
}

module.exports = { chooseAndReveal, RESTORE_ON_CANCEL };
