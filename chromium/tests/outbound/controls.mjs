// Outbound-isolation negative controls (S1.1): deliberate attempts to leave
// the Mac by every path the OS block must stop. Each one records its window;
// analyze.mjs requires each to appear in the pf log, or the run is invalid.
// Node tries direct TCP, QUIC-shaped UDP, DNS, DoH, DoT, STUN and IPv6; a
// browser launched without the proxy tries direct HTTPS, QUIC and WebRTC STUN
// from a fixture page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import dgram from 'node:dgram';
import {NativeFixture} from '../lib/fixture.mjs';

const [configPath, outFile] = process.argv.slice(2);
if (!configPath || !outFile) throw Error('Usage: controls.mjs runtime-config.json result.json');
const config = JSON.parse(fs.readFileSync(configPath));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const controls = [];

async function control(name, family, proto, address, port, attempt) {
  const started = new Date().toISOString();
  let outcome;
  try { outcome = await attempt(); } catch (e) { outcome = 'error: ' + e.code; }
  await pause(500);
  controls.push({name, family, proto, address, port, started, finished: new Date().toISOString(), outcome});
}
const tcp = (address, port) => () => new Promise(resolve => {
  const socket = net.connect({host: address, port, timeout: 3000});
  socket.once('connect', () => { socket.destroy(); resolve('connected'); });
  socket.once('timeout', () => { socket.destroy(); resolve('timed out'); });
  socket.once('error', e => resolve('error: ' + e.code));
});
const udp = (type, address, port, payload) => () => new Promise(resolve => {
  const socket = dgram.createSocket(type);
  socket.send(payload, port, address, error => { setTimeout(() => { socket.close(); resolve(error ? 'error: ' + error.code : 'sent'); }, 1000); });
});
// A DNS query for example.com, a QUIC long-header Initial's first bytes, and a
// STUN binding request.
const DNS = Buffer.from('123401000001000000000000076578616d706c6503636f6d0000010001', 'hex');
const QUIC = Buffer.concat([Buffer.from('c000000001', 'hex'), Buffer.alloc(1195)]);
const STUN = Buffer.from('000100002112a442' + '0102030405060708090a0b0c', 'hex');

await control('node-tcp', 'inet', 'tcp', '1.1.1.1', 443, tcp('1.1.1.1', 443));
await control('node-quic', 'inet', 'udp', '1.1.1.1', 443, udp('udp4', '1.1.1.1', 443, QUIC));
await control('node-dns', 'inet', 'udp', '8.8.8.8', 53, udp('udp4', '8.8.8.8', 53, DNS));
await control('node-doh', 'inet', 'tcp', '8.8.8.8', 443, tcp('8.8.8.8', 443));
await control('node-dot', 'inet', 'tcp', '1.1.1.1', 853, tcp('1.1.1.1', 853));
await control('node-stun', 'inet', 'udp', '74.125.250.129', 19302, udp('udp4', '74.125.250.129', 19302, STUN));
await control('node-tcp6', 'inet6', 'tcp', '2606:4700:4700::1111', 443, tcp('2606:4700:4700::1111', 443));

// The browser itself, with no proxy: direct HTTPS, forced QUIC and STUN.
const fixture = new NativeFixture();
let browserError = null;
try {
  await fixture.launch(config, fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-controls-')) + '/case',
    {diskAssets: false, direct: ['--enable-quic', '--origin-to-force-quic-on=1.0.0.1:443']});
  const page = fixture.page;
  await control('browser-tcp', 'inet', 'tcp', '1.1.1.1', 443, () =>
    page.eval(`fetch('https://1.1.1.1/', {mode: 'no-cors'}).then(() => 'answered', e => 'refused: ' + e.message)`));
  await control('browser-quic', 'inet', 'udp', '1.0.0.1', 443, () =>
    page.eval(`fetch('https://1.0.0.1/', {mode: 'no-cors'}).then(() => 'answered', e => 'refused: ' + e.message)`));
  await control('browser-stun', 'inet', 'udp', '74.125.250.129', 19302, () => page.eval(`new Promise(resolve => {
    const pc = new RTCPeerConnection({iceServers: [{urls: 'stun:74.125.250.129:19302'}]});
    pc.createDataChannel('probe');
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { pc.close(); resolve('gathered'); } };
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
    setTimeout(() => { pc.close(); resolve('timed out'); }, 6000);
  })`));
} catch (e) {
  browserError = String(e.stack || e);
} finally {
  await fixture.close().catch(() => {});
}
fs.writeFileSync(outFile, JSON.stringify({candidate: config.candidate, user: os.userInfo().username, controls, browserError}, null, 2) + '\n');
console.log(JSON.stringify({controls: controls.map(c => `${c.name}: ${c.outcome}`), browserError: browserError?.split('\n')[0] ?? null}));
