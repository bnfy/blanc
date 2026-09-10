'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { makeWorld } = require('../helpers/display-capture-page-world');

test('trusted abort after readiness ends the original and its clones and closes relay', async () => {
  const w = makeWorld();
  const stream = await w.gdm({ video: true });
  const track = stream.getTracks()[0];
  const clone = track.clone();
  let ended = 0;
  clone.addEventListener('ended', () => { ended++; });
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'stop' }),
  }));
  assert.equal(track.readyState, 'ended');
  assert.equal(clone.readyState, 'ended');
  assert.equal(ended, 1);
  assert.equal(w.pcs[0].connectionState, 'closed');
});

test('video false is TypeError before any broker request', async () => {
  const w = makeWorld();
  await assert.rejects(() => w.gdm({ video: false }), (err) => err && err.name === 'TypeError');
  assert.equal(w.events.some((item) => item.type === 'blanc:display-capture-request'), false);
});

test('muted live ontrack still emits track-ready so startup can clear', async () => {
  const w = makeWorld({ computerAudio: true, emitAudioImmediately: false, mutedVideo: true });
  const pending = w.gdm({ video: true, audio: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const added = w.events.filter((item) => item.type === 'blanc:display-capture-track-added');
  const ready = w.events.filter((item) => item.type === 'blanc:display-capture-track-ready');
  assert.ok(added.some((item) => JSON.parse(item.detail).kind === 'video'));
  assert.ok(ready.some((item) => JSON.parse(item.detail).kind === 'video'));
  w.emitAudio();
  w.unmuteVideo();
  const stream = await pending;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.ok(stream.getTracks().some((track) => track.kind === 'audio'));
});

test('relayed video getSettings reports displaySurface from picker enum', async () => {
  const w = makeWorld({ displaySurface: 'window' });
  const stream = await w.gdm({ video: true });
  const video = stream.getTracks().find((track) => track.kind === 'video');
  assert.equal(video.getSettings().displaySurface, 'window');
  assert.equal(video.getCapabilities().displaySurface, 'window');
  assert.equal(video.clone().getSettings().displaySurface, 'window');
});

test('dimensionless video times out instead of publishing and releases audio playout', async () => {
  const w = makeWorld({ computerAudio: true, mutedVideo: true });
  await assert.rejects(w.gdm({ video: true, audio: true }), { name: 'NotReadableError' });
  assert.equal(w.pcs[0].connectionState, 'closed');
  assert.equal(w.pcs[0]._video.readyState, 'ended');
  assert.equal(w.pcs[0]._audio.readyState, 'ended');
  assert.equal(w.audioElements.length, 0);
  assert.ok(w.events.some((event) => event.type === 'blanc:display-capture-signal'
    && JSON.parse(event.detail).type === 'failed'));
});

test('video becoming usable after two seconds is not published early', async () => {
  const w = makeWorld({ mutedVideo: true });
  let settled = false;
  const pending = w.gdm({ video: true }).then(stream => { settled = true; return stream; });
  await new Promise(resolve => setTimeout(resolve, 2200));
  const publishedEarly = settled;
  w.unmuteVideo();
  const stream = await pending;
  assert.equal(publishedEarly, false, 'the two-second fallback must not hand Meet dimensionless video');
  const video = stream.getTracks().find(track => track.kind === 'video');
  assert.equal(video.muted, false);
  assert.equal(video.getSettings().width, 1280);
  assert.equal(video.getSettings().height, 720);
});

test('unmute plus dimensions can resolve before the publish deadline', async () => {
  const w = makeWorld({ computerAudio: false, mutedVideo: true });
  const pending = w.gdm({ video: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 100));
  w.unmuteVideo();
  const stream = await pending;
  const elapsed = Date.now() - started;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.equal(stream.getTracks().find((t) => t.kind === 'video').getSettings().displaySurface, 'monitor');
  assert.ok(elapsed < 1500, `expected early resolve after unmute, got ${elapsed}ms`);
});

test('video ending during publish wait rejects instead of hanging', async () => {
  const w = makeWorld({ computerAudio: false, mutedVideo: true });
  const pending = w.gdm({ video: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(w.pcs[0]?._video, 'expected muted live video while waiting');
  const started = Date.now();
  w.endVideo();
  await assert.rejects(
    Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('still pending after hang window')), 2200)),
    ]),
    (err) => err && err.name === 'AbortError',
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `expected immediate reject after ended, got ${elapsed}ms`);
});

