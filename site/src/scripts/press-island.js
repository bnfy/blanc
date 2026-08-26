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
  const shieldCount = document.getElementById('pressIslandShieldCount');
  const hint = document.getElementById('pressIslandHint');
  const favicon = toggle?.querySelector('.pill-fav');
  const page = document.getElementById('pressIslandPage');
  const slash = document.getElementById('pressIslandSlash');
  const start = document.getElementById('pressIslandStart');
  const newTab = document.getElementById('pressIslandNewTab');

  if (!demo || !island || !toggle || !state || !stateLabel || !input || !list || !domain || !shield || !shieldCount || !hint || !favicon || !page || !slash || !start || !newTab) return;

  // The blank tab renders a miniature of the "billboard" start page. Date,
  // clock, and meridiem use the app's own formats; the blocked line is
  // illustrative, matching the demo's per-site shield counts.
  (function fillBillboard() {
    const now = new Date();
    document.getElementById('pressIslandStartDate').textContent = now
      .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      .toLowerCase();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    document.getElementById('pressIslandStartClock').textContent = time.replace(/\s?[AP]M$/i, '');
    document.getElementById('pressIslandStartMeridiem').textContent = (time.match(/[AP]M$/i) || [''])[0].toLowerCase();
    document.getElementById('pressIslandStartBlocked').textContent = '2,412 ads blocked this week · nothing followed you home';
  })();

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

  // The blank-tab state (the "new tab" footer button): the island collapses to
  // the quiet placeholder pill — prompt label, Blanc-mark favicon, the "/"
  // chip, no shield (the app hides it entirely on internal pages) — resting
  // over a miniature of Blanc's start page.
  function enterBlankTab() {
    interact();
    selectedDomain = '';
    domain.textContent = 'Search or type a URL';
    domain.classList.add('placeholder');
    favicon.style.backgroundImage = '';
    favicon.classList.remove('press-island-blanc-favicon');
    favicon.classList.add('internal');
    shield.hidden = true;
    slash.hidden = false;
    start.hidden = false;
    delete demo.dataset.site;
    input.value = '';
    restoreTabs();
    setOpen(false);
  }

  function leaveBlankTab() {
    domain.classList.remove('placeholder');
    favicon.classList.remove('internal');
    shield.hidden = false;
    slash.hidden = true;
    start.hidden = true;
  }

  function chooseRow(row) {
    const nextDomain = row.dataset.domain;
    const selectedFavicon = row.dataset.favicon;
    const selectedShield = row.dataset.shield;
    interact();
    leaveBlankTab();
    selectedDomain = nextDomain;
    domain.textContent = nextDomain;
    favicon.style.backgroundImage = selectedFavicon ? `url('/favicons/${selectedFavicon}.ico')` : 'none';
    favicon.classList.toggle('press-island-blanc-favicon', !selectedFavicon);
    shieldCount.textContent = selectedShield === '0' ? '' : selectedShield;
    // Nothing blocked here reads as a quiet shield, not an absent one.
    shield.classList.toggle('shield-quiet', selectedShield === '0');
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

  toggle.addEventListener('click', (event) => {
    interact();
    const open = island.classList.contains('open');
    // The "/" chip opens the panel already showing the command list, exactly
    // like the app's own chip — a bare "/" cannot say what it does, so
    // clicking it shows you. (The chip is a decorative span inside the pill
    // button, so its clicks arrive here by delegation.)
    if (!open && event.target === slash) {
      input.value = '/';
      renderCommands('/');
      setOpen(true);
      requestAnimationFrame(() => input.focus());
      return;
    }
    setOpen(!open, !open);
  });
  newTab.addEventListener('click', enterBlankTab);
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
