// First-run onboarding dialog (design system "New tab v2 + onboarding"
// handoff; six-step variant per the 2026-08-16 spec — privacy consent is
// step 5). Owns only the dialog: newtab.js calls window.blancOnboarding
// .maybeShow(status, onboarding) on every status render, and everything else
// happens in here. Steps write through narrow, sender-validated IPC; nothing
// closes until the privacy choices are confirmed saved.
(() => {
  const params = new URLSearchParams(location.search);
  const TOUR = params.has('tour');
  const isPrivate = params.has('private');

  const LABELS = ['default browser', 'import', 'the island', 'ad blocking', 'privacy', 'theme'];
  const IMPORT_STEP = 1;
  const PRIVACY_STEP = 4;
  const LAST_STEP = 5;
  const FILE_SOURCE = '__file__';

  const scrim = document.getElementById('onboardScrim');
  const dialog = document.getElementById('onboardDialog');
  const stepLabel = document.getElementById('obStepLabel');
  const skipBtn = document.getElementById('obSkip');
  const backBtn = document.getElementById('obBack');
  const nextBtn = document.getElementById('obNext');
  const dots = document.querySelectorAll('#obDots span');
  const sections = document.querySelectorAll('#obContent [data-step]');
  const setDefaultBtn = document.getElementById('obSetDefault');
  const lookBtn = document.getElementById('obLook');
  const sourceList = document.getElementById('obSources');
  const importStatus = document.getElementById('obImportStatus');
  const bringTabsBtn = document.getElementById('obBringTabs');
  const adblockToggle = document.getElementById('obAdblock');
  const suggestionsToggle = document.getElementById('obSuggestions');
  const pingToggle = document.getElementById('obPing');
  const privacyError = document.getElementById('obPrivacyError');
  const themeLight = document.getElementById('obThemeLight');
  const themeDark = document.getElementById('obThemeDark');

  const state = {
    step: 0,
    shown: false,
    done: false,
    defaultSet: false,
    canSetDefault: false,
    looked: false,
    // The bookmarks-file row is available from the start — Safari/Firefox
    // users need no discovery to use it. Look prepends detected browsers.
    sources: [{ id: FILE_SOURCE, label: 'From a bookmarks file (HTML)…' }],
    importSource: null,    // selected source id, or null = "no thanks"
    // 'skip' — Bring tabs without importing everything…; 'post-import' — folder handoff.
    importHandoff: 'skip',
    // Shared transition lock: one navigation/import/persist at a time. While
    // held, Continue/Back/Skip and the import controls are disabled — a
    // second Continue during a pending import must never advance the step.
    busy: false,
    adblock: true,
    suggestions: true,
    ping: true,
    theme: null,           // 'system' | 'light' | 'dark' — system marks no card
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function setToggle(el, on) {
    el.setAttribute('aria-checked', String(!!on));
  }

  function sync() {
    dialog.dataset.step = String(state.step);
    nextBtn.disabled = state.busy;
    backBtn.disabled = state.busy;
    skipBtn.disabled = state.busy;
    stepLabel.textContent = `${state.step + 1} / 6 — ${LABELS[state.step]}`;
    nextBtn.textContent = state.step === LAST_STEP ? 'Start browsing' : 'Continue';
    dots.forEach((dot, i) => dot.classList.toggle('on', i === state.step));
    sections.forEach((section) => {
      section.hidden = Number(section.dataset.step) !== state.step;
    });

    // Set-default CTA: primary at rest; confirmed-secondary once set; plain
    // disabled where the OS registration is unavailable (dev runs, Linux).
    const confirmed = state.defaultSet;
    setDefaultBtn.disabled = confirmed || !state.canSetDefault;
    setDefaultBtn.textContent = confirmed ? 'Blanc is your default' : 'Set as default';
    dialog.style.setProperty('--ob-default-bg', confirmed || !state.canSetDefault ? 'var(--surface-raised)' : 'var(--accent)');
    dialog.style.setProperty('--ob-default-text', confirmed || !state.canSetDefault ? 'var(--text-dim)' : 'var(--surface-raised)');
    dialog.style.setProperty('--ob-default-border', confirmed || !state.canSetDefault ? 'var(--border)' : 'var(--accent)');

    lookBtn.hidden = state.looked;
    lookBtn.disabled = state.busy;
    bringTabsBtn.hidden = state.step !== IMPORT_STEP || !state.importHandoff;
    bringTabsBtn.disabled = state.busy;
    bringTabsBtn.textContent = state.importHandoff === 'post-import'
      ? 'Bring a folder in as tabs…'
      : 'Bring tabs without importing everything…';
    renderSources();

    setToggle(adblockToggle, state.adblock);
    setToggle(suggestionsToggle, state.suggestions);
    setToggle(pingToggle, state.ping);

    themeLight.classList.toggle('selected', state.theme === 'light');
    themeDark.classList.toggle('selected', state.theme === 'dark');
  }

  function renderSources() {
    sourceList.replaceChildren();
    for (const source of state.sources) {
      if (source.unavailable) {
        const row = document.createElement('div');
        row.className = 'ob-src-unavailable';
        const label = document.createElement('span');
        label.className = 'ob-src-unavailable-name';
        label.textContent = source.label;
        const hint = document.createElement('span');
        hint.className = 'ob-src-unavailable-hint';
        hint.textContent = source.guidance ?? '';
        row.append(label, hint);
        sourceList.appendChild(row);
        continue;
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ob-src-row' + (state.importSource === source.id ? ' selected' : '');
      const radio = document.createElement('span');
      radio.className = 'ob-radio';
      radio.appendChild(document.createElement('span'));
      const label = document.createElement('span');
      label.textContent = source.label;
      row.append(radio, label);
      // Re-clicking the selected row deselects — advancing with nothing
      // selected is the "no thanks" path.
      row.disabled = state.busy;
      row.addEventListener('click', () => {
        if (state.busy) return;
        state.importSource = state.importSource === source.id ? null : source.id;
        sync();
      });
      sourceList.appendChild(row);
    }
  }

  /** Runs fn under the transition lock; re-entry is a silent no-op. */
  async function withBusy(fn) {
    if (state.busy) return;
    state.busy = true;
    sync();
    try {
      await fn();
    } finally {
      state.busy = false;
      sync();
    }
  }

  // F30/D22: no browser profile directory is read until this explicit ask.
  async function lookForBrowsers() {
    lookBtn.disabled = true;
    importStatus.textContent = 'Looking for installed browsers…';
    try {
      const result = await window.bowserPages.bookmarks.browserSources();
      const sources = result?.sources ?? [];
      const unavailable = result?.unavailable ?? [];
      state.looked = true;
      state.sources = [
        ...sources.map((source) => ({ id: source.id, label: source.label })),
        ...unavailable.map((entry) => ({
          id: null,
          label: entry.label,
          unavailable: true,
          guidance: entry.guidance ?? '',
        })),
        state.sources[state.sources.length - 1], // the file row stays last
      ];
      importStatus.textContent = (sources.length || unavailable.length)
        ? ''
        : 'No other browser profiles found.';
    } catch {
      importStatus.textContent = "Couldn't check for other browsers.";
    } finally {
      lookBtn.disabled = false;
      sync();
    }
  }

  /** Runs the selected import. Returns true when the step should HOLD (an
   * import ran and its result deserves reading) rather than advance. */
  async function runImportIfSelected() {
    const source = state.importSource;
    if (!source) return false;
    importStatus.textContent = 'Importing favorites…';
    try {
      const result = source === FILE_SOURCE
        ? await window.bowserPages.bookmarks.import()
        : await window.bowserPages.bookmarks.importBrowser(source);
      if (result?.cancelled) {
        importStatus.textContent = '';
      } else if (result?.error === 'empty') {
        importStatus.textContent = 'No favorites found there.';
      } else if (result?.error === 'too-large') {
        importStatus.textContent = 'That profile is too large to import safely.';
      } else if (result?.error) {
        importStatus.textContent = "Couldn't read that browser profile.";
      } else if (result.added > 0) {
        const from = result.source?.label ? ` from ${result.source.label}` : '';
        const skipped = result.skipped
          ? `; skipped ${plural(result.skipped, 'favorite')} already saved`
          : '';
        importStatus.textContent = `Imported ${plural(result.added, 'favorite')}${from}${skipped}.`;
        state.importHandoff = 'post-import';
      } else {
        importStatus.textContent = result.skipped
          ? `All ${plural(result.skipped, 'favorite')} were already saved.`
          : 'No favorites found there.';
        state.importHandoff = 'skip';
      }
    } catch {
      importStatus.textContent = "Couldn't import from there.";
    } finally {
      state.importSource = null; // the next Continue advances
      sync();
    }
    return true;
  }

  async function persistPrivacy() {
    try {
      const result = await window.bowserPages.start.completePrivacy({
        searchSuggestions: state.suggestions,
        usagePing: state.ping,
      });
      return !!result?.completed;
    } catch {
      return false;
    }
  }

  // Close ONLY on confirmed persistence: a failed write keeps the dialog up
  // and surfaces the card's error copy on the privacy step.
  function dismissForHandoff() {
    scrim.hidden = true;
    dialog.hidden = true;
    setBackgroundInert(false);
  }

  function openBringTabs() {
    dismissForHandoff();
    window.location.href = 'blanc://tab-import/';
  }

  async function finish() {
    if (!(await persistPrivacy())) {
      state.step = PRIVACY_STEP;
      sync();
      privacyError.textContent = 'Could not save these choices. Check disk access and try again.';
      return;
    }
    state.done = true;
    scrim.hidden = true;
    dialog.hidden = true;
    setBackgroundInert(false);
  }

  async function next() {
    if (state.step === IMPORT_STEP && (await runImportIfSelected())) return;
    if (state.step === LAST_STEP) {
      await finish();
      return;
    }
    state.step += 1;
    sync();
  }

  function back() {
    if (state.step === 0) return; // never wraps
    state.step -= 1;
    sync();
  }

  async function show(status, onboarding) {
    state.shown = true;
    // Real current values only: the projection carries what is actually
    // saved, so a tour replay shows the truth, never invented defaults.
    state.adblock = !!onboarding.adblockEnabled;
    state.theme = onboarding.theme ?? null;
    state.suggestions = !!status.privacy?.searchSuggestions;
    state.ping = !!status.privacy?.usagePing;
    try {
      const def = await window.bowserPages.start.defaultBrowser();
      state.defaultSet = !!def?.isDefault;
      state.canSetDefault = !!def?.canSet;
    } catch {
      state.defaultSet = false;
      state.canSetDefault = false;
    }
    scrim.hidden = false;
    dialog.hidden = false;
    setBackgroundInert(true);
    sync();
    nextBtn.focus();
  }

  /** Everything behind the modal goes inert while it is open — the scrim
   * already blocks the pointer, but Tab could still walk into the page. */
  function setBackgroundInert(on) {
    for (const el of document.body.children) {
      if (el !== scrim && el !== dialog) el.inert = on;
    }
  }

  function maybeShow(status, onboarding) {
    if (isPrivate || state.shown || state.done) return;
    // The blocking-preparation/failure card owns the surface while startup
    // is unsettled; the dialog waits for the next status push.
    const startupBusy = status?.startup?.phase === 'initializing' || status?.startup?.phase === 'failed';
    if (startupBusy) return;
    // The projection is REQUIRED: an early pages:start:status broadcast can
    // land before start.data() resolves, and opening on it would show
    // invented defaults instead of saved ones.
    if (!onboarding) return;
    if (TOUR || status?.privacy?.required) show(status, onboarding);
  }

  skipBtn.addEventListener('click', () => withBusy(finish));
  nextBtn.addEventListener('click', () => withBusy(next));
  backBtn.addEventListener('click', () => withBusy(back));
  setDefaultBtn.addEventListener('click', async () => {
    try {
      const def = await window.bowserPages.start.setDefaultBrowser();
      state.defaultSet = !!def?.isDefault;
      state.canSetDefault = !!def?.canSet;
    } catch { /* status unchanged */ }
    sync();
  });
  lookBtn.addEventListener('click', () => withBusy(lookForBrowsers));
  bringTabsBtn.addEventListener('click', () => withBusy(openBringTabs));
  adblockToggle.addEventListener('click', () => {
    state.adblock = !state.adblock;
    window.bowserPages.start.onboardingSet({ adblockEnabled: state.adblock });
    sync();
  });
  suggestionsToggle.addEventListener('click', () => {
    state.suggestions = !state.suggestions;
    privacyError.textContent = '';
    sync();
  });
  pingToggle.addEventListener('click', () => {
    state.ping = !state.ping;
    privacyError.textContent = '';
    sync();
  });
  // Theme applies live during the flow (prototype behavior), not on finish.
  themeLight.addEventListener('click', () => {
    state.theme = 'light';
    window.bowserPages.start.onboardingSet({ theme: 'light' });
    sync();
  });
  themeDark.addEventListener('click', () => {
    state.theme = 'dark';
    window.bowserPages.start.onboardingSet({ theme: 'dark' });
    sync();
  });

  window.blancOnboarding = { maybeShow };
})();