test('required audio ending before video arrives rejects instead of hanging', async () => {
  const w = makeWorld({
    computerAudio: true,
    emitAudioImmediately: false,
    emitVideoImmediately: false,
  });
  const pending = w.gdm({ video: true, audio: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  w.emitAudio();
  await new Promise((resolve) => setImmediate(resolve));
  const readyKinds = w.events
    .filter((item) => item.type === 'blanc:display-capture-track-ready')
    .map((item) => JSON.parse(item.detail).kind);
  assert.deepEqual(readyKinds, ['audio']);
  // Attach before ending audio — rejection is synchronous with the ended handler.
  const expectAbort = assert.rejects(pending, (err) => err && err.name === 'AbortError');
  const started = Date.now();
  w.endAudio();
  const lateVideo = w.emitVideo();
  await new Promise((resolve) => setImmediate(resolve));
  const readyAfter = w.events
    .filter((item) => item.type === 'blanc:display-capture-track-ready')
    .map((item) => JSON.parse(item.detail).kind);
  assert.equal(readyAfter.includes('video'), false, 'failed shares must not announce a late track as ready');
  assert.equal(lateVideo.readyState, 'ended');
  await expectAbort;
  assert.ok(w.events.some((event) => event.type === 'blanc:display-capture-signal'
    && JSON.parse(event.detail).type === 'failed'), 'main receives failure instead of a late ready');
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `expected immediate reject after required audio lost, got ${elapsed}ms`);
});

test('unmuted video with zero height is not publishable until height is non-zero', async () => {
  const w = makeWorld({
    computerAudio: false,
    mutedVideo: true,
    unmuteWidth: 1280,
    unmuteHeight: 0,
  });
  const pending = w.gdm({ video: true });
  let settled = false;
  const tracked = pending.then((stream) => {
    settled = true;
    return stream;
  }, (err) => {
    settled = true;
    throw err;
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  w.unmuteVideo();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(settled, false, '1280×0 must not resolve as publishable');
  w.setVideoDimensions(1280, 720);
  // Poll notices dimension changes without a dedicated event.
  const stream = await tracked;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.equal(stream.getTracks().find((t) => t.kind === 'video').getSettings().height, 720);
});

test('unmuted video with zero width is not publishable', async () => {
  const w = makeWorld({
    computerAudio: false,
    mutedVideo: true,
    unmuteWidth: 0,
    unmuteHeight: 720,
  });
  const pending = w.gdm({ video: true });
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  w.unmuteVideo();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(settled, false, '0×720 must not resolve as publishable');
  w.setVideoDimensions(1280, 720);
  const stream = await pending;
  assert.equal(settled, true);
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
});

test('approved computer audio waits for a live audio track', async () => {
  const w = makeWorld({ computerAudio: true, emitAudioImmediately: false });
  let settled = false;
  const pending = w.gdm({ video: true, audio: true }).then((stream) => {
    settled = true;
    return stream;
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  w.emitAudio();
  const stream = await pending;
  assert.equal(settled, true);
  assert.ok(stream.getTracks().some((track) => track.kind === 'audio'));
});

test('page audio handoff emits Meet-boundary page-diag', async () => {
  const w = makeWorld({ computerAudio: true });
  await w.gdm({ video: true, audio: true });
  const handoffs = w.events
    .filter((item) => item.type === 'blanc:display-capture-page-diag')
    .map((item) => JSON.parse(item.detail))
    .filter((item) => item.event === 'audio-handoff');
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].shareId, 'share-1');
  assert.equal(handoffs[0].computerAudio, true);
  assert.equal(handoffs[0].displaySurface, 'monitor');
  assert.equal(handoffs[0].readyState, 'live');
});

test('energy probe samples page and outbound input in parallel with timestamps', async () => {
  const w = makeWorld({ computerAudio: true });
  const stream = await w.gdm({ video: true, audio: true });
  const audio = stream.getTracks().find((track) => track.kind === 'audio');
  assert.ok(audio);
  audio.__probeAmp = 0.4;
  const meetPc = new w.world.window.RTCPeerConnection();
  // Meet often clones; clone stays brokered via wrapTrack and is a distinct analyser.
  const outboundTrack = audio.clone();
  outboundTrack.__probeAmp = 0.35;
  meetPc.addTrack(outboundTrack);
  // Mic sender on the same PC must not pollute brokered RTP attribution.
  const mic = new w.world.MediaStreamTrack('audio');
  mic.__probeAmp = 0.99;
  meetPc.addTrack(mic, { mic: true });

  w.audioSampleLog.length = 0;
  const probe = await w.world.window.__blancCaptureEnergyProbe(80);

  assert.equal(probe.outboundAttribution, 'brokered-sender-matched');
  assert.equal(typeof probe.page.peak, 'number');
  assert.equal(typeof probe.page.sampleStartedAt, 'number');
  assert.equal(typeof probe.page.sampleEndedAt, 'number');
  assert.equal(probe.page.sampleStartedAt, probe.sampleStartedAt);
  assert.equal(probe.page.sampleEndedAt, probe.sampleEndedAt);
  assert.equal(probe.meetOutboundBrokered.length, 1);
  const out = probe.meetOutboundBrokered[0];
  assert.equal(out.senderInput.sampleStartedAt, probe.page.sampleStartedAt);
  assert.equal(out.senderInput.sampleEndedAt, probe.page.sampleEndedAt);
  assert.equal(out.rtpBound, true);
  assert.equal(out.rtpDelta.ssrc, 1);
  assert.ok(out.rtpDelta.bytesSent > 0);
  assert.ok(out.rtpDelta.packetsSent > 0);
  assert.equal(out.rtpDelta.audibleEnergy, 'unknown');
  assert.equal(out.rtpDelta.totalAudioEnergy, undefined);
  assert.equal(probe.audibleEndToEnd, 'receiver-listening');
  // PC-level stats would see mic ssrc 99; brokered binding must not.
  assert.notEqual(out.rtpDelta.ssrc, 99);

  const trackIds = new Set(w.audioSampleLog.map((row) => row.trackId));
  assert.ok(trackIds.has(audio.id));
  // Parallel: first samples for page vs outbound must overlap in time (not
  // end(page) then start(outbound)).
  const byTrack = new Map();
  for (const row of w.audioSampleLog) {
    if (!byTrack.has(row.trackId)) byTrack.set(row.trackId, []);
    byTrack.get(row.trackId).push(row.t);
  }
  const times = [...byTrack.values()];
  assert.ok(times.length >= 2, 'expected ≥2 analyser tracks sampled');
  const firstA = Math.min(...times[0]);
  const lastA = Math.max(...times[0]);
  const firstB = Math.min(...times[1]);
  const lastB = Math.max(...times[1]);
  assert.ok(firstA <= lastB && firstB <= lastA, 'analyser windows must overlap');

  const logged = w.events
    .filter((item) => item.type === 'blanc:display-capture-page-diag')
    .map((item) => JSON.parse(item.detail))
    .filter((item) => item.event === 'energy-probe');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].outboundAttribution, 'brokered-sender-matched');
  assert.equal(logged[0].meetOutboundCount, 1);
  assert.equal(probe.senderAttachment.audioSenderCount, 2);
  assert.equal(probe.senderAttachment.brokeredSenderCount, 1);
  assert.equal(probe.senderAttachment.otherAudioSenderCount, 1);
  assert.equal(probe.senderAttachment.brokeredExactMatchCount, 0);
});

test('energy probe is inconclusive when Meet uses a non-brokered transformed track', async () => {
  const w = makeWorld({ computerAudio: true });
  await w.gdm({ video: true, audio: true });
  const meetPc = new w.world.window.RTCPeerConnection();
  const transformed = new w.world.MediaStreamTrack('audio');
  meetPc.addTrack(transformed);
  const probe = await w.world.window.__blancCaptureEnergyProbe(50);
  assert.equal(probe.outboundAttribution, 'inconclusive-no-brokered-sender');
  assert.equal(probe.meetOutboundBrokered.length, 0);
  assert.equal(typeof probe.page.peak, 'number');
  assert.equal(probe.senderAttachment.audioSenderCount, 1);
  assert.equal(probe.senderAttachment.brokeredSenderCount, 0);
  assert.equal(probe.senderAttachment.otherAudioSenderCount, 1);
  assert.equal(probe.senderAttachment.attached, undefined);
  assert.equal(probe.senderAttachment.meetAttached, undefined);
});

test('clone increments consumers; stopping one clone does not emit the sibling key', async () => {
  const w = makeWorld();
  const stream = await w.gdm({ video: true, audio: true });
  const video = stream.getTracks().find((track) => track.kind === 'video');
  const clone = video.clone();
  video.stop();
  const stopped = w.stopped();
  assert.equal(stopped.length, 1);
  assert.notEqual(stopped[0].trackKey, undefined);
  clone.stop();
  const stoppedBoth = w.stopped();
  assert.equal(stoppedBoth.length, 2);
  assert.notEqual(stoppedBoth[0].trackKey, stoppedBoth[1].trackKey);
});

test('computer audio starts muted receiver playout before resolving, without adding a page consumer', async () => {
  let finishPlay;
  const w = makeWorld({ computerAudio: true, audioPlay: () => new Promise((r) => { finishPlay = r; }) });
  let resolved = false;
  const pending = w.gdm({ video: true, audio: true }).then((stream) => { resolved = true; return stream; });
  await new Promise((r) => setImmediate(r));
  assert.equal(w.audioElements.length, 1);
  assert.equal(resolved, false, 'getDisplayMedia must wait for successful play');
  const sink = w.audioElements[0];
  assert.equal(sink.hidden, true);
  assert.equal(sink.defaultMuted, true);
  assert.notEqual(sink.playedTrack, w.pcs[0]._audio, 'sink owns an independent clone');
  assert.equal(w.events.filter((e) => e.type === 'blanc:display-capture-track-added').length, 2);
  finishPlay();
  const stream = await pending;
  assert.equal(stream.getTracks().includes(sink.playedTrack), false);
  for (const track of stream.getTracks()) track.stop();
  assert.equal(sink.paused, true);
  assert.equal(sink.srcObject, null);
  assert.equal(sink.playedTrack.readyState, 'ended');
  assert.equal(w.audioElements.length, 0);
});

test('video-only share does not create a receiver audio sink', async () => {
  const w = makeWorld({ emitAudioImmediately: false });
  const stream = await w.gdm({ video: true });
  assert.equal(w.allAudioElements.length, 0);
  stream.getTracks()[0].stop();
});

test('receiver sink survives original audio stop until the last audio clone stops', async () => {
  const w = makeWorld({ computerAudio: true });
  const stream = await w.gdm({ video: true, audio: true });
  const audio = stream.getTracks().find((t) => t.kind === 'audio');
  const video = stream.getTracks().find((t) => t.kind === 'video');
  const clone = audio.clone();
  const sink = w.audioElements[0];
  audio.stop();
  assert.equal(w.audioElements.length, 1);
  assert.equal(sink.playedTrack.readyState, 'live');
  clone.stop();
  assert.equal(w.audioElements.length, 0);
  assert.equal(sink.playedTrack.readyState, 'ended');
  assert.equal(video.readyState, 'live');
  video.stop();
});

test('trusted Stop removes only the named share sink and leaves independent capture live', async () => {
  const w = makeWorld({ computerAudio: true });
  const mic = new w.world.MediaStreamTrack('audio');
  const camera = new w.world.MediaStreamTrack('video');
  const first = await w.gdm({ video: true, audio: true });
  const second = await w.gdm({ video: true, audio: true });
  const [firstSink, secondSink] = w.audioElements;
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'stop' }),
  }));
  assert.equal(firstSink.removed, true);
  assert.equal(firstSink.playedTrack.readyState, 'ended');
  assert.equal(secondSink.removed, false);
  assert.equal(secondSink.playedTrack.readyState, 'live');
  assert.ok(first.getTracks().every((t) => t.readyState === 'ended'));
  assert.ok(second.getTracks().every((t) => t.readyState === 'live'));
  assert.equal(mic.readyState, 'live');
  assert.equal(camera.readyState, 'live');
  for (const track of second.getTracks()) track.stop();
});

