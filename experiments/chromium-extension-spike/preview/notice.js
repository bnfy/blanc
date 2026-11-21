'use strict';
(() => {
  if (location.origin !== 'chrome://blanc-prototype') return;
  document.addEventListener('DOMContentLoaded', () => {
    const marker = document.querySelector('meta[name="blanc-preview-build"]');
    if (!marker) return;
    let info;
    try { info = JSON.parse(marker.content); } catch { return; }
    const statusUrl = 'https://github.com/bnfy/blanc/pull/1028';
    const supportUrl = 'mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview';
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(info.version) ||
        !['not-released', 'withdrawn'].includes(info.status) ||
        info.statusUrl !== statusUrl || info.supportUrl !== supportUrl ||
        !/^(?:[a-f0-9]{40}|development)$/.test(info.revision)) return;
    const dialog = document.getElementById('previewNotice');
    const trigger = document.getElementById('previewNoticeButton');
    if (trigger && dialog) {
      trigger.textContent = `Preview ${info.version} · Version & security`;
      trigger.hidden = false;
      for (const el of dialog.querySelectorAll('[data-preview-field]')) {
        const key = el.dataset.previewField;
        el.textContent = key === 'revision' ? info.revision.slice(0, 12) : String(info[key] ?? '');
      }
      const status = document.getElementById('previewNoticeStatus');
      status.textContent = info.status === 'withdrawn'
        ? 'Withdrawn — quit this preview and use shipping Blanc'
        : 'Not released — evaluation only';
      dialog.dataset.status = info.status;
      document.getElementById('previewLiveStatus').href = statusUrl;
      document.getElementById('previewSupport').href = supportUrl;
      trigger.addEventListener('click', () => { dialog.setAttribute('aria-modal', 'true'); dialog.showModal(); });
      document.getElementById('previewNoticeClose').addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { dialog.removeAttribute('aria-modal'); trigger.focus(); });
    }
    const island = document.getElementById('previewStatusLink');
    if (island) {
      island.textContent = `Preview ${info.version} · Security & updates ↗`;
      island.hidden = false;
      island.addEventListener('click', async () => {
        await window.browserAPI.createTab(statusUrl);
        await window.browserAPI.closeOverlay();
      });
    }
  });
})();
