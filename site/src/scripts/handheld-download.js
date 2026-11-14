// The desktop download link can't install anything on a phone or tablet, so
// there it sends the download page onward (share sheet, then clipboard)
// instead of opening it. On an iPhone or iPad, where Blanc for iPhone and iPad
// is on the App Store, the page also shows its App Store button
// ([data-ios-store]) and hides copy that is only true of other handhelds
// ([data-not-ios]). On an Android phone it shows the way to the Blanc for
// Android beta signup ([data-android]).
import { SITE_ORIGIN } from '../lib/site-origin.mjs';

const DOWNLOAD_URL = `${SITE_ORIGIN}/download`;

export function isHandheld(nav) {
  const ua = String(nav?.userAgent || '');
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS requests desktop sites with a Mac user agent; touch support gives it away.
  return /Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1;
}

// Blanc for iPhone and iPad runs on both since App Store version 1.0.3. An
// iPad asking for desktop sites sends a Mac user agent; touch gives it away.
export function isAppleHandheld(nav) {
  const ua = String(nav?.userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1;
}

export function isAndroid(nav) {
  return /Android/i.test(String(nav?.userAgent || ''));
}

export function initHandheldDownload({ document = window.document, view = window } = {}) {
  if (!isHandheld(view.navigator)) return false;
  document.querySelectorAll('[data-handheld-note]').forEach(note => { note.hidden = false; });
  const apple = isAppleHandheld(view.navigator);
  if (apple) {
    document.querySelectorAll('[data-ios-store]').forEach(item => { item.hidden = false; });
    document.querySelectorAll('[data-not-ios]').forEach(item => { item.hidden = true; });
  }
  if (isAndroid(view.navigator)) {
    document.querySelectorAll('[data-android]').forEach(item => { item.hidden = false; });
  }
  document.querySelectorAll('a[data-handheld-share]').forEach(link => {
    const status = document.getElementById(link.dataset.handheldShare);
    link.textContent = link.dataset.handheldLabel;
    // On an iPhone or iPad the App Store button leads; sending the link is secondary.
    if (apple && link.classList) link.classList.add('is-secondary');
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