test('cancel during receiver play startup rejects and disposes a late play completion', async () => {
  let finishPlay;
  const w = makeWorld({ computerAudio: true, audioPlay: () => new Promise((r) => { finishPlay = r; }) });
  const pending = w.gdm({ video: true, audio: true });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await new Promise((r) => setImmediate(r));
  const sink = w.audioElements[0];
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'navigation' }),
  }));
  await rejected;
  finishPlay();
  await new Promise((r) => setImmediate(r));
  assert.equal(w.audioElements.length, 0);
  assert.equal(sink.srcObject, null);
  assert.equal(sink.playedTrack.readyState, 'ended');
  assert.equal(w.pcs[0].connectionState, 'closed');
  const lateAudio = w.emitAudio();
  assert.equal(lateAudio.readyState, 'ended', 'queued ontrack after abort must be discarded');
  assert.equal(w.allAudioElements.length, 1, 'late ontrack must not recreate the sink');
});

test('receiver play rejection rejects the share and releases its native clone', async () => {
  const w = makeWorld({ computerAudio: true, audioPlay: () => Promise.reject(new Error('play failed')) });
  await assert.rejects(w.gdm({ video: true, audio: true }), { name: 'NotReadableError' });
  assert.equal(w.audioElements.length, 0);
  assert.equal(w.allAudioElements[0].playedTrack.readyState, 'ended');
  assert.equal(w.pcs[0].connectionState, 'closed');
});

