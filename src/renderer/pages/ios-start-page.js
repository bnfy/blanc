// Loaded only by the native iOS bridge; the desktop keeps its own controls.
(() => {
  window.addEventListener('scroll', () => window.dispatchEvent(new Event('resize')), { passive: true });

  const clockRow = document.querySelector('.bb-clock-row');
  new ResizeObserver(() => {
    document.body.style.setProperty('--mobile-clock-height', `${clockRow.getBoundingClientRect().height}px`);
    document.body.style.setProperty('--mobile-clock-half-height', `${clockRow.getBoundingClientRect().height / 2}px`);
  }).observe(clockRow);

  // The preview uses the real clock, so remeasure its canvas after the
  // editor changes the available type size, including on dismissal.
  for (const id of ['clockPopover', 'customizePopover']) {
    document.getElementById(id).addEventListener('toggle', () => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  // iOS has no blocked-request counters yet. Show the real setting instead
  // of presenting the desktop bridge's empty statistics as measured data.
  async function refreshProtection() {
    try {
      const data = await window.bowserPages.start.data();
      const enabled = data.mobileAdblockEnabled === true;
      document.getElementById('bbBlocked').textContent = '';
      document.querySelector('.shelf-card-blocked .shelf-label').textContent = 'Browser protection';
      document.getElementById('shBlocked').textContent = enabled ? 'On' : 'Off';
      document.getElementById('shBlockedUnit').textContent = 'Ad blocking';
      document.querySelector('.tally-right .ledger-label').textContent = 'Browser protection';
      document.getElementById('tlCount').textContent = enabled ? 'On' : 'Off';
      document.getElementById('tlCaption').textContent = 'Blocking statistics are not available on iOS yet.';
    } catch { /* Keep the page usable if it is closing during a bridge call. */ }
  }
  // Start Page pins remain desktop-only; Favorites use the shared live store.
  refreshProtection();
  // The desktop renderer refreshes these nodes when a layout changes.
  new MutationObserver(refreshProtection).observe(document.body, {
    attributes: true, attributeFilter: ['data-layout'],
  });
})();
