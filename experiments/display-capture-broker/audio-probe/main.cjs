'use strict';

const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
} = require('../../../src/main/display-capture-flags');

const RESULT = path.join(__dirname, 'result.md');
const PROFILE = path.join(__dirname, '.probe-profile');
const TONE = path.join(__dirname, '.tone.wav');

const prior = app.commandLine.getSwitchValue('disable-features');
app.commandLine.appendSwitch(
  'disable-features',
  mergeDisabledFeatures(prior, process.platform === 'darwin' ? [MAC_CATAP_LOOPBACK_FEATURE] : [])
);

function writeToneWav(file, seconds = 4, freq = 880) {
  const sampleRate = 44100;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.45;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function startTone() {
  if (process.platform === 'darwin') {
    return spawn('zsh', ['-c', 'while true; do afplay "$1"; done', 'blanc-audio-probe', TONE], { stdio: 'ignore', detached: true });
  }
  if (process.platform === 'win32') {
    return spawn(
      'powershell',
      ['-NoProfile', '-Command', 'while ($true) { (New-Object Media.SoundPlayer $env:BLANC_AUDIO_PROBE_TONE).PlaySync() }'],
      { stdio: 'ignore', env: { ...process.env, BLANC_AUDIO_PROBE_TONE: TONE } }
    );
  }
  return spawn('sh', ['-c', 'while true; do aplay "$1"; done', 'blanc-audio-probe', TONE], { stdio: 'ignore' });
}

function startServer() {
  const files = {
    '/helper': { file: 'helper.html', type: 'text/html; charset=utf-8' },
    '/receiver': { file: 'receiver.html', type: 'text/html; charset=utf-8' },
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = files[req.url];
      if (!route) {
        res.writeHead(404);
        res.end('no');
        return;
      }
      res.writeHead(200, { 'Content-Type': route.type });
      res.end(fs.readFileSync(path.join(__dirname, route.file)));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function waitIpc(channel, timeoutMs, pred = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener(channel, onMsg);
      reject(new Error(`timeout waiting for ${channel}`));
    }, timeoutMs);
    const onMsg = (_e, payload) => {
      if (!pred(payload)) return;
      clearTimeout(timer);
      ipcMain.removeListener(channel, onMsg);
      resolve({ sender: _e.sender, payload });
    };
    ipcMain.on(channel, onMsg);
  });
}