test('receiver play startup has a bounded timeout even after track-ready', async () => {
  const w = makeWorld({ computerAudio: true, audioPlay: () => new Promise(() => {}) });
  let expire;
  w.world.setTimeout = (fn, ms) => {
    if (ms === 5000) { expire = fn; return setTimeout(() => {}, 5000); }
    return setTimeout(fn, ms);
  };
  const pending = w.gdm({ video: true, audio: true });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await new Promise((r) => setImmediate(r));
  assert.equal(typeof expire, 'function');
  expire();
  await rejected;
  assert.equal(w.audioElements.length, 0);
  assert.equal(w.pcs[0].connectionState, 'closed');
});

test('natural audio end releases receiver sink without stopping video', async () => {
  const w = makeWorld({ computerAudio: true });
  const stream = await w.gdm({ video: true, audio: true });
  const sink = w.audioElements[0];
  w.endAudio();
  assert.equal(w.audioElements.length, 0);
  assert.equal(sink.playedTrack.readyState, 'ended');
  const video = stream.getTracks().find((t) => t.kind === 'video');
  assert.equal(video.readyState, 'live');
  video.stop();
});

test('adapter capabilities exclude native identifiers and describe real support', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768, sourceFrameRate: 30 });
  const stream = await w.gdm({ video: true });
  const video = stream.getVideoTracks()[0];
  const caps = video.getCapabilities();
  assert.equal(caps.deviceId, undefined);
  assert.equal(caps.groupId, undefined);
  assert.equal(caps.width.max, 1024);
  assert.equal(caps.height.max, 768);
  assert.equal(caps.displaySurface, 'monitor');
  const settings = video.getSettings();
  assert.equal(settings.deviceId, undefined);
  assert.equal(settings.groupId, undefined);
  assert.equal(settings.width, 1024);
  assert.equal(settings.height, 768);
  assert.equal(Object.keys(video.getConstraints()).length, 0);
});

