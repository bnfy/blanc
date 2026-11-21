// The protected-video notice (owner, 2026-11-16; replacement spec D3/X2): a
// page asked for protected playback, which Blanc Beta cannot do. Its words
// name the beta and the released app apart: a person in the beta already
// thinks of it as Blanc. The host
// (host.js) shows this document under the Island and acts on its two buttons;
// nothing here reads the page or takes focus.
'use strict';
(() => {
  const host = window.parent?.BlancPrototypeHost;
  const open = document.getElementById('protectedOpen');
  // With Electron Blanc absent the action is getting it.
  if (host?.protectedNoticeState().blancInstalled !== true) {
    open.dataset.i18n = 'protectedMedia.getBlanc';
    open.textContent = window.blancI18n.t('protectedMedia.getBlanc');
  }
  document.getElementById('protectedLater').addEventListener('click', () => host?.protectedNotice('later'));
  open.addEventListener('click', () => host?.protectedNotice('open'));
})();
