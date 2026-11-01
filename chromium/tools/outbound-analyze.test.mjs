// The outbound-isolation verdict (tests/outbound/analyze.mjs) must fail closed:
// a missed control invalidates the run, any other blocked attempt or unknown
// proxied host fails it, and only an IPv6 control without a route is skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {judge, parsePflog, hostOf} from '../tests/outbound/analyze.mjs';

const LOG = [
  '2026-11-01 17:00:01.100000 rule 0/0(match): block out on en0: 192.168.1.5.50000 > 1.1.1.1.443: Flags [S], seq 1, length 0',
  '2026-11-01 17:00:02.200000 rule 0/0(match): block out on en0: 192.168.1.5.50001 > 8.8.8.8.53: 4660+ A? example.com. (29)',
  '2026-11-01 17:00:03.300000 rule 0/0(match): block out on en0: fd00::5.50002 > 2606:4700:4700::1111.443: Flags [S], seq 1, length 0',
].join('\n');
const at = s => new Date(s.replace(' ', 'T')).toISOString();
const control = (name, address, port, start, end, outcome = 'timed out') =>
  ({name, address, port, started: at(start), finished: at(end), outcome});
const base = {
  controls: [control('tcp', '1.1.1.1', 443, '2026-11-01 17:00:01.000', '2026-11-01 17:00:01.500'),
    control('dns', '8.8.8.8', 53, '2026-11-01 17:00:02.000', '2026-11-01 17:00:02.500'),
    control('tcp6', '2606:4700:4700::1111', 443, '2026-11-01 17:00:03.000', '2026-11-01 17:00:03.500')],
  egress: [{target: 'duckduckgo.com:443'}, {target: 'www.youtube.com:443'}],
  leak: {status: 'passed'},
  scenarioHosts: ['www.youtube.com'],
};

test('pf log lines give their destination and time, IPv4 and IPv6', () => {
  const lines = parsePflog(LOG);
  assert.deepEqual(lines.map(l => [l.address, l.port]), [['1.1.1.1', 443], ['8.8.8.8', 53], ['2606:4700:4700::1111', 443]]);
  assert.equal(hostOf('duckduckgo.com:443'), 'duckduckgo.com');
  assert.equal(hostOf('http://m.example/?q=hi'), 'm.example');
});

test('a run whose controls all appear and whose traffic is expected passes', () => {
  const report = judge({...base, pflog: parsePflog(LOG)});
  assert.equal(report.verdict, 'pass', JSON.stringify(report.problems));
});

test('a control missing from the pf log invalidates the run', () => {
  const report = judge({...base, pflog: parsePflog(LOG.split('\n').slice(1).join('\n'))});
  assert.equal(report.verdict, 'fail');
  assert.match(report.problems.join('\n'), /control tcp .* not seen/);
});

test('a blocked attempt outside every control fails the run', () => {
  const stray = '2026-11-01 17:05:00.000000 rule 0/0(match): block out on en0: 192.168.1.5.50009 > 142.250.1.1.443: Flags [S]';
  const report = judge({...base, pflog: parsePflog(LOG + '\n' + stray)});
  assert.equal(report.verdict, 'fail');
  assert.match(report.problems.join('\n'), /outside every control/);
});

test('a proxied host that is neither an engine nor a scenario site fails the run', () => {
  const report = judge({...base, pflog: parsePflog(LOG), egress: [...base.egress, {target: 'clients2.google.com:443'}]});
  assert.equal(report.verdict, 'fail');
  assert.match(report.problems.join('\n'), /clients2\.google\.com/);
});

test('only an IPv6 control without a route is skipped, and it is reported', () => {
  const controls = [...base.controls.slice(0, 2), {...base.controls[2], outcome: 'error: ENETUNREACH'}];
  const report = judge({...base, controls, pflog: parsePflog(LOG.split('\n').slice(0, 2).join('\n'))});
  assert.equal(report.verdict, 'pass', JSON.stringify(report.problems));
  assert.deepEqual(report.missingRoute, ['tcp6']);
  assert.equal(judge({...base, leak: {status: 'failed'}, pflog: parsePflog(LOG)}).verdict, 'fail');
});
