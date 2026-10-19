(async () => {
  const {
    settings,
    searchEngines,
    appIcons,
    appInfo,
    capabilities,
    onePasswordAvailable,
    languages,
  } =
    await window.bowserPages.settings.get();

  // Electron desktop sends no `capabilities` field; its main process separately
  // reports whether the 1Password bridge is available. A platform
  // that DOES send the capabilities list (iOS)
  // gets each unsupported feature skipped ENTIRELY — no child getElementById, no
  // bridge call to an unimplemented method, no listener — then its control is
  // removed. Guarding (not merely removing) matters because several sections
  // `await` a bridge method on load; an unimplemented one rejects and would
  // abort this whole IIFE, and removing a container first makes its children
  // un-findable by id (getElementById → null → `.addEventListener` throws).
  const { t } = blancI18n;
  const cap = capabilities ? new Set(capabilities) : null;
  const supports = (feature) => !cap || cap.has(feature);

  // The Dark websites and blocker exception lists share one shape: a row per
  // site with an always-visible × named for that site. After a removal, focus
  // moves to the × now in the same place, or to the add field once the list
  // is empty, so a keyboard user is never dropped back at the top of the page.
  // Removals run one at a time and each reads the saved list afresh, so two
  // quick clicks can never write back a site the first one removed.
  let siteRemovals = Promise.resolve();
  function renderSiteList({ list, input, hostnames, emptyKey, onRemove }) {
    list.replaceChildren();
    if (hostnames.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'site-list-empty';
      empty.textContent = t(emptyKey);
      list.append(empty);
      return;
    }
    [...hostnames].sort().forEach((hostname, index) => {
      const row = document.createElement('div');
      row.className = 'site-row';
      const name = document.createElement('span');
      name.className = 'site-row-name';
      name.textContent = hostname;
      name.dataset.i18nIgnore = '';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'site-row-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', t('settings.siteList.remove', { site: hostname }));
      remove.addEventListener('click', async () => {
        const hadFocus = document.activeElement === remove;
        siteRemovals = siteRemovals.then(() => onRemove(hostname)).catch((error) => console.error(error));
        await siteRemovals;
        if (!hadFocus) return;
        const buttons = list.querySelectorAll('.site-row-remove');
        (buttons[Math.min(index, buttons.length - 1)] ?? input).focus();
      });
      row.append(name, remove);
      list.append(row);
    });
  }

  function renderWallpaperSetting() {
    if (!supports('newtabDynamicWallpaper')) return;
    const control = document.getElementById('newtabDynamicWallpaper');
    control.checked = settings.newtabDynamicWallpaper === true;
    document.getElementById('dynamicWallpaperHint').textContent =
      t('settings.general.newtabDynamicWallpaper.syncedHint');
  }
  if (supports('newtabDynamicWallpaper')) {
    renderWallpaperSetting();
    document.getElementById('newtabDynamicWallpaper').addEventListener('change', async (event) => {
      const result = await window.bowserPages.settings.set({ newtabDynamicWallpaper: event.target.checked });
      settings.newtabDynamicWallpaper = result.newtabDynamicWallpaper;
      renderWallpaperSetting();
    });
    window.bowserPages.settings.onAppearance?.((status) => {
      settings.newtabDynamicWallpaper = status.newtabDynamicWallpaper === true;
      renderWallpaperSetting();
    });
  } else {
    document.getElementById('dynamicWallpaperSetting')?.remove();
  }

  // F49: this device's own Start Page image. Main answers with the same
  // { source, hasImage, image } projection the Start Page receives.
  if (supports('newtabCustomWallpaper') && window.bowserPages.settings.wallpaper) {
    const toggle = document.getElementById('newtabCustomWallpaper');
    const choose = document.getElementById('customWallpaperChoose');
    const remove = document.getElementById('customWallpaperRemove');
    const hint = document.getElementById('customWallpaperHint');
    const errors = {
      'too-large': 'newtab.wallpaper.error.tooLarge',
      unsupported: 'newtab.wallpaper.error.unsupported',
      unreadable: 'newtab.wallpaper.error.unreadable',
    };
    let state = { source: 'sunrise', hasImage: false };
    const render = (error) => {
      toggle.checked = state.source === 'custom';
      choose.textContent = state.hasImage ? t('newtab.wallpaper.change') : t('newtab.wallpaper.choose');
      remove.hidden = !state.hasImage;
      hint.textContent = errors[error] ? t(errors[error]) : t('settings.general.newtabCustomWallpaper.hint');
    };
    const apply = (next, error) => {
      if (next && typeof next === 'object') state = next;
      render(error);
    };
    const pick = async () => {
      const reply = await window.bowserPages.settings.chooseWallpaper();
      apply(reply?.wallpaper, reply?.error);
    };
    choose.addEventListener('click', pick);
    remove.addEventListener('click', async () => apply(await window.bowserPages.settings.removeWallpaper()));
    toggle.addEventListener('change', async () => {
      if (toggle.checked && !state.hasImage) return pick();
      const off = settings.newtabDynamicWallpaper === true ? 'time-of-day' : 'sunrise';
      apply(await window.bowserPages.settings.setWallpaper(toggle.checked ? 'custom' : off));
    });
    window.bowserPages.settings.onAppearance?.((status) => apply(status.wallpaper));
    window.bowserPages.settings.wallpaper().then((next) => apply(next));
  } else {
    document.getElementById('customWallpaperSetting')?.remove();
  }

  // About is a read-only projection of the running desktop build. Other
  // platforms can omit it and the updater method without gaining a new call.
  if (appInfo) {
    const platforms = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
    for (const [id, value] of Object.entries({
      aboutBlanc: appInfo.blancVersion,
      aboutElectron: appInfo.electronVersion,
      aboutChromium: appInfo.chromiumVersion,
      aboutPlatform: platforms[appInfo.platform] || appInfo.platform,
      aboutArchitecture: appInfo.architecture,
    })) {
      const element = document.getElementById(id);
      element.textContent = value || t('settings.help.unavailable');
      // Versions and platform names are the same in every language.
      if (value) element.dataset.i18nIgnore = '';
    }
    document.getElementById('appAboutCard').hidden = false;
    const check = document.getElementById('checkForUpdates');
    if (typeof window.bowserPages.settings.checkForUpdates === 'function') {
      check.hidden = false;
      check.addEventListener('click', async () => {
        check.disabled = true;
        const status = document.getElementById('updateCheckStatus');
        status.textContent = '';
        try {
          await window.bowserPages.settings.checkForUpdates();
        } catch {
          status.textContent = t('settings.help.updateCheckFailed');
        } finally {
          check.disabled = false;
        }
      });
    }
  }

  // --- Core: theme / search engine / adblock (always supported) ---
  const theme = document.getElementById('theme');
  const newtabLayout = document.getElementById('newtabLayout');
  const showWelcomeTour = document.getElementById('showWelcomeTour');
  const searchEngine = document.getElementById('searchEngine');
  const searchSuggestions = document.getElementById('searchSuggestions');
  const adblockEnabled = document.getElementById('adblockEnabled');
  if (typeof window.bowserPages.settings.blockingStatus === 'function') {
    const selector = document.getElementById('adblockProvider');
    const label = id => id === 'ublock-origin' ? 'uBlock Origin' : 'Blanc Blocker';
    const renderBlocking = (state) => {
      if (!state) return;
      document.getElementById('blockingProviderSetting').hidden = state.exposed === false;
      selector.value = state.fallback ? state.active : state.selected;
      selector.querySelector('[value="ublock-origin"]').disabled = !state.supported;
      const status = document.getElementById('blockingProviderStatus');
      const unavailable = t('settings.blockingStatus.unavailable');
      const provider = label(state.active);
      const shown = state.enabled ? state.phase : 'disabled';
      const phase = shown === 'ready' ? t('settings.blockingStatus.ready', { provider })
        : shown === 'initializing' ? t('settings.blockingStatus.initializing', { provider })
          : shown === 'disabled' ? t('settings.blockingStatus.disabled', { provider })
            : t('settings.blockingStatus.phase', { provider, phase: shown });
      status.textContent = state.restartPending
        ? t('settings.blockingStatus.restartPending', { selected: label(state.selected), active: provider })
        : state.phase === 'recovering'
          ? t('settings.blockingStatus.recovering', { provider })
        : state.phase === 'failed'
          ? (state.enabled
            ? t('settings.blockingStatus.failed', { provider, error: state.error })
            : t('settings.blockingStatus.failedOff', { provider, error: state.error }))
          : state.phase === 'unsupported'
            ? unavailable
            : state.supported || state.exposed === false || state.fallback ? phase : `${phase} ${unavailable}`;
      if (state.fallback) {
        const protection = state.enabled && state.phase === 'ready' ? t('settings.blockingStatus.fallbackActive')
          : state.enabled ? status.textContent : t('settings.blockingStatus.off');
        const reason = state.fallback === 'manifest-v2-retired' ? t('settings.blockingStatus.retired') : unavailable;
        status.textContent = `${reason} ${protection} ${t('settings.blockingStatus.saved')}`;
      }
      if (state.internalCandidate) status.textContent += ` ${t('settings.blockingStatus.internalCandidate')}`;
      const ubo = state.active === 'ublock-origin';
      document.getElementById('ublockTools').hidden = !ubo;
      document.getElementById('ublockLimits').hidden = !ubo;
      const failed = ['failed', 'unsupported'].includes(state.phase);
      document.getElementById('blockingRecovery').hidden = !failed;
      document.getElementById('ublockRetry').hidden = !failed;
      document.getElementById('ublockRetry').textContent = t('settings.blockingStatus.retry', { provider });
      document.getElementById('ublockUseBlanc').hidden = !failed || !ubo;
      document.getElementById('ublockContinue').hidden = !failed;
    };
    renderBlocking(await window.bowserPages.settings.blockingStatus());
    window.bowserPages.settings.onBlockingStatus(renderBlocking);
    selector.addEventListener('change', async () => {
      await window.bowserPages.settings.set({ adblockProvider: selector.value });
      renderBlocking(await window.bowserPages.settings.blockingStatus());
    });
    for (const [id, tool] of [['ublockDashboard', 'dashboard'], ['ublockLogger', 'logger']]) {
      document.getElementById(id).addEventListener('click', () => window.bowserPages.settings.blockingOpen(tool));
    }
    document.getElementById('ublockRetry').addEventListener('click', async () => {
      try { await window.bowserPages.settings.blockingRetry(); } catch {}
      renderBlocking(await window.bowserPages.settings.blockingStatus());
    });
    document.getElementById('ublockUseBlanc').addEventListener('click', async () => {
      await window.bowserPages.settings.set({ adblockProvider: 'blanc' });
      renderBlocking(await window.bowserPages.settings.blockingStatus());
    });
    document.getElementById('ublockContinue').addEventListener('click', async () => {
      await window.bowserPages.settings.set({ adblockEnabled: false });
      adblockEnabled.checked = false;
      renderBlocking(await window.bowserPages.settings.blockingStatus());
    });
  } else {
    document.getElementById('blockingProviderSetting')?.remove();
  }

  for (const [key, label] of Object.entries(searchEngines)) {
    if (key === 'custom' && !supports('searchEngineTemplate')) continue;
    const opt = document.createElement('option');
    opt.value = key;
    if (key === 'custom') {
      opt.textContent = t('settings.general.searchEngine.custom');
    } else {
      opt.textContent = label;
      opt.dataset.i18nIgnore = ''; // engine names are proper names
    }
    searchEngine.append(opt);
  }
  theme.value = settings.theme ?? 'system';
  newtabLayout.value = settings.newtabLayout ?? 'billboard';
  searchSuggestions.checked = settings.searchSuggestions ?? false;
  adblockEnabled.checked = settings.adblockEnabled;

  theme.addEventListener('change', () =>
    window.bowserPages.settings.set({ theme: theme.value }));
  newtabLayout.addEventListener('change', () =>
    window.bowserPages.settings.set({ newtabLayout: newtabLayout.value }));
  // The tour opens as a real tab in the sheet's window — main creates and
  // activates it (the sheet's own navigation is default-deny for blanc://).
  showWelcomeTour.addEventListener('click', () =>
    window.bowserPages.settings.welcomeTour());
  searchSuggestions.addEventListener('change', () =>
    window.bowserPages.settings.set({ searchSuggestions: searchSuggestions.checked }));
  adblockEnabled.addEventListener('change', () =>
    window.bowserPages.settings.set({ adblockEnabled: adblockEnabled.checked }));

  // --- Search engine, with the Custom address (Encrypted DNS pattern) ---
  const searchCustomRow = document.getElementById('searchEngineCustomRow');
  const searchTemplate = document.getElementById('searchEngineTemplate');
  const searchTemplateError = document.getElementById('searchEngineTemplateError');
  if (supports('searchEngineTemplate')) {
    // The error joins the field's description only while it shows: Chromium
    // reads a hidden element named by aria-describedby, which would call a
    // good address invalid.
    const setSearchError = (shown) => {
      searchTemplateError.hidden = !shown;
      searchTemplate.setAttribute('aria-invalid', String(shown));
      searchTemplate.setAttribute('aria-describedby', shown ? 'searchEngineTemplateHint searchEngineTemplateError' : 'searchEngineTemplateHint');
    };
    // Reflect an ACCEPTED stored snapshot into the controls (clears any error).
    const showAcceptedSearch = (s) => {
      searchEngine.value = s.searchEngine;
      searchTemplate.value = s.searchEngineTemplate ?? '';
      searchCustomRow.hidden = searchEngine.value !== 'custom';
      setSearchError(false);
    };
    // Main is the sole validator: send the change, then render from what was
    // actually stored. A Custom write was refused when Custom isn't selected
    // afterwards, or when the stored address isn't the one just sent (an
    // invalid edit keeps the previous address). Keep the draft visible with
    // the error rather than snapping back.
    const commitSearch = async (partial) => {
      const next = await window.bowserPages.settings.set(partial);
      const refused = partial.searchEngine === 'custom' &&
        (next.searchEngine !== 'custom' || next.searchEngineTemplate !== partial.searchEngineTemplate);
      if (refused) {
        searchEngine.value = 'custom';
        searchCustomRow.hidden = false;
        setSearchError(true);
        return; // leaves the rejected text in the field to correct
      }
      showAcceptedSearch(next);
    };

    showAcceptedSearch(settings);

    searchEngine.addEventListener('change', () => {
      if (searchEngine.value === 'custom') {
        searchCustomRow.hidden = false;
        setSearchError(false); // no error before anything is typed
        const template = searchTemplate.value.trim();
        if (template) commitSearch({ searchEngine: 'custom', searchEngineTemplate: template });
        // else: the address field's own change event commits and validates
      } else {
        commitSearch({ searchEngine: searchEngine.value });
      }
    });
    searchTemplate.addEventListener('change', () =>
      commitSearch({ searchEngine: 'custom', searchEngineTemplate: searchTemplate.value.trim() }));
  } else {
    searchCustomRow?.remove();
    searchEngine.value = settings.searchEngine;
    searchEngine.addEventListener('change', () =>
      window.bowserPages.settings.set({ searchEngine: searchEngine.value }));
  }

  // --- Bangs: the switch and the person's own bangs ---
  if (supports('bangsEnabled')) {
    const bangsEnabled = document.getElementById('bangsEnabled');
    bangsEnabled.checked = settings.bangsEnabled !== false;
    bangsEnabled.addEventListener('change', () =>
      window.bowserPages.settings.set({ bangsEnabled: bangsEnabled.checked }));

    const bangCode = document.getElementById('customBangCode');
    const bangName = document.getElementById('customBangName');
    const bangTemplate = document.getElementById('customBangTemplate');
    const bangAdd = document.getElementById('customBangAdd');
    const bangList = document.getElementById('customBangList');
    const bangError = document.getElementById('customBangError');
    const bangReplaces = document.getElementById('customBangReplaces');
    const bangHost = (template) => {
      try { return new URL(template.replace('%s', 'x')).host; } catch { return ''; }
    };
    const showBangNotice = (error, replaces) => {
      bangError.hidden = !error;
      if (error) bangError.textContent = error;
      bangReplaces.hidden = !replaces;
      if (replaces) bangReplaces.textContent = replaces;
    };

    function renderCustomBangs(list) {
      bangList.replaceChildren();
      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'site-list-empty';
        empty.textContent = t('settings.general.customBangs.empty');
        bangList.append(empty);
        return;
      }
      list.forEach((bang, index) => {
        const row = document.createElement('div');
        row.className = 'site-row';
        const code = document.createElement('span');
        code.className = 'custom-bang-code';
        code.textContent = `!${bang.code}`;
        code.dataset.i18nIgnore = '';
        const name = document.createElement('span');
        name.className = 'site-row-name';
        name.textContent = bang.name;
        name.dataset.i18nIgnore = '';
        const host = document.createElement('span');
        host.className = 'custom-bang-host';
        host.textContent = bangHost(bang.template);
        host.dataset.i18nIgnore = '';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'site-row-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', t('settings.general.customBangs.remove', { code: bang.code }));
        remove.addEventListener('click', async () => {
          const hadFocus = document.activeElement === remove;
          siteRemovals = siteRemovals.then(async () => {
            const { settings: saved } = await window.bowserPages.settings.get();
            const next = await window.bowserPages.settings.set({
              customBangs: (saved.customBangs ?? []).filter((b) => b.code !== bang.code),
            });
            renderCustomBangs(next.customBangs ?? []);
            showBangNotice('', '');
          }).catch((error) => console.error(error));
          await siteRemovals;
          if (!hadFocus) return;
          const buttons = bangList.querySelectorAll('.site-row-remove');
          (buttons[Math.min(index, buttons.length - 1)] ?? bangCode).focus();
        });
        row.append(code, name, host, remove);
        bangList.append(row);
      });
    }

    // Main is the sole validator: send the row, then look for it in what was
    // stored. A duplicate code is refused here first, because the stored list
    // would keep the earlier row and make the add look accepted.
    async function addCustomBang() {
      const code = bangCode.value.trim().replace(/^!/, '').toLowerCase();
      const name = bangName.value.trim();
      const template = bangTemplate.value.trim();
      if (!code && !name && !template) return;
      const { settings: current } = await window.bowserPages.settings.get();
      const existing = current.customBangs ?? [];
      if (existing.some((b) => b.code === code)) {
        showBangNotice(t('settings.general.customBangs.duplicate', { code }), '');
        return;
      }
      const intended = { code, name, template };
      const next = await window.bowserPages.settings.set({ customBangs: [...existing, intended] });
      const stored = (next.customBangs ?? []).find((b) =>
        b.code === intended.code && b.name === intended.name && b.template === intended.template);
      if (!stored) {
        showBangNotice(t('settings.general.customBangsError'), '');
        return; // leaves the draft in the fields to correct
      }
      renderCustomBangs(next.customBangs ?? []);
      bangCode.value = '';
      bangName.value = '';
      bangTemplate.value = '';
      const builtIn = Bangs.findBang(code, BangsCatalog, []);
      showBangNotice('', builtIn ? t('settings.general.customBangs.replaces', { code, site: builtIn.name }) : '');
      bangCode.focus();
    }

    bangAdd.addEventListener('click', addCustomBang);
    for (const field of [bangCode, bangName, bangTemplate]) {
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addCustomBang();
      });
    }
    renderCustomBangs(settings.customBangs ?? []);
  } else {
    document.getElementById('customBangsBlock')?.remove();
    document.getElementById('bangsEnabled')?.closest('.setting')?.remove();
  }

  // --- Tab presentation (desktop-only, device-local) ---
  if (supports('tabLayout')) {
    const tabLayout = document.getElementById('tabLayout');
    tabLayout.value = settings.tabLayout ?? 'island';
    tabLayout.addEventListener('change', () =>
      window.bowserPages.settings.set({ tabLayout: tabLayout.value }));
  } else {
    document.getElementById('tabLayoutSetting')?.remove();
  }

  if (supports('islandHoverOpen')) {
    const islandHoverOpen = document.getElementById('islandHoverOpen');
    islandHoverOpen.checked = settings.islandHoverOpen === true;
    islandHoverOpen.addEventListener('change', async () => {
      const saved = await window.bowserPages.settings.set({ islandHoverOpen: islandHoverOpen.checked });
      islandHoverOpen.checked = saved.islandHoverOpen === true;
    });
  } else {
    document.getElementById('islandHoverOpenSetting')?.remove();
  }

  if (supports('islandAutoHide')) {
    const islandAutoHide = document.getElementById('islandAutoHide');
    islandAutoHide.checked = settings.islandAutoHide === true;
    islandAutoHide.addEventListener('change', async () => {
      const saved = await window.bowserPages.settings.set({ islandAutoHide: islandAutoHide.checked });
      islandAutoHide.checked = saved.islandAutoHide === true;
    });
  } else {
    document.getElementById('islandAutoHideSetting')?.remove();
  }

  // --- Quiet Tabs idle delay (device-local memory policy) ---
  // Device-local: the Island strip's site-color tint. Off leaves it on the
  // theme background (near-black in Dark).
  if (supports('islandSiteColors')) {
    const siteColors = document.getElementById('islandSiteColors');
    siteColors.checked = settings.islandSiteColors;
    siteColors.addEventListener('change', async () => {
      const result = await window.bowserPages.settings.set({ islandSiteColors: siteColors.checked });
      siteColors.checked = result.islandSiteColors;
    });
  } else {
    document.getElementById('islandSiteColorsSetting')?.remove();
  }

  // --- Dark websites (device-local) ---
  if (supports('darkWebsites')) {
    const darkWebsites = document.getElementById('darkWebsites');
    const darkExceptionInput = document.getElementById('darkExceptionInput');
    const darkExceptionAdd = document.getElementById('darkExceptionAdd');
    const darkExceptionList = document.getElementById('darkExceptionList');
    const darkExceptionsBlock = document.getElementById('darkWebsitesExceptionsBlock');

    function renderDarkExceptions(current) {
      darkWebsites.checked = current.darkWebsites === true;
      darkExceptionsBlock.hidden = !darkWebsites.checked;
      const exceptions = current.darkWebsitesExceptions ?? [];
      renderSiteList({
        list: darkExceptionList,
        input: darkExceptionInput,
        hostnames: exceptions,
        emptyKey: 'settings.general.darkExceptionList.empty',
        onRemove: async (hostname) => {
          const { settings: saved } = await window.bowserPages.settings.get();
          renderDarkExceptions(await window.bowserPages.settings.set({
            darkWebsitesExceptions: (saved.darkWebsitesExceptions ?? []).filter((h) => h !== hostname),
          }));
        },
      });
    }

    async function addDarkException() {
      const value = darkExceptionInput.value.trim();
      if (!value) return;
      const { settings: current } = await window.bowserPages.settings.get();
      // Main normalizes and drops anything that is not a hostname.
      const next = await window.bowserPages.settings.set({
        darkWebsitesExceptions: [...(current.darkWebsitesExceptions ?? []), value],
      });
      darkExceptionInput.value = '';
      renderDarkExceptions(next);
    }

    darkWebsites.addEventListener('change', async () => {
      renderDarkExceptions(await window.bowserPages.settings.set({ darkWebsites: darkWebsites.checked }));
    });
    darkExceptionAdd.addEventListener('click', addDarkException);
    darkExceptionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addDarkException();
    });
    renderDarkExceptions(settings);
  } else {
    document.getElementById('darkWebsitesSetting')?.remove();
    document.getElementById('darkWebsitesExceptionsBlock')?.remove();
  }

  if (supports('uiLanguage')) {
    const languageSetting = document.getElementById('uiLanguageSetting');
    const row = window.blancSettingsLanguage.languageRow({ uiLanguage: settings.uiLanguage, languages, t: blancI18n.t });
    if (!row.visible) {
      languageSetting.remove();
    } else {
      const select = document.getElementById('uiLanguage');
      const relaunch = document.getElementById('uiLanguageRelaunch');
      select.replaceChildren(...row.options.map((option) => {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        // Each language is named in its own language, whatever the interface's.
        if (option.value !== 'system') el.dataset.i18nIgnore = '';
        return el;
      }));
      select.value = row.selected;
      let committed = row.selected;
      const syncRelaunch = () => { relaunch.hidden = !window.blancSettingsLanguage.needsRelaunch(select.value, languages); };
      select.addEventListener('change', async () => {
        if (await window.bowserPages.settings.language(select.value, false)) committed = select.value;
        else select.value = committed;
        syncRelaunch();
      });
      relaunch.addEventListener('click', () => window.bowserPages.settings.language(select.value, true));
      languageSetting.hidden = false;
      syncRelaunch();
    }
  }

  if (supports('tabSleep')) {
    const tabSleep = document.getElementById('tabSleep');
    tabSleep.value = settings.tabSleep ?? '1h';
    tabSleep.addEventListener('change', () =>
      window.bowserPages.settings.set({ tabSleep: tabSleep.value }));
  } else {
    document.getElementById('tabSleepSetting')?.remove();
  }

  // Device-local right-button gestures. Drawing uses left pointer input in
  // Settings so normal settings interactions never activate a page gesture.
  if (supports('mouseGesturesEnabled')) {
    const actions = {
      back: t('settings.gesture.action.back'),
      forward: t('settings.gesture.action.forward'),
      reload: t('settings.gesture.action.reload'),
      newTab: t('settings.gesture.action.newTab'),
      closeTab: t('settings.gesture.action.closeTab'),
      reopenTab: t('settings.gesture.action.reopenTab'),
      previousTab: t('settings.gesture.action.previousTab'),
      nextTab: t('settings.gesture.action.nextTab'),
      island: t('settings.gesture.action.island'),
    };
    const defaults = { L: 'back', R: 'forward', U: 'newTab', D: 'closeTab' };
    const enabled = document.getElementById('mouseGesturesEnabled');
    const editor = document.getElementById('mouseGestureEditor');
    const rows = document.getElementById('mouseGestureRows');
    const add = document.getElementById('mouseGestureAdd');
    const composer = document.getElementById('mouseGestureComposer');
    const action = document.getElementById('mouseGestureAction');
    const pad = document.getElementById('mouseGesturePad');
    const padPrompt = document.getElementById('mouseGesturePadPrompt');
    const save = document.getElementById('mouseGestureSave');
    const message = document.getElementById('mouseGestureMessage');
    let mapping = { ...(settings.mouseGestureMapping ?? defaults) };
    let mappingWrite = Promise.resolve();
    let drawing = null;
    let drawnPattern = '';
    enabled.checked = settings.mouseGesturesEnabled === true;
    editor.hidden = !enabled.checked;
    const labels = { U: '↑', D: '↓', L: '←', R: '→' };
    const padIdle = t('settings.general.mouseGesturePadPrompt');
    const glyphFor = (pattern) => [...pattern].map((letter) => labels[letter]).join('');
    const fillActions = (select, selected) => {
      for (const [id, label] of Object.entries(actions)) {
        const option = document.createElement('option'); option.value = id; option.textContent = label;
        select.append(option);
      }
      select.value = selected;
    };
    const closeComposer = () => {
      composer.hidden = true; add.hidden = false; drawing = null; drawnPattern = '';
      padPrompt.textContent = padIdle; save.disabled = true;
    };
    const showEmpty = () => {
      const empty = document.createElement('p'); empty.className = 'gesture-empty';
      empty.textContent = t('settings.gesture.empty'); rows.append(empty);
    };
    const makeRow = (pattern, command) => {
      const row = document.createElement('div'); row.className = 'gesture-row';
      const glyph = document.createElement('code');
      glyph.textContent = glyphFor(pattern);
      const select = document.createElement('select');
      select.setAttribute('aria-label', t('settings.gesture.actionLabel', { gesture: glyph.textContent }));
      fillActions(select, command);
      select.addEventListener('change', async () => {
        const selectedAction = select.value;
        await persistMapping(
          (current) => ({ ...current, [pattern]: selectedAction }),
          t('settings.gesture.changed', { gesture: glyph.textContent, action: actions[selectedAction] }),
          {
            redraw: false,
            onFailure: () => {
              if (select.isConnected && select.value === selectedAction) select.value = mapping[pattern];
            },
          }
        );
      });
      const remove = document.createElement('button'); remove.type = 'button';
      remove.className = 'gesture-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', t('settings.gesture.removeLabel', { gesture: glyph.textContent }));
      remove.addEventListener('click', async () => {
        await persistMapping((current) => {
          const next = { ...current }; delete next[pattern]; return next;
        }, t('settings.gesture.removed', { gesture: glyph.textContent }), {
          redraw: false,
          onSuccess: () => {
            const restoreFocus = row.contains(document.activeElement);
            if (row.isConnected) {
              row.remove();
              if (!Object.keys(mapping).length) showEmpty();
            } else showRows();
            if (restoreFocus && !editor.hidden) add.focus();
          },
        });
      });
      row.append(glyph, select, remove);
      return row;
    };
    const showRows = () => {
      rows.replaceChildren();
      if (!Object.keys(mapping).length) showEmpty();
      for (const [pattern, command] of Object.entries(mapping)) rows.append(makeRow(pattern, command));
    };
    const persistMapping = (makeNext, success, { redraw = true, onSuccess, onFailure } = {}) => {
      const write = mappingWrite.then(async () => {
        let saved;
        try {
          const next = typeof makeNext === 'function' ? makeNext(mapping) : makeNext;
          saved = (await window.bowserPages.settings.set({ mouseGestureMapping: next })).mouseGestureMapping;
          if (JSON.stringify(saved) !== JSON.stringify(next)) throw new Error('Mapping rejected');
        } catch {
          onFailure?.(); message.textContent = t('settings.gesture.saveFailed');
          return false;
        }
        mapping = { ...saved };
        if (redraw) showRows();
        onSuccess?.(); message.textContent = success;
        return true;
      });
      mappingWrite = write.then(() => {}, () => {});
      return write;
    };
    fillActions(action, 'back');
    showRows();
    enabled.addEventListener('change', async () => {
      const saved = await window.bowserPages.settings.set({ mouseGesturesEnabled: enabled.checked });
      enabled.checked = saved.mouseGesturesEnabled; editor.hidden = !enabled.checked;
      if (!enabled.checked) closeComposer();
    });
    document.getElementById('mouseGestureReset').addEventListener('click', async () => {
      closeComposer();
      await persistMapping(defaults, t('settings.gesture.reset'));
    });
    add.addEventListener('click', () => {
      if (Object.keys(mapping).length >= 16) {
        message.textContent = t('settings.gesture.limit'); return;
      }
      add.hidden = true; composer.hidden = false; drawnPattern = '';
      padPrompt.textContent = padIdle; save.disabled = true;
      message.textContent = '';
    });
    document.getElementById('mouseGestureCancel').addEventListener('click', () => {
      closeComposer(); message.textContent = '';
    });
    pad.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      drawnPattern = ''; save.disabled = true;
      drawing = { x: event.clientX, y: event.clientY, pattern: '', overflow: false };
      pad.setPointerCapture(event.pointerId);
      padPrompt.textContent = t('settings.gesture.drawing'); message.textContent = '';
    });
    pad.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const dx = event.clientX - drawing.x; const dy = event.clientY - drawing.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      const direction = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
      if (drawing.pattern.at(-1) !== direction) {
        if (drawing.pattern.length < 3) drawing.pattern += direction;
        else drawing.overflow = true;
      }
      drawing.x = event.clientX; drawing.y = event.clientY;
      padPrompt.textContent = glyphFor(drawing.pattern);
    });
    pad.addEventListener('pointerup', () => {
      if (!drawing) return;
      const { pattern, overflow } = drawing; drawing = null;
      if (overflow) { padPrompt.textContent = padIdle; message.textContent = t('settings.gesture.tooLong'); return; }
      if (!pattern) { padPrompt.textContent = padIdle; message.textContent = t('settings.gesture.tooShort'); return; }
      if (Object.hasOwn(mapping, pattern)) { padPrompt.textContent = padIdle; message.textContent = t('settings.gesture.duplicate'); return; }
      drawnPattern = pattern; save.disabled = false;
      message.textContent = t('settings.gesture.ready', { gesture: glyphFor(pattern) });
    });
    save.addEventListener('click', async () => {
      if (!drawnPattern || Object.hasOwn(mapping, drawnPattern)) return;
      const pattern = drawnPattern;
      const selectedAction = action.value;
      save.disabled = true;
      const saved = await persistMapping(
        (current) => ({ ...current, [pattern]: selectedAction }),
        t('settings.gesture.saved', { gesture: glyphFor(pattern), action: actions[selectedAction] }),
        { redraw: false, onSuccess: () => {
          rows.querySelector('.gesture-empty')?.remove();
          rows.append(makeRow(pattern, selectedAction));
          if (!composer.hidden && !editor.hidden) {
            const restoreFocus = composer.contains(document.activeElement);
            closeComposer();
            if (restoreFocus) add.focus();
          }
        } }
      );
      if (!saved && drawnPattern === pattern) save.disabled = false;
    });
    pad.addEventListener('pointercancel', () => {
      drawing = null; drawnPattern = ''; save.disabled = true;
      padPrompt.textContent = padIdle; message.textContent = t('settings.gesture.cancelled');
    });
  } else {
    document.getElementById('mouseGesturesSetting')?.remove();
    document.getElementById('mouseGestureEditor')?.remove();
  }

  // --- Home page ---
  if (supports('homePage')) {
    const homePage = document.getElementById('homePage');
    homePage.value = settings.homePage;
    homePage.addEventListener('change', () =>
      window.bowserPages.settings.set({ homePage: homePage.value }));
  } else {
    document.getElementById('homePage')?.closest('.setting')?.remove();
  }

  // --- WebRTC IP-handling policy ---
  if (supports('webrtcPolicy')) {
    const webrtcPolicy = document.getElementById('webrtcPolicy');
    webrtcPolicy.value = settings.webrtcPolicy ?? 'standard';
    webrtcPolicy.addEventListener('change', () =>
      window.bowserPages.settings.set({ webrtcPolicy: webrtcPolicy.value }));
  } else {
    document.getElementById('webrtcPolicy')?.closest('.setting')?.remove();
  }

  // --- WebRTC audio receive buffer ---
  if (supports('webrtcAudioBuffer')) {
    const webrtcAudioBuffer = document.getElementById('webrtcAudioBuffer');
    webrtcAudioBuffer.value = settings.webrtcAudioBuffer ?? 'automatic';
    webrtcAudioBuffer.addEventListener('change', () =>
      window.bowserPages.settings.set({ webrtcAudioBuffer: webrtcAudioBuffer.value }));
  } else {
    document.getElementById('webrtcAudioBuffer')?.closest('.setting')?.remove();
  }

  // --- Encrypted DNS (DoH) ---
  if (supports('secureDns')) {
    const secureDns = document.getElementById('secureDns');
    const secureDnsRow = document.getElementById('secureDnsCustomRow');
    const secureDnsTemplate = document.getElementById('secureDnsTemplate');
    const secureDnsError = document.getElementById('secureDnsError');

    // The error joins the field's description only while it shows: Chromium
    // reads a hidden element named by aria-describedby, which would call a
    // good address invalid.
    const setError = (shown) => {
      secureDnsError.hidden = !shown;
      secureDnsTemplate.setAttribute('aria-invalid', String(shown));
      secureDnsTemplate.setAttribute('aria-describedby', shown ? 'secureDnsTemplateHint secureDnsError' : 'secureDnsTemplateHint');
    };

    // Reflect an ACCEPTED persisted snapshot into the controls (clears any error).
    const showAccepted = (s) => {
      secureDns.value = s.secureDns ?? 'auto';
      secureDnsTemplate.value = s.secureDnsTemplate ?? '';
      secureDnsRow.hidden = secureDns.value !== 'custom';
      setError(false);
    };

    // The main process is the sole validator. Send the change, then render from the
    // ACTUAL persisted result (set() returns the settings). A custom write is REJECTED
    // when the store didn't take it — either the provider isn't custom, OR (Custom
    // already active) the submitted template wasn't stored because it was invalid and
    // sanitize dropped it, leaving the previous valid template in place. Comparing only
    // the provider would miss that second case: keep the draft visible (dropdown on
    // custom, row OPEN, typed text intact) and show the error — never snap back.
    const commit = async (partial, attempted) => {
      const next = await window.bowserPages.settings.set(partial);
      const rejected = attempted === 'custom' &&
        (next.secureDns !== 'custom' || next.secureDnsTemplate !== partial.secureDnsTemplate);
      if (rejected) {
        secureDns.value = 'custom';
        secureDnsRow.hidden = false;
        setError(true);
        return; // leaves secureDnsTemplate.value (the rejected text) untouched
      }
      showAccepted(next);
    };

    showAccepted(settings); // initial render from the get() payload

    secureDns.addEventListener('change', () => {
      if (secureDns.value === 'custom') {
        secureDnsRow.hidden = false; // reveal the field so they can type
        setError(false); // don't error before they've entered anything
        const template = secureDnsTemplate.value.trim();
        if (template) commit({ secureDns: 'custom', secureDnsTemplate: template }, 'custom');
        // else: wait for the template's own change event to commit + validate
      } else {
        commit({ secureDns: secureDns.value }, secureDns.value);
      }
    });
    secureDnsTemplate.addEventListener('change', () =>
      commit({ secureDns: 'custom', secureDnsTemplate: secureDnsTemplate.value.trim() }, 'custom'));
  } else {
    document.getElementById('secureDns')?.closest('.setting')?.remove();
    document.getElementById('secureDnsCustomRow')?.remove();
  }

  // --- 1Password desktop-app bridge (macOS-only, device-local, opt-in) ---
  if (onePasswordAvailable === true && supports('onePassword')) {
    document.getElementById('onePasswordSettings').hidden = false;
    const onePasswordEnabled = document.getElementById('onePasswordEnabled');
    const onePasswordAccount = document.getElementById('onePasswordAccount');
    const verifyButton = document.getElementById('onePasswordVerify');
    const verifyState = document.getElementById('onePasswordVerifyState');
    const appHint = document.getElementById('onePasswordAppHint');
    const openAppButton = document.getElementById('onePasswordOpenApp');
    const model = window.blancVerifyModel;
    // Settings-local status strings — not capsule copy (that lives in
    // fill-status-copy.js); these describe the Verify action itself.
    const VERIFY_ERRORS = {
      'account-not-found': t('settings.onePassword.error.accountNotFound'),
      'not-authorized': t('settings.onePassword.error.notAuthorized'),
      'session-expired': t('settings.onePassword.error.sessionExpired'),
      'desktop-unavailable': t('settings.onePassword.error.desktopUnavailable'),
      'unsupported-device': t('settings.onePassword.error.unsupportedDevice'),
      'timed-out': t('settings.onePassword.error.timedOut'),
      'broker-stopped': t('settings.onePassword.error.brokerStopped'),
      'sdk-error': t('settings.onePassword.error.sdkError'),
    };
    let verify = model.onFieldInput(model.createVerifyModel(), settings.onePasswordAccount ?? '');
    verify = { ...verify, token: 0 }; // the seed edit is not a user supersession
    const renderVerify = () => {
      const projection = model.view(verify);
      verifyButton.disabled = projection.buttonDisabled;
      if (projection.normalizeFieldTo !== null) onePasswordAccount.value = projection.normalizeFieldTo;
      verifyState.textContent = projection.phase === 'pending' ? t('settings.onePassword.checking')
        : projection.phase === 'connected' ? t('settings.onePassword.connected')
          : projection.phase === 'error' ? (VERIFY_ERRORS[projection.kind] ?? VERIFY_ERRORS['sdk-error'])
            : '';
    };
    onePasswordEnabled.checked = settings.onePasswordEnabled ?? false;
    onePasswordAccount.value = settings.onePasswordAccount ?? '';
    onePasswordAccount.disabled = !onePasswordEnabled.checked;
    renderVerify();
    onePasswordEnabled.addEventListener('change', async () => {
      onePasswordAccount.disabled = !onePasswordEnabled.checked;
      await window.bowserPages.settings.set({
        onePasswordEnabled: onePasswordEnabled.checked,
      });
      if (onePasswordEnabled.checked && !onePasswordAccount.value.trim()) {
        onePasswordAccount.focus();
      }
    });
    onePasswordAccount.addEventListener('input', () => {
      verify = model.onFieldInput(verify, onePasswordAccount.value);
      renderVerify();
    });
    onePasswordAccount.addEventListener('change', async () => {
      const next = await window.bowserPages.settings.set({
        onePasswordAccount: onePasswordAccount.value,
      });
      onePasswordAccount.value = next.onePasswordAccount ?? '';
    });
    verifyButton.addEventListener('click', async () => {
      const before = verify;
      verify = model.onVerifyClick(verify);
      if (verify === before) return; // empty field or already pending
      renderVerify();
      const token = verify.token;
      // Verify persists first main-side (onepassword-verify-flow.js) and
      // echoes the normalized probed value; a stale reply means another
      // window changed the stored account mid-flight and is dropped.
      const reply = await window.bowserPages.settings.onePasswordVerify(onePasswordAccount.value)
        .catch(() => ({ ok: false, kind: 'sdk-error', account: onePasswordAccount.value.trim() }));
      verify = model.onReply(verify, { ...reply, token });
      renderVerify();
    });
    // App presence is a soft hint — Verify above is the authoritative check.
    window.bowserPages.settings.onePasswordStatus().then(({ appDetected, supported }) => {
      // Windows on Arm: say why fill can't work here instead of a presence hint.
      if (supported === false) {
        appHint.textContent = t('settings.onePassword.error.unsupportedDevice');
        openAppButton.hidden = true;
        return;
      }
      const onMac = appInfo ? appInfo.platform === 'darwin' : navigator.platform.startsWith('Mac');
      appHint.textContent = appDetected
        ? (onMac ? t('settings.onePassword.installedMac') : t('settings.onePassword.installed'))
        : (onMac ? t('settings.onePassword.notFoundMac') : t('settings.onePassword.notFound'));
      openAppButton.hidden = !appDetected;
    }).catch(() => { appHint.textContent = ''; });
    openAppButton.addEventListener('click', () => {
      window.bowserPages.settings.openOnePasswordApp().catch(() => {});
    });
  } else {
    document.getElementById('onePasswordSettings')?.remove();
  }

  // --- Usage ping ---
  if (supports('usagePing')) {
    const usagePing = document.getElementById('usagePing');
    usagePing.checked = settings.usagePing;
    usagePing.addEventListener('change', () =>
      window.bowserPages.settings.set({ usagePing: usagePing.checked }));

    const resetInstallId = document.getElementById('resetInstallId');
    const resetInstallIdStatus = document.getElementById('resetInstallIdStatus');
    resetInstallId.addEventListener('click', async () => {
      const ok = await window.bowserPages.resetInstallId();
      resetInstallIdStatus.textContent = ok
        ? t('settings.privacy.resetInstallId.done')
        : t('settings.privacy.resetInstallId.failed');
      setTimeout(() => { resetInstallIdStatus.textContent = ''; }, 3000);
    });
  } else {
    document.getElementById('usagePing')?.closest('.setting')?.remove();
    document.getElementById('resetInstallId')?.closest('.toolbar-row')?.remove();
  }

  // --- Default browser (live OS state, nothing stored) ---
  const defaultBrowserSetting = document.getElementById('defaultBrowserSetting');
  if (!supports('defaultBrowser') || navigator.platform.includes('Linux')) {
    defaultBrowserSetting.remove();
  } else {
    const defaultBrowserBtn = document.getElementById('defaultBrowserBtn');
    const defaultBrowserState = document.getElementById('defaultBrowserState');
    const defaultBrowserHint = document.getElementById('defaultBrowserHint');
    const applyDefaultBrowser = ({ isDefault, canSet }) => {
      defaultBrowserBtn.hidden = isDefault;
      defaultBrowserState.hidden = !isDefault;
      defaultBrowserBtn.disabled = !canSet;
      if (!canSet && !isDefault) defaultBrowserHint.textContent = t('settings.general.defaultBrowserBtn.installedOnly');
    };
    defaultBrowserBtn.addEventListener('click', async () => {
      applyDefaultBrowser(await window.bowserPages.defaultBrowser.set());
    });
    // The macOS confirmation dialog happens outside the app — re-check
    // whenever the user comes back to this page.
    window.addEventListener('focus', async () => {
      applyDefaultBrowser(await window.bowserPages.defaultBrowser.get());
    });
    applyDefaultBrowser(await window.bowserPages.defaultBrowser.get());
  }

  // --- App icon colorways (macOS Dock only) ---
  // The bindings stay in IIFE scope unconditionally because only the executable
  // tail (render vs. remove) is gated by the platform capability below.
  const appIconSetting = document.getElementById('appIconSetting');
  // `patronActive` is the durable projection field; `supporterActive` is only a
  // temporary alias to the same boolean (see pages.js's clientSettings()).
  let patronActive = settings.patronActive ?? false;
  const appIconGrid = document.getElementById('appIconGrid');
  // Tracked directly rather than re-derived from the DOM on every render —
  // ids/labels come from main (settings.js APP_ICON_LABELS)
  // so there's one source of truth instead of a hand-typed second copy.
  let selectedIcon = settings.appIcon ?? 'sunrise';

  const selectAppIcon = (id) => {
    selectedIcon = id;
    for (const btn of appIconGrid.children) {
      btn.classList.toggle('active', btn.dataset.icon === id);
      btn.setAttribute('aria-checked', String(btn.dataset.icon === id));
    }
  };

  function renderAppIconGrid() {
    appIconGrid.replaceChildren();
    for (const [id, label] of Object.entries(appIcons)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-swatch';
      btn.dataset.icon = id;
      btn.setAttribute('role', 'radio');
      const img = document.createElement('img');
      img.src = `icon-${id}.png`;
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = label;
      name.dataset.i18nIgnore = ''; // colorway names are proper names
      btn.append(img, name);
      btn.addEventListener('click', async () => {
        await window.bowserPages.settings.set({ appIcon: id });
        selectAppIcon(id);
      });
      appIconGrid.append(btn);
    }
    selectAppIcon(selectedIcon);
  }

  const appIconPlatform = navigator.platform;
  const supportsNativeAppIcon = appIconPlatform.startsWith('Mac');
  if (!supports('appIcon') || !supportsNativeAppIcon) {
    appIconSetting.remove();
  } else {
    document.getElementById('appIconHint').textContent =
      t('settings.general.appIconSetting.macHint');
    renderAppIconGrid();
  }

  // --- Patron activation ---
  // Capability key stays 'supporter' — guarded by
  // test/unit/app-icon.test.js's literal-string match; Phase 4 renames it.
  // Checkout + license activation are cross-platform (workspaces and founding
  // keys are not Dock-bound); only the icon colorway grid is macOS-gated above.
  if (supports('supporter')) {
    const patronCheckoutRow = document.getElementById('patronCheckoutRow');
    const patronActivateHint = document.getElementById('patronActivateHint');
    const patronActivateRow = document.getElementById('patronActivateRow');
    const patronKey = document.getElementById('patronKey');
    const patronActivateBtn = document.getElementById('patronActivate');
    const patronStatus = document.getElementById('patronStatus');

    function renderPatronState() {
      if (!patronActive) return;
      patronCheckoutRow.hidden = true;
      patronActivateHint.hidden = true;
      patronActivateRow.hidden = true;
      // Never gate on this date's presence — it's null for active subscribers
      // (only founding/lifetime carry a mirror date). Show it when present,
      // but the row above is already driven by the `patronActive` boolean.
      const when = settings.supporterActivatedAt
        ? new Date(settings.supporterActivatedAt).toLocaleDateString(blancI18n.formatLocale())
        : null;
      patronStatus.textContent = when
        ? t('settings.patron.thanksSince', { date: when })
        : t('settings.patron.thanks');
    }
    renderPatronState();

    async function activatePatron() {
      // Also guards the Enter-keydown listener below — without this, OS
      // key-repeat while holding Enter fires concurrent activation requests.
      if (patronActivateBtn.disabled) return;
      patronActivateBtn.disabled = true;
      patronStatus.textContent = t('settings.patron.activating');
      let result;
      try {
        result = await window.bowserPages.settings.activateSupporter(patronKey.value);
      } catch {
        // A rejected IPC (an unexpected main-process throw) must still
        // re-enable the button — never leave it stuck on "Activating…".
        patronActivateBtn.disabled = false;
        patronStatus.textContent = t('settings.patron.failed');
        return;
      }
      patronActivateBtn.disabled = false;
      if (result.ok) {
        // The response is only `{ ok, kind }` — no activatedAt to mirror
        // here; `settings.supporterActivatedAt` (if any) stays whatever it
        // was at page load, and renderPatronState() shows it only when set.
        patronActive = true;
        renderPatronState();
      } else {
        patronStatus.textContent = result.message;
      }
    }
    patronActivateBtn.addEventListener('click', activatePatron);
    patronKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') activatePatron();
    });
  } else {
    document.getElementById('group-patron')?.remove();
  }

  // --- Local profiles ---
  if (supports('localProfiles')) {
    const profileList = document.getElementById('profilesList');
    const profileName = document.getElementById('newProfileName');
    const profileCreate = document.getElementById('newProfileCreate');
    const profileStatus = document.getElementById('profilesStatus');

    const button = (label, action, className = '') => {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.className = className;
      element.addEventListener('click', action);
      return element;
    };

    async function refreshProfiles() {
      const { currentId, profiles } = await window.bowserPages.profiles.list();
      profileList.replaceChildren();
      for (const profile of profiles) {
        const row = document.createElement('div');
        row.className = 'row profile-row';
        row.dataset.profileId = profile.id;
        const main = document.createElement('div');
        main.className = 'main';
        const actions = document.createElement('div');
        actions.className = 'actions';

        const renderReadOnly = () => {
          row.classList.remove('editing');
          main.replaceChildren();
          actions.replaceChildren();
          const title = document.createElement('div');
          title.className = 'title';
          title.textContent = profile.name;
          title.dataset.i18nIgnore = '';
          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = profile.id === 'default'
            ? t('settings.profiles.personalMeta')
            : (profile.id === currentId ? t('settings.profiles.currentWindow') : t('settings.profiles.separateData'));
          main.append(title, meta);

          if (profile.id !== currentId) {
            actions.append(button(t('settings.profiles.open'), async () => {
              const result = await window.bowserPages.profiles.open(profile.id);
              if (!result?.ok) profileStatus.textContent = result?.message ?? t('settings.profiles.openFailed');
            }));
          }
          if (profile.id === 'default') return;

          actions.append(button(t('settings.profiles.rename'), () => {
            row.classList.add('editing');
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 40;
            input.value = profile.name;
            input.setAttribute('aria-label', t('settings.profiles.renameLabel', { name: profile.name }));
            const save = async () => {
              const result = await window.bowserPages.profiles.rename(profile.id, input.value);
              profileStatus.textContent = result.ok
                ? t('settings.profiles.renamed')
                : (result.message ?? t('settings.profiles.renameFailed'));
              if (result.ok) await refreshProfiles();
            };
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') renderReadOnly();
            });
            main.replaceChildren(input);
            actions.replaceChildren(
              button(t('settings.profiles.save'), save),
              button(t('common.cancel'), renderReadOnly),
            );
            input.focus();
            input.select();
          }));

          actions.append(button(t('settings.profiles.delete'), () => {
            row.classList.add('editing');
            const warning = document.createElement('div');
            warning.className = 'meta confirmation';
            warning.textContent = t('settings.profiles.deleteWarning', { name: profile.name });
            const input = document.createElement('input');
            input.type = 'text';
            input.autocomplete = 'off';
            input.setAttribute('aria-label', t('settings.profiles.deleteLabel', { name: profile.name }));
            const remove = async () => {
              const result = await window.bowserPages.profiles.remove(profile.id, input.value);
              profileStatus.textContent = result.ok
                ? (result.pending ? result.message : t('settings.profiles.deleted'))
                : (result.message ?? t('settings.profiles.deleteFailed'));
              if (result.ok) await refreshProfiles();
            };
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') remove();
              if (event.key === 'Escape') renderReadOnly();
            });
            main.replaceChildren(warning, input);
            actions.replaceChildren(
              button(t('settings.profiles.deletePermanently'), remove, 'danger'),
              button(t('common.cancel'), renderReadOnly),
            );
            input.focus();
          }, 'danger'));
        };

        renderReadOnly();
        row.append(main, actions);
        profileList.append(row);
      }
    }

    async function createProfile() {
      if (profileCreate.disabled) return;
      profileCreate.disabled = true;
      const result = await window.bowserPages.profiles.create(profileName.value);
      profileCreate.disabled = false;
      if (!result?.ok || !result.profile) {
        profileStatus.textContent = result?.message ?? t('settings.profiles.createFailed');
        return;
      }
      profileName.value = '';
      profileStatus.textContent = t('settings.profiles.created', { name: result.profile.name });
      await refreshProfiles();
    }

    profileCreate.addEventListener('click', createProfile);
    profileName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') createProfile();
    });
    refreshProfiles().catch(() => {
      profileStatus.textContent = t('settings.profiles.loadFailed');
    });
  } else {
    document.getElementById('group-profiles')?.remove();
  }

  // --- Site permissions ---
  if (supports('permissions')) {
    const permissionList = document.getElementById('permissionList');
    const PERMISSION_LABELS = {
      media: t('settings.permissions.media'),
      geolocation: t('settings.permissions.geolocation'),
      notifications: t('settings.permissions.notifications'),
    };
    const MEDIA_LABELS = { audio: t('settings.permissions.audio'), video: t('settings.permissions.video') };

    async function refreshPermissions() {
      const decisions = await window.bowserPages.permissions.list();
      permissionList.replaceChildren();

      const entries = Object.entries(decisions);
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('settings.permissions.empty');
        permissionList.append(empty);
        return;
      }

      for (const [key, decision] of entries.sort(([a], [b]) => a.localeCompare(b))) {
        const [origin, permission, mediaType] = key.split('|');
        const row = document.createElement('div');
        row.className = 'row';

        const main = document.createElement('div');
        main.className = 'main';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = new URL(origin).host;
        title.dataset.i18nIgnore = '';
        main.append(title);

        const meta = document.createElement('div');
        meta.className = 'meta';
        const permissionLabel = permission === 'media' && mediaType
          ? (MEDIA_LABELS[mediaType] ?? PERMISSION_LABELS.media)
          : (PERMISSION_LABELS[permission] ?? permission);
        meta.textContent = decision === 'allow'
          ? t('settings.permissions.allowed', { permission: permissionLabel })
          : t('settings.permissions.blocked', { permission: permissionLabel });

        const actions = document.createElement('div');
        actions.className = 'actions';
        const remove = document.createElement('button');
        remove.className = 'danger';
        remove.textContent = t('settings.remove');
        remove.addEventListener('click', async () => {
          await window.bowserPages.permissions.remove(key);
          refreshPermissions();
        });
        actions.append(remove);

        row.append(main, meta, actions);
        permissionList.append(row);
      }
    }

    refreshPermissions();
  } else {
    document.getElementById('sitePermissionsCard')?.remove();
  }

  // --- Ad-block exceptions ---
  if (supports('adblockExceptions')) {
    const exceptionInput = document.getElementById('exceptionInput');
    const exceptionAdd = document.getElementById('exceptionAdd');
    const exceptionList = document.getElementById('exceptionList');

    function normalizeHostname(input) {
      try {
        return new URL(input.includes('://') ? input : `https://${input}`).hostname
          .toLowerCase()
          .replace(/^www\./, '');
      } catch {
        return null;
      }
    }

    async function refreshExceptions() {
      const { settings: current } = await window.bowserPages.settings.get();
      const exceptions = current.adblockExceptions ?? [];
      renderSiteList({
        list: exceptionList,
        input: exceptionInput,
        hostnames: exceptions,
        emptyKey: 'settings.privacy.exceptionList.empty',
        onRemove: async (hostname) => {
          const { settings: saved } = await window.bowserPages.settings.get();
          await window.bowserPages.settings.set({
            adblockExceptions: (saved.adblockExceptions ?? []).filter((h) => h !== hostname),
          });
          await refreshExceptions();
        },
      });
    }

    async function addException() {
      const hostname = normalizeHostname(exceptionInput.value.trim());
      if (!hostname) return;
      const { settings: current } = await window.bowserPages.settings.get();
      const exceptions = new Set(current.adblockExceptions ?? []);
      exceptions.add(hostname);
      await window.bowserPages.settings.set({ adblockExceptions: [...exceptions] });
      exceptionInput.value = '';
      refreshExceptions();
    }

    exceptionAdd.addEventListener('click', addException);
    exceptionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addException();
    });

    refreshExceptions();
  } else {
    document.getElementById('adblockExceptionsBlock')?.remove();
  }

  // --- Clear browsing data ---
  if (supports('clearBrowsingData')) {
    const clearBrowsingData = document.getElementById('clearBrowsingData');
    const clearBrowsingDataStatus = document.getElementById('clearBrowsingDataStatus');

    clearBrowsingData.addEventListener('click', async () => {
      if (!confirm(t('settings.privacy.clearBrowsingData.confirm'))) return;
      await window.bowserPages.clearBrowsingData();
      clearBrowsingDataStatus.textContent = t('settings.privacy.clearBrowsingData.done');
      setTimeout(() => { clearBrowsingDataStatus.textContent = ''; }, 2000);
    });
  } else {
    const clearRow = document.getElementById('clearBrowsingData')?.closest('.toolbar-row');
    if (clearRow) {
      let prev = clearRow.previousElementSibling;
      if (prev && prev.tagName === 'P') { const p = prev; prev = p.previousElementSibling; p.remove(); }
      if (prev && prev.tagName === 'H3') prev.remove();
      clearRow.remove();
    }
  }

  // A Privacy card whose every control was removed above (unsupported on this
  // platform) would otherwise leave a lone title behind.
  for (const card of document.querySelectorAll('#group-privacy .settings-card')) {
    if (!card.querySelector(':scope > :not(.card-title)')) card.remove();
  }

  // --- Sync ---
  if (supports('sync')) {
    (function initSync() {
      const { createSyncSetupModel, transition, view, relativeSyncTime } = window.blancSyncSetupModel;
      const setup = document.getElementById('syncSetup');
      const active = document.getElementById('syncActive');
      const setupTitle = document.getElementById('syncSetupTitle');
      const setupIntro = document.getElementById('syncSetupIntro');
      const paths = document.getElementById('syncPaths');
      const pathStart = document.getElementById('syncPathStart');
      const form = document.getElementById('syncForm');
      const handleEl = document.getElementById('syncHandle');
      const passEl = document.getElementById('syncPassphrase');
      const handleHint = document.getElementById('syncHandleHint');
      const passHint = document.getElementById('syncPassphraseHint');
      const submitBtn = document.getElementById('syncSubmit');
      const finishTitle = document.getElementById('syncFinishTitle');
      const finishHint = document.getElementById('syncFinishHint');
      const backBtn = document.getElementById('syncBack');
      const submitRow = document.getElementById('syncSubmitRow');
      const notFound = document.getElementById('syncNotFound');
      const tryAgainBtn = document.getElementById('syncTryAgain');
      const startNewBtn = document.getElementById('syncStartNew');
      const setupStatus = document.getElementById('syncSetupStatus');
      const activeStatus = document.getElementById('syncActiveStatus');
      const syncStatusHandle = document.getElementById('syncStatusHandle');
      const deviceNameEl = document.getElementById('syncDeviceName');
      const syncStatusData = document.getElementById('syncStatusData');
      const syncStatusTabs = document.getElementById('syncStatusTabs');
      const syncStatusErrorRow = document.getElementById('syncStatusErrorRow');
      const syncStatusError = document.getElementById('syncStatusError');
      const nowBtn = document.getElementById('syncNow');
      const disableBtn = document.getElementById('syncDisable');
      const wipeEl = document.getElementById('syncWipe');
      const tabsShareEl = document.getElementById('syncTabsShare');
      // Device pairing (design 2026-10-16): the code path of the off state,
      // and the on state's Add another device / Connect to a different sync /
      // Copy recovery code. Driven by settings-sync-pairing-model.js.
      const {
        createPairingModel, pairingTransition, pairingView,
        createSwitchModel, switchTransition, switchView,
      } = window.blancSyncPairingModel;
      const pathCode = document.getElementById('syncPathCode');
      const codeForm = document.getElementById('syncCodeForm');
      const codeEl = document.getElementById('syncCode');
      const codeSubmit = document.getElementById('syncCodeSubmit');
      const codeBack = document.getElementById('syncCodeBack');
      const usePassphrase = document.getElementById('syncUsePassphrase');
      const codeStatus = document.getElementById('syncCodeStatus');
      const addDeviceBtn = document.getElementById('syncAddDevice');
      const pairingPanel = document.getElementById('syncPairing');
      const pairingCodeEl = document.getElementById('syncPairingCode');
      const pairingRemaining = document.getElementById('syncPairingRemaining');
      const pairingCopy = document.getElementById('syncPairingCopy');
      const pairingCancel = document.getElementById('syncPairingCancel');
      const pairingNotice = document.getElementById('syncPairingNotice');
      const switchOpen = document.getElementById('syncSwitchOpen');
      const switchForm = document.getElementById('syncSwitch');
      const switchName = document.getElementById('syncSwitchName');
      const switchBody = document.getElementById('syncSwitchBody');
      const switchWipe = document.getElementById('syncSwitchWipe');
      const switchWipeLabel = document.getElementById('syncSwitchWipeLabel');
      const switchCode = document.getElementById('syncSwitchCode');
      const switchSubmit = document.getElementById('syncSwitchSubmit');
      const switchCancel = document.getElementById('syncSwitchCancel');
      const switchNotice = document.getElementById('syncSwitchNotice');
      const recoveryCopy = document.getElementById('syncRecoveryCopy');
      const recoveryNote = document.getElementById('syncRecoveryNote');
      let currentHandle = '';

      // On-state: one row per category; the error lives ONLY in its own row.
      function renderStatus(status, note) {
        const on = !!status.enabled;
        setup.hidden = on;
        active.hidden = !on;
        tabsShareEl.checked = !!status.syncTabs;
        if (on) {
          currentHandle = status.handle;
          syncStatusHandle.textContent = status.handle;
          // The chosen name, or empty with the computer's name as the hint.
          if (document.activeElement !== deviceNameEl) deviceNameEl.value = status.deviceName || '';
          deviceNameEl.placeholder = status.deviceNamePublished || '';
          const lastSynced = relativeSyncTime(status.lastSyncedAt);
          syncStatusData.textContent = lastSynced ? t('settings.sync.lastSynced', { when: lastSynced }) : t('settings.sync.notSynced');
          syncStatusTabs.textContent = status.syncTabs ? t('settings.sync.sharing') : t('settings.sync.notShared');
          syncStatusErrorRow.hidden = !status.lastError;
          syncStatusError.textContent = status.lastError || '';
          activeStatus.textContent = note || '';
        }
      }

      // Off-state: the reducer owns the flow; this code only mirrors view()
      // to the DOM and performs each returned effect exactly once.
      let model = createSyncSetupModel();
      function renderSetup() {
        const v = view(model);
        setupTitle.textContent = v.setupTitle;
        setupIntro.textContent = v.setupIntro;
        paths.hidden = v.pathChosen;
        form.hidden = !v.fieldsVisible;
        codeForm.hidden = !v.codePath;
        if (v.codePath) {
          codeSubmit.disabled = v.submitDisabled;
          codeStatus.textContent = v.noticeText;
          if (codeEl.value !== model.code) codeEl.value = model.code;
        }
        handleHint.textContent = v.handleHint;
        passHint.textContent = v.passphraseHint;
        submitBtn.textContent = v.submitLabel;
        finishTitle.textContent = v.finishTitle;
        finishHint.textContent = v.finishHint;
        submitBtn.disabled = v.submitDisabled;
        submitRow.hidden = v.showNotFound;
        notFound.hidden = !v.showNotFound;
        setupStatus.textContent = v.noticeText;
        if (handleEl.value !== model.handle) handleEl.value = model.handle;
        if (passEl.value !== model.passphrase) passEl.value = model.passphrase;
      }

      async function performEnable(effect) {
        setupStatus.textContent = t('settings.sync.turningOn');
        const res = await window.bowserPages.settings.syncEnable({ handle: effect.handle, passphrase: effect.passphrase });
        const name = effect.handle;
        // Copy comes from the EFFECT's path, never from live model state: the
        // person may have pressed Back or switched paths while this awaited.
        // created === false: enable()'s own probe found data — say so.
        // created === null: probe offline — plain copy.
        // Only a SUCCESSFUL enable gets transient copy. A failure that still
        // persisted credentials leaves sync on, and its message is already the
        // status's lastError — repeating it here would put the same error in
        // two places, which §4.4 forbids. A failure that persisted nothing
        // keeps the setup panel up, where the reducer's notice speaks.
        const note = res.ok
          ? (res.created === false
            ? (effect.path === 'join' ? t('settings.sync.connectedTo', { name }) : t('settings.sync.joinedAs', { name }))
            : t('settings.sync.on'))
          : null;
        // Only a reply for the attempt still in flight may speak; the status
        // itself is always real (sync may be on now) and is always rendered.
        const current = model.phase === 'enabling' && model.token === effect.token;
        dispatch({ type: 'enable-reply', token: effect.token, ok: res.ok, message: res.message });
        renderStatus(res.status, current ? note : null);
      }

      async function performPreflight(effect) {
        setupStatus.textContent = t('settings.sync.checking');
        let reply;
        try {
          reply = await window.bowserPages.settings.syncPreflight({ handle: effect.handle, passphrase: effect.passphrase });
        } catch {
          reply = { ok: false, outcome: 'error', message: t('settings.sync.checkFailed') };
        }
        dispatch({ type: 'preflight-reply', token: effect.token, outcome: reply.outcome, message: reply.message });
      }

      async function performJoinCode(effect) {
        codeStatus.textContent = t('settings.sync.turningOn');
        let res;
        try {
          res = await window.bowserPages.settings.syncJoinCode(effect.code);
        } catch {
          res = { ok: false, message: t('settings.sync.checkFailed') };
        }
        const current = model.phase === 'joining' && model.token === effect.token;
        dispatch({ type: 'join-code-reply', token: effect.token, ok: res.ok, outcome: res.error, message: res.message });
        if (res.status) {
          renderStatus(res.status, current && res.ok ? t('settings.sync.connectedTo', { name: res.status.handle }) : null);
        }
      }

      function dispatch(event) {
        const { state: next, effect } = transition(model, event);
        model = next;
        renderSetup();
        if (effect?.type === 'preflight') performPreflight(effect);
        if (effect?.type === 'enable') performEnable(effect);
        if (effect?.type === 'join-code') performJoinCode(effect);
      }

      // --- On state: Add another device ---
      let pairingModel = createPairingModel();
      let pairingTimer = null;
      function renderPairing() {
        const pv = pairingView(pairingModel, Date.now());
        pairingPanel.hidden = !pv.showing;
        addDeviceBtn.hidden = !pv.beginVisible;
        addDeviceBtn.disabled = pairingModel.phase === 'starting';
        pairingCodeEl.textContent = pv.codeText;
        pairingRemaining.textContent = pv.showing ? t('settings.sync.pairing.expiresIn', { time: pv.remainingText }) : '';
        pairingNotice.textContent = pv.expired ? t('settings.sync.pairing.expired') : pv.noticeText;
        pairingNotice.hidden = !pairingNotice.textContent;
        if (pv.showing && !pairingTimer) pairingTimer = setInterval(() => dispatchPairing({ type: 'tick', now: Date.now() }), 1000);
        if (!pv.showing && pairingTimer) { clearInterval(pairingTimer); pairingTimer = null; }
      }
      async function performPairBegin() {
        let res;
        try {
          res = await window.bowserPages.settings.syncPairBegin();
        } catch {
          res = { ok: false, message: t('settings.sync.checkFailed') };
        }
        dispatchPairing({ type: 'began', ok: res.ok, code: res.code, expiresAt: res.expiresAt, message: res.message });
      }
      function dispatchPairing(event) {
        const { state: next, effect } = pairingTransition(pairingModel, event);
        pairingModel = next;
        renderPairing();
        if (effect?.type === 'pair-begin') performPairBegin();
        if (effect?.type === 'pair-cancel') window.bowserPages.settings.syncPairCancel().catch(() => {});
      }
      addDeviceBtn.addEventListener('click', () => dispatchPairing({ type: 'begin' }));
      pairingCancel.addEventListener('click', () => dispatchPairing({ type: 'cancel' }));
      pairingCopy.addEventListener('click', () => {
        // The pairing code is the one secret meant to travel; the recovery
        // code never passes through this page.
        navigator.clipboard?.writeText(pairingModel.code).catch(() => {});
      });
      // A reopened Settings sheet shows the code still counting down.
      function resumePairing() {
        window.bowserPages.settings.syncPairState()
          .then((state) => dispatchPairing({ type: 'resume', ...state }))
          .catch(() => {});
      }

      // --- On state: Connect to a different sync ---
      let switchModel = createSwitchModel();
      function renderSwitch() {
        const sv = switchView(switchModel);
        switchForm.hidden = !sv.open;
        switchOpen.hidden = sv.open;
        if (sv.open) {
          switchName.textContent = t('settings.sync.switch.title', { name: currentHandle });
          switchBody.textContent = t('settings.sync.switch.body', { name: currentHandle });
          switchWipeLabel.textContent = t('settings.sync.switch.wipe', { name: currentHandle });
          switchWipe.checked = sv.wipeRemote;
          switchSubmit.disabled = sv.submitDisabled;
          switchNotice.textContent = sv.noticeText;
          if (switchCode.value !== sv.codeValue) switchCode.value = sv.codeValue;
        }
      }
      async function performSwitch(effect) {
        switchNotice.textContent = t('settings.sync.turningOn');
        let res;
        try {
          res = await window.bowserPages.settings.syncSwitchCode({ code: effect.code, wipeRemote: effect.wipeRemote });
        } catch {
          res = { ok: false, message: t('settings.sync.checkFailed') };
        }
        const current = switchModel.phase === 'pending' && switchModel.token === effect.token;
        dispatchSwitch({ type: 'switch-reply', token: effect.token, ok: res.ok, message: res.message });
        if (res.status) {
          renderStatus(res.status, current && res.ok ? t('settings.sync.connectedTo', { name: res.status.handle }) : null);
        }
      }
      function dispatchSwitch(event) {
        const { state: next, effect } = switchTransition(switchModel, event);
        switchModel = next;
        renderSwitch();
        if (effect?.type === 'switch-code') performSwitch(effect);
      }
      switchOpen.addEventListener('click', () => { dispatchSwitch({ type: 'open' }); switchCode.focus(); });
      switchCancel.addEventListener('click', () => dispatchSwitch({ type: 'cancel' }));
      switchCode.addEventListener('input', () => dispatchSwitch({ type: 'code-input', code: switchCode.value }));
      switchWipe.addEventListener('change', () => dispatchSwitch({ type: 'toggle-wipe', on: switchWipe.checked }));
      switchForm.addEventListener('submit', (e) => { e.preventDefault(); dispatchSwitch({ type: 'submit' }); });

      // --- On state: Copy recovery code (main shows the dialog and writes the clipboard) ---
      recoveryCopy.addEventListener('click', async () => {
        recoveryCopy.disabled = true;
        let res;
        try {
          res = await window.bowserPages.settings.syncRecoveryCodeCopy();
        } catch {
          res = { ok: false };
        }
        recoveryCopy.disabled = false;
        recoveryNote.textContent = res.ok ? t('settings.sync.recovery.copied') : (res.error === 'cancelled' ? '' : (res.message ?? ''));
      });

      pathStart.addEventListener('click', () => { dispatch({ type: 'choose', path: 'start' }); handleEl.focus(); });
      pathCode.addEventListener('click', () => { dispatch({ type: 'choose', path: 'code' }); codeEl.focus(); });
      backBtn.addEventListener('click', () => dispatch({ type: 'back' }));
      codeBack.addEventListener('click', () => dispatch({ type: 'back' }));
      codeEl.addEventListener('input', () => dispatch({ type: 'code-input', code: codeEl.value }));
      codeForm.addEventListener('submit', (e) => { e.preventDefault(); dispatch({ type: 'submit' }); });
      usePassphrase.addEventListener('click', () => { dispatch({ type: 'use-passphrase' }); handleEl.focus(); });
      const onInput = () => dispatch({ type: 'input', handle: handleEl.value, passphrase: passEl.value });
      handleEl.addEventListener('input', onInput);
      passEl.addEventListener('input', onInput);
      form.addEventListener('submit', (e) => { e.preventDefault(); dispatch({ type: 'submit' }); });
      tryAgainBtn.addEventListener('click', () => { dispatch({ type: 'input', handle: handleEl.value, passphrase: passEl.value }); passEl.focus(); });
      startNewBtn.addEventListener('click', () => dispatch({ type: 'start-new' }));

      window.bowserPages.settings.syncGet().then((status) => {
        renderStatus(status);
        renderSetup();
        renderPairing();
        renderSwitch();
        if (status.enabled) resumePairing();
      }).catch(() => {});

      nowBtn.addEventListener('click', async () => {
        nowBtn.disabled = true;
        activeStatus.textContent = t('settings.sync.syncing');
        renderStatus(await window.bowserPages.settings.syncNow());
        nowBtn.disabled = false;
      });

      disableBtn.addEventListener('click', async () => {
        const res = await window.bowserPages.settings.syncDisable({ wipeRemote: wipeEl.checked });
        // A failed remote wipe keeps sync ON (the accountId is the only handle
        // on the server copy) — leave the checkbox set for the retry and say why.
        wipeEl.checked = res.ok ? false : wipeEl.checked;
        model = createSyncSetupModel();
        pairingModel = createPairingModel();
        switchModel = createSwitchModel();
        renderStatus(res.status, res.ok ? null : res.message);
        renderSetup();
        renderPairing();
        renderSwitch();
      });

      tabsShareEl.addEventListener('change', async () => {
        renderStatus(await window.bowserPages.settings.syncTabsSet(tabsShareEl.checked));
      });
      deviceNameEl.addEventListener('change', async () => {
        renderStatus(await window.bowserPages.settings.syncDeviceNameSet(deviceNameEl.value));
      });
      deviceNameEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') deviceNameEl.blur(); // commits through change
      });
    })();
  } else {
    document.getElementById('group-sync')?.remove();
  }

  // --- About & Trust: a local, read-only receipt ---
  if (typeof window.bowserPages?.settings?.trustReceipt === 'function') {
    const trustStatus = document.getElementById('trustReceiptStatus');
    const trustList = document.getElementById('trustReceiptList');
    const trustLinks = document.getElementById('trustReceiptLinks');
    const yesNo = (value) => (value ? t('settings.trust.on') : t('settings.trust.off'));
    const dnsProviders = { cloudflare: 'Cloudflare', quad9: 'Quad9', mullvad: 'Mullvad' };
    // A data fact (versions, digests, list and provider names) reads the same
    // in every language.
    const addFact = (label, value, { data = false } = {}) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      if (data) detail.dataset.i18nIgnore = '';
      trustList.append(term, detail);
    };

    window.bowserPages.settings.trustReceipt().then((receipt) => {
      const { expectedPublisher: expected, observedPublisher: observed } = receipt.signature;
      const signature = {
        verified: () => t('settings.trust.signature.verified', { publisher: observed }),
        mismatch: () => t('settings.trust.signature.mismatch', { expected, observed: observed || t('settings.trust.signature.unknownPublisher') }),
        unavailable: () => t('settings.trust.signature.unavailable', { expected }),
        development: () => t('settings.trust.signature.development'),
        'manifest-backed': () => t('settings.trust.signature.manifestBacked'),
      }[receipt.signature.status]?.() ?? t('settings.trust.signature.unknown');
      const { app, blocker, choices } = receipt;
      const build = { version: app.version, build: app.bundleBuild };
      addFact(t('settings.trust.fact.build'),
        app.packaged ? t('settings.trust.buildPackaged', build) : t('settings.trust.buildDevelopment', build));
      const data = { data: true };
      addFact(t('settings.trust.fact.runtime'), `Electron ${app.electron} · Chromium ${app.chromium} · Node ${app.node}`, data);
      addFact(t('settings.trust.fact.platform'), `${app.platform} · ${app.architecture}`, data);
      addFact(t('settings.trust.fact.publisher'), signature);
      addFact(t('settings.trust.fact.blockerSnapshot'), `${blocker.snapshotDate} · ${blocker.lists.map((list) => list.name).join(' + ')}`, data);
      for (const list of blocker.lists) addFact(t('settings.trust.fact.blockerList', { name: list.name }), list.sha256, data);
      addFact(t('settings.trust.fact.blockerDigest'), blocker.combinedSha256, data);
      // The receipt's sync categories and scope are fixed (trust-receipt.js).
      addFact(t('settings.trust.fact.sync'), receipt.sync.enabled ? t('settings.trust.syncScope') : t('settings.trust.off'));
      addFact(t('settings.trust.fact.openTabs'), yesNo(receipt.sync.openTabsEnabled));
      addFact(t('settings.trust.fact.usage'), yesNo(choices.usageMeasurement));
      addFact(t('settings.trust.fact.suggestions'), yesNo(choices.searchSuggestions));
      const dns = choices.secureDns;
      const dnsSetting = { auto: t('settings.trust.dnsAuto'), off: t('settings.trust.off'), custom: t('settings.trust.dnsCustom') }[dns];
      addFact(t('settings.trust.fact.secureDns'), dnsSetting ?? dnsProviders[dns] ?? dns, { data: !dnsSetting });
      addFact(t('settings.trust.fact.crashLedger'), t('settings.trust.crashLedger',
        { count: choices.crashLedger.eventCount, limit: choices.crashLedger.eventLimit }));
      for (const link of receipt.links) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiet';
        button.textContent = link.label;
        button.addEventListener('click', () => window.bowserPages.settings.openTrustLink(link.id));
        trustLinks.append(button);
      }
      trustStatus.textContent = t('settings.trust.checked');
      trustList.hidden = false;
      trustLinks.hidden = false;
    }).catch(() => {
      trustStatus.textContent = t('settings.trust.failed');
    });
  } else {
    document.getElementById('group-trust')?.remove();
  }

  // --- Device-local crash ledger / explicit export ---
  if (window.bowserPages?.diagnostics) {
    const summary = document.getElementById('diagnosticsSummary');
    const status = document.getElementById('diagnosticsStatus');
    const exportButton = document.getElementById('diagnosticsExport');
    const clearButton = document.getElementById('diagnosticsClear');

    function renderDiagnostics(value) {
      const count = Number.isInteger(value?.count) ? value.count : 0;
      summary.textContent = count === 0 ? t('settings.diagnostics.none') : t('settings.diagnostics.count', { count });
      clearButton.disabled = count === 0;
    }

    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      status.textContent = t('settings.diagnostics.preparing');
      const result = await window.bowserPages.diagnostics.export();
      exportButton.disabled = false;
      status.textContent = result.ok
        ? t('settings.diagnostics.saved')
        : (result.cancelled ? t('settings.diagnostics.cancelled') : t('settings.diagnostics.saveFailed'));
    });

    clearButton.addEventListener('click', async () => {
      if (!confirm(t('settings.diagnostics.clearConfirm'))) return;
      const result = await window.bowserPages.diagnostics.clear();
      status.textContent = result.ok ? t('settings.diagnostics.cleared') : t('settings.diagnostics.clearFailed');
      renderDiagnostics(result);
    });

    window.bowserPages.diagnostics.status().then(renderDiagnostics).catch(() => {
      summary.textContent = t('settings.diagnostics.readFailed');
    });
  } else {
    document.getElementById('group-diagnostics')?.remove();
  }

  // --- Settings sidebar: scroll-spy + click-to-scroll ---
  (function initSettingsNav() {
    // Drop nav links whose group was removed above (unsupported on this platform).
    for (const link of [...document.querySelectorAll('.settings-nav a')]) {
      if (!document.getElementById(`group-${link.dataset.group}`)) link.remove();
    }

    const links = [...document.querySelectorAll('.settings-nav a')];
    const activeGroups = links.map((link) => document.getElementById(`group-${link.dataset.group}`)).filter(Boolean);
    let anchoredGroup = activeGroups.find((group) => `#${group.id}` === location.hash) ?? null;

    const setCurrent = (group) => {
      for (const link of links) {
        const current = link.dataset.group === group;
        link.classList.toggle('current', current);
        if (current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    };

    // In the utility sheet the card (.page) scrolls, not the window, so the
    // marker is scored against — and driven by — that element. Scoring rules
    // live in settings-nav-model.js.
    const scroller = document.querySelector('body.sheet .page') ?? window;
    const viewBox = () => (scroller === window
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect());

    function updateCurrent() {
      const sections = activeGroups.map((group) => {
        const rect = group.getBoundingClientRect();
        return { id: group.id.replace('group-', ''), top: rect.top, bottom: rect.bottom };
      });
      const anchoredId = anchoredGroup ? anchoredGroup.id.replace('group-', '') : null;
      const result = window.blancSettingsNavModel.currentSection(sections, viewBox(), anchoredId);
      if (!result.anchored) anchoredGroup = null;
      if (result.id) setCurrent(result.id);
    }

    // A sidebar click pins its target through the smooth-scroll animation.
    // Otherwise clicking a short trailing section (Help) — whose scrollIntoView
    // clamps at the page bottom, leaving it tied with Patron — would let the
    // scorer settle the highlight on Patron instead.
    let pinnedUntil = 0;
    let ticking = false;
    const scheduleUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (Date.now() >= pinnedUntil) updateCurrent();
        ticking = false;
      });
    };
    scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
    // Setup panels can change height without scrolling (for example, choosing
    // a Sync path). Re-score then too so the sidebar never highlights the next
    // short section after the current section expands.
    if (typeof ResizeObserver === 'function') {
      const sizeObserver = new ResizeObserver(scheduleUpdate);
      for (const group of activeGroups) sizeObserver.observe(group);
    }
    updateCurrent();

    for (const link of links) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        anchoredGroup = document.getElementById(`group-${link.dataset.group}`);
        setCurrent(link.dataset.group);
        pinnedUntil = Date.now() + 800; // outlasts the smooth-scroll animation
        document.getElementById(`group-${link.dataset.group}`)?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  })();

  // Replace native <select> popups (Liquid Glass / ghosted closed face on
  // macOS) with opaque in-page menus. Keep the real <select> as the value
  // source so existing change listeners and programmatic .value writes work.
  enhanceSettingsSelects(document.querySelectorAll('.settings-content select'));

  // Long explanations show their first two lines; More reveals the same text
  // in place. Nothing is summarized or reworded.
  (function foldLongHints() {
    const hints = [...document.querySelectorAll('.setting .label .hint:not(.field-error)')];
    const measure = () => {
      for (const hint of hints) {
        if (hint.dataset.userExpanded === 'true' || !hint.offsetParent) continue;
        hint.classList.add('folded');
        const overflowing = hint.scrollHeight > hint.clientHeight + 1;
        let toggle = hint.nextElementSibling?.classList.contains('hint-toggle') ? hint.nextElementSibling : null;
        if (!overflowing) {
          hint.classList.remove('folded');
          toggle?.remove();
          continue;
        }
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'hint-toggle';
          toggle.textContent = t('settings.hint.more');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.addEventListener('click', () => {
            const open = hint.classList.toggle('folded') === false;
            hint.dataset.userExpanded = String(open);
            toggle.textContent = open ? t('settings.hint.less') : t('settings.hint.more');
            toggle.setAttribute('aria-expanded', String(open));
          });
          hint.after(toggle);
        }
      }
    };
    measure();
    let pending = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(measure);
    });
  })();

  // A fragment naming a card rather than a group (#onePasswordSettings, from
  // the 1Password setup prompt) points at content this script reveals after
  // the browser's own fragment scroll has given up. Scroll to it last, once
  // folding the hints above it can no longer move it.
  const anchoredCard = location.hash && !location.hash.startsWith('#group-')
    ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
    : null;
  if (anchoredCard && !anchoredCard.hidden) anchoredCard.scrollIntoView({ block: 'start' });
})();

