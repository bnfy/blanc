// Shipping steps the fork replaces under an owner-approved divergence (spec
// §9), keyed by shipping's exact step text. Each keeps what the divergence
// leaves true and names what it changes; every other step stays shipping's.
import assert from 'node:assert/strict';

const tabDom = (world, id, expression) => world.call('executeTab', id, expression);

export const DIVERGENCES = new Map([
  // V8 (owner, 2026-10-31): certificate errors show Chromium's warning page
  // and use its proceed decisions instead of blanc://error and shipping's
  // session-only continue. Same warning, in Chromium's words.
  ['Blanc shows a certificate safety interstitial', {divergence: 'V8', async run() {
    const dom = await tabDom(this, this.untrustedCertificateTabId, `(() => ({
      heading: document.querySelector('#main-message h1')?.textContent.trim() ?? '',
      code: document.getElementById('error-code')?.textContent ?? '',
      safety: document.getElementById('primary-button')?.textContent.trim() ?? '',
    }))()`);
    assert.equal(dom.heading, 'Your connection is not private');
    assert.match(dom.code, /CERT/);
    assert.equal(dom.safety, 'Back to safety');
  }}],
  // Chromium's decisions let any site be continued past, so shipping's "no
  // way through" for a public site becomes: nothing past the warning shows
  // until Advanced, which offers Chromium's own Proceed.
  ['no certificate bypass is offered', {divergence: 'V8', async run() {
    const dom = await tabDom(this, this.untrustedCertificateTabId, `(() => ({
      hidden: document.getElementById('details')?.classList.contains('hidden') ?? null,
      proceed: document.getElementById('proceed-link')?.textContent.trim() ?? null,
    }))()`);
    assert.equal(dom.hidden, true, 'nothing past the warning shows before Advanced');
    assert.match(dom.proceed ?? '', /^Proceed to .+ \(unsafe\)$/);
  }}],
  ['I open Advanced and continue to the local address', {divergence: 'V8', async run() {
    const clicked = await tabDom(this, this.localTabId, `(() => {
      const advanced = document.getElementById('details-button');
      if (!advanced) return 'no-advanced';
      advanced.click();
      const proceed = document.getElementById('proceed-link');
      if (!proceed || document.getElementById('details').classList.contains('hidden')) return 'no-panel';
      if (!/^Proceed to nas\\.home\\.arpa(:\\d+)? \\(unsafe\\)$/.test(proceed.textContent.trim())) return proceed.textContent;
      proceed.click();
      return 'clicked';
    })()`);
    assert.equal(clicked, 'clicked');
  }}],
  // V13 (owner, 2026-11-04): Settings is chrome://settings, which shows every
  // explanation in full rather than folding long ones behind More. What
  // shipping's scenario protects stays true: the text is whole and unchanged.
  ['long setting explanations are folded to two lines with a More control', {divergence: 'V13', async run() {
    const explanations = await this.call('settingsExplanations');
    const long = explanations.find(e => e.text.length > 80);
    assert.ok(long, 'a long setting explanation');
    assert.ok(explanations.every(e => e.whole), 'every explanation shows in full');
    this.foldedHint = long;
  }}],
  ['I open the first folded explanation', {divergence: 'V13', async run() {
    // Nothing is folded, so there is nothing to open.
    assert.ok(this.foldedHint, 'the long explanation was found');
  }}],
  ['it shows its full text, unchanged', {divergence: 'V13', async run() {
    const same = (await this.call('settingsExplanations')).find(e => e.text === this.foldedHint.text);
    assert.ok(same?.whole, 'the explanation shows its full text, unchanged');
  }}],
  // V14 (owner, 2026-11-04): chrome://settings's menu marks the page you are
  // on, not the section scrolled to. Scrolling to the end still works, and
  // choosing Help in the menu marks Help and shows it.
  ['I scroll the settings sheet to its end', {divergence: 'V14', async run() {
    assert.equal(await this.call('settingsScrollToEnd'), true);
  }}],
  ['the settings section marker is on Help', {divergence: 'V14', async run() {
    assert.equal(await this.call('settingsChooseMenuItem', 'about-menu'), true, 'Settings has a Help item');
    const marked = await this.call('settingsMenuMarked');
    assert.equal(marked?.item, 'about-menu', 'the menu marks Help');
    assert.equal(marked?.path, '/help', 'Settings shows Help');
  }}],
]);
