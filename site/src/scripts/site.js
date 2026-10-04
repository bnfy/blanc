/* Shared marketing-site behaviour: release resolution and opt-in measurement. */
const openAIAttribution = (() => {
  const CONSENT_KEY = 'measurement-consent-v2';
  const STORAGE_KEY = 'openai-oppref';
  const MAX_OPPREF_LENGTH = 2048;
  const validOppref = (value) =>
    typeof value === 'string' && value.length > 0 && value.length <= MAX_OPPREF_LENGTH;

  const clearDownloadReference = (link) => {
    try {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith('/dl/')) return null;
      if (url.searchParams.has('oppref')) {
        url.searchParams.delete('oppref');
        link.href = url.href;
      }
      return url;
    } catch { return null; }
  };

  let pendingOppref = null;
  let disabled = false;
  try {
    const landingUrl = new URL(location.href);
    const landingOppref = landingUrl.searchParams.get('oppref');
    // Consume the landing reference once. A later reload/regrant must not
    // resurrect a reference that the visitor has withdrawn.
    if (landingUrl.searchParams.has('oppref')) {
      landingUrl.searchParams.delete('oppref');
      window.history?.replaceState(null, '', landingUrl.href);
    }
    if (validOppref(landingOppref)) pendingOppref = landingOppref;

    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === 'granted' && pendingOppref) {
      sessionStorage.setItem(STORAGE_KEY, pendingOppref);
    } else if (consent === 'denied') {
      pendingOppref = null;
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch { pendingOppref = null; disabled = true; /* Never block downloads. */ }

  return {
    grant() {
      disabled = false;
      try {
        if (pendingOppref) sessionStorage.setItem(STORAGE_KEY, pendingOppref);
      } catch { /* Storage restrictions disable attribution. */ }
    },
    deny() {
      disabled = true;
      pendingOppref = null;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* No stored attribution. */ }
      // A prior click may have opened another tab or a download, leaving this
      // page's link decorated. Withdrawal must also clean that live URL.
      document.querySelectorAll('a[data-download-cta], a[data-download-link]')
        .forEach(clearDownloadReference);
    },
    decorateDownload(link) {
      // Remove old attribution before reading storage, which may now be denied
      // or unavailable. Add it back only for a currently consented click.
      const url = clearDownloadReference(link);
      if (!url) return;
      try {
        if (disabled || localStorage.getItem(CONSENT_KEY) !== 'granted') return;
        const oppref = sessionStorage.getItem(STORAGE_KEY);
        if (!validOppref(oppref)) return;

        url.searchParams.set('oppref', oppref);
        link.href = url.href;
      } catch { /* Attribution must never affect the download path. */ }
    },
  };
})();

(function () {
  const ctas = Array.from(document.querySelectorAll('[data-download-cta]'));
  const links = Array.from(document.querySelectorAll('[data-download-link]'));
  if (!ctas.length && !links.length) return;

  const ua = navigator.userAgent;
  let os = null;
  if (/Windows/i.test(ua)) os = 'win';
  else if (/Android|iPhone|iPad|iPod/i.test(ua)) os = null;
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'mac';
  else if (/Linux/i.test(ua)) os = 'linux';

  // On the dedicated download page, make the relevant installer the first
  // choice without changing the meaningful source order for unsupported
  // devices. The individual links remain available as fallbacks.
  const downloadOptions = document.querySelector('[data-download-options]');
  if (os && downloadOptions) {
    const preferred = links.find((link) =>
      link.dataset.platform === os ||
      (os === 'mac' && link.dataset.platform === 'mac-arm64')
    );
    if (preferred?.parentElement === downloadOptions) downloadOptions.prepend(preferred);
  }

  const pickAsset = (assets, kind) => {
    // A Mac user agent does not reliably reveal Apple Silicon vs Intel.
    // Generic Mac CTAs therefore stay on /download, where both signed
    // artifacts are explicit, instead of guessing the wrong binary.
    if (kind === 'mac') return null;
    if (kind === 'mac-arm64' || kind === 'mac-x64') {
      const dmgs = assets.filter((asset) => asset.name.endsWith('.dmg'));
      if (kind === 'mac-x64') {
        return dmgs.find((asset) => !asset.name.includes('arm64')) || null;
      }
      return dmgs.find((asset) => asset.name.includes('arm64')) || null;
    }
    if (kind === 'win') return assets.find((asset) => asset.name.endsWith('.exe'));
    if (kind === 'linux') return assets.find((asset) => asset.name.endsWith('.AppImage'));
    return null;
  };

  // The card hrefs are static /dl/<target> counted redirects and are never
  // rewritten — pointing them at direct asset URLs would bypass the edge
  // counter. The release fetch survives only to reveal/hide option cards
  // (Cards for artifacts the current release may lack — Mac Intel — ship
  // hidden in the static markup) so no card ever promises an artifact the
  // current release does not contain.
  fetch('https://api.github.com/repos/bnfy/blanc/releases/latest')
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((release) => {
      links.forEach((link) => {
        if (link.parentElement !== downloadOptions) return;
        link.hidden = !pickAsset(release.assets, link.dataset.platform);
      });
    })
    .catch(() => { /* Cards keep their static hidden/visible state. */ });

  // CTAs need no release data any more: the counted redirect resolves the
  // artifact server-side. Generic 'mac' stays on /download (arm64 vs x64
  // can't be told from a UA — see pickAsset).
  if (os && os !== 'mac') {
    const label = os === 'win' ? 'Download for Windows' : 'Download for Linux';
    ctas.forEach((cta) => {
      cta.href = '/dl/' + os;
      cta.dataset.platform = os;
      // This link now downloads the installer directly, so say which one.
      cta.textContent = label;
    });
  }

  // OpenAI's opaque ad-click reference is forwarded only after the site's
  // measurement consent is granted. The download stays a normal link and the
  // server-side event path receives no form data or browser identifiers.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-download-cta], a[data-download-link]');
    if (link) openAIAttribution.decorateDownload(link);
  });
})();

