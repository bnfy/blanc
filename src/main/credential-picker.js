'use strict';

function menuText(value, fallback, maximum = 120) {
  const clean = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, maximum);
}

/** Native, renderer-free item picker. The callback closes over the chosen
 * index; vault/item ids and candidate metadata never cross a renderer. */
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
      const template = rows.map((row, index) => {
        const title = menuText(row.title, 'Untitled login');
        const vault = menuText(row.vaultName, '1Password');
        return {
          label: process.platform === 'darwin' ? title : `${title} — ${vault}`,
          ...(process.platform === 'darwin' ? { sublabel: vault } : {}),
          toolTip: vault,
          click: () => { chosen = index; },
        };
      });
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

module.exports = { menuText, pickCredential };
