// The Android args build MP4, H.264 and AAC (proprietary_codecs, Chrome ffmpeg branding): checked
// in the built app, so a rebase or args change that drops them fails a gate, not only the args pin.
//   - canPlayType says an H.264 MP4 is playable.
//   - MediaSource takes H.264 video with AAC audio.
// Reads the page through the debug build's DevTools socket. Fails closed.
//
//   node chromium/tests/android/codecs.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hostPort} from './support/host-ports.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGE = 'https://example.com/';

async function evaluate(port, expression) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(p => p.type === 'page' && p.url === PAGE);
  if (!page) throw Error(`no ${PAGE} page`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('DevTools timed out')), 15000);
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer); ws.close();
      resolve(message.result?.result?.value);
    };
    ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
  });
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: codecs.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(8);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', PAGE, '-p', PACKAGE);
  sleep(7);
  const port = hostPort(9334);
  adb('forward', `tcp:${port}`, 'localabstract:chrome_devtools_remote');
  const seen = await evaluate(port, `({
    canPlay: document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'),
    mse: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
  })`);
  adb('forward', '--remove', `tcp:${port}`);
  const results = [
    {case: 'an H.264 MP4 is playable', problems: seen?.canPlay === 'probably' ? [] : [`canPlayType said "${seen?.canPlay}"`]},
    {case: 'MediaSource takes H.264 with AAC', problems: seen?.mse === true ? [] : ['isTypeSupported was false']},
  ];
  fs.writeFileSync(path.join(evidence, 'codecs.json'), JSON.stringify({results, seen, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => { console.error(`codecs: ${error.message}`); process.exitCode = 1; });