/** Opaque Settings picker over each remaining .settings-content <select>. */
function enhanceSettingsSelects(selects) {
  let openPicker = null;
  let anonymousPickerId = 0;
  const enhanced = new Map();
  const surface = window.bowserPages?.surface;

  const setEscapeArmed = (armed) => {
    try { surface?.armEscape?.(armed); } catch { /* bridge absent in static preview */ }
  };

  const closeOpen = () => {
    if (openPicker) openPicker.close();
  };

  document.addEventListener('pointerdown', (e) => {
    if (openPicker && !openPicker.root.contains(e.target) && !openPicker.menu.contains(e.target)) {
      closeOpen();
    }
  });
  // Page keydown is a fallback; main's sheet before-input-event normally owns
  // Escape and forwards pages:surface:escape when escape is armed.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPicker) {
      e.preventDefault();
      const trigger = openPicker.trigger;
      closeOpen();
      trigger.focus();
    }
  });
  surface?.onEscape?.(() => {
    if (!openPicker) return;
    const trigger = openPicker.trigger;
    closeOpen();
    trigger.focus();
  });
  document.querySelector('body.sheet .page')?.addEventListener('scroll', closeOpen, { passive: true });
  window.addEventListener('resize', closeOpen);

  const enhanceNew = (candidates) => {
    for (const select of candidates) {
      if (!(select instanceof HTMLSelectElement)) continue;
      if (select.dataset.settingsSelectEnhanced === '1') continue;
      select.dataset.settingsSelectEnhanced = '1';
      enhanced.set(select, enhanceSettingsSelect(select));
    }
  };
  enhanceNew(selects);
  const settingsContent = document.querySelector('.settings-content');
  if (settingsContent) {
    new MutationObserver(() => {
      for (const [select, picker] of enhanced) {
        if (!select.isConnected) { picker.dispose(); enhanced.delete(select); }
      }
      enhanceNew(settingsContent.querySelectorAll('select'));
    }).observe(settingsContent, { childList: true, subtree: true });
  }

  function enhanceSettingsSelect(select) {
    const wrap = document.createElement('div');
    wrap.className = 'settings-select';
    select.parentNode.insertBefore(wrap, select);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'settings-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const pickerId = select.id || `settingsSelect${++anonymousPickerId}`;
    trigger.id = `${pickerId}Trigger`;

    const titleEl = select.closest('.setting')?.querySelector('.label > span:first-child');
    if (titleEl) {
      if (!titleEl.id) titleEl.id = select.id ? `${select.id}Label` : `${trigger.id || 'settingsSelect'}Label`;
      trigger.setAttribute('aria-labelledby', titleEl.id);
    } else if (select.getAttribute('aria-label')) {
      trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    }

    const face = document.createElement('span');
    face.className = 'settings-select-label';
    trigger.append(face);

    const menu = document.createElement('ul');
    menu.className = 'settings-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.id = `${pickerId}Listbox`;
    menu.hidden = true;
    trigger.setAttribute('aria-controls', menu.id);
    if (titleEl?.id) menu.setAttribute('aria-labelledby', titleEl.id);

    select.classList.add('settings-select-native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    wrap.append(trigger, select);
    // Menu is portaled to <body> so sheet overflow can't clip it, and so it
    // isn't a descendant of the trigger for hit-testing while open.
    document.body.append(menu);

    // The face and menu rows carry an option's data-i18n-ignore (proper names).
    const syncFace = () => {
      const opt = select.selectedOptions[0];
      face.textContent = opt ? opt.textContent : '';
      face.toggleAttribute('data-i18n-ignore', opt?.hasAttribute('data-i18n-ignore') === true);
    };

    const rebuildMenu = () => {
      menu.replaceChildren();
      for (const opt of select.options) {
        const li = document.createElement('li');
        li.className = 'settings-select-option';
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        li.textContent = opt.textContent;
        li.toggleAttribute('data-i18n-ignore', opt.hasAttribute('data-i18n-ignore'));
        li.tabIndex = -1;
        if (opt.selected) {
          li.classList.add('is-selected');
          li.setAttribute('aria-selected', 'true');
        } else {
          li.setAttribute('aria-selected', 'false');
        }
        menu.append(li);
      }
    };

    const positionMenu = () => {
      const r = trigger.getBoundingClientRect();
      const pad = 8;
      menu.style.minWidth = `${Math.ceil(r.width)}px`;
      // Force layout so offsetHeight is current before flipping.
      const mh = menu.offsetHeight || 0;
      const mw = menu.offsetWidth || r.width;
      const spaceBelow = window.innerHeight - r.bottom - pad;
      const openUp = mh > spaceBelow && r.top - pad > spaceBelow;
      let left = r.left;
      if (left + mw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - mw - pad);
      if (left < pad) left = pad;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = openUp
        ? `${Math.round(Math.max(pad, r.top - mh - 4))}px`
        : `${Math.round(r.bottom + 4)}px`;
    };

    const api = {
      root: wrap,
      menu,
      trigger,
      close() {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        wrap.classList.remove('is-open');
        for (const li of menu.querySelectorAll('.settings-select-option.is-active')) {
          li.classList.remove('is-active');
        }
        if (openPicker === api) openPicker = null;
        setEscapeArmed(false);
      },
      open() {
        closeOpen();
        rebuildMenu();
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        wrap.classList.add('is-open');
        positionMenu();
        openPicker = api;
        setEscapeArmed(true);
        const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.settings-select-option');
        if (selected) {
          selected.tabIndex = 0;
          selected.classList.add('is-active');
          selected.focus();
        }
      },
    };

    const choose = (li) => {
      if (!li) return;
      const value = li.dataset.value;
      if (select.value !== value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncFace();
      api.close();
      trigger.focus();
    };

    trigger.addEventListener('click', () => {
      if (menu.hidden) api.open();
      else api.close();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (menu.hidden) api.open();
      }
    });

    menu.addEventListener('click', (e) => {
      choose(e.target.closest('.settings-select-option'));
    });

    menu.addEventListener('pointerdown', (e) => {
      // Keep the document pointerdown closer from treating menu clicks as outside.
      e.stopPropagation();
    });

    menu.addEventListener('keydown', (e) => {
      const opts = [...menu.querySelectorAll('.settings-select-option')];
      const i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = opts[Math.min(opts.length - 1, Math.max(0, i) + 1)] || opts[0];
        opts.forEach((o) => { o.tabIndex = -1; o.classList.remove('is-active'); });
        next.tabIndex = 0;
        next.classList.add('is-active');
        next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = opts[Math.max(0, (i < 0 ? 0 : i) - 1)] || opts[0];
        opts.forEach((o) => { o.tabIndex = -1; o.classList.remove('is-active'); });
        next.tabIndex = 0;
        next.classList.add('is-active');
        next.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(document.activeElement?.closest?.('.settings-select-option') || opts[i]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        api.close();
        trigger.focus();
      } else if (e.key === 'Tab') {
        api.close();
      }
    });

    // Programmatic select.value = … (e.g. secureDns showAccepted) must refresh
    // the closed face without a change event.
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (desc?.get && desc?.set) {
      Object.defineProperty(select, 'value', {
        configurable: true,
        enumerable: true,
        get() { return desc.get.call(this); },
        set(v) {
          desc.set.call(this, v);
          syncFace();
        },
      });
    }

    select.addEventListener('change', syncFace);
    const syncObserver = new MutationObserver(syncFace);
    syncObserver.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['selected', 'value'],
    });

    syncFace();
    return {
      dispose() {
        if (openPicker === api) api.close();
        syncObserver.disconnect();
        menu.remove();
      },
    };
  }
}
