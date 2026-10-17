const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  INVITE_URL,
  inviteMessage,
  inviteMailto,
  inviteFriend,
} = require('../../src/main/invite-friend');
const { englishT: t } = require('../support/english-t');

const repo = path.join(__dirname, '..', '..');

test('the invite link is the site with one campaign-wide ref and no per-person code', () => {
  const url = new URL(INVITE_URL);
  assert.equal(url.origin, 'https://blanc.day');
  assert.deepEqual([...url.searchParams], [['ref', 'invite']]);
});

test('the invite email is written from the catalog and ends with the link', () => {
  const { subject, body } = inviteMessage(t);
  assert.equal(subject, 'Try Blanc, the browser I use');
  assert.match(body, /^Hi,\n\nI’ve been using Blanc/);
  assert.ok(body.endsWith(`You can download it here: ${INVITE_URL}`));
});

test('the mailto has no recipient and survives a round trip through RFC 6068 decoding', () => {
  const message = inviteMessage(t);
  const mailto = inviteMailto(message);
  assert.ok(mailto.startsWith('mailto:?subject='));
  const params = new URLSearchParams(mailto.slice('mailto:?'.length));
  assert.equal(params.get('subject'), message.subject);
  assert.equal(params.get('body'), message.body.replace(/\n/g, '\r\n'));
  // Spaces are %20, never "+", which some mail apps would show literally.
  assert.doesNotMatch(mailto, /\+/);
});

test('every language encodes to a mailto the same way', () => {
  for (const locale of ['de', 'es', 'fr', 'pt-BR', 'it']) {
    const catalog = JSON.parse(fs.readFileSync(path.join(repo, 'copy/messages', `${locale}.json`), 'utf8'));
    const localT = (key, params = {}) => catalog[key].message.replace(/\{(\w+)\}/g, (_, name) => params[name]);
    const message = inviteMessage(localT);
    assert.ok(message.body.includes(INVITE_URL), locale);
    const params = new URLSearchParams(inviteMailto(message).slice('mailto:?'.length));
    assert.equal(params.get('subject'), message.subject, locale);
  }
});

test('the invite opens in the mail app and touches nothing else when that works', async () => {
  const opened = [];
  const copied = [];
  const result = await inviteFriend({
    t,
    openExternal: async (url) => { opened.push(url); },
    writeClipboard: (text) => copied.push(text),
  });
  assert.equal(result, 'mail');
  assert.equal(opened.length, 1);
  assert.ok(opened[0].startsWith('mailto:?'));
  assert.deepEqual(copied, []);
});

test('without a mail app the whole invite goes to the clipboard instead', async () => {
  const copied = [];
  const result = await inviteFriend({
    t,
    openExternal: async () => { throw new Error('no handler'); },
    writeClipboard: (text) => copied.push(text),
  });
  assert.equal(result, 'copied');
  const { subject, body } = inviteMessage(t);
  assert.deepEqual(copied, [`${subject}\n\n${body}`]);
});

test('Help → Invite a Friend… and /invite both reach the same main-process path', () => {
  const main = fs.readFileSync(path.join(repo, 'src/main/main.js'), 'utf8');
  assert.match(main, /label: t\('menu\.inviteFriend'\), click: \(\) => \{ inviteFriendNow\(\); \}/);
  assert.match(main, /chromeHandle\('chrome:invite-friend', \(\) => inviteFriendNow\(\)\)/);
  const overlay = fs.readFileSync(path.join(repo, 'src/renderer/overlay.js'), 'utf8');
  assert.match(overlay, /cmd: '\/invite'.*window\.browserAPI\.inviteFriend\(\)/);
});
