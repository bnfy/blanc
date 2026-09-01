const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: {
      getPath: () => activeUserData,
      on: () => {},
    },
  },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('the WebRTC policy accepts Compatibility, rejects unknown values, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-webrtc-policy-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);

  assert.equal(settings.getSettings().webrtcPolicy, 'standard');
  assert.equal(settings.setSettings({ webrtcPolicy: 'compatibility' }).webrtcPolicy, 'compatibility');
  assert.equal(settings.setSettings({ webrtcPolicy: 'strict' }).webrtcPolicy, 'strict');
  assert.equal(settings.setSettings({ webrtcPolicy: 'unrestricted' }).webrtcPolicy, 'strict');
  assert.equal(settings.setSettings({ webrtcPolicy: null }).webrtcPolicy, 'strict');
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'webrtcPolicy'),
    false
  );

  assert.equal(settings.getSettings().webrtcAudioBuffer, 'automatic');
  assert.equal(settings.setSettings({ webrtcAudioBuffer: 'stable' }).webrtcAudioBuffer, 'stable');
  assert.equal(settings.setSettings({ webrtcAudioBuffer: 'resilient' }).webrtcAudioBuffer, 'resilient');
  assert.equal(settings.setSettings({ webrtcAudioBuffer: 'maximum' }).webrtcAudioBuffer, 'resilient');
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'webrtcAudioBuffer'),
    false
  );
});

test('the Compatibility policy reaches the schema, generated artifacts, and Settings UI', () => {
  const schema = require('../../settings-schema/schema.json');
  assert.deepEqual(schema.webrtcPolicies, ['standard', 'compatibility', 'strict']);
  assert.deepEqual(schema.webrtcAudioBuffers, ['automatic', 'stable', 'resilient']);

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  assert.match(generated('BlancSettings.swift'), /case standard\n    case compatibility\n    case strict/);
  assert.match(
    generated('BlancSettings.kt'),
    /STANDARD\("standard"\),\n    COMPATIBILITY\("compatibility"\),\n    STRICT\("strict"\)/
  );
  assert.match(generated('BlancSettings.swift'), /enum BlancWebrtcAudioBuffer[\s\S]*case automatic\n    case stable\n    case resilient/);
  assert.match(generated('BlancSettings.kt'), /enum class BlancWebrtcAudioBuffer[\s\S]*AUTOMATIC\("automatic"\),\n    STABLE\("stable"\),\n    RESILIENT\("resilient"\)/);

  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'),
    'utf8'
  );
  const select = html.match(/<select id="webrtcPolicy">[\s\S]*?<\/select>/)?.[0];
  assert.ok(select, 'no #webrtcPolicy select in settings.html');
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, schema.webrtcPolicies);
  assert.match(select, /Compatibility — widest call support, less IP privacy/);

  const audioSelect = html.match(/<select id="webrtcAudioBuffer">[\s\S]*?<\/select>/)?.[0];
  assert.ok(audioSelect, 'no #webrtcAudioBuffer select in settings.html');
  const audioValues = [...audioSelect.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(audioValues, schema.webrtcAudioBuffers);
  assert.match(audioSelect, /Stable — smoother playback, about 400 ms buffer/);
  assert.match(audioSelect, /Resilient — high stability, about 1 second buffer/);
});
