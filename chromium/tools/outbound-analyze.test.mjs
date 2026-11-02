// The outbound-isolation verdict (tests/outbound/analyze.mjs) must fail closed:
// a missed control invalidates the run, any other blocked attempt during the
// run or unknown proxied host fails it, and only an IPv6 control without a
// route is skipped. The test account's background (blocks only other processes
// were seen making, multicast) never fails it; a block a Blanc process may
// have made, or that no process was seen making, always does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {judge, parsePflog, parseNettop, hostOf, scenarioHostsFrom} from '../tests/outbound/analyze.mjs';

const LOG = [
  '2026-11-01 17:00:01.100000 rule 0/0(match): block out on en0: 192.168.1.5.50000 > 1.1.1.1.443: Flags [S], seq 1, length 0',
  '2026-11-01 17:00:02.200000 rule 0/0(match): block out on en0: 192.168.1.5.50001 > 8.8.8.8.53: 4660+ A? example.com. (29)',
  '2026-11-01 17:00:03.300000 rule 0/0(match): block out on en0: fd00::5.50002 > 2606:4700:4700::1111.443: Flags [S], seq 1, length 0',
].join('\n');
const at = s => new Date(s.replace(' ', 'T')).toISOString();
const control = (name, address, port, start, end, outcome = 'timed out') =>
  ({name, address, port, started: at(start), finished: at(end), outcome});
const NETTOP = [
  'time,,interface,state,bytes_in,bytes_out,',
  '20:01:57.858727,cloudd.395,,,250170,924739,',
  '20:01:57.857661,tcp4 192.168.1.5:61075<->17.253.3.135:443,en1,SynSent,0,0,',
  '20:01:57.857700,udp4 192.168.1.5:53274<->17.248.207.9:443,en1,,0,0,',
  '20:01:57.858800,Blanc Prototype Helper.4242,,,0,0,',
  '20:01:57.858900,tcp4 192.168.1.5:61080<->142.250.1.1:443,en1,SynSent,0,0,',
  '20:01:57.859000,tcp6 fe80::1%en1.64652<->fe80::2%en1.49153,en1,Established,0,0,',
  '20:01:57.859100,tcp4 *:22<->*:*,,Listen,,,',
].join('\n');
const base = {
  controls: [control('tcp', '1.1.1.1', 443, '2026-11-01 17:00:01.000', '2026-11-01 17:00:01.500'),
    control('dns', '8.8.8.8', 53, '2026-11-01 17:00:02.000', '2026-11-01 17:00:02.500'),
    control('tcp6', '2606:4700:4700::1111', 443, '2026-11-01 17:00:03.000', '2026-11-01 17:00:03.500')],
  egress: [{target: 'duckduckgo.com:443'}, {target: 'www.youtube.com:443'}],
  leak: {status: 'passed'},
  scenarioHosts: ['www.youtube.com'],
  run: {start: Date.parse(at('2026-11-01 17:00:00.000')), end: Date.parse(at('2026-11-01 17:10:00.000'))},
  owners: parseNettop(NETTOP),
};
const block = (time, address, port = 443) =>
  `2026-11-01 ${time} rule 0.blanc-outbound.0/0(match): block out on en1: 192.168.1.5.50100 > ${address}.${port}: Flags [S], seq 1`;

test('pf log lines give their destination and time, IPv4 and IPv6', () => {
  const lines = parsePflog(LOG);
  assert.deepEqual(lines.map(l => [l.address, l.port]), [['1.1.1.1', 443], ['8.8.8.8', 53], ['2606:4700:4700::1111', 443]]);
  assert.equal(hostOf('duckduckgo.com:443'), 'duckduckgo.com');
  assert.equal(hostOf('http://m.example/?q=hi'), 'm.example');
});

