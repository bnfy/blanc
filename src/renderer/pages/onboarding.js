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
    importing: false,
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
      row.addEventListener('click', () => {
        state.importSource = state.importSource === source.id ? null : source.id;
        sync();
      });
      sourceList.appendChild(row);
    }
  }

  // F30/D22: no browser profile directory is read until this explicit ask.
  async function lookForBrowsers() {
    lookBtn.disabled = true;
    importStatus.textContent = 'Looking for installed browsers…';
    try {
      const sources = await window.bowserPages.bookmarks.browserSources();
      state.looked = true;
      state.sources = [
        ...(sources ?? []),
        state.sources[state.sources.length - 1], // the file row stays last
      ];
      importStatus.textContent = sources?.length ? '' : 'No other browser profiles found.';
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
    if (!source || state.importing) return false;
    state.importing = true;
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
      } else {
        const from = result.source?.label ? ` from ${result.source.label}` : '';
        const skipped = result.skipped
          ? `; skipped ${plural(result.skipped, 'favorite')} already saved`
          : '';
        importStatus.textContent = `Imported ${plural(result.added, 'favorite')}${from}${skipped}.`;
      }
    } catch {
      importStatus.textContent = "Couldn't import from there.";
    } finally {
      state.importing = false;
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
  }

  async function next() {
    if (state.step === IMPORT_STEP && (await runImportIfSelected())) return;
    if (state.step === LAST_STEP) {
      finish();
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
    sync();
    nextBtn.focus();
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

  skipBtn.addEventListener('click', finish);
  nextBtn.addEventListener('click', next);
  backBtn.addEventListener('click', back);
  setDefaultBtn.addEventListener('click', async () => {
    try {
      const def = await window.bowserPages.start.setDefaultBrowser();
      state.defaultSet = !!def?.isDefault;
      state.canSetDefault = !!def?.canSet;
    } catch { /* status unchanged */ }
    sync();
  });
  lookBtn.addEventListener('click', lookForBrowsers);
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
