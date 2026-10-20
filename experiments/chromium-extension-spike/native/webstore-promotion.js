// Prototype compatibility rule: suppress only the Store's Chrome-download callout.
(() => {
  if (location.origin !== 'https://chromewebstore.google.com' || window !== top) return;
  if (globalThis.__blancStorePromotionObserver) return;
  const relabeled = new WeakMap();
  function suppress() {
    // Relabel the existing action; retain the button, handlers and disabled state.
    for (const button of document.querySelectorAll('button')) {
      const text = button.textContent.trim();
      if (relabeled.has(button) && text !== 'Add to Blanc') {
        if (button.getAttribute('aria-label') === 'Add to Blanc') {
          const original = relabeled.get(button);
          if (original === null) button.removeAttribute('aria-label');
          else button.setAttribute('aria-label', text === 'Add to Chrome' ? original : text);
        }
        relabeled.delete(button);
      }
      if (text !== 'Add to Chrome') continue;
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.trim() === 'Add to Chrome') {
          relabeled.set(button, button.getAttribute('aria-label'));
          node.nodeValue = node.nodeValue.replace('Add to Chrome', 'Add to Blanc');
          button.setAttribute('aria-label', 'Add to Blanc');
          break;
        }
      }
    }
    // English inline banner: match its exact accessible action and complete
    // copy, then require that action to be its only interactive descendant.
    // Never climb into the listing, search, sign-in or installation controls.
    const label = 'Switch to Chrome to install extensions and themes Install Chrome';
    const copy = label.replace(/\s/g, '');
    for (const button of document.querySelectorAll(`button[aria-label="${label}"]`)) {
      for (let box = button.parentElement; box && box !== document.body; box = box.parentElement) {
        const controls = [...box.querySelectorAll('a,button,input,select,textarea,iframe,[role="button"],[role="dialog"]')];
        if (controls.length !== 1 || controls[0] !== button) break;
        if (box.textContent.replace(/\s/g, '') !== copy) continue;
        box.style.setProperty('display', 'none', 'important');
        break;
      }
    }
    for (const link of document.querySelectorAll('a[href]')) {
      let url;
      try { url = new URL(link.href); } catch { continue; }
      if (url.origin !== 'https://www.google.com' && url.origin !== 'https://google.com') continue;
      if (url.pathname !== '/chrome/' || url.searchParams.get('utm_medium') !== 'material-callout' ||
          url.searchParams.get('utm_campaign') !== 'cws') continue;
      // Find the smallest callout containing its heading and dismiss button.
      // Never suppress a page, installation control, or generic dialog.
      for (let box = link.parentElement; box && box !== document.body; box = box.parentElement) {
        if (box.textContent.length > 1200) break;
        if (!box.querySelector('h1,h2,h3,[role="heading"]') || !box.querySelector('button')) continue;
        if (box.querySelector('input,select,textarea') || box.querySelectorAll('a[href]').length !== 1) break;
        // The Store wraps this aside in a dialog with an empty decorative span.
        // Hide that shell too, but only when all content and controls belong to
        // the already-validated promotion. Never hide a mixed-purpose dialog.
        const shell = box.parentElement;
        const decorationOnly = shell && shell.getAttribute('role') === 'dialog' &&
          [...shell.childNodes].every(node => node === box ||
            (node.nodeType === 3 ? !node.textContent.trim() :
              node.nodeType === 1 && !node.textContent.trim() &&
              !node.matches('a,button,input,select,textarea,iframe,[tabindex],[role]') &&
              !node.querySelector('a,button,input,select,textarea,iframe,[tabindex],[role]')));
        (decorationOnly ? shell : box).style.setProperty('display', 'none', 'important');
        break;
      }
    }
  }
  suppress();
  globalThis.__blancStorePromotionObserver = new MutationObserver(suppress);
  globalThis.__blancStorePromotionObserver.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
})();