test('nettop flows name their processes, IPv4, UDP and scoped IPv6, and listeners are skipped', () => {
  const owners = parseNettop(NETTOP);
  assert.deepEqual([...owners.get('17.253.3.135')], ['cloudd']);
  assert.deepEqual([...owners.get('17.248.207.9')], ['cloudd']);
  assert.deepEqual([...owners.get('142.250.1.1')], ['Blanc Prototype Helper']);
  assert.ok(owners.has('fe80::2'));
  assert.ok(!owners.has('*'));
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

test('a block during the run that no process was seen making fails the run', () => {
  const report = judge({...base, pflog: parsePflog(LOG + '\n' + block('17:05:00.000000', '9.9.9.9'))});
  assert.equal(report.verdict, 'fail');
  assert.match(report.problems.join('\n'), /outside every control to 9\.9\.9\.9:443 \(no process seen\)/);
});

test('a block to an address a Blanc process used fails the run, even if another process used it too', () => {
  assert.match(judge({...base, pflog: parsePflog(LOG + '\n' + block('17:05:00.000000', '142.250.1.1'))}).problems.join('\n'),
    /142\.250\.1\.1:443 \(Blanc Prototype Helper\)/);
  const shared = parseNettop(NETTOP + '\n20:01:58.000000,cloudd.395,,,0,0,\n20:01:58.000100,tcp4 192.168.1.5:61090<->142.250.1.1:443,en1,SynSent,0,0,');
  assert.equal(judge({...base, owners: shared, pflog: parsePflog(LOG + '\n' + block('17:05:00.000000', '142.250.1.1'))}).verdict, 'fail');
});

test('blocks only other processes made, and multicast, are the account\'s background', () => {
  const lines = [LOG, block('17:05:00.000000', '17.253.3.135'), block('17:05:01.000000', '224.0.0.251', 5353),
    block('17:20:00.000000', '9.9.9.9')]; // after the run: not judged
  const report = judge({...base, pflog: parsePflog(lines.join('\n'))});
  assert.equal(report.verdict, 'pass', JSON.stringify(report.problems));
  assert.deepEqual(report.backgroundDuringRun, {'17.253.3.135 (cloudd)': 1, '224.0.0.251 (multicast or link-local)': 1});
  assert.equal(report.outsideRun, 1);
});

test('a run without times or without a nettop log is invalid', () => {
  assert.equal(judge({...base, run: null, pflog: parsePflog(LOG)}).verdict, 'fail');
  assert.match(judge({...base, owners: new Map(), pflog: parsePflog(LOG)}).problems.join('\n'), /nettop saw no connections/);
});

test('a proxied host that is neither an engine nor a scenario site fails the run', () => {
  const report = judge({...base, pflog: parsePflog(LOG), egress: [...base.egress, {target: 'clients2.google.com:443'}]});
  assert.equal(report.verdict, 'fail');
  assert.ok(report.problems.includes('proxy saw 1 request(s) to clients2.google.com, not an engine or a scenario site'),
    JSON.stringify(report.problems));
});

test('scenario sites: addresses, typed bare domains and the bangs a scenario types', () => {
  const catalog = [['y8', [], 'Y8', 'www.y8.com', 'https://www.y8.com/search?q=%s'],
    ['yt', ['youtube'], 'YouTube', 'www.youtube.com', 'https://www.youtube.com/results?search_query=%s'],
    ['w', [], 'Wikipedia', 'en.wikipedia.org', 'https://en.wikipedia.org/w/index.php?search=%s']];
  const features = 'When I enter "example.com" in the command bar\nGiven a custom bang "m" named "Mine" for "https://m.example/?q=%s"\nWhen I type "!youtube lofi"';
  const steps = "for (const code of ['y8', 'ya']) {";
  assert.deepEqual(scenarioHostsFrom({features, steps, catalog}).sort(),
    ['example.com', 'm.example', 'www.y8.com', 'www.youtube.com'].sort());
});

test('only an IPv6 control without a route is skipped, and it is reported', () => {
  const controls = [...base.controls.slice(0, 2), {...base.controls[2], outcome: 'error: ENETUNREACH'}];
  const report = judge({...base, controls, pflog: parsePflog(LOG.split('\n').slice(0, 2).join('\n'))});
  assert.equal(report.verdict, 'pass', JSON.stringify(report.problems));
  assert.deepEqual(report.missingRoute, ['tcp6']);
  assert.equal(judge({...base, leak: {status: 'failed'}, pflog: parsePflog(LOG)}).verdict, 'fail');
});
