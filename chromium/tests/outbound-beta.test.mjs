// The beta's outbound verdict is valid only when the pf controls and the
// network-log probe show up, and passes only when nothing a Blanc process
// could have sent was blocked and no network log names an outside host.
import test from 'node:test';
import assert from 'node:assert/strict';
import {netlogHosts, judgeBeta, dnsQuestion} from './outbound/analyze-beta.mjs';
import {PROBE_HOST} from './outbound/beta-scenarios.mjs';

const T = iso => Date.parse(iso);
const run = {start: T('2026-11-14T10:00:00Z'), end: T('2026-11-14T10:10:00Z')};
const control = {name: 'tcp', address: '93.184.216.34', port: 443, started: '2026-11-14T10:00:10Z', finished: '2026-11-14T10:00:12Z', outcome: 'timed out'};
const controlHit = {at: T('2026-11-14T10:00:11Z'), address: control.address, port: 443};
const scenarios = [{name: 'startup-idle'}, {name: 'private-window'}];
const netlog = hosts => new Map(Object.entries(hosts));
const clean = () => ({controls: [control], pflog: [controlHit], run, scenarios,
  owners: new Map([['17.1.2.3', new Set(['apsd'])]]),
  netlogs: {'startup-idle': netlog({localhost: 9, [PROBE_HOST]: 3}), 'private-window': netlog({localhost: 4, [PROBE_HOST]: 2})}});

test('network logs give their hosts, even cut short', () => {
  const log = JSON.stringify({constants: {}, events: [{params: {url: 'https://clients2.google.com/x'}}, {params: {host: 'localhost:8080'}}, {params: {url: 'http://~NOTFOUND/'}}]});
  assert.deepEqual(Object.fromEntries(netlogHosts(log)), {'clients2.google.com': 1, localhost: 1});
  assert.deepEqual(Object.fromEntries(netlogHosts(log.slice(0, -2) + ',\n')), {'clients2.google.com': 1, localhost: 1});
  const lines = '{"constants": {},\n"events": [\n{"params":{"url":"https://a.example/"}},\n{"params":{"host":"b.example"}}]';
  assert.deepEqual(Object.fromEntries(netlogHosts(lines + '\n')), {'a.example': 1, 'b.example': 1}, 'only the closing brace missing');
  assert.deepEqual(Object.fromEntries(netlogHosts(lines.replace('{"params":{"host":"b.example"}}]', '{"params":{"host":"b.exa'))), {'a.example': 1}, 'cut inside an event');
  assert.throws(() => netlogHosts('not json'), /unreadable/);
});

test('a quiet beta passes; background services of the test account are only recorded', () => {
  const input = clean();
  input.pflog.push({at: T('2026-11-14T10:05:00Z'), address: '17.1.2.3', port: 443});
  const report = judgeBeta(input);
  assert.equal(report.verdict, 'pass', report.problems.join('; '));
  assert.deepEqual(Object.keys(report.backgroundDuringRun), ['17.1.2.3 (apsd)']);
});

test('the beta fails on its own outside traffic and the run is invalid without its proofs', () => {
  for (const [change, pattern] of [
    [i => i.pflog.push({at: T('2026-11-14T10:05:00Z'), address: '142.250.1.1', port: 443}), /a Blanc process could have made, to 142.250.1.1:443 \(no process seen\)/],
    [i => { i.owners.set('142.250.1.1', new Set(['Blanc Beta Helper'])); i.pflog.push({at: T('2026-11-14T10:05:00Z'), address: '142.250.1.1', port: 443}); }, /Blanc Beta Helper/],
    [i => i.netlogs['startup-idle'].set('clients2.google.com', 2), /startup-idle: the beta tried to reach clients2.google.com/],
    [i => i.netlogs['private-window'].delete(PROBE_HOST), /never names the probe host/],
    [i => delete i.netlogs['private-window'], /no network log/],
    [i => { i.pflog.length = 0; }, /control tcp .* was not seen in the pf log/],
    [i => { i.owners = new Map(); }, /nettop saw no connections/],
    [i => { i.run = null; }, /no start and end time/],
  ]) {
    const input = clean(); change(input);
    const report = judgeBeta(input);
    assert.equal(report.verdict, 'fail'); assert.match(report.problems.join('\n'), pattern);
  }
  const allowed = clean(); allowed.netlogs['startup-idle'].set('blanc.day', 1);
  assert.equal(judgeBeta({...allowed, allow: ['blanc.day']}).verdict, 'pass', 'an intended destination can be allowed by name');
});

test('DNS lookups of the probe host are the probe; any other name is the beta', () => {
  const line = name => `2026-11-14 10:05:00.000000 rule 0/0(match): block out on en0: 192.168.1.20.50000 > 192.168.1.1.53: 4242+ A? ${name}. (40)`;
  assert.equal(dnsQuestion(line(PROBE_HOST)), PROBE_HOST);
  assert.equal(dnsQuestion(line('Clients2.Google.com')), 'clients2.google.com');
  const probe = clean(); probe.pflog.push({at: T('2026-11-14T10:05:00Z'), address: '192.168.1.1', port: 53, line: line(PROBE_HOST)});
  const report = judgeBeta(probe);
  assert.equal(report.verdict, 'pass', report.problems.join('; ')); assert.equal(report.probeLookups, 1);
  const other = clean(); other.pflog.push({at: T('2026-11-14T10:05:00Z'), address: '192.168.1.1', port: 53, line: line('clients2.google.com')});
  assert.equal(judgeBeta(other).verdict, 'fail');
});
