/* global vAPI, blancI18n */
// Blanc's approved popup presentation. Original uBO handlers own every action.
(() => {
  'use strict';
  // Blanc's text arrives beside this script in the interface language
  // (blanc-strings.js), with the catalog's formatter (blanc-i18n.js).
  const t = blancI18n.createTranslator(self.BlancUboStrings);
  const number = new Intl.NumberFormat(self.BlancUboStrings.formatLocale);
  const node = id => document.getElementById(id);
  const icon = name => `<span class="blanc-icon" style="--icon:url('blanc-icons/${name}.svg')" aria-hidden="true"></span>`;
  const card = document.createElement('section');
  card.id = 'blancPopup'; card.setAttribute('aria-label', t('ublock.popup.label'));
  card.innerHTML = `<header id="blancHeader"><button id="blancBack">${icon('chevron-left')}</button><img id="blancMark" src="blanc://ubo-brand/sunrise.png" alt=""><div><h1>uBlock Origin</h1><div id="blancHost"></div></div><button id="blancClose">${icon('x')}</button></header>`;
  document.body.prepend(card);
  node('blancBack').setAttribute('aria-label', t('ublock.popup.back'));
  node('blancClose').setAttribute('aria-label', t('ublock.popup.close'));
  const pointer = document.createElement('div'); pointer.id = 'blancPointer'; pointer.hidden = true; document.body.prepend(pointer);
  node('blancHost').append(node('hostname'));
  card.append(node('panes'));
  const main = node('main');
  const site = document.createElement('section'); site.id = 'blancSite';
  site.innerHTML = '<div><strong></strong><small></small></div>';
  site.querySelector('strong').textContent = t('ublock.popup.siteTitle');
  site.querySelector('small').textContent = t('ublock.popup.siteDetail');
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
    tool.innerHTML = `${icon(glyph)}<span><strong></strong><small></small></span>${icon('chevron-right')}`;
    tool.querySelector('strong').textContent = name; tool.querySelector('small').textContent = description;
    tool.addEventListener('click', event => {
      if (!tool.classList.contains('canPick')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true });
    actions.append(tool);
  };
  configureTool('gotoPick', t('ublock.popup.pick'), t('ublock.popup.pickDetail'), 'pipette');
  configureTool('gotoZap', t('ublock.popup.zap'), t('ublock.popup.zapDetail'), 'zap');
  main.append(actions);
  const links = document.createElement('section'); links.id = 'blancToolLinks';
  for (const [href, label, glyph] of [['logger-ui.html#_', t('ublock.popup.logger'), 'list'], ['dashboard.html', t('ublock.popup.dashboard'), 'settings']]) {
    const link = tools.querySelector(`[href="${href}"]`);
    link.className = 'blanc-tool-link'; link.innerHTML = `${icon(glyph)}<span></span>`; link.lastElementChild.textContent = label; links.append(link);
  }
  main.append(links);
  const footer = document.createElement('footer'); footer.id = 'blancFooter';
  footer.innerHTML = `<button id="blancMore" aria-expanded="false" aria-controls="blancExtra"><span></span>${icon('chevron-down')}</button><details id="blancOverflow"><summary>${icon('ellipsis')}</summary><div id="blancOverflowMenu"></div></details>`;
  footer.querySelector('#blancMore span').textContent = t('ublock.popup.more');
  footer.querySelector('summary').setAttribute('aria-label', t('ublock.popup.overflow'));
  const report = node('gotoReport'); report.className = 'blanc-report'; report.setAttribute('role', 'button'); report.tabIndex = 0; report.textContent = t('ublock.popup.report');
  report.addEventListener('click', event => { if (!report.classList.contains('canPick')) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true });
  node('basicStats').removeAttribute('data-more');
  // Footer must be attached before resolving its new menu id.
  main.append(footer); node('blancOverflowMenu').append(report);
  const since = document.createElement('div'); since.className = 'blanc-since';
  since.innerHTML = '<span></span><span id="blancSinceCount"></span>'; since.firstElementChild.textContent = t('ublock.popup.since');
  node('blancOverflowMenu').append(since);
  const extra = document.createElement('section'); extra.id = 'blancExtra';
  const heading = document.createElement('h2'); heading.textContent = t('ublock.popup.siteControls'); extra.append(heading);
  extra.append(node('extraTools'));
  const ruleTools = document.createElement('div'); ruleTools.id = 'blancRuleTools';
  for (const [id, label, glyph] of [['saveRules', t('ublock.popup.saveRules'), 'lock-keyhole'], ['revertRules', t('ublock.popup.revert'), 'undo-2'], ['refresh', t('ublock.popup.reload'), 'rotate-cw']]) {
    const tool = node(id); tool.setAttribute('role', 'button'); tool.tabIndex = 0;
    tool.innerHTML = `${icon(glyph)}<span></span>`; tool.lastElementChild.textContent = label; ruleTools.append(tool);
  }
  main.append(ruleTools);
  const matrixHeading = document.createElement('h2'); matrixHeading.textContent = t('ublock.popup.requestsAndDomains'); extra.append(matrixHeading);
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
      node('blancPageCount').textContent = t('ublock.popup.blocked', { count: blocked });
      node('blancPagePercent').textContent = t('ublock.popup.share', { percent: total ? Math.floor(blocked * 100 / total) : 0 });
      node('blancSinceCount').textContent = number.format(data.globalBlockedRequestCount ?? 0);
      const domains = new Map();
      for (const [host, value] of Object.entries(data.hostnameDict || {})) {
        if (host === '*') continue;
        domains.set(value.domain, domains.get(value.domain) || value.counts.allowed.any > 0);
      }
      node('blancDomains').textContent = t('ublock.popup.domains', {
        connected: number.format([...domains.values()].filter(Boolean).length), count: domains.size,
      });
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
    node('blancMore').querySelector('span').textContent = expanded ? t('ublock.popup.fewer') : t('ublock.popup.more');
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
