/* Blanc Dashboard presentation. Native uBO controls, state and handlers stay upstream. */
/* global blancI18n */
'use strict';
(() => {
  // Blanc's text arrives beside this script in the interface language
  // (blanc-strings.js), with the catalog's formatter (blanc-i18n.js). Page
  // titles keep uBlock Origin's own (data-i18n) names.
  const t = blancI18n.createTranslator(self.BlancUboStrings);
  const page = location.pathname.split('/').pop();
  const pages = {
    '3p-filters.html': ['3pPageName', t('ublock.dashboard.lists')],
    'settings.html': ['settingsPageName', t('ublock.dashboard.settings')],
    '1p-filters.html': ['1pPageName', t('ublock.dashboard.myFilters')],
    'dyna-rules.html': ['rulesPageName', t('ublock.dashboard.rules')],
    'whitelist.html': ['whitelistPageName', t('ublock.dashboard.trusted')],
    'support.html': ['supportPageName', t('ublock.dashboard.support')],
    'about.html': ['aboutPageName', t('ublock.dashboard.about')],
    'advanced-settings.html': [null, t('ublock.dashboard.advanced')],
  };
  if (page !== 'dashboard.html' && !pages[page]) return;
  document.documentElement.dataset.blancPage = page;
  const element = (tag, id, text) => {
    const node = document.createElement(tag);
    if (id) node.id = id;
    if (text) node.textContent = text;
    return node;
  };
  // Fixed library glyphs, attached before upstream converts its text glyphs to SVG.
  // Templates keep these attributes when the native list renderer clones them.
  const icons = { check: 'check', refresh: 'refresh-cw', 'download-alt': 'download', 'upload-alt': 'upload', save: 'save', undo: 'undo-2', cogs: 'settings', book: 'book-open', 'info-circle': 'info', 'question-circle': 'circle-help' };
  for (const icon of document.querySelectorAll('.fa-icon')) {
    const name = icons[icon.firstChild?.nodeValue?.trim()];
    if (name) icon.dataset.blancIcon = name;
  }
  if (page === 'dashboard.html') {
    const logo = document.querySelector('#dashboard-nav .logo');
    const mark = logo.querySelector('img');
    mark.src = 'blanc://ubo-brand/sunrise.png';
    mark.alt = '';
    mark.removeAttribute('data-i18n-title');
    logo.append(element('strong', null, 'uBlock Origin'));
    document.getElementById('iframe').title = t('ublock.dashboard.frame');
    document.getElementById('dashboard-nav').setAttribute('aria-label', t('ublock.dashboard.panels'));
    // Native click handlers retain the unsaved-change guard for keyboard navigation.
    document.getElementById('dashboard-nav').addEventListener('keydown', event => {
      if (!event.target.matches('.tabButton') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...document.querySelectorAll('.tabButton')].filter(button => button.dataset.pane !== 'no-dashboard.html');
      const index = buttons.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    });
    return;
  }
  const header = element('header', 'blancPaneHeader');
  const heading = element('div');
  const title = element('h1');
  if (pages[page][0]) title.dataset.i18n = pages[page][0];
  else title.textContent = t('ublock.dashboard.advancedTitle');
  heading.append(title, element('p', null, pages[page][1]));
  header.append(heading);
  const body = document.querySelector('body > .body') || document.body;
  body.prepend(header);
  if (page !== '3p-filters.html') return;
  header.append(document.getElementById('actions'));
  const layout = element('div', 'blancListsLayout');
  header.after(layout);
  const options = element('aside', 'blancListOptions');
  layout.append(options);
  const optionsHeading = element('h2', 'blancOptionsHeading', t('ublock.dashboard.listOptions'));
  options.setAttribute('aria-labelledby', optionsHeading.id);
  options.append(optionsHeading);
  const controls = document.getElementById('autoUpdate').closest('.li').parentElement;
  options.append(controls);
  const descriptions = {
    autoUpdate: t('ublock.dashboard.autoUpdate'),
    suspendUntilListsAreLoaded: t('ublock.dashboard.suspend'),
    parseCosmeticFilters: t('ublock.dashboard.cosmetic'),
    ignoreGenericCosmeticFilters: t('ublock.dashboard.genericCosmetic'),
  };
  for (const [id, text] of Object.entries(descriptions)) {
    const input = document.getElementById(id);
    const description = element('p', 'blancDescription-' + id, text);
    input.setAttribute('aria-describedby', description.id);
    input.closest('.li').append(description);
  }
  const subscriptions = element('section', 'blancSubscriptions');
  const subscriptionsHeading = element('h2', 'blancSubscriptionsHeading', t('ublock.dashboard.subscriptions'));
  subscriptions.setAttribute('aria-labelledby', subscriptionsHeading.id);
  subscriptions.append(subscriptionsHeading, document.getElementById('lists'));
  const importName = subscriptions.querySelector('[data-role="import"] .listname');
  importName.removeAttribute('data-i18n');
  importName.textContent = t('ublock.dashboard.importList');
  const search = subscriptions.querySelector('input[type="search"]');
  search.placeholder = t('ublock.dashboard.search');
  search.setAttribute('aria-label', t('ublock.dashboard.searchLabel'));
  layout.append(subscriptions);
  const lists = document.getElementById('lists');
  // The native delegated click path is also available to keyboard users.
  const describeExpanders = () => {
    for (const expander of lists.querySelectorAll('.listExpander')) {
      const row = expander.closest('.expandable');
      expander.setAttribute('role', 'button');
      expander.tabIndex = 0;
      expander.setAttribute('aria-expanded', String(row.classList.contains('expanded')));
      expander.setAttribute('aria-label', row.querySelector('.listname')?.textContent || t('ublock.dashboard.allLists'));
    }
  };
  new MutationObserver(describeExpanders).observe(lists, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  describeExpanders();
  lists.addEventListener('keydown', event => {
    if (!event.target.matches('.listExpander') || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.target.click();
  });
})();
