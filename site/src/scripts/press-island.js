(function () {
  const demo = document.getElementById('pressIslandDemo');
  const island = document.getElementById('pressIslandLive');
  const toggle = document.getElementById('pressIslandToggle');
  const close = document.getElementById('pressIslandClose');
  const state = document.getElementById('pressIslandState');
  const stateLabel = document.getElementById('pressIslandStateLabel');
  const input = document.getElementById('pressIslandInput');
  const list = document.getElementById('pressIslandList');
  const domain = document.getElementById('pressIslandDomain');
  const shield = document.getElementById('pressIslandShield');
  const favicon = toggle?.querySelector('.pill-fav');
  const groupName = toggle?.querySelector('.group-name');
  const page = document.getElementById('pressIslandPage');

  if (!demo || !island || !toggle || !state || !stateLabel || !input || !list || !domain || !shield || !favicon || !groupName || !page) return;

  const originalMarkup = list.innerHTML;
  const commands = [
    ['/favorites', 'Open favorites'],
    ['/history', 'Open browsing history'],
    ['/downloads', 'Open downloads'],
    ['/settings', 'Open settings'],
    ['/new', 'Open a new tab'],
    ['/private', 'Open a private tab'],
  ];
  let hasInteracted = false;
  let introTimer = null;
  let selectedDomain = domain.textContent.trim();

  function setOpen(open, focusInput = false) {
    island.classList.toggle('open', open);
    demo.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    state.setAttribute('aria-pressed', String(open));
    stateLabel.textContent = open ? 'expanded' : 'resting';
    if (open && focusInput) requestAnimationFrame(() => input.focus());
  }

  function restoreTabs() {
    list.innerHTML = originalMarkup;
    syncActiveRow();
    bindRows();
  }

  function syncActiveRow() {
    list.querySelectorAll('[data-domain]').forEach((row) => {
      const active = row.dataset.domain === selectedDomain;
      row.classList.toggle('hl', active);
      row.querySelector('.tag')?.remove();
      if (active) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'active';
        row.append(tag);
      }
    });
  }

  function switchPage(row) {
    const capture = row.dataset.page;
    if (capture) page.setAttribute('src', capture);
    demo.dataset.site = row.dataset.domain;
  }

  function renderCommands(query) {
    const normalized = query.trim().toLowerCase();
    const matches = commands.filter(([command]) => command.startsWith(normalized || '/'));
    list.innerHTML = matches.length
      ? matches.map(([command, hint], index) => `<button class="trow command${index === 0 ? ' hl' : ''}" type="button"><span class="cmd">${command}</span><span class="hint">${hint}</span>${index === 0 ? '<span class="enter">↵</span>' : ''}</button>`).join('')
      : '<div class="trow"><span class="empty">No matching command</span></div>';
  }

  function filterTabs(query) {
    const normalized = query.trim().toLowerCase();
    restoreTabs();
    if (!normalized) return;
    list.querySelectorAll('.sec-head').forEach((heading) => heading.remove());
    list.querySelectorAll('[data-domain]').forEach((row) => {
      const haystack = `${row.dataset.title} ${row.dataset.domain}`.toLowerCase();
      row.hidden = !haystack.includes(normalized);
    });
    if (!list.querySelector('[data-domain]:not([hidden])')) {
      list.innerHTML = '<div class="trow"><span class="empty">No match — press Enter to search the web</span></div>';
    }
  }

  function chooseRow(row) {
    const nextDomain = row.dataset.domain;
    const selectedFavicon = row.dataset.favicon;
    const selectedShield = row.dataset.shield;
    const selectedGroup = row.dataset.group;
    interact();
    selectedDomain = nextDomain;
    domain.textContent = nextDomain;
    favicon.style.backgroundImage = selectedFavicon ? `url('/favicons/${selectedFavicon}.ico')` : 'none';
    favicon.classList.toggle('press-island-blanc-favicon', !selectedFavicon);
    shield.textContent = selectedShield;
    shield.hidden = selectedShield === '0';
    groupName.textContent = selectedGroup ? `${selectedGroup} ·` : '';
    groupName.hidden = !selectedGroup;
    switchPage(row);
    input.value = '';
    restoreTabs();
    setOpen(false);
  }

  function bindRows() {
    list.querySelectorAll('[data-domain]').forEach((row) => row.addEventListener('click', () => chooseRow(row)));
  }

  function preloadPages() {
    new Set(Array.from(list.querySelectorAll('[data-page]'), (row) => row.dataset.page)).forEach((source) => {
      const image = new Image();
      image.src = source;
    });
  }

  function interact() {
    hasInteracted = true;
    clearTimeout(introTimer);
  }

  toggle.addEventListener('click', () => {
    interact();
    setOpen(!island.classList.contains('open'), !island.classList.contains('open'));
  });
  state.addEventListener('click', () => {
    interact();
    setOpen(!island.classList.contains('open'), !island.classList.contains('open'));
  });
  close?.addEventListener('click', () => {
    interact();
    setOpen(false);
    toggle.focus();
  });
  input.addEventListener('input', () => {
    interact();
    if (input.value.trim().startsWith('/')) renderCommands(input.value);
    else filterTabs(input.value);
  });
  demo.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && island.classList.contains('open')) {
      event.preventDefault();
      interact();
      setOpen(false);
      toggle.focus();
    }
  });

  bindRows();
  preloadPages();
  setOpen(true);

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    introTimer = window.setTimeout(() => {
      if (hasInteracted || !island.classList.contains('open')) return;
      input.value = '/';
      renderCommands('/');
      window.setTimeout(() => {
        if (hasInteracted) return;
        input.value = '';
        restoreTabs();
      }, 1800);
    }, 1400);
  }
})();
