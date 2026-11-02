// The outbound-isolation verdict (tests/outbound/analyze.mjs) must fail closed:
// a missed control invalidates the run, any other blocked attempt during the
// run or unknown proxied host fails it, and only an IPv6 control without a
// route is skipped. The test account's background (blocks outside the run,
// multicast) never fails it, but never covers a control's address.
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
  run: {start: Date.parse(at('2026-11-01 17:00:00.000')), end: Date.parse(at('2026-11-01 17:10:00.000'))},
};
const block = (time, address, port = 443) =>
  `2026-11-01 ${time} rule 0.blanc-outbound.0/0(match): block out on en1: 192.168.1.5.50100 > ${address}.${port}: Flags [S], seq 1`;

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

test('a blocked attempt during the run outside every control fails the run', () => {
  const stray = '2026-11-01 17:05:00.000000 rule 0/0(match): block out on en0: 192.168.1.5.50009 > 142.250.1.1.443: Flags [S]';
  const report = judge({...base, pflog: parsePflog(LOG + '\n' + stray)});
  assert.equal(report.verdict, 'fail');
  assert.match(report.problems.join('\n'), /during the run outside every control/);
});

test('the account\'s background is set apart, and only by what was seen outside the run', () => {
  const lines = [LOG,
    block('16:50:00.000000', '17.253.3.135'),        // before the run: background
    block('17:05:00.000000', '17.253.3.135'),        // same address during the run
    block('17:05:01.000000', '224.0.0.251', 5353),   // multicast
    block('17:20:00.000000', '23.216.5.215')];       // after the run
  const report = judge({...base, pflog: parsePflog(lines.join('\n'))});
  assert.equal(report.verdict, 'pass', JSON.stringify(report.problems));
  assert.deepEqual(report.backgroundDuringRun, {'17.253.3.135': 1, '224.0.0.251': 1});
  assert.equal(report.idleBlocks, 2);
  const unseen = judge({...base, pflog: parsePflog([LOG, block('16:50:00.000000', '17.253.3.135'), block('17:05:00.000000', '17.253.3.136')].join('\n'))});
  assert.equal(unseen.verdict, 'fail', 'an address the background never reached');
});

test('an earlier attempt\'s blocks are neither background nor failures', () => {
  const lines = [LOG, block('16:55:00.000000', '142.250.1.1'), block('17:05:00.000000', '142.250.1.1')];
  const firstStart = Date.parse(at('2026-11-01 16:54:00.000'));
  const report = judge({...base, firstStart, pflog: parsePflog(lines.join('\n'))});
  assert.equal(report.verdict, 'fail', 'the earlier attempt did not make 142.250.1.1 background');
  assert.equal(report.earlierAttemptBlocks, 1);
  assert.equal(judge({...base, pflog: parsePflog(lines.join('\n'))}).verdict, 'pass', 'without an earlier attempt it is background');
});

test('background never covers a control\'s address or a run without times', () => {
  const masked = judge({...base, pflog: parsePflog([LOG, block('16:50:00.000000', '1.1.1.1'), block('17:05:00.000000', '1.1.1.1')].join('\n'))});
  assert.equal(masked.verdict, 'fail');
  assert.match(masked.problems.join('\n'), /during the run outside every control/);
  assert.equal(judge({...base, run: null, pflog: parsePflog(LOG)}).verdict, 'fail');
});

test('a proxied host that is neither an engine nor a scenario site fails the run', () => {
  const report = judge({...base, pflog: parsePflog(LOG), egress: [...base.egress, {target: 'clients2.google.com:443'}]});
  assert.equal(report.verdict, 'fail');
  assert.ok(report.problems.includes('proxy saw 1 request(s) to clients2.google.com, not an engine or a scenario site'),
    JSON.stringify(report.problems));
});

test('only an IPv6 control without a route is skipped, and it is reported', () => {
  const controls = [...base.controls.slice(0, 2), {...base.controls[2], outcome: 'error: ENETUNREACH'}];
  const report = judge({...base, controls, pflog: parsePflog(LOG.split('\n').slice(0, 2).join('\n'))});
  assert.equal(report.verdict, 'pass', JSON.stringify(report.problems));
  assert.deepEqual(report.missingRoute, ['tcp6']);
  assert.equal(judge({...base, leak: {status: 'failed'}, pflog: parsePflog(LOG)}).verdict, 'fail');
});