test('Meet-like max constraints succeed on adapter video', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const stream = await w.gdm({ video: true });
  const video = stream.getVideoTracks()[0];
  await video.applyConstraints({
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { min: 0, ideal: 30 },
  });
  assert.equal(video.getSettings().width, 1024);
  assert.equal(video.getSettings().height, 768);
  assert.equal(video.getConstraints().width.max, 1920);
});

test('impossible required constraints reject with constraint name and keep prior config', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const stream = await w.gdm({ video: true });
  const video = stream.getVideoTracks()[0];
  await video.applyConstraints({ width: { exact: 640 }, height: { exact: 480 } });
  await assert.rejects(
    () => video.applyConstraints({ width: { min: 1920 } }),
    (err) => err && err.name === 'OverconstrainedError' && err.constraint === 'width',
  );
  assert.equal(video.getSettings().width, 640);
  assert.equal(video.getSettings().height, 480);
  assert.equal(video.getConstraints().width.exact, 640);
});

test('track.clone consumers constrain independently and inherit accepted constraints', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const stream = await w.gdm({ video: true });
  const video = stream.getVideoTracks()[0];
  await video.applyConstraints({ width: { exact: 800 }, height: { exact: 600 } });
  const clone = video.clone();
  assert.notEqual(clone.__blancAdapterConsumer.pipeline, video.__blancAdapterConsumer.pipeline);
  assert.equal(clone.getSettings().width, 800);
  assert.equal(clone.getConstraints().width.exact, 800);
  await clone.applyConstraints({ width: { exact: 640 }, height: { exact: 480 } });
  assert.equal(clone.getSettings().width, 640);
  assert.equal(video.getSettings().width, 800);
});

