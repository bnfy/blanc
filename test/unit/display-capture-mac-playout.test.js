'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('../helpers/display-capture-page-world');

test('Mac returns the relay video itself and never constructs an adapter clock', async () => {
  const w = makeWorld({platform:'darwin', canvasAdapter:true, emitAudioImmediately:false});
  const stream = await w.gdm({video:true});
  const track = stream.getVideoTracks()[0];
  assert.equal(track, w.pcs.at(-1)._video);
  assert.equal(track.getSettings().displaySurface, 'monitor');
  assert.equal(track.__blancAdapterConsumer, undefined);
  assert.equal(w.world.__audioProcessors.length, 0);
  const clone = track.clone();
  assert.equal(clone.__blancAdapterConsumer, undefined);
  assert.equal(w.world.__audioProcessors.length, 0);
  track.stop();
  assert.equal(clone.readyState, 'live');
  clone.stop();
});

test('Mac preserves muted private-clone audio playout and trusted abort cleanup', async () => {
  const w = makeWorld({platform:'darwin', computerAudio:true, canvasAdapter:true});
  const stream = await w.gdm({video:true,audio:true});
  const audio = stream.getAudioTracks()[0];
  assert.equal(w.audioElements.length, 1);
  const sink = w.audioElements[0];
  const sinkTrack = sink.srcObject.getAudioTracks()[0];
  assert.notEqual(sinkTrack, audio);
  assert.equal(sink.muted, true);
  assert.equal(sink.volume, 0);
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {detail:JSON.stringify({shareId:'share-1',reason:'stop'})}));
  assert.equal(sinkTrack.readyState, 'ended');
  assert.equal(w.audioElements.length, 0);
  assert.ok(stream.getTracks().every(t=>t.readyState==='ended'));
});

test('Mac video-only capture never creates a private audio sink', async () => {
  const w = makeWorld({platform:'darwin', computerAudio:false, emitAudioImmediately:false, canvasAdapter:true});
  const stream = await w.gdm({video:true});
  assert.equal(w.audioElements.length, 0);
  assert.equal(w.world.__audioProcessors.length, 0);
  stream.getTracks().forEach(t=>t.stop());
});
