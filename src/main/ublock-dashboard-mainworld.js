/* Blanc Dashboard presentation. Native uBO controls, state and handlers stay upstream. */
'use strict';
(() => {
  const page = location.pathname.split('/').pop();
  const pages = {
    '3p-filters.html': ['3pPageName', 'Choose which lists uBlock Origin uses.'],
    'settings.html': ['settingsPageName', 'Customize filtering, appearance, and your uBlock Origin preferences.'],
    '1p-filters.html': ['1pPageName', 'Add your own network and cosmetic filters.'],
    'dyna-rules.html': ['rulesPageName', 'Review permanent rules and changes for this session.'],
    'whitelist.html': ['whitelistPageName', 'Choose where uBlock Origin filtering is turned off.'],
    'support.html': ['supportPageName', 'Find help and troubleshoot uBlock Origin.'],
    'about.html': ['aboutPageName', 'Version, licenses, and acknowledgments.'],
    'advanced-settings.html': [null, 'Advanced configuration for experienced users.'],
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
    mark.src = 'blanc-sunrise.png';
    mark.alt = '';
    mark.removeAttribute('data-i18n-title');
    logo.append(element('strong', null, 'uBlock Origin'));
    document.getElementById('iframe').title = 'uBlock Origin settings';
    document.getElementById('dashboard-nav').setAttribute('aria-label', 'uBlock Origin settings panels');
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
  else title.textContent = 'Advanced settings';
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
  const optionsHeading = element('h2', 'blancOptionsHeading', 'List options');
  options.setAttribute('aria-labelledby', optionsHeading.id);
  options.append(optionsHeading);
  const controls = document.getElementById('autoUpdate').closest('.li').parentElement;
  options.append(controls);
  const descriptions = {
    autoUpdate: 'Periodically check and update filter lists in the background.',
    suspendUntilListsAreLoaded: 'Prevent network requests until filtering rules are ready.',
    parseCosmeticFilters: 'Enable cosmetic filters to hide page elements.',
    ignoreGenericCosmeticFilters: 'Skip generic cosmetic filters (e.g. those not specific to a site).',
  };
  for (const [id, text] of Object.entries(descriptions)) {
    const input = document.getElementById(id);
    const description = element('p', 'blancDescription-' + id, text);
    input.setAttribute('aria-describedby', description.id);
    input.closest('.li').append(description);
  }
  const subscriptions = element('section', 'blancSubscriptions');
  const subscriptionsHeading = element('h2', 'blancSubscriptionsHeading', 'Subscriptions');
  subscriptions.setAttribute('aria-labelledby', subscriptionsHeading.id);
  subscriptions.append(subscriptionsHeading, document.getElementById('lists'));
  const importName = subscriptions.querySelector('[data-role="import"] .listname');
  importName.removeAttribute('data-i18n');
  importName.textContent = 'Import a filter list';
  const search = subscriptions.querySelector('input[type="search"]');
  search.placeholder = 'Search filter lists…';
  search.setAttribute('aria-label', 'Search filter lists');
  layout.append(subscriptions);
  const lists = document.getElementById('lists');
  // The native delegated click path is also available to keyboard users.
  const describeExpanders = () => {
    for (const expander of lists.querySelectorAll('.listExpander')) {
      const row = expander.closest('.expandable');
      expander.setAttribute('role', 'button');
      expander.tabIndex = 0;
      expander.setAttribute('aria-expanded', String(row.classList.contains('expanded')));
      expander.setAttribute('aria-label', row.querySelector('.listname')?.textContent || 'All filter lists');
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
