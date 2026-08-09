/* Shared marketing-site behaviour: release resolution and opt-in analytics. */
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

  fetch('https://api.github.com/repos/bnfy/blanc/releases/latest')
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((release) => {
      links.forEach((link) => {
        const asset = pickAsset(release.assets, link.dataset.platform);
        if (asset) {
          link.href = asset.browser_download_url;
          // Cards for artifacts the current release may lack (Mac Intel) ship
          // hidden in the static markup; reveal one only once its asset is
          // confirmed, so a failed fetch or disabled JS never shows a promise
          // the release can't keep.
          if (link.parentElement === downloadOptions) link.hidden = false;
        } else if (link.parentElement === downloadOptions) {
          // The release pipeline may intentionally omit an architecture or
          // platform that has not passed its native gate. Do not leave a card
          // that promises an artifact the current release does not contain.
          link.hidden = true;
        }
      });
      if (!os) return;
      const asset = pickAsset(release.assets, os);
      if (!asset) return;
      ctas.forEach((cta) => {
        cta.href = asset.browser_download_url;
        cta.dataset.platform = os;
      });
    })
    .catch(() => { /* Releases page remains the deliberate fallback. */ });
})();

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
  const consent = localStorage.getItem('ga-consent');
  if (consent === 'granted') {
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
  } else if (consent !== 'denied' && banner) {
    banner.hidden = false;
    document.body.classList.add('has-consent');
    // How tall the bar ends up depends on how the question wraps, which moves
    // with viewport width and with whichever font actually loaded. The hero and
    // footer hold back --consent-h, so measure it rather than guess: a reserve
    // that guesses low puts the hero's CTA under the bar. The CSS value stands
    // in until this runs.
    const reserve = () => {
      document.documentElement.style.setProperty('--consent-h', banner.offsetHeight + 'px');
    };
    reserve();
    const observer = window.ResizeObserver ? new ResizeObserver(reserve) : null;
    if (observer) observer.observe(banner);
    const dismiss = (choice) => {
      localStorage.setItem('ga-consent', choice);
      // Let the bar slide out before it leaves the layout, so the hero and the
      // footer only take back their reserved space once it has gone.
      banner.classList.add('is-leaving');
      setTimeout(() => {
        banner.hidden = true;
        banner.classList.remove('is-leaving');
        document.body.classList.remove('has-consent');
        if (observer) observer.disconnect();
      }, 200);
    };
    document.getElementById('consentAllow').addEventListener('click', () => {
      dismiss('granted');
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
    });
    document.getElementById('consentDeny').addEventListener('click', () => dismiss('denied'));
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
