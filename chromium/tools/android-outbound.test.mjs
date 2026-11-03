// The Android privacy gate (tests/android/outbound-gate.mjs) must fail closed:
// any denylisted Google host fails it, an allowlisted flow passes only after
// its trigger, and a session whose pages never loaded is not-run, never a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hostFrom, hostPattern, judge, netLogHosts, readNetLog, SESSION_PAGES} from '../tests/android/outbound-gate.mjs';

const lists = name => JSON.parse(fs.readFileSync(new URL(`../tests/android/${name}`, import.meta.url)));
const denylist = lists('outbound-denylist.json').hosts;
const START = 2, RESOLVE = 7, CONNECT = 9;
const netlog = (...extra) => ({
  constants: {logEventTypes: {URL_REQUEST_START_JOB: START, HOST_RESOLVER_MANAGER_REQUEST: RESOLVE, SOCKET_POOL_CONNECT_JOB: CONNECT}},
  events: [...SESSION_PAGES.map(url => ({type: START, params: {url, method: 'GET'}})), ...extra],
});
const verdict = (log, {allowlist = [], actions = []} = {}) =>
  judge({...netLogHosts(log), pages: SESSION_PAGES, denylist, allowlist, actions});

test('a clean session passes', () => {
  const result = verdict(netlog({type: RESOLVE, params: {host: 'example.com:443'}}, {type: CONNECT, params: {group_id: 'ssl/duckduckgo.com:443'}}));
  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.problems, []);
});

test('a denylisted host fails the gate', () => {
  for (const event of [
    {type: START, params: {url: 'https://clientservices.googleapis.com/chrome-variations/seed'}},
    {type: RESOLVE, params: {host: 'safebrowsing.googleapis.com:443'}},
    {type: CONNECT, params: {group_id: 'ssl/clients4.google.com:443 <https://example.com same_site>'}},
    {type: CONNECT, params: {group_name: 'pm/www.gstatic.com:443'}},
    {type: START, params: {url: 'https://google.com/'}},
  ]) {
    const result = verdict(netlog(event));
    assert.equal(result.verdict, 'fail', JSON.stringify(event));
    assert.equal(result.problems.length, 1);
  }
});

test('an allowlisted flow passes only with its trigger', () => {
  const allowlist = [{host: 'passkeys.google.com', trigger: 'create passkey', reason: 'Credential Manager'}];
  const log = netlog({type: START, params: {url: 'https://passkeys.google.com/v1/create'}});
  assert.equal(verdict(log, {allowlist, actions: ['create passkey']}).verdict, 'pass');
  const untriggered = verdict(log, {allowlist, actions: ['open https://example.com/']});
  assert.equal(untriggered.verdict, 'fail');
  assert.match(untriggered.problems[0], /without its trigger "create passkey"/);
});

test('an empty session fails as not-run', () => {
  const empty = verdict({constants: {logEventTypes: {URL_REQUEST_START_JOB: START}}, events: []});
  assert.equal(empty.verdict, 'not-run');
  const partial = netlog(); partial.events.pop();
  assert.equal(verdict(partial).verdict, 'not-run');
  assert.throws(() => netLogHosts({constants: {}}), /no events/);
});

test('the A0 allowlist is empty', () => {
  assert.deepEqual(lists('outbound-allowlist.json').flows, []);
});

test('host patterns cover the domain and its subdomains, nothing that only ends alike', () => {
  const google = hostPattern('*.google.com');
  for (const host of ['google.com', 'www.google.com', 'a.b.google.com']) assert.ok(google.test(host), host);
  for (const host of ['notgoogle.com', 'google.com.evil.example', 'googlexcom']) assert.ok(!google.test(host), host);
  assert.ok(hostPattern('clients*.google.com').test('clients2.google.com'));
  assert.ok(!hostPattern('clients*.google.com').test('x.clients2.google.com'));
});

test('hosts are read from every NetLog form', () => {
  assert.equal(hostFrom('https://User@Example.com:8443/path'), 'example.com');
  assert.equal(hostFrom('ssl/www.gstatic.com:443'), 'www.gstatic.com');
  assert.equal(hostFrom('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(hostFrom('https://[2001:db8::1]/'), '2001:db8::1');
  assert.equal(hostFrom(42), null);
});

test('a NetLog cut short when the app stops is still read', () => {
  const whole = JSON.stringify(netlog());
  assert.equal(readNetLog(whole.slice(0, -2) + ',\n').events.length, SESSION_PAGES.length);
  assert.throws(() => readNetLog('{"constants": {'), /not readable/);
});
