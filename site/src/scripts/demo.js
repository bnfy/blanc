/* ---- large live demo: data-driven, self-playing on a fixed loop ----
   Each scene declares the full workspace state (which sites are pinned,
   grouped, or loose) plus the hero message that explains the current beat, so
   pinning and grouping read as real state changes rather than option flashes. */
(function () {
  const stage = document.getElementById('demoStage');
  const demo = document.getElementById('demoIsland');
  const heroMessageEl = document.getElementById('demoHeroMessage');
  const headlineEl = document.getElementById('demoHeadline');
  const subtextEl = document.getElementById('demoSubtext');
  const dotsEl = document.getElementById('demoDots');
  const favEl = document.getElementById('demoFav');
  const domainEl = document.getElementById('demoDomain');
  const slashEl = document.getElementById('demoSlash');
  const newtabEl = document.getElementById('demoNewtab');
  const privateSkeletonEl = document.getElementById('demoPrivateSkeleton');
  const glanceEl = document.getElementById('demoGlance');
  const glanceHeaderEl = document.getElementById('demoGlanceHeader');
  const glanceShotEl = document.getElementById('demoGlanceShot');
  const glanceDividerEl = document.getElementById('demoGlanceDivider');
  const glanceFaviconEl = document.getElementById('demoGlanceFavicon');
  const glanceTitleEl = document.getElementById('demoGlanceTitle');
  const glanceMakeMainEl = document.getElementById('demoGlanceMakeMain');
  const shieldEl = document.getElementById('demoShield');
  const shieldCountEl = document.getElementById('demoShieldCount');
  const shieldHostEl = document.getElementById('demoShieldHost');
  const shieldBlockedEl = document.getElementById('demoShieldBlocked');
  const typedEl = document.getElementById('demoTyped');
  const listEl = document.getElementById('demoList');
  const footEl = document.getElementById('demoFoot');
  const heartEl = document.getElementById('demoHeart');
  const workspaceEl = document.getElementById('demoWorkspace');
  const workspaceLabelEl = document.getElementById('demoWorkspaceLabel');
  const workspaceSwitcherEl = document.getElementById('demoWorkspaceSwitcher');
  const cursorEl = document.getElementById('demoCursor');

  // The blank-tab beat renders a miniature of the "billboard" start page. The
  // date, clock, and meridiem use the app's own formats; the blocked line is
  // illustrative, like the demo's per-site shield counts.
  function fillBillboard(ids, blockedText) {
    const now = new Date();
    document.getElementById(ids.date).textContent = now
      .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      .toLowerCase();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    document.getElementById(ids.clock).textContent = time.replace(/\s?[AP]M$/i, '');
    document.getElementById(ids.meridiem).textContent = (time.match(/[AP]M$/i) || [''])[0].toLowerCase();
    document.getElementById(ids.blocked).textContent = blockedText;
  }
  fillBillboard(
    { date: 'demoBbDate', clock: 'demoBbClock', meridiem: 'demoBbMeridiem', blocked: 'demoBbBlocked' },
    '2,412 ads blocked this week · nothing followed you home'
  );

  /* ---- island motion (1.1.0) ----
     Two effects, both reproducing the app's own numbers rather than
     approximating the look of them. */
  const panelEl = demo.querySelector('.panel');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cursorMoveTimer = null;
  let cursorClickTimer = null;

  function setCursorCue(cue, { openingPanel = false } = {}) {
    clearTimeout(cursorMoveTimer);
    clearTimeout(cursorClickTimer);
    cursorEl.classList.remove('clicking', 'dragging');
    if (!cue || reduceMotion.matches) {
      cursorEl.classList.remove('visible');
      cursorEl.hidden = true;
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    if (cursorEl.hidden) {
      cursorEl.style.setProperty('--cursor-x', `${stageRect.width * 0.78}px`);
      cursorEl.style.setProperty('--cursor-y', `${stageRect.height * 0.78}px`);
      cursorEl.hidden = false;
      void cursorEl.offsetWidth;
      cursorEl.classList.add('visible');
    }

    const delay = cue.delay ?? (openingPanel ? MORPH_MS + 80 : 90);
    cursorMoveTimer = setTimeout(() => {
      const target = stage.querySelector(cue.target);
      if (!target) {
        cursorEl.classList.remove('visible');
        return;
      }
      const targetRect = target.getBoundingClientRect();
      const currentStageRect = stage.getBoundingClientRect();
      const targetX = targetRect.left - currentStageRect.left + targetRect.width * (cue.x ?? 0.5);
      const targetY = targetRect.top - currentStageRect.top + targetRect.height * (cue.y ?? 0.5);
      const x = Math.max(4, Math.min(currentStageRect.width - 24, targetX));
      const y = Math.max(4, Math.min(currentStageRect.height - 30, targetY));
      cursorEl.style.setProperty('--cursor-x', `${Math.round(x)}px`);
      cursorEl.style.setProperty('--cursor-y', `${Math.round(y)}px`);
      if (cue.click || cue.drag) {
        cursorClickTimer = setTimeout(() => {
          cursorEl.classList.remove('clicking', 'dragging');
          void cursorEl.offsetWidth;
          cursorEl.classList.add(cue.drag ? 'dragging' : 'clicking');
        }, 730);
      }
    }, delay);
  }

  // Proximity, mirroring src/main/island-proximity.js: a 250px range on a
  // smoothstep so neither end has an edge you can feel, a lean scaled by
  // closeness so the pill can only tilt while it is also awake, and distance
  // measured to the pill's box rather than its centre — otherwise a wide pill
  // reads as "far" while the cursor sits right beside it.
  const PROX_RANGE = 250;
  let cursor = null;
  let proxFrame = null;
  // Declared up here, not beside the morph below, because applyProximity reads
  // it and the listeners that reach applyProximity are registered before that
  // point. Today only requestAnimationFrame's deferral keeps that from being a
  // temporal-dead-zone throw — which is a timing accident, not a guarantee.
  let panelOpen = false; // intent, which outlives the class during a retraction

  const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  // The pill's on-screen box. .demo-island's own border box is the pill's
  // untransformed one — a transform on a child never changes its parent's box,
  // which is exactly what makes it a stable reference — so the hero's base
  // presentation scale (--pill-scale, origin 50% 0%) is folded back in by hand.
  // The proximity scale is deliberately left out: the app measures the
  // untransformed pill too, and including it here would feed the pill's own
  // growth back into the next frame's distance.
  function pillBox() {
    const r = demo.getBoundingClientRect();
    const s = parseFloat(getComputedStyle(demo).getPropertyValue('--pill-scale')) || 1;
    const width = r.width * s;
    const height = r.height * s;
    const left = r.left + (r.width - width) / 2;
    return { left, top: r.top, right: left + width, bottom: r.top + height, width, height };
  }

  function applyProximity() {
    proxFrame = null;
    let k = 0;
    let lean = 0;
    // Nothing moves while the panel is open or the page has lost the cursor —
    // the app holds just as still when it is not the focused application.
    if (cursor && !reduceMotion.matches && !panelOpen) {
      const r = pillBox();
      const dx = Math.max(r.left - cursor.x, 0, cursor.x - r.right);
      const dy = Math.max(r.top - cursor.y, 0, cursor.y - r.bottom);
      k = smoothstep(1 - Math.min(Math.hypot(dx, dy), PROX_RANGE) / PROX_RANGE);
      const offset = (cursor.x - (r.left + r.width / 2)) / (r.width / 2 + PROX_RANGE);
      lean = Math.max(-1, Math.min(1, offset)) * k;
    }
    demo.style.setProperty('--island-k', k.toFixed(4));
    demo.style.setProperty('--island-lean', lean.toFixed(4));
  }

  function queueProximity() {
    if (!proxFrame) proxFrame = requestAnimationFrame(applyProximity);
  }

  window.addEventListener('mousemove', (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    queueProximity();
  }, { passive: true });
  // The pill moves under a still cursor when the page scrolls, so the distance
  // has to be recomputed then too.
  window.addEventListener('scroll', queueProximity, { passive: true });
  window.addEventListener('blur', () => { cursor = null; queueProximity(); });
  document.addEventListener('mouseleave', () => { cursor = null; queueProximity(); });

  // The panel grows out of the pill and retracts back into it, animating real
  // width and height rather than a transform scale — see the note in site.css.
  // The explicit size is released once the movement lands so the list can go
  // on resizing with its own content.
  const MORPH_MS = 320;
  const RETRACT_MS = 200;
  let morphTimer = null;

  function setPanelOpen(open) {
    if (panelOpen === open) return;
    panelOpen = open;
    clearTimeout(morphTimer);
    panelEl.classList.remove('morph-start', 'morph-run', 'retracting');
    panelEl.style.width = '';
    panelEl.style.height = '';
    panelEl.style.borderRadius = '';

    if (reduceMotion.matches) {
      demo.classList.toggle('open', open);
      queueProximity();
      return;
    }

    const pill = pillBox();
    // The pill's *used* corner radius: 999px on a box this short resolves to
    // half its height. Travelling from that to the panel's own 18px is a
    // movement of about a pixel — the corner should barely register.
    const pillRadius = pill.height / 2;
    const panelRadius = getComputedStyle(panelEl).borderTopLeftRadius;

    if (open) {
      const targetW = panelEl.offsetWidth;
      const targetH = panelEl.offsetHeight;
      panelEl.classList.add('morph-start');
      panelEl.style.width = pill.width + 'px';
      panelEl.style.height = pill.height + 'px';
      panelEl.style.borderRadius = pillRadius + 'px';
      void panelEl.offsetWidth; // commit the start box before animating off it
      demo.classList.add('open');
      panelEl.classList.replace('morph-start', 'morph-run');
      panelEl.style.width = targetW + 'px';
      panelEl.style.height = targetH + 'px';
      panelEl.style.borderRadius = panelRadius;
      morphTimer = setTimeout(() => {
        panelEl.classList.remove('morph-run');
        panelEl.style.width = '';
        panelEl.style.height = '';
        panelEl.style.borderRadius = '';
      }, MORPH_MS);
    } else {
      panelEl.style.width = panelEl.offsetWidth + 'px';
      panelEl.style.height = panelEl.offsetHeight + 'px';
      panelEl.style.borderRadius = panelRadius;
      void panelEl.offsetWidth;
      panelEl.classList.add('retracting');
      panelEl.style.width = pill.width + 'px';
      panelEl.style.height = pill.height + 'px';
      panelEl.style.borderRadius = pillRadius + 'px';
      morphTimer = setTimeout(() => {
        // The pill returns onto an identical shape, so the swap is invisible.
        demo.classList.remove('open');
        panelEl.classList.remove('retracting');
        panelEl.style.width = '';
        panelEl.style.height = '';
        panelEl.style.borderRadius = '';
      }, RETRACT_MS);
    }
    queueProximity();
  }

  const NORMAL_FOOT = '⌘L summons · / for commands';
  const GROUP_FOOT = '/group moves this tab · ⌘1–9 jumps between sections';
  const PRIVATE_FOOT = 'private · nothing here is saved to history';

  // Real sites. `fav` is the domain whose favicon we fetch (a couple differ
  // from the display domain); a missing icon falls back to a neutral square,
  // so the demo never shows a broken image.
  const TABS = {
    gmail:    { title: 'Gmail',     domain: 'mail.google.com', fav: 'gmail.com',    shield: 2 },
    notion:   { title: 'Notion',    domain: 'notion.so',       fav: 'notion.so',    shield: 1 },
    youtube:  { title: 'YouTube',   domain: 'youtube.com',     fav: 'youtube.com',  shield: 9 },
    threads:  { title: 'Threads',   domain: 'threads.net',     fav: 'threads.net',  shield: 6 },
    scroll:   { title: 'Scroll',    domain: 'scrollapp.co',    fav: 'scrollapp.co', shield: 0 },
    nintendo: { title: 'Nintendo',  domain: 'nintendo.com',    fav: 'nintendo.com', shield: 4 },
    msnow:    { title: 'MS NOW',    domain: 'msnow.com',       fav: 'msnbc.com',    shield: 14, quiet: true },
    netflix:  { title: 'Netflix',   domain: 'netflix.com',     fav: 'netflix.com',  shield: 3 },
    github:   { title: 'GitHub',    domain: 'github.com',      fav: 'github.com',   shield: 0 },
    // A blank tab. No domain puts the pill in placeholder mode: the prompt
    // label, the Blanc-mark favicon, the "/" chip, and no shield (the app
    // hides it entirely on internal pages) — matching the real app's state.
    newtab:   { title: 'New Tab',   domain: '',                fav: null,           shield: 0, internal: true },
  };

  const ICON_BASE = '/favicons/';
  const favStyle = (t) => t.fav ? `background-image:url('${ICON_BASE}${t.fav}.ico')` : '';

  /* ---- real page renders for the tabs a scene can land on ----
     Desktop and mobile layouts are pre-captured and bundled under
     site/shots/{desktop,mobile}/ rather than pulled live. The live services
     were unreliable in both directions: mobile-viewport requests 403'd, and a
     live desktop render silently drifts (and letterboxes) when a site
     redesigns. Bundling ships a controlled crop that always loads instantly;
     until an image loads the skeleton bars stay visible. */
  const shotEl = document.getElementById('demoShot');
  // Which render set to use tracks the SAME 560px breakpoint as the compact-
  // pill CSS, and stays reactive (change listener below) so a rotation across
  // it never leaves the pill and its background render from different modes.
  const mobileMq = window.matchMedia('(max-width: 560px)');
  let MOBILE = mobileMq.matches;
  const SHOT_IDS = ['github', 'notion', 'scroll', 'netflix']; // sites with a bundled render
  const PRELOAD_IDS = [...SHOT_IDS];
  // Sampled top-edge color of each bundled render, so the Island's top strip
  // blends into the page below it (the CSS reads --demo-strip-bg). A scene with
  // no bundled shot falls back to the theme surface (matches the skeleton); the
  // private scene keeps Blanc's own dark strip above its animated loading view.
  const SHOT_TOP = { github: '#030442', notion: '#ffffff', scroll: '#ffffff', netflix: '#080706' };
  const PRIVATE_TOP = '#0a0a0a';
  const shots = {}; // id -> { src, ready }
  let currentShotId = null;

  const shotSrc = (id) => '/shots/' + (MOBILE ? 'mobile' : 'desktop') + '/' + id + '.jpg';

  function preloadShot(id) {
    if (shots[id]) return;
    const rec = shots[id] = { src: '', ready: false };
    const img = new Image();
    const src = shotSrc(id);
    img.onload = () => { rec.src = src; rec.ready = true; showShot(currentShotId); };
    img.src = src;
  }
  PRELOAD_IDS.forEach(preloadShot);

  // Crossing the 560px breakpoint (mainly a phone rotation) swaps the desktop
  // renders for the mobile ones and vice versa. Drop the cached other-mode
  // shots, re-preload for the new mode, and refresh the on-screen tab so the
  // background never disagrees with the pill the CSS is now showing.
  mobileMq.addEventListener('change', (e) => {
    MOBILE = e.matches;
    PRELOAD_IDS.forEach((id) => delete shots[id]);
    PRELOAD_IDS.forEach(preloadShot);
    showShot(currentShotId);
    if (glanceModeVisible) {
      glanceShotEl.src = shotSrc(glanceTabId);
      layoutDemoGlance();
    }
  });

  function showShot(id) {
    currentShotId = id;
    const rec = id && shots[id];
    if (rec && rec.ready) {
      if (shotEl.getAttribute('src') !== rec.src) shotEl.src = rec.src;
      shotEl.classList.add('show');
    } else {
      shotEl.classList.remove('show');
    }
  }

  let glanceModeVisible = false;
  let glanceRatio = 0.62;
  let glanceTabId = 'notion';
  let glanceActionTimer = null;
  let glanceEffectTimer = null;
  let shieldActionTimer = null;

  function setGlanceTab(id) {
    glanceTabId = id;
    const tab = TABS[id];
    glanceTitleEl.textContent = tab.title;
    glanceFaviconEl.style.backgroundImage = `url('${ICON_BASE}${tab.fav}.ico')`;
    const src = shotSrc(id);
    if (glanceShotEl.getAttribute('src') !== src) glanceShotEl.src = src;
  }

  function setGlanceRatio(ratio) {
    // Match src/main/glance-layout.js: the primary page remains dominant and
    // the divider is constrained to the app's real 50–78% range.
    glanceRatio = Math.max(0.5, Math.min(0.78, ratio));
    layoutDemoGlance();
  }

  function layoutDemoGlance() {
    if (!glanceModeVisible) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const pageY = parseFloat(getComputedStyle(stage).getPropertyValue('--demo-strip-h')) || 48;
    const pageHeight = Math.max(0, height - pageY);
    const divider = Math.min(12, width);

    if (width >= 800) {
      const primaryWidth = Math.round((width - divider) * glanceRatio);
      const glanceLeft = primaryWidth + divider;
      glanceEl.dataset.direction = 'horizontal';
      demo.style.left = `${Math.round(primaryWidth / 2)}px`;
      Object.assign(shotEl.style, { left: '0px', top: `${pageY}px`, width: `${primaryWidth}px`, height: `${pageHeight}px` });
      Object.assign(glanceHeaderEl.style, { left: `${primaryWidth}px`, top: '0px', width: `${width - primaryWidth}px`, height: `${pageY}px` });
      Object.assign(glanceDividerEl.style, { left: `${primaryWidth}px`, top: `${pageY}px`, width: `${divider}px`, height: `${pageHeight}px` });
      Object.assign(glanceShotEl.style, { left: `${glanceLeft}px`, top: `${pageY}px`, width: `${Math.max(0, width - glanceLeft)}px`, height: `${pageHeight}px` });
      return;
    }

    const stackedHeader = Math.min(44, Math.max(0, pageHeight - divider));
    const usable = Math.max(0, pageHeight - divider - stackedHeader);
    const primaryHeight = Math.round(usable * glanceRatio);
    const dividerTop = pageY + primaryHeight;
    const headerTop = dividerTop + divider;
    const glanceTop = headerTop + stackedHeader;
    glanceEl.dataset.direction = 'vertical';
    demo.style.left = `${Math.round(width / 2)}px`;
    Object.assign(shotEl.style, { left: '0px', top: `${pageY}px`, width: `${width}px`, height: `${primaryHeight}px` });
    Object.assign(glanceDividerEl.style, { left: '0px', top: `${dividerTop}px`, width: `${width}px`, height: `${divider}px` });
    Object.assign(glanceHeaderEl.style, { left: '0px', top: `${headerTop}px`, width: `${width}px`, height: `${stackedHeader}px` });
    Object.assign(glanceShotEl.style, { left: '0px', top: `${glanceTop}px`, width: `${width}px`, height: `${Math.max(0, height - glanceTop)}px` });
  }

  function setDemoGlance(visible, { ratio = 0.62, tab = 'notion' } = {}) {
    glanceModeVisible = visible;
    glanceEl.hidden = !visible;
    stage.classList.toggle('glance-mode', visible);
    if (!visible) {
      for (const prop of ['left', 'top', 'width', 'height']) shotEl.style.removeProperty(prop);
      demo.style.removeProperty('left');
      return;
    }
    setGlanceTab(tab);
    setGlanceRatio(ratio);
  }

  function moveCursorWithGlanceDivider(ratio) {
    if (cursorEl.hidden || reduceMotion.matches) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const pageY = parseFloat(getComputedStyle(stage).getPropertyValue('--demo-strip-h')) || 48;
    const divider = Math.min(12, width);
    if (width >= 800) {
      const x = Math.round((width - divider) * ratio + divider / 2);
      cursorEl.style.setProperty('--cursor-x', `${x}px`);
      cursorEl.style.setProperty('--cursor-y', `${Math.round(pageY + (height - pageY) * 0.55)}px`);
      return;
    }
    const pageHeight = Math.max(0, height - pageY);
    const stackedHeader = Math.min(44, Math.max(0, pageHeight - divider));
    const usable = Math.max(0, pageHeight - divider - stackedHeader);
    cursorEl.style.setProperty('--cursor-x', `${Math.round(width * 0.55)}px`);
    cursorEl.style.setProperty('--cursor-y', `${Math.round(pageY + usable * ratio + divider / 2)}px`);
  }

  function animateGlanceResize(toRatio) {
    stage.classList.add('glance-resizing');
    setGlanceRatio(toRatio);
    moveCursorWithGlanceDivider(toRatio);
    glanceEffectTimer = setTimeout(() => stage.classList.remove('glance-resizing'), 1100);
  }

  function swapGlanceMain(layout, mainId, glanceId, scene) {
    stage.classList.add('glance-swapping');
    glanceMakeMainEl.classList.add('activated');
    renderPill(layout, mainId, { ...scene, current: mainId, glanceTab: glanceId });
    showShot(mainId);
    setGlanceTab(glanceId);
    stage.style.setProperty('--demo-strip-bg', SHOT_TOP[mainId] || '');
    glanceEffectTimer = setTimeout(() => {
      stage.classList.remove('glance-swapping');
      glanceMakeMainEl.classList.remove('activated');
    }, 720);
  }

  window.addEventListener('resize', layoutDemoGlance, { passive: true });

  const CARET_ICON = '<svg class="caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2 L7 5 L3.5 8"/></svg>';
  const PIN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h6l-1 5 2 2v1H4v-1l2-2z"/><path d="M8 11v3"/></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>';
  const COMMANDS = [
    { cmd: '/favorites', hint: 'Open favorites' },
    { cmd: '/save', hint: 'Save this page to favorites' },
    { cmd: '/history', hint: 'Open browsing history' },
    { cmd: '/downloads', hint: 'Open downloads' },
    { cmd: '/settings', hint: 'Open settings' },
    { cmd: '/clear', hint: 'Clear browsing history' },
    { cmd: '/new', hint: 'Open a new tab' },
    { cmd: '/private', hint: 'Open a private tab (history stays untouched)' },
    { cmd: '/close', hint: 'Close this tab' },
    { cmd: '/reopen', hint: 'Reopen the tab you just closed' },
    { cmd: '/pin', hint: 'Pin or unpin this tab' },
    { cmd: '/mute', hint: 'Mute or unmute this tab' },
    { cmd: '/sleep', hint: 'Quiet background tabs and free their memory' },
    { cmd: '/group', hint: 'Type a space, then a group name — e.g. "work"' },
    { cmd: '/ungroup', hint: 'Take this tab out of its group' },
    { cmd: '/close-group', hint: 'Close every tab in this group' },
    { cmd: '/find', hint: 'Find in page' },
    { cmd: '/block-ads', hint: 'Block ads here, or toggle blocking everywhere' },
    { cmd: '/1password', hint: 'Fill a login from 1Password' },
    { cmd: '/theme', hint: 'Cycle appearance, or choose system / light / dark' },
    { cmd: '/patron', hint: 'Support Blanc with a Patron subscription' },
    { cmd: '/workspace', hint: 'Switch to a named workspace, or save this window' },
  ];
  const SEARCH_TAGS = {
    notion: 'favorite',
    scroll: 'favorite',
    nintendo: 'history',
    msnow: 'history',
  };

  // Workspace layouts. The loop progresses base → pinned → grouped as the
  // demo pins a site and then forms a new group.
  const LAYOUTS = {
    base: {
      pinned: ['gmail', 'notion'],
      groups: [{ name: 'social', ids: ['youtube', 'threads'] }],
      loose: ['scroll', 'nintendo', 'msnow', 'netflix', 'github'],
    },
    // base plus a just-opened blank tab. A plain new tab always launches
    // ungrouped, so it joins the loose set — the dots the pill shows for it.
    fresh: {
      pinned: ['gmail', 'notion'],
      groups: [{ name: 'social', ids: ['youtube', 'threads'] }],
      loose: ['scroll', 'nintendo', 'msnow', 'netflix', 'github', 'newtab'],
    },
    pinned: {
      pinned: ['gmail', 'notion', 'scroll'],
      groups: [{ name: 'social', ids: ['youtube', 'threads'] }],
      loose: ['nintendo', 'msnow', 'netflix', 'github'],
    },
    grouped: {
      pinned: ['gmail', 'notion', 'scroll'],
      groups: [
        { name: 'social', ids: ['threads'] },
        { name: 'watch', ids: ['youtube', 'netflix'] },
      ],
      loose: ['nintendo', 'msnow', 'github'],
    },
    folded: {
      pinned: ['gmail', 'notion', 'scroll'],
      groups: [
        { name: 'social', ids: ['threads'], collapsed: true },
        { name: 'watch', ids: ['youtube', 'netflix'] },
      ],
      loose: ['nintendo', 'msnow', 'github'],
    },
    // A separate saved window state. Keeping it group-free makes the workspace
    // handoff unmistakable: the entire set of tabs and pins changes rather
    // than another named cluster appearing inside the same window.
    writing: {
      pinned: ['notion'],
      groups: [],
      loose: ['github', 'gmail', 'scroll'],
    },
  };

  const allIds = (lay) => [...lay.pinned, ...lay.groups.flatMap((g) => g.ids), ...lay.loose];
  const activeGroup = (lay, current) => lay.groups.find((g) => g.ids.includes(current));

  function rowDots(count, accented) {
    return '<span class="row-dots' + (accented ? ' accent' : '') + '">' +
      Array.from({ length: Math.min(count, 5) }, () => '<span></span>').join('') +
      '</span>';
  }

  // Tab rows in the open panel carry no domain column — 1.1.0 dropped it so the
  // title has the room. Quick-Switcher and command rows keep their subs, which
  // is why the domain is opt-in rather than always drawn.
  function tabRow(id, opts) {
    opts = opts || {};
    const t = TABS[id];
    const cls = 'trow' + (opts.hl ? ' hl' : '') + (opts.just ? ' just' : '') + (t.quiet && !opts.sub ? ' quiet' : '') + (opts.inGroup ? ' in-group' : '');
    const dom = opts.sub ? `<span class="dom">${t.domain}</span>` : '';
    const tag = opts.tag ? `<span class="tag">${opts.tag}</span>` : '';
    const enter = opts.enter ? '<span class="enter">↵</span>' : '';
    const rowActions = opts.sub ? '' :
      `<span class="row-pin${opts.pinned ? ' on' : ''}">${PIN_ICON}</span>` +
      (opts.glance ? '<span class="row-glance on">glance</span>' : opts.glanceCue ? '<span class="row-glance cue">glance</span>' : '<span class="row-glance">glance</span>') +
      `<span class="row-close">${CLOSE_ICON}</span>`;
    return `<div class="${cls}"><span class="fav" style="${favStyle(t)}"></span>` +
           `<span class="title">${t.title}</span>${dom}${tag}${rowActions}${enter}</div>`;
  }

  function secHead(label, count, { caret = false, just = false, collapsed = false, kbd = '' } = {}) {
    const cls = 'sec-head' + (just ? ' just' : '') + (collapsed ? ' collapsed' : '');
    return `<div class="${cls}">${caret ? CARET_ICON : ''}<span>${label}</span>` +
           `${count != null ? `<span class="count">${count}</span>` : ''}${kbd ? `<span class="kbd">${kbd}</span>` : ''}</div>`;
  }

  function renderTabsPanel(layName, opts) {
    opts = opts || {};
    const lay = LAYOUTS[layName];

    let html = secHead('pinned', lay.pinned.length);
    lay.pinned.forEach((id) => { html += tabRow(id, { hl: id === opts.current, just: id === opts.justPin, pinned: true, glance: id === opts.glanceTab, glanceCue: id === opts.glanceCue }); });

    lay.groups.forEach((g, index) => {
      const gjust = g.name === opts.justGroup;
      let band = secHead(g.name, g.ids.length, { caret: true, just: gjust, collapsed: g.collapsed, kbd: `⌘${index + 2}` });
      if (!g.collapsed) g.ids.forEach((id) => { band += tabRow(id, { hl: id === opts.current, just: gjust, inGroup: true, glance: id === opts.glanceTab, glanceCue: id === opts.glanceCue }); });
      html += `<div class="group-band">${band}</div>`;
    });

    if (lay.loose.length) {
      lay.loose.forEach((id) => { html += tabRow(id, { hl: id === opts.current, glance: id === opts.glanceTab, glanceCue: id === opts.glanceCue }); });
    }
    html += `<div class="panel-furniture">${secHead('recently closed', 2, { caret: true, collapsed: true })}</div>`;
    // New-tab / private launchers live in the panel's footer bar (static
    // markup), not as list rows — mirrors the app's #islandFooter.
    listEl.innerHTML = html;
  }

  function commandRows(input, { all = false } = {}) {
    const word = input.trim().split(/\s+/)[0] || '/';
    const matches = COMMANDS.filter((c) => c.cmd.startsWith(word) || word === '/');
    const visible = all ? matches : matches.slice(0, 6);
    listEl.innerHTML = matches.length
      ? (all ? secHead('slash commands', null) : '') + visible.map((c, i) => `<div class="trow command${i === 0 ? ' hl' : ''}"><span class="cmd">${c.cmd}</span><span class="hint">${c.hint}</span>${i === 0 ? '<span class="enter">↵</span>' : ''}</div>`).join('')
      : '<div class="trow"><span class="empty">No matching command</span></div>';
    listEl.scrollTop = 0;
  }

  function matchScore(query, text) {
    const t = text.toLowerCase();
    if (t.includes(query)) return 2;
    let i = 0;
    for (const ch of t) {
      if (ch === query[i]) i++;
      if (i === query.length) return 1;
    }
    return 0;
  }

  function switcherResults(layName, query) {
    const lay = LAYOUTS[layName];
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results = [];

    lay.groups.forEach((g) => {
      const nameScore = matchScore(q, g.name);
      const memberScore = nameScore ? 0 : matchScore(q, g.ids.map((id) => `${TABS[id].title} ${TABS[id].domain}`).join(' '));
      if (nameScore || memberScore) {
        results.push({ kind: 'group', title: g.name, domain: `${g.ids.length} tabs`, count: g.ids.length, score: (nameScore || memberScore) + (nameScore ? 0.35 : 0.05) });
      }
    });

    allIds(lay).forEach((id) => {
      const t = TABS[id];
      const score = matchScore(q, `${t.title} ${t.domain}`);
      if (!score) return;
      const kind = SEARCH_TAGS[id] || 'tab';
      const weight = kind === 'favorite' ? 0.3 : kind === 'history' ? 0.2 : 0.1;
      results.push({ kind, id, title: t.title, domain: t.domain, score: score + weight });
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 6);
  }

  function resultRow(result, i) {
    if (result.kind === 'group') {
      return `<div class="trow${i === 0 ? ' hl' : ''}"><span class="result-group-mark">${CARET_ICON}</span><span class="title mono">${result.title}</span><span class="dom">${result.domain}</span><span class="tag">group</span>${i === 0 ? '<span class="enter">↵</span>' : ''}</div>`;
    }
    return tabRow(result.id, { hl: i === 0, tag: result.kind, enter: i === 0, sub: true });
  }

  function switcherRows(layName, input) {
    const rows = switcherResults(layName, input);
    listEl.innerHTML = rows.length
      ? rows.map(resultRow).join('')
      : '<div class="trow"><span class="empty">No matches — enter searches the web</span></div>';
  }

  function renderPill(layName, current, opts) {
    opts = opts || {};
    const DOT_CAP = 8;
    const lay = LAYOUTS[layName];
    const group = activeGroup(lay, current);
    const activeWindow = (members, capacity) => {
      if (members.length <= capacity) return members;
      const activeIndex = Math.max(0, members.indexOf(current));
      const start = activeIndex < capacity
        ? 0
        : Math.min(activeIndex - (capacity - 1), members.length - capacity);
      return members.slice(start, start + capacity);
    };

    // Match src/renderer/renderer.js's islandTabPresentation(): standalone
    // pins remain globally reachable, followed by the active group or loose
    // section. If the active tab is itself a standalone pin, the pinned shelf
    // becomes the active section. The +N is window-wide, not section-local.
    const activeIsPin = lay.pinned.includes(current);
    const pinned = activeIsPin
      ? activeWindow(lay.pinned, DOT_CAP)
      : lay.pinned.slice(0, Math.max(0, DOT_CAP - 1));
    const section = activeIsPin
      ? []
      : activeWindow(group ? group.ids : lay.loose, DOT_CAP - pinned.length);
    const shown = [...pinned, ...section];
    const hidden = Math.max(0, allIds(lay).length - shown.length);
    const classes = (id, sectionStart = false) => [
      id === current ? 'cur' : '',
      sectionStart ? 'dot-section-start' : '',
    ].filter(Boolean).join(' ');
    let dots = pinned.map((id) => `<span class="${classes(id)}"></span>`).join('');
    dots += section.map((id, index) => `<span class="${classes(id, index === 0 && pinned.length > 0)}"></span>`).join('');
    if (hidden > 0) dots += `<span class="dot-more">+${hidden}</span>`;
    dotsEl.innerHTML = dots;

    const t = TABS[current];
    // No domain = the app's placeholder mode (1.6.0): the prompt label with
    // its wash, the "/" chip, the Blanc-mark favicon, and no shield at all —
    // internal pages hide the shield entirely, unlike a protected site with
    // zero blocked (which keeps a quiet shield).
    const blank = !t.domain;
    favEl.classList.toggle('internal', blank);
    favEl.style.backgroundImage = blank ? '' : (t.fav ? `url('${ICON_BASE}${t.fav}.ico')` : 'none');
    domainEl.textContent = blank ? 'Search or type a URL' : t.domain;
    domainEl.classList.toggle('placeholder', blank);
    slashEl.hidden = !blank;
    shieldEl.hidden = blank;
    // Protected with nothing blocked yet is a state of its own in the app — a
    // dimmed shield with no badge, not a missing one. The shield is a permanent
    // landmark in the pill; only the badge comes and goes.
    shieldEl.classList.toggle('shield-quiet', !t.shield);
    shieldCountEl.textContent = t.shield || '';
    shieldHostEl.textContent = t.domain;
    shieldBlockedEl.textContent = t.shield ? `${t.shield} request${t.shield === 1 ? '' : 's'} blocked` : 'Nothing blocked on this page';
    // Favorite (heart) fills for the sites the demo treats as favorites.
    heartEl.classList.toggle('on', SEARCH_TAGS[current] === 'favorite');
  }

  function setHeroMessage(scene) {
    headlineEl.textContent = scene.headline;
    subtextEl.textContent = scene.subtext;
    heroMessageEl.classList.remove('scene-change');
    void heroMessageEl.offsetWidth; // restart the quiet message transition
    heroMessageEl.classList.add('scene-change');
  }

  function stopTyping() {
    clearInterval(typeTimer);
    typeTimer = null;
  }

  const TYPE_MS = 105;          // per-character typing cadence, slow enough to follow
  const POST_TYPE_HOLD = 2800; // linger after typing finishes to read the result + hero message

  function typeInput(text, renderPartial, renderBeforeTyping) {
    stopTyping();
    typedEl.textContent = '';
    renderBeforeTyping();
    let i = 0;
    typeTimer = setInterval(() => {
      i++;
      const partial = text.slice(0, i);
      typedEl.textContent = partial;
      renderPartial(partial);
      if (i >= text.length) stopTyping();
    }, TYPE_MS);
  }

  // ---- scenes: one linear workflow, paced for the message and interaction ----
  const SCENES = [
    { view: 'rest',  layout: 'base',    current: 'github',  hold: 3200, headline: 'The browser that\ngets out of the way.', subtext: 'Blanc puts tabs, search and commands in one floating Island — so the page is all you see.' },
    { view: 'rest',  layout: 'base',    current: 'github',  scroll: true, hold: 4200, headline: 'Your page stays\nin front.', subtext: 'Scroll freely while the Island remains fixed above the page, ready without taking over.' },
    // An invitation rather than a claim: the pill only reacts to a real cursor,
    // so the message points at something the visitor can go and do.
    { view: 'rest',  layout: 'base',    current: 'github',  pointer: { target: '.pill', x: 0.58, y: 0.62 }, hold: 3400, headline: 'Close when you need it.\nQuiet when you do not.', subtext: 'Move toward the Island and it gently meets you; move away and it settles back down.' },
    // The blank-tab beat: the pill drops to its placeholder ("Search or type
    // a URL" + the "/" chip), the state the app shows only on a new tab.
    { view: 'rest',  layout: 'fresh',   current: 'newtab',  pointer: { target: '#demoSlash', click: true }, hold: 1600, headline: 'Every command starts\nwith one slash.', subtext: 'On a new tab, click / to open Blanc’s complete command directory.' },
    { view: 'panel', layout: 'fresh',   current: 'newtab',  panel: 'commands', allCommands: true, pointer: { target: '.list', x: 0.62, y: 0.32 }, hold: 6200, headline: 'Every command.\nOne quiet place.', subtext: 'Scroll the directory or start typing to narrow it to exactly what you need.' },
    { view: 'panel', layout: 'base',    current: 'github',  panel: 'switcher', typed: 'scr', pointer: { target: '.field', x: 0.2 }, hold: 3400, headline: 'Find anything\nin a few letters.', subtext: 'The same field searches open tabs, Favorites and recent history.' },
    { view: 'rest',  layout: 'base',    current: 'scroll',  hold: 2800, headline: 'Switch tabs.\nKeep the page.', subtext: 'Press Enter and Blanc puts the destination in front without leaving browser chrome behind.' },
    { view: 'panel', layout: 'pinned',  current: 'scroll',  panel: 'commands', typed: '/pin', justPin: 'scroll', pointer: { target: '.trow.command.hl', x: 0.18 }, hold: 3800, headline: 'Small browser chores,\none short command.', subtext: 'Pin, mute, find and more without hunting through menus.' },
    { view: 'panel', layout: 'grouped', current: 'netflix', justGroup: 'watch', pointer: { target: '.group-band:last-of-type .sec-head', x: 0.28 }, hold: 4200, headline: 'Give related tabs\na name.', subtext: 'Named Groups keep YouTube and Netflix together without adding another permanent sidebar.' },
    { view: 'panel', layout: 'folded',  current: 'netflix', pointer: { target: '.group-band:first-of-type .sec-head', x: 0.28, click: true }, hold: 3300, headline: 'Tuck a group away\nuntil you need it.', subtext: 'Folded groups stay out of sight while remaining one keyboard jump away.' },
    { view: 'panel', layout: 'grouped', current: 'netflix', panel: 'switcher', typed: 'No', pointer: { target: '.field', x: 0.18 }, hold: 4200, headline: 'Search across\nyour whole session.', subtext: 'Tabs, groups, Favorites and history all answer from the same input.' },
    { view: 'rest',  layout: 'grouped', current: 'notion', hold: 3200, headline: 'Enter switches.\nThe page returns.', subtext: 'Blanc gets the interface out of the way as soon as you choose where to go.' },
    // Keep the active tab continuous from the prior scene. Both Notion and
    // Scroll are standalone pins, so making either one main leaves the same
    // pinned-shelf dot presentation in the pill instead of manufacturing a
    // Glance-only width jump by silently moving to a different tab section.
    { view: 'panel', layout: 'grouped', current: 'notion', glanceCue: 'scroll', pointer: { target: '.row-glance.cue', click: true }, hold: 1250, headline: 'Keep another tab\nin Glance.', subtext: 'Choose Glance from any tab row to keep a second page beside the first.' },
    { view: 'glance', layout: 'grouped', current: 'notion', glanceTab: 'scroll', glanceResize: { from: 0.62, to: 0.5 }, pointer: { target: '#demoGlanceDivider', drag: true }, hold: 5200, headline: 'Give either page\nmore room.', subtext: 'Drag the divider until the balance between your main page and Glance feels right.' },
    { view: 'glance', layout: 'grouped', current: 'notion', glanceTab: 'scroll', glanceRatio: 0.5, glanceSwap: { main: 'scroll', glance: 'notion' }, pointer: { target: '#demoGlanceMakeMain', click: true }, hold: 5600, headline: 'Make either tab\nthe main page.', subtext: 'Swap their roles instantly without closing a tab or losing its place.' },
    { view: 'workspace', layout: 'grouped', current: 'scroll', workspaceName: 'research', pointer: { target: '.demo-ws-row:nth-child(2)', click: true }, hold: 1600, headline: 'Move between whole\nWorkspaces.', subtext: 'Named Workspaces preserve an entire window for Patron members.' },
    { view: 'panel', layout: 'writing', current: 'notion', workspaceName: 'writing', hold: 4800, headline: 'Your whole window,\nright where you left it.', subtext: 'Tabs, pins and the active page arrive together when you open a saved Workspace.' },
    { view: 'shield',layout: 'grouped', current: 'netflix', pointer: { target: '#demoShield', click: true }, hold: 4800, headline: 'Site controls live\nin the Island.', subtext: 'Click the Blanc Blocker shield to see what was stopped or change protection for this site.' },
    { view: 'panel', layout: 'grouped', current: 'youtube', panel: 'commands', typed: '/private', pointer: { target: '.trow.command.hl', x: 0.18 }, hold: 3600, headline: 'Open a private tab\nin one command.', subtext: 'Private tabs use a separate session and never enter your browsing history.' },
    { view: 'rest',  layout: 'grouped', current: 'youtube', priv: true, hold: 3800, headline: 'Private means\nnothing gets saved.', subtext: 'The chrome shifts with the session, and the tab leaves no history behind.' },
  ];

  // Chapters group the scenes into the demo's topics; each scrub-bar marker sits
  // at the start of one and jumps playback there.
  const CHAPTERS = [
    { label: 'the island', scene: 0 },
    { label: 'command bar', scene: 4 },
    { label: 'tab groups', scene: 8 },
    { label: 'glance', scene: 12 },
    { label: 'workspaces', scene: 15 },
    { label: 'blanc blocker', scene: 17 },
    { label: 'private tabs', scene: 18 },
  ];
  // A scene's on-screen duration: typing scenes run for the keystrokes plus a
  // read beat, everything else uses its authored hold. The scrub fill and the
  // scene timer share this so the bar tracks playback exactly.
  const DEMO_PACE = 1.18;
  const sceneDuration = (s) => Math.round((s.typed ? s.typed.length * TYPE_MS + POST_TYPE_HOLD : s.hold) * DEMO_PACE);
  const DUR = SCENES.map(sceneDuration);
  const TOTAL = DUR.reduce((sum, d) => sum + d, 0);
  const START = []; DUR.reduce((acc, d, i) => (START[i] = acc, acc + d), 0);

  let idx = 0, timer = null, typeTimer = null;

  function applyScene(s) {
    stopTyping();
    clearTimeout(glanceActionTimer);
    clearTimeout(glanceEffectTimer);
    clearTimeout(shieldActionTimer);
    stage.classList.remove('glance-resizing', 'glance-swapping');
    glanceMakeMainEl.classList.remove('activated');
    const open = s.view === 'panel' || s.view === 'workspace';
    const openingPanel = open && !panelOpen;
    const showShield = s.view === 'shield';
    const showWorkspaces = s.view === 'workspace';
    const showGlance = s.view === 'glance';
    const lay = LAYOUTS[s.layout];
    const current = s.current || allIds(lay)[0];
    listEl.classList.toggle('command-directory', !!s.allCommands);
    // A shield scene starts closed. The popover is revealed only after the
    // staged pointer has reached and clicked the shield below.
    demo.classList.remove('show-shield');
    demo.classList.toggle('show-workspaces', showWorkspaces);
    workspaceSwitcherEl.hidden = !showWorkspaces;
    workspaceLabelEl.textContent = s.workspaceName || 'research';
    workspaceEl.setAttribute('aria-label', `Workspace ${s.workspaceName || 'research'}`);
    workspaceEl.setAttribute('aria-expanded', String(showWorkspaces));
    demo.classList.toggle('private', !!s.priv);
    stage.classList.remove('scrolling');
    void stage.offsetWidth; // restart the scroll animation when the scene repeats
    stage.classList.toggle('scrolling', !!s.scroll);
    stage.classList.toggle('private-loading', !!s.priv);
    stage.setAttribute('data-theme', s.priv ? 'private' : 'light');
    footEl.textContent = s.priv ? PRIVATE_FOOT : lay.groups.length > 1 ? GROUP_FOOT : NORMAL_FOOT;

    renderPill(s.layout, current, s);
    showShot(s.priv ? null : current);
    privateSkeletonEl.hidden = !s.priv;
    const startingGlanceRatio = s.glanceResize?.from ?? s.glanceRatio ?? 0.62;
    setDemoGlance(showGlance, { ratio: startingGlanceRatio, tab: s.glanceTab });
    // The blank tab shows a miniature of the ledger start page instead of a
    // site render — the surface the quiet pill actually rests over in the app.
    newtabEl.hidden = !TABS[current].internal || !!s.priv;
    // Color-match the top strip to the page now behind it, so the Island reads
    // as floating in the page's top margin rather than on a browser bar.
    stage.style.setProperty('--demo-strip-bg', s.priv ? PRIVATE_TOP : (SHOT_TOP[current] || ''));
    setHeroMessage(s);

    // Content first, then the movement — the morph measures the panel it is
    // about to grow into, so the rows have to be in place before it starts.
    if (open) {
      if (s.panel === 'commands' && s.allCommands) {
        typedEl.textContent = '/';
        commandRows('/', { all: true });
      } else if (s.typed && s.panel === 'commands') {
        typeInput(s.typed, commandRows, () => renderTabsPanel(s.layout, s));
      } else if (s.typed && s.panel === 'switcher') {
        typeInput(s.typed, (partial) => switcherRows(s.layout, partial), () => renderTabsPanel(s.layout, s));
      } else {
        typedEl.textContent = '';
        renderTabsPanel(s.layout, s);
      }
    } else {
      typedEl.textContent = '';
    }
    setPanelOpen(open);
    setCursorCue(s.pointer, { openingPanel });
    if (showShield) {
      shieldActionTimer = setTimeout(
        () => demo.classList.add('show-shield'),
        reduceMotion.matches ? 0 : 840
      );
    }
    // The cursor starts after 90ms and travels for 720ms. Begin resizing as
    // its tip reaches the divider; Make Main keeps its slightly longer click
    // beat so the button press still reads clearly.
    const glanceActionDelay = reduceMotion.matches ? 0 : s.glanceResize ? 820 : 920;
    if (s.glanceResize) {
      glanceActionTimer = setTimeout(() => animateGlanceResize(s.glanceResize.to), glanceActionDelay);
    } else if (s.glanceSwap) {
      glanceActionTimer = setTimeout(
        () => swapGlanceMain(s.layout, s.glanceSwap.main, s.glanceSwap.glance, s),
        glanceActionDelay
      );
    }
  }

  // ---- scrub bar: progress fill + clickable chapter markers ----
  const trackEl = document.getElementById('demoScrubTrack');
  const fillEl = document.getElementById('demoScrubFill');
  const markerEls = trackEl ? CHAPTERS.map((ch) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'demo-scrub-marker';
    b.style.left = (START[ch.scene] / TOTAL * 100) + '%';
    b.setAttribute('aria-label', 'Jump to ' + ch.label);
    const lbl = document.createElement('span');
    lbl.className = 'demo-scrub-label';
    lbl.textContent = ch.label;
    b.appendChild(lbl);
    b._scene = ch.scene;
    b.addEventListener('click', () => jumpTo(ch.scene));
    trackEl.appendChild(b);
    return b;
  }) : [];

  // Fill the bar linearly over the current scene's duration. The fill is snapped
  // back to the scene's start with the transition disabled (so a loop wrap
  // doesn't animate backwards), then transitions to the scene's end.
  function updateScrub() {
    if (fillEl) {
      const from = START[idx] / TOTAL * 100;
      const to = (START[idx] + DUR[idx]) / TOTAL * 100;
      fillEl.style.transition = 'none';
      fillEl.style.width = from + '%';
      void fillEl.offsetWidth; // reflow so the snap-back applies before animating
      fillEl.style.transition = 'width ' + DUR[idx] + 'ms linear';
      fillEl.style.width = to + '%';
    }
    let activeScene = 0;
    for (const ch of CHAPTERS) if (ch.scene <= idx) activeScene = ch.scene;
    markerEls.forEach((m) => m.classList.toggle('active', m._scene === activeScene));
  }

  function jumpTo(sceneIndex) {
    clearTimeout(timer);
    stopTyping();
    idx = sceneIndex;
    tick();
  }

  function tick() {
    applyScene(SCENES[idx]);
    updateScrub();
    timer = setTimeout(() => { idx = (idx + 1) % SCENES.length; tick(); }, DUR[idx]);
  }
  tick();
})();
