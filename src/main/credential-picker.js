'use strict';

function menuText(value, fallback, maximum = 120) {
  // Strip native-menu controls plus Unicode direction/line controls that can
  // visually reorder or split a credential label supplied by a vault item.
  const clean = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, maximum);
}

function credentialMenuLabels(row, platform = process.platform) {
  const title = menuText(row.title, 'Untitled login');
  const vault = menuText(row.vaultName, '1Password');
  const username = menuText(row.username, '', 160);
  const titleIsUsername = username
    && title.localeCompare(username, undefined, { sensitivity: 'accent' }) === 0;
  const context = titleIsUsername ? vault : `${title} · ${vault}`;
  if (!username) {
    return {
      label: platform === 'darwin' ? title : `${title} — ${vault}`,
      ...(platform === 'darwin' ? { sublabel: vault } : {}),
      toolTip: `${title} — ${vault}`,
    };
  }
  return {
    label: platform === 'darwin' ? username : `${username} — ${context}`,
    ...(platform === 'darwin' ? { sublabel: context } : {}),
    toolTip: `${username} — ${context}`,
  };
}

/** The picker closed without a choice because Blanc's window lost focus
 * (a native menu closes with its window's focus), not because the user
 * dismissed it. */
const PICKER_FOCUS_LOST = 'focus-lost';

// On Windows the menu can close before Blanc's window reports losing focus
// (#739), so a close without a choice waits this long for a blur before it
// counts as a cancel.
const FOCUS_SETTLE_MS = 150;

/** Native, renderer-free item picker. The callback closes over the chosen
 * index; usernames, vault/item ids, and candidate metadata never cross a
 * renderer. Resolves the chosen index, null for a cancel, or
 * PICKER_FOCUS_LOST. */
function pickCredential({ Menu, window, rows, point = {}, focusSettleMs = FOCUS_SETTLE_MS }) {
  if (!Array.isArray(rows) || rows.length < 2) return Promise.resolve(rows.length ? 0 : null);
  return new Promise((resolve, reject) => {
    let chosen = null;
    let settled = false;
    // True only for a live window that has lost focus; a destroyed window
    // (whose methods throw) counts as a cancel.
    const lostFocus = () => {
      try { return !window?.isDestroyed?.() && window?.isFocused?.() === false; } catch { return false; }
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      // Esc or a click inside Blanc closes the menu with the window still
      // focused; another app taking focus (1Password's approval dialog
      // closing, #693) closes it too, and that is not an answer.
      if (chosen !== null) return resolve(chosen);
      if (lostFocus()) return resolve(PICKER_FOCUS_LOST);
      if (typeof window?.once !== 'function') return resolve(null);
      const onBlur = () => { clearTimeout(timer); resolve(PICKER_FOCUS_LOST); };
      const timer = setTimeout(() => {
        window.removeListener?.('blur', onBlur);
        resolve(lostFocus() ? PICKER_FOCUS_LOST : null);
      }, focusSettleMs);
      window.once('blur', onBlur);
    };
    try {
      const template = rows.map((row, index) => ({
        ...credentialMenuLabels(row),
        click: () => { chosen = index; },
      }));
      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window,
        x: Math.max(0, Math.round(Number(point.x) || 0)),
        y: Math.max(0, Math.round(Number(point.y) || 0)),
        callback: settle,
      });
    } catch (error) {
      settled = true;
      reject(error);
    }
  });
}

module.exports = { menuText, credentialMenuLabels, pickCredential, PICKER_FOCUS_LOST };
