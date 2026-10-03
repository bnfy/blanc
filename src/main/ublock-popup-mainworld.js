/* global vAPI */
// Blanc's approved popup presentation. Original uBO handlers own every action.
(() => {
  'use strict';
  const node = id => document.getElementById(id);
  const icon = name => `<span class="blanc-icon" style="--icon:url('blanc-icons/${name}.svg')" aria-hidden="true"></span>`;
  const card = document.createElement('section');
  card.id = 'blancPopup'; card.setAttribute('aria-label', 'uBlock Origin controls');
  card.innerHTML = `<header id="blancHeader"><button id="blancBack" aria-label="Back to site protection">${icon('chevron-left')}</button><img id="blancMark" src="blanc://ubo-brand/sunrise.png" alt=""><div><h1>uBlock Origin</h1><div id="blancHost"></div></div><button id="blancClose" aria-label="Close uBlock Origin controls">${icon('x')}</button></header>`;
  document.body.prepend(card);
  const pointer = document.createElement('div'); pointer.id = 'blancPointer'; pointer.hidden = true; document.body.prepend(pointer);
  node('blancHost').append(node('hostname'));
  card.append(node('panes'));
  const main = node('main');
  const site = document.createElement('section'); site.id = 'blancSite';
  site.innerHTML = '<div><strong>Block ads and trackers</strong><small>For this site.</small></div>';
  const siteSwitch = node('switch');
  siteSwitch.replaceChildren(); siteSwitch.setAttribute('role', 'switch');
  site.append(siteSwitch);
  const stats = document.createElement('section'); stats.id = 'blancStats';
  stats.innerHTML = '<div><strong id="blancPageCount"></strong><span id="blancPagePercent"></span></div><div id="blancDomains"></div>';
  main.prepend(stats); main.prepend(site);
  node('sticky').hidden = true;
  node('basicStats').hidden = true;
  const tools = node('basicTools');
  const actions = document.createElement('section'); actions.id = 'blancPageTools';
  const configureTool = (id, name, description, glyph) => {
    const tool = node(id); tool.className = 'blanc-page-tool needPick';
    tool.setAttribute('role', 'button'); tool.tabIndex = 0;
    tool.innerHTML = `${icon(glyph)}<span><strong>${name}</strong><small>${description}</small></span>${icon('chevron-right')}`;
    tool.addEventListener('click', event => {
      if (!tool.classList.contains('canPick')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true });
    actions.append(tool);
  };
  configureTool('gotoPick', 'Pick an element', 'Create a filter that hides it', 'pipette');
  configureTool('gotoZap', 'Zap an element', 'Remove it until the page reloads', 'zap');
  main.append(actions);
  const links = document.createElement('section'); links.id = 'blancToolLinks';
  for (const [href, label, glyph] of [['logger-ui.html#_', 'Logger', 'list'], ['dashboard.html', 'Dashboard', 'settings']]) {
    const link = tools.querySelector(`[href="${href}"]`);
    link.className = 'blanc-tool-link'; link.innerHTML = `${icon(glyph)}<span>${label}</span>`; links.append(link);
  }
  main.append(links);
  const footer = document.createElement('footer'); footer.id = 'blancFooter';
  footer.innerHTML = `<button id="blancMore" aria-expanded="false" aria-controls="blancExtra"><span>More controls</span>${icon('chevron-down')}</button><details id="blancOverflow"><summary aria-label="More uBlock Origin actions">${icon('ellipsis')}</summary><div id="blancOverflowMenu"></div></details>`;
  const report = node('gotoReport'); report.className = 'blanc-report'; report.setAttribute('role', 'button'); report.tabIndex = 0; report.textContent = 'Report an issue';
  report.addEventListener('click', event => { if (!report.classList.contains('canPick')) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true });
  node('basicStats').removeAttribute('data-more');
  // Footer must be attached before resolving its new menu id.
  main.append(footer); node('blancOverflowMenu').append(report);
  const since = document.createElement('div'); since.className = 'blanc-since';
  since.innerHTML = '<span>Blocked since install</span><span id="blancSinceCount"></span>'; node('blancOverflowMenu').append(since);
  const extra = document.createElement('section'); extra.id = 'blancExtra';
  const heading = document.createElement('h2'); heading.textContent = 'Site controls'; extra.append(heading);
  extra.append(node('extraTools'));
  const ruleTools = document.createElement('div'); ruleTools.id = 'blancRuleTools';
  for (const [id, label, glyph] of [['saveRules', 'Save rules', 'lock-keyhole'], ['revertRules', 'Revert', 'undo-2'], ['refresh', 'Reload page', 'rotate-cw']]) {
    const tool = node(id); tool.setAttribute('role', 'button'); tool.tabIndex = 0;
    tool.innerHTML = `${icon(glyph)}<span>${label}</span>`; ruleTools.append(tool);
  }
  main.append(ruleTools);
  const matrixHeading = document.createElement('h2'); matrixHeading.textContent = 'Requests and domains'; extra.append(matrixHeading);
  extra.append(node('firewall')); extra.append(node('moreOrLess'));
  main.append(extra);
  tools.hidden = true;
  for (const divider of main.querySelectorAll(':scope > hr')) divider.hidden = true;
  for (const ribbon of main.querySelectorAll(':scope > .itemRibbon')) ribbon.hidden = true;
  let expanded = false;
  self.BlancUboPopupUI = {
    expand: null,
    update(data) {
      const counts = data.pageCounts;
      const blocked = counts?.blocked.any ?? 0;
      const total = blocked + (counts?.allowed.any ?? 0);
      node('blancPageCount').textContent = `${blocked.toLocaleString()} ${blocked === 1 ? 'request' : 'requests'} blocked`;
      node('blancPagePercent').textContent = `${total ? Math.floor(blocked * 100 / total) : 0}% of this page’s requests`;
      node('blancSinceCount').textContent = (data.globalBlockedRequestCount ?? 0).toLocaleString();
      const domains = new Map();
      for (const [host, value] of Object.entries(data.hostnameDict || {})) {
        if (host === '*') continue;
        domains.set(value.domain, domains.get(value.domain) || value.counts.allowed.any > 0);
      }
      node('blancDomains').textContent = `${[...domains.values()].filter(Boolean).length} of ${domains.size} domains connected`;
      if (data.pageURL === '') node('switch').setAttribute('aria-disabled', 'true');
      else node('switch').removeAttribute('aria-disabled');
      syncState();
    },
  };
  function syncState() {
    node('switch').setAttribute('aria-checked', String(!document.body.classList.contains('off')));
    for (const id of ['gotoPick', 'gotoZap', 'gotoReport']) {
      const tool = node(id), available = tool.classList.contains('canPick');
      tool.setAttribute('aria-disabled', String(!available)); tool.tabIndex = available ? 0 : -1;
    }
  }
  const stateObserver = new MutationObserver(syncState);
  stateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  for (const id of ['gotoPick', 'gotoZap', 'gotoReport']) stateObserver.observe(node(id), { attributes: true, attributeFilter: ['class'] });
  node('blancMore').addEventListener('click', () => {
    expanded = !expanded;
    self.BlancUboPopupUI.expand?.(expanded);
    document.body.classList.toggle('blanc-expanded', expanded);
    node('blancMore').setAttribute('aria-expanded', String(expanded));
    node('blancMore').querySelector('span').textContent = expanded ? 'Fewer controls' : 'More controls';
    if (!expanded) node('blancMore').scrollIntoView({ block: 'nearest' });
  });
  node('blancClose').addEventListener('click', () => window.blancUboPopup?.close());
  node('blancBack').addEventListener('click', () => window.blancUboPopup?.back());
  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || event.target.matches('button, a, summary, input')) return;
    if (event.target.getAttribute('role') !== 'button' && event.target.getAttribute('role') !== 'switch') return;
    if (event.target.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: event.ctrlKey, metaKey: event.metaKey }));
  });
  document.addEventListener('click', event => {
    if (!node('blancOverflow').contains(event.target)) node('blancOverflow').open = false;
  });
  window.blancUboPopup?.listen(state => {
    document.documentElement.style.setProperty('--popup-max-height', `${Math.max(0, state.maxHeight)}px`);
    pointer.style.left = `${state.pointer}px`; pointer.hidden = !state.connected;
  });
  let measured = 0;
  const resize = new ResizeObserver(() => {
    const height = Math.ceil(card.scrollHeight + card.getBoundingClientRect().height - card.clientHeight);
    if (height !== measured) { measured = height; window.blancUboPopup?.layout(height); }
  });
  resize.observe(card); resize.observe(main);
})();
