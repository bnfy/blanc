const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { xdgOpen, XDG_OPEN_SETTLE_MS } = require('../../src/main/xdg-open');

const URL = 'mailto:?subject=Hi&body=Hello';

function fakeSpawn() {
  const calls = [];
  const child = new EventEmitter();
  child.unrefCalls = 0;
  child.unref = () => { child.unrefCalls += 1; };
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return child;
  };
  return { spawn, child, calls };
}

test('xdg-open gets the URL as its only argument, with no shell and no terminal', async () => {
  const { spawn, child, calls } = fakeSpawn();
  const opened = xdgOpen(URL, { spawn, env: { PATH: '/usr/bin' } });
  child.emit('exit', 0, null);
  await opened;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'xdg-open');
  assert.deepEqual(calls[0].args, [URL]);
  assert.equal(calls[0].options.shell, undefined);
  assert.equal(calls[0].options.stdio, 'ignore');
  assert.equal(calls[0].options.detached, true);
  // Chromium's own xdg-open launch sets this so mailcap never wants a terminal.
  assert.deepEqual(calls[0].options.env, { PATH: '/usr/bin', MM_NOTTTY: '1' });
});

test('a failed xdg-open rejects, so the caller can fall back', async () => {
  const { spawn, child } = fakeSpawn();
  const opened = xdgOpen(URL, { spawn, env: {} });
  // What xdg-open exits with when no app handles the link ("action failed").
  child.emit('exit', 4, null);
  await assert.rejects(opened, /xdg-open exited with 4/);
});

test('a missing xdg-open rejects', async () => {
  const { spawn, child } = fakeSpawn();
  const opened = xdgOpen(URL, { spawn, env: {} });
  child.emit('error', Object.assign(new Error('spawn xdg-open ENOENT'), { code: 'ENOENT' }));
  await assert.rejects(opened, /ENOENT/);
});

test('an xdg-open killed by a signal rejects', async () => {
  const { spawn, child } = fakeSpawn();
  const opened = xdgOpen(URL, { spawn, env: {} });
  child.emit('exit', null, 'SIGTERM');
  await assert.rejects(opened, /SIGTERM/);
});

test('an xdg-open still running after the settle time counts as opened and is let go', async () => {
  // Generic xdg-open waits for a terminal mail client such as mutt to exit.
  const { spawn, child } = fakeSpawn();
  const opened = xdgOpen(URL, { spawn, env: {}, settleMs: 5 });
  await opened;
  assert.equal(child.unrefCalls, 1);
  // A late failure after that changes nothing.
  child.emit('exit', 4, null);
});

test('the default settle time is a few seconds', () => {
  assert.ok(XDG_OPEN_SETTLE_MS >= 2000 && XDG_OPEN_SETTLE_MS <= 10000);
});