async function click(wc, id) {
  const box = await wc.executeJavaScript(`(() => {
    const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`, false);
  wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

async function run() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  app.setPath('userData', PROFILE);
  writeToneWav(TONE, 16, 880);
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;

  const helperSes = session.fromPartition('audio-probe-helper');
  helperSes.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture');
  });
  helperSes.setPermissionCheckHandler((_wc, permission) => (
    permission === 'media' || permission === 'display-capture'
  ));

  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const source = sources[0] || null;

  const cases = [];
  const attempts = [
    {
      name: 'handler-getDisplayMedia-loopback',
      api: 'getDisplayMedia',
      installHandler: true,
      handlerAudio: 'loopback',
    },
    {
      name: 'gum-video-id-audio-id',
      api: 'getUserMedia',
      installHandler: false,
      constraints: source ? {
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id } },
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id } },
      } : null,
    },
    {
      name: 'gum-video-id-audio-desktop',
      api: 'getUserMedia',
      installHandler: false,
      constraints: source ? {
        audio: { mandatory: { chromeMediaSource: 'desktop' } },
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id } },
      } : null,
    },
  ];

  const helper = new BrowserWindow({
    width: 360,
    height: 240,
    show: true,
    webPreferences: {
      session: helperSes,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  const receiver = new BrowserWindow({
    width: 360,
    height: 240,
    show: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  ipcMain.on('audio-probe:helper-offer', (_e, msg) => {
    receiver.webContents.send('audio-probe:helper-offer', msg);
  });
  ipcMain.on('audio-probe:page-answer', (_e, msg) => {
    helper.webContents.send('audio-probe:page-answer', msg);
  });

  await receiver.loadURL(`${origin}/receiver`);
  await new Promise((r) => setTimeout(r, 200));
  receiver.focus();
  await click(receiver.webContents, 'arm');
  await waitIpc('audio-probe:armed', 4000).catch((err) => {
    cases.push({ name: 'receiver-arm', error: err.message });
  });

  for (const attempt of attempts) {
    const record = {
      name: attempt.name,
      api: attempt.api,
      handlerAudio: attempt.handlerAudio || null,
      sourceIdPresent: Boolean(source?.id),
      sourceName: source?.name || null,
    };
    if (!source) {
      record.ok = false;
      record.error = 'desktopCapturer returned no screen sources';
      cases.push(record);
      continue;
    }
    if (attempt.installHandler) {
      helperSes.setDisplayMediaRequestHandler((_request, callback) => {
        callback({ video: source, audio: attempt.handlerAudio });
      });
    } else {
      helperSes.setDisplayMediaRequestHandler(null);
    }
    await helper.loadURL(`${origin}/helper`);
    await new Promise((r) => setTimeout(r, 200));
    helper.focus();
    await click(helper.webContents, 'go');
    await waitIpc('audio-probe:clicked', 4000).catch((err) => {
      record.clickError = err.message;
    });
    const helperResultP = waitIpc('audio-probe:helper-result', 12000, (p) => p.name === attempt.name);
    const energyP = waitIpc('audio-probe:energy', 16000, (p) => p.name === attempt.name);
    let tone = startTone();
    helper.webContents.send('audio-probe:run', {
      name: attempt.name,
      api: attempt.api,
      constraints: attempt.constraints || null,
    });
    try {
      const helperResult = (await helperResultP).payload;
      Object.assign(record, helperResult);
      if (helperResult.ok) {
        try {
          record.energy = (await energyP).payload;
        } catch (err) {
          record.energy = { error: err.message };
        }
      }
    } catch (err) {
      record.ok = false;
      record.error = err.message;
    } finally {
      if (tone && !tone.killed) {
        tone.kill('SIGTERM');
        try { process.kill(-tone.pid, 'SIGTERM'); } catch {}
      }
      await helper.webContents.executeJavaScript('window.__probeCleanup?.()', false).catch(() => {});
    }
    cases.push(record);
  }

  const successful = cases.filter((c) => c.ok && Number(c.energy?.peak) > 0);
  const lines = [
    '# Helper system-audio probe',
    '',
    `- Date: ${new Date().toISOString()}`,
    `- Electron: ${process.versions.electron}`,
    `- Chromium: ${process.versions.chrome}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- disable-features: ${app.commandLine.getSwitchValue('disable-features')}`,
    `- desktopCapturer sources: ${sources.length}`,
    `- Microphone getUserMedia: not used`,
    '',
    '## Successful helper invocation (copy this into Task 8)',
    '',
  ];
  if (successful.length) {
    for (const item of successful) {
      lines.push(`- **${item.name}** \`${item.api}\` peak=${item.energy.peak}`);
      if (item.api === 'getDisplayMedia') {
        lines.push('  - Helper: `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`');
        lines.push(`  - Helper session: \`setDisplayMediaRequestHandler\` → \`callback({ video: desktopCapturerSource, audio: '${item.handlerAudio}' })\``);
      } else {
        lines.push('  - Helper: `navigator.mediaDevices.getUserMedia(constraints)` with legacy `chromeMediaSource`/`chromeMediaSourceId`');
        lines.push(`  - See raw case \`${item.name}\` for the exact constraints object.`);
      }
      lines.push('');
    }
  } else {
    lines.push('No attempt produced receiver-measured nonzero energy on this host.');
    lines.push('');
  }
  lines.push('## Windows / Linux');
  lines.push('');
  lines.push('Not run from this macOS host. Energy-at-receiver still required on those guests before Island picker lock-in.');
  lines.push('');
  lines.push('## Raw cases');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    flags: app.commandLine.getSwitchValue('disable-features'),
    source: source ? { idPrefix: String(source.id).slice(0, 24), name: source.name } : null,
    cases,
  }, null, 2));
  lines.push('```');
  lines.push('');
  fs.writeFileSync(RESULT, `${lines.join('\n')}\n`);

  helper.close();
  receiver.close();
  server.close();
  app.quit();
}

app.whenReady().then(run).catch((err) => {
  fs.writeFileSync(RESULT, `# Audio probe failed\n\n${err.stack}\n`);
  app.exit(1);
});

app.on('quit', () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(TONE, { force: true });
});
