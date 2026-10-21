'use strict';
(() => {
  if (location.protocol !== 'chrome:' || location.hostname !== 'extensions' || window.__blancExtensionsBranding) return;
  window.__blancExtensionsBranding = true;
  // Font bytes are bundled locally, without a network request or CSP relaxation.
  const fonts = __BLANC_FONTS__;
  for (const [name, data, weight] of fonts) {
    const face = new FontFace(name, Uint8Array.from(atob(data), c => c.charCodeAt(0)), { weight });
    document.fonts.add(face); face.load().catch(() => {});
  }
  const logo = '__BLANC_LOGO__';
  const css = `
    :root,:host {
      --blanc-paper:#faf9f6;--blanc-card:#fff;--blanc-ink:#25231f;--blanc-muted:#6c675e;--blanc-line:#ded9d0;--blanc-accent:#805b26;--blanc-selected:#f0e9dc;
      --cr-primary-text-color:var(--blanc-ink);--cr-secondary-text-color:var(--blanc-muted);
      --cr-card-background-color:var(--blanc-card);--cr-separator-color:var(--blanc-line);
      --cr-link-color:var(--blanc-accent);--cr-focus-outline-color:var(--blanc-accent);
      --color-primary:var(--blanc-accent);--color-sys-primary:var(--blanc-accent);
      --color-button-foreground:var(--blanc-accent);--color-button-border:var(--blanc-line);
      --color-button-background-prominent:var(--blanc-accent);--color-button-foreground-prominent:#fff;
      --cr-toggle-color:var(--blanc-accent);--cr-toggle-checked-bar-color:var(--blanc-accent);
      --cr-toggle-checked-button-color:var(--blanc-accent);--cr-toolbar-background:var(--blanc-paper);
      --color-webui-page-background:var(--blanc-paper);--md-background-color:var(--blanc-paper);
    }
    @media(prefers-color-scheme:dark){:root,:host{--blanc-paper:#20201e;--blanc-card:#292925;--blanc-ink:#f1eee7;--blanc-muted:#bbb5aa;--blanc-line:#47453f;--blanc-accent:#dec18e;--blanc-selected:#3c352b;--color-button-foreground-prominent:#20201e}}
    :host,body,input,button,select,textarea,div,span,p,a,label,h1,h2,h3,cr-button {font-family:'Instrument Sans',sans-serif!important}
    body{background:var(--blanc-paper)!important;color:var(--blanc-ink)!important}
    h1,h2,h3{font-family:Inter,sans-serif!important;letter-spacing:-.025em}
    a{color:var(--blanc-accent)!important}
    cr-toolbar,extensions-toolbar,#devDrawer{background:var(--blanc-paper)!important;color:var(--blanc-ink)!important}
    cr-button{border-radius:10px!important}
    #card{border:1px solid var(--blanc-line)!important;border-radius:16px!important;box-shadow:0 3px 12px #0000000a!important}
    a.selected,a[aria-current=page],.selected{background-color:var(--blanc-selected)!important;color:var(--blanc-accent)!important}
    .cr-nav-menu-item{color:var(--blanc-ink)!important;--iron-icon-fill-color:var(--blanc-muted)!important}
    .cr-nav-menu-item[selected]{background:var(--blanc-selected)!important;color:var(--blanc-accent)!important;--iron-icon-fill-color:var(--blanc-accent)!important}
    :host(cr-toggle[checked]) #bar{background:var(--blanc-accent)!important;border-color:var(--blanc-accent)!important}
    :host(cr-toggle[checked]) #knob{background:var(--blanc-card)!important}
    :host(cr-toolbar-search-field) #background{background:var(--blanc-card)!important}
    :host(cr-toolbar-search-field) #stateBackground{background:var(--blanc-selected)!important}
    #product-logo{width:32px!important;height:32px!important;object-fit:contain}
    @media(prefers-color-scheme:dark){#product-logo{filter:brightness(0) invert(1)}}
  `;
  const seen = new WeakSet();
  function scan(root) {
    if (!seen.has(root)) {
      seen.add(root);
      const style = document.createElement('style'); style.textContent = css;
      (root === document ? document.head : root).append(style);
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) visit(node);
        }
      }).observe(root, {childList:true,subtree:true});
    }
    for (const el of root.querySelectorAll('*')) visit(el);
  }
  function visit(el) {
    if (el.id === 'product-logo') {
      el.removeAttribute('srcset'); el.src = logo;
      el.parentElement?.querySelectorAll('source').forEach(source => source.remove());
    }
    if (el.shadowRoot) scan(el.shadowRoot);
    for (const child of el.querySelectorAll('*')) if (child.shadowRoot) scan(child.shadowRoot);
  }
  scan(document);
  // Lit definitions may attach roots after the initial document has loaded.
  for (const name of ['extensions-manager','extensions-toolbar','extensions-sidebar','extensions-item-list','extensions-item','extensions-detail-view','cr-toolbar']) {
    customElements.whenDefined(name).then(() => requestAnimationFrame(() => scan(document)));
  }
})();
