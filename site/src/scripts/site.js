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
  try {
    const landingOppref = new URL(location.href).searchParams.get('oppref');
    if (validOppref(landingOppref)) pendingOppref = landingOppref;

    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === 'granted' && pendingOppref) {
      sessionStorage.setItem(STORAGE_KEY, pendingOppref);
    } else if (consent === 'denied') {
      pendingOppref = null;
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* Storage restrictions disable attribution, never downloads. */ }

  return {
    grant() {
      try {
        if (pendingOppref) sessionStorage.setItem(STORAGE_KEY, pendingOppref);
      } catch { /* Storage restrictions disable attribution. */ }
    },
    deny() {
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
        if (localStorage.getItem(CONSENT_KEY) !== 'granted') return;
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
    ctas.forEach((cta) => {
      cta.href = '/dl/' + os;
      cta.dataset.platform = os;
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
// identifier, so it sits under the same restricted-measurement basis as the
// denied-state GA4 pings and needs no consent gate. It only loads on non-legal
// pages because site.js itself is gated by BaseLayout's `analytics` prop.
// The token is public (it names the site, not an account); leave it empty to
// ship without the beacon. EasyPrivacy blocks cloudflareinsights.com, so Blanc
// and other blocker users are never counted — it measures the non-blocking share.
try {
  const CF_BEACON_TOKEN = '';
  if (CF_BEACON_TOKEN) {
    const beacon = document.createElement('script');
    beacon.defer = true;
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: CF_BEACON_TOKEN }));
    document.head.appendChild(beacon);
  }
} catch {}

// GA4 Consent Mode: gtag loads with analytics_storage denied by default.
// Cookieless pings give GA4 modelling signal; full measurement requires opt-in.
try {
  const GA_ID = 'G-MN8BLY6GE9';
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', { analytics_storage: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(script);

  const banner = document.getElementById('consent');
  const allowButton = document.getElementById('consentAllow');
  const denyButton = document.getElementById('consentDeny');
  const choiceButtons = document.querySelectorAll('[data-consent-open]');
  // Version the broader choice so an earlier analytics-only Allow is not
  // silently treated as consent to the newly added ad-conversion purpose.
  const consent = localStorage.getItem('measurement-consent-v2');
  if (consent === 'granted') {
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
  }

  let leaveTimer = null;
  const showConsent = ({ focus = false } = {}) => {
    if (!banner) return;
    if (leaveTimer) clearTimeout(leaveTimer);
    banner.classList.remove('is-leaving');
    banner.hidden = false;
    if (focus) requestAnimationFrame(() => allowButton?.focus());
  };
  const dismissConsent = (choice) => {
    localStorage.setItem('measurement-consent-v2', choice);
    banner.classList.add('is-leaving');
    leaveTimer = setTimeout(() => {
      banner.hidden = true;
      banner.classList.remove('is-leaving');
      leaveTimer = null;
    }, 180);
  };

  if (consent !== 'granted' && consent !== 'denied') showConsent();
  choiceButtons.forEach((button) => {
    button.addEventListener('click', () => showConsent({ focus: true }));
  });
  if (banner && allowButton && denyButton) {
    allowButton.addEventListener('click', () => {
      dismissConsent('granted');
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
      openAIAttribution.grant();
    });
    denyButton.addEventListener('click', () => {
      dismissConsent('denied');
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      openAIAttribution.deny();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-track]');
    if (!target || typeof window.gtag !== 'function') return;
    const payload = {
      source_page: document.body.dataset.page || location.pathname,
      cta_position: target.dataset.ctaPosition || undefined,
      platform: target.dataset.platform || undefined,
      feature: target.dataset.feature || undefined,
    };
    window.gtag('event', target.dataset.track, payload);
  });
} catch (error) { /* A broken analytics path must never affect the site. */ }