test('MediaStream.clone consumers constrain independently and inherit accepted constraints', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const stream = await w.gdm({ video: true });
  const video = stream.getVideoTracks()[0];
  await video.applyConstraints({ width: { exact: 800 }, height: { exact: 600 } });
  const copy = stream.clone();
  const clonedVideo = copy.getVideoTracks()[0];
  assert.notEqual(clonedVideo, video);
  assert.notEqual(clonedVideo.__blancAdapterConsumer.pipeline, video.__blancAdapterConsumer.pipeline);
  assert.equal(clonedVideo.getSettings().width, 800);
  assert.equal(clonedVideo.getConstraints().width.exact, 800);
  await clonedVideo.applyConstraints({ width: { exact: 320 }, height: { exact: 240 } });
  assert.equal(clonedVideo.getSettings().width, 320);
  assert.equal(video.getSettings().width, 800);
  const stoppedBefore = w.stopped().length;
  clonedVideo.stop();
  assert.equal(w.stopped().length, stoppedBefore + 1);
  assert.equal(video.readyState, 'live');
});

test('stopping a MediaStream clone leaves the original canvas output live', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const stream = await w.gdm({ video: true });
  stream.clone().getVideoTracks()[0].stop();
  assert.equal(stream.getVideoTracks()[0].readyState, 'live');
});

test('frameRate constraints reconfigure the physical canvas capture rate', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768, sourceFrameRate: 30 });
  const track = (await w.gdm({ video: true })).getVideoTracks()[0];
  await track.applyConstraints({ frameRate: { exact: 15 } });
  assert.equal(track.getSettings().frameRate, 15);
  assert.equal(w.world.__canvases[0].captureRate, 15);
  assert.equal(w.world.MediaStreamTrack.prototype.getSettings.call(track).frameRate, 15);
});

test('remote relay ending ends the dependent canvas output', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const track = (await w.gdm({ video: true })).getVideoTracks()[0];
  w.endVideo();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(track.readyState, 'ended');
});

