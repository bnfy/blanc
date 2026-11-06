// The desktop download link can't install anything on a phone or tablet, so
// there it sends the download page onward (share sheet, then clipboard)
// instead of opening it. On an iPhone, where Blanc for iPhone is on the App
// Store, the page also shows its App Store button ([data-iphone-store]) and
// hides copy that is only true of other handhelds ([data-not-iphone]).
import { SITE_ORIGIN } from '../lib/site-origin.mjs';

const DOWNLOAD_URL = `${SITE_ORIGIN}/download`;

export function isHandheld(nav) {
  const ua = String(nav?.userAgent || '');
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS requests desktop sites with a Mac user agent; touch support gives it away.
  return /Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1;
}

// Blanc for iPhone 1.0 runs on iPhone only (no iPad build), so an iPad,
// whatever user agent it sends, is not an iPhone here.
export function isIphone(nav) {
  return /iPhone|iPod/i.test(String(nav?.userAgent || ''));
}

export function initHandheldDownload({ document = window.document, view = window } = {}) {
  if (!isHandheld(view.navigator)) return false;
  document.querySelectorAll('[data-handheld-note]').forEach(note => { note.hidden = false; });
  const iphone = isIphone(view.navigator);
  if (iphone) {
    document.querySelectorAll('[data-iphone-store]').forEach(item => { item.hidden = false; });
    document.querySelectorAll('[data-not-iphone]').forEach(item => { item.hidden = true; });
  }
  document.querySelectorAll('a[data-handheld-share]').forEach(link => {
    const status = document.getElementById(link.dataset.handheldShare);
    link.textContent = link.dataset.handheldLabel;
    // On an iPhone the App Store button leads; sending the link is secondary.
    if (iphone && link.classList) link.classList.add('is-secondary');
    // Nothing is downloaded on this path, so it must not count as a download.
    delete link.dataset.track;
    link.addEventListener('click', async event => {
      event.preventDefault();
      if (typeof view.navigator.share === 'function') {
        try {
          await view.navigator.share({ title: 'Blanc Browser', text: link.dataset.handheldText, url: DOWNLOAD_URL });
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      try {
        await view.navigator.clipboard.writeText(DOWNLOAD_URL);
        if (status) status.textContent = 'Link copied';
      } catch {
        view.location.assign(link.href);
      }
    });
  });
  return true;
}
