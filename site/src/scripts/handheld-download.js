// Blanc is desktop-only, so on a phone or tablet the download link sends the
// download page onward (share sheet, then clipboard) instead of opening it.
const DOWNLOAD_URL = 'https://blancbrowser.com/download';

export function isHandheld(nav) {
  const ua = String(nav?.userAgent || '');
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS requests desktop sites with a Mac user agent; touch support gives it away.
  return /Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1;
}

export function initHandheldDownload({ document = window.document, view = window } = {}) {
  if (!isHandheld(view.navigator)) return false;
  document.querySelectorAll('[data-handheld-note]').forEach(note => { note.hidden = false; });
  document.querySelectorAll('a[data-handheld-share]').forEach(link => {
    const status = document.getElementById(link.dataset.handheldShare);
    link.textContent = link.dataset.handheldLabel;
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
