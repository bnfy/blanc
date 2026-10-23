'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {wav, classify} = require('../desktop/support/audio-fixture.cjs');
const trials = advance => [44100,48000].flatMap(sampleRate => ['media','muted','web-audio'].map(kind => ({
  sampleRate,kind:kind==='muted'?'media':kind,muted:kind==='muted',first:{time:0},second:{time:advance?5:0.1}
})));
test('audio fixture is local stereo PCM at both native clock rates', () => {
  for (const rate of [44100,48000]) {
    const bytes=wav(rate,1);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');
    assert.equal(bytes.readUInt16LE(20),1);
    assert.equal(bytes.readUInt16LE(22),2);
    assert.equal(bytes.readUInt32LE(24),rate);
    assert.equal(bytes.length,44+rate*4);
  }
  assert.throws(()=>wav(1));
});
test('audio attribution requires complete controls and distinguishes ECS-only failures', () => {
  const controls={official:{trials:trials(true)},ecs:{trials:trials(false)}};
  assert.equal(classify(controls,{}),'ECS-specific-failure-on-the-same-host');
  controls.official.trials=trials(false);
  assert.equal(classify(controls,{}),'incomplete-native-control');
  assert.equal(classify(controls,{trials:[{},{}]}),'incomplete-native-control');
  assert.equal(classify(controls,{trials:[{error:'failed'},{error:'failed'}]}),'shared-browser-and-native-output-failure-host-audio-suspect');
  assert.equal(classify(controls,{trials:[44100,48000].map(outputSampleRate=>({outputSampleRate,advancedFrames:outputSampleRate*5}))}),
    'shared-browser-audio-path-failure-native-output-clock-advances');
  controls.ecs.trials=[];
  assert.equal(classify(controls,{}),'incomplete-browser-controls');
});
test('Intel audio control has no signing, private transfer or production access', () => {
  const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/ublock-origin.yml'),'utf8');
  const job=workflow.split('  intel-audio:')[1].split('  ecs-updater-intel:')[0];
  assert.match(job,/inputs.intel_audio/);
  assert.match(job,/runs-on: macos-15-intel/);
  assert.match(job,/contents: read/);
  assert.match(job,/persist-credentials: false/);
  assert.match(job,/SHASUMS256.txt/);
  assert.match(job,/prepareEcsRuntime/);
  assert.doesNotMatch(job,/contents: write|ecs-private|APPLE_|EVS_|--no-sandbox|release (?:create|upload|edit)/);
});