test('silent relay readyState end is observed by the canvas pump', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const track = (await w.gdm({ video: true })).getVideoTracks()[0];
  const relay = track.__blancAdapterConsumer.relayTrack;
  // Chromium captureStream.stop(): readyState flips, 'ended' does not fire.
  relay.readyState = 'ended';
  w.world.tickAudio();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(track.readyState, 'ended');
});

test('clone frameRate apply retimes the retained native canvas track', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768, sourceFrameRate: 30 });
  const original = (await w.gdm({ video: true })).getVideoTracks()[0];
  await original.applyConstraints({ frameRate: { exact: 15 } });
  const copy = original.clone();
  await copy.applyConstraints({ frameRate: { exact: 30 } });
  assert.equal(copy.getSettings().frameRate, 30);
  assert.equal(copy.__blancAdapterConsumer.pipeline.getCaptureRate(), 30);
  assert.equal(w.world.MediaStreamTrack.prototype.getSettings.call(copy).frameRate, 30);
  assert.equal(original.getSettings().frameRate, 15);
  assert.equal(original.__blancAdapterConsumer.pipeline.getCaptureRate(), 15);
});

test('without canvas, required resize is OverconstrainedError and settings stay real', async () => {
  const w = makeWorld({ canvasAdapter: false, unmuteWidth: 1280, unmuteHeight: 720, sourceWidth: 1280, sourceHeight: 720 });
  const track = (await w.gdm({ video: true })).getVideoTracks()[0];
  await assert.rejects(
    () => track.applyConstraints({ width: { exact: 640 }, height: { exact: 360 } }),
    (err) => err && err.name === 'OverconstrainedError',
  );
  const actual = w.world.MediaStreamTrack.prototype.getSettings.call(track);
  assert.equal(track.getSettings().width, actual.width);
  assert.equal(track.getSettings().width, 1280);
});

test('silent source end closes every per-consumer AudioContext', async () => {
  const w = makeWorld({ canvasAdapter: true, emitAudioImmediately: false });
  const track = (await w.gdm({ video: true })).getVideoTracks()[0];
  track.__blancAdapterConsumer.relayTrack.readyState = 'ended';
  w.world.tickAudio();
  assert.equal(track.readyState, 'ended');
  assert.deepEqual(w.world.__audioProcessors.map((ctx) => ctx.state), ['closed']);
});

test('Stop settles an in-flight native apply before native completion', async () => {
  const w = makeWorld({ canvasAdapter: true, emitAudioImmediately: false });
  const track = (await w.gdm({ video: true })).getVideoTracks()[0];
  let entered;
  const nativeStarted = new Promise((resolve) => { entered = resolve; });
  let release;
  const nativeGate = new Promise((resolve) => { release = resolve; });
  const proto = w.world.MediaStreamTrack.prototype;
  const oldApply = proto.applyConstraints;
  proto.applyConstraints = async function applyConstraints(constraints) {
    entered();
    await nativeGate;
    return oldApply.call(this, constraints);
  };
  let outcome = 'pending';
  const pending = track.applyConstraints({ frameRate: { exact: 15 } })
    .then(() => { outcome = 'resolved'; }, (error) => { outcome = error.name; });
  await nativeStarted;
  track.stop();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const outcomeAtStop = outcome;
  release();
  await pending;
  assert.equal(outcomeAtStop, 'AbortError', 'Stop still waits for the native apply promise');
});

test('Stop aborts pending applyConstraints and late completion does not revive config', async () => {
  const w = makeWorld({ canvasAdapter: true, sourceWidth: 1024, sourceHeight: 768 });
  const stream = await w.gdm({ video: true });
  const video = stream.getVideoTracks()[0];
  await video.applyConstraints({ width: { exact: 640 }, height: { exact: 480 } });
  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  video.__adapterDelay = () => gate;
  const pending = video.applyConstraints({ width: { exact: 320 }, height: { exact: 240 } });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'stop' }),
  }));
  await rejected;
  releaseGate();
  await new Promise((r) => setImmediate(r));
  assert.equal(video.readyState, 'ended');
  assert.equal(video.getSettings().width, 640);
});
