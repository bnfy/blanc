'use strict';
function wav(sampleRate, seconds = 20) {
  if (![44100, 48000].includes(sampleRate)) throw Error('Unsupported fixture rate');
  const frames = sampleRate * seconds, data = Buffer.alloc(44 + frames * 4);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * 4, 28);
  data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const value = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 1000);
    data.writeInt16LE(value, 44 + i * 4); data.writeInt16LE(value, 46 + i * 4);
  }
  return data;
}
function advances(trial) {
  return !trial.failure && !trial.second?.error && trial.second?.time - trial.first?.time > 2;
}
function classify(runtimes, native) {
  if (!['official', 'ecs'].every(name => !runtimes[name]?.failure && runtimes[name]?.trials?.length === 6)) {
    return 'incomplete-browser-controls';
  }
  const good = name => runtimes[name]?.trials?.filter(t => t.kind === 'media' && !t.muted).every(advances)
    && runtimes[name].trials.filter(t => t.kind === 'media' && !t.muted).length === 2;
  const official = good('official'), ecs = good('ecs');
  if (official && ecs) return 'minimal-runtimes-pass-investigate-Blanc-integration-or-original-fixture';
  if (official && !ecs) return 'ECS-specific-failure-on-the-same-host';
  if (!official && ecs) return 'official-control-failed-ECS-passed';
  if (native?.trials?.length !== 2 || !native.trials.every(t => t.error ||
    (Number.isFinite(t.advancedFrames) && t.outputSampleRate > 0))) return 'incomplete-native-control';
  if (native.trials.every(t => !t.error && t.outputSampleRate > 0 && t.advancedFrames > t.outputSampleRate * 2)) {
    return 'shared-browser-audio-path-failure-native-output-clock-advances';
  }
  return 'shared-browser-and-native-output-failure-host-audio-suspect';
}
module.exports = { wav, advances, classify };
