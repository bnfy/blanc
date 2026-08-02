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
  const hint = document.getElementById('pressIslandHint');
  const favicon = toggle?.querySelector('.pill-fav');
  const groupName = toggle?.querySelector('.group-name');
  const page = document.getElementById('pressIslandPage');

  if (!demo || !island || !toggle || !state || !stateLabel || !input || !list || !domain || !shield || !hint || !favicon || !groupName || !page) return;

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
      if (active) row.setAttribute('aria-current', 'page');
      else row.removeAttribute('aria-current');
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
    list.querySelectorAll('[data-domain]').forEach((row) => {
      row.addEventListener('click', () => chooseRow(row));
      row.addEventListener('keydown', (event) => {
        if (event.target !== row || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        chooseRow(row);
      });

      const pin = row.querySelector('.row-pin');
      pin?.addEventListener('click', (event) => {
        event.stopPropagation();
        const pinned = !pin.classList.contains('on');
        pin.classList.toggle('on', pinned);
        pin.setAttribute('aria-pressed', String(pinned));
        pin.setAttribute('aria-label', pinned ? 'Unpin tab' : 'Pin tab');
        pin.title = pinned ? 'Unpin tab' : 'Pin tab';
        hint.textContent = pinned ? `${row.dataset.title} pinned` : `${row.dataset.title} unpinned`;
      });

      const group = row.querySelector('.row-grp');
      group?.addEventListener('click', (event) => {
        event.stopPropagation();
        group.classList.toggle('open');
        group.setAttribute('aria-expanded', String(group.classList.contains('open')));
        hint.textContent = group.classList.contains('open')
          ? `move ${row.dataset.title} to another group`
          : 'esc to dismiss · type / for commands · choose a row to switch';
      });

      row.querySelector('.row-close')?.addEventListener('click', (event) => {
        event.stopPropagation();
        row.classList.add('is-closing');
        hint.textContent = `${row.dataset.title} closed`;
        window.setTimeout(() => { row.hidden = true; }, 120);
      });
    });
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

(function setupPressMotion() {
  const page = document.querySelector('.press-page');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (!page || reduceMotion.matches || !('IntersectionObserver' in window)) return;

  const targets = Array.from(page.querySelectorAll([
    '.press-product-heading',
    '.press-proof article',
    '.press-compare-heading',
    '.press-compare-table-wrap',
    '.press-compare-note',
    '.press-newsroom-heading',
    '.press-primary-asset',
    '.press-secondary-assets',
    '.press-build-verification',
    '.press-assets-contact',
    '.press-announcement-intro',
    '.press-announcement-copy',
    '.press-facts > *',
    '.press-review > *',
    '.press-boundaries > *',
    '.press-contact',
  ].join(',')));

  if (!targets.length) return;

  const viewportCutoff = window.innerHeight * 0.92;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.08,
  });

  targets.forEach((target, index) => {
    target.classList.add('press-reveal');
    target.style.setProperty('--press-reveal-delay', `${(index % 2) * 65}ms`);

    if (target.getBoundingClientRect().top <= viewportCutoff) {
      target.classList.add('is-visible');
      return;
    }

    observer.observe(target);
  });

  document.documentElement.classList.add('press-motion-ready');
})();