// Cloudflare Web Analytics: a cookieless page-view beacon with no persistent
// identifier. Google analytics and ad attribution are separately opt-in. It only loads on non-legal
// pages because site.js itself is gated by BaseLayout's `analytics` prop.
// The token is public (it names the site, not an account); leave it empty to
// ship without the beacon. EasyPrivacy blocks cloudflareinsights.com, so Blanc
// and other blocker users are never counted — it measures the non-blocking share.
try {
  const CF_BEACON_TOKEN = '5bb5a98e48364f51b4fea600381c2a0c';
  if (CF_BEACON_TOKEN) {
    const beacon = document.createElement('script');
    beacon.type = 'module';
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: CF_BEACON_TOKEN }));
    document.head.appendChild(beacon);
  }
} catch {}

// Optional measurement loads only after a saved, explicit grant. No denied-state
// Google script, pings, or event queue exists on an unconsented visit.
(() => {
  const GA_ID = 'G-MN8BLY6GE9';
  const CONSENT_KEY = 'measurement-consent-v2';
  const banner = document.getElementById('consent');
  const allowButton = document.getElementById('consentAllow');
  const denyButton = document.getElementById('consentDeny');
  const closeButton = document.getElementById('consentClose');
  const status = document.getElementById('consentStatus');
  let loaded = false;
  let disabled = false;
  let returnFocus = null;
  const readChoice = () => {
    try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
  };
  const allowed = () => !disabled && readChoice() === 'granted';
  const showStatus = message => { if (status) status.textContent = message; };
  const loadMeasurement = () => {
    if (loaded || !allowed()) return;
    loaded = true;
    window['ga-disable-' + GA_ID] = false;
    window.dataLayer = [];
    window.gtag = function () { if (allowed()) window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);
  };
  const hideChoice = () => {
    if (banner) banner.hidden = true;
    returnFocus?.focus?.({ preventScroll: true });
  };
  const showChoice = trigger => {
    if (!banner) return;
    returnFocus = trigger;
    showStatus(allowed() ? 'Optional measurement is on.' : 'Optional measurement is off.');
    banner.hidden = false;
    allowButton?.focus?.({ preventScroll: true });
  };
  const saveChoice = choice => {
    try {
      localStorage.setItem(CONSENT_KEY, choice);
      return readChoice() === choice;
    } catch { return false; }
  };
  const stopMeasurement = () => {
    disabled = true;
    window['ga-disable-' + GA_ID] = true;
    if (window.dataLayer) window.dataLayer.length = 0;
    openAIAttribution.deny();
  };
  document.querySelectorAll('[data-consent-open]').forEach(button => {
    button.addEventListener('click', () => showChoice(button));
  });
  closeButton?.addEventListener('click', hideChoice);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && banner && !banner.hidden) { event.preventDefault(); hideChoice(); }
  });
  allowButton?.addEventListener('click', () => {
    if (!saveChoice('granted')) {
      stopMeasurement();
      showStatus('Could not save this choice. Optional measurement stays off. Check browser storage and try again.');
      return;
    }
    disabled = false;
    window['ga-disable-' + GA_ID] = false;
    openAIAttribution.grant();
    loadMeasurement();
    hideChoice();
  });
  denyButton?.addEventListener('click', () => {
    stopMeasurement();
    if (!saveChoice('denied')) {
      showStatus('Measurement is off on this page, but the choice could not be saved. Check browser storage and try again.');
      return;
    }
    hideChoice();
    // A reload unloads the granted Google library; the saved denial prevents it
    // from loading again. Existing in-flight requests cannot be recalled.
    if (loaded) location.reload?.();
  });
  window.addEventListener?.('storage', event => {
    if ((event.key === CONSENT_KEY || event.key === null) && readChoice() !== 'granted') {
      stopMeasurement();
      if (loaded) location.reload?.();
    }
  });
  document.addEventListener('click', event => {
    if (!allowed() || typeof window.gtag !== 'function') return;
    const target = event.target.closest('[data-track]');
    if (!target) return;
    window.gtag('event', target.dataset.track, {
      source_page: document.body.dataset.page || location.pathname,
      cta_position: target.dataset.ctaPosition || undefined,
      platform: target.dataset.platform || undefined,
      feature: target.dataset.feature || undefined,
    });
  });
  try { loadMeasurement(); } catch { /* Measurement never blocks browsing. */ }
})();
