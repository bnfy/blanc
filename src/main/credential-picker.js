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

/** Native, renderer-free item picker. The callback closes over the chosen
 * index; usernames, vault/item ids, and candidate metadata never cross a
 * renderer. */
function pickCredential({ Menu, window, rows, point = {} }) {
  if (!Array.isArray(rows) || rows.length < 2) return Promise.resolve(rows.length ? 0 : null);
  return new Promise((resolve, reject) => {
    let chosen = null;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve(chosen);
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

module.exports = { menuText, credentialMenuLabels, pickCredential };
