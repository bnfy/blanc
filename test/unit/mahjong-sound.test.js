'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CUES,
  STORAGE_KEY,
  createMahjongSound,
} = require('../../src/renderer/pages/mahjong-sound');

class FakeAudioParam {
  constructor() { this.events = []; }
  setValueAtTime(value, time) { this.events.push(['set', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]); }
}

class FakeOscillator {
  constructor() {
    this.frequency = new FakeAudioParam();
    this.type = 'sine';
    this.started = [];
    this.stopped = [];
  }
  connect(node) { this.connectedTo = node; }
  start(time) { this.started.push(time); }
  stop(time) { this.stopped.push(time); }
}

class FakeGain {
  constructor() { this.gain = new FakeAudioParam(); }
  connect(node) { this.connectedTo = node; }
}

class FakeAudioContext {
  constructor() {
    FakeAudioContext.instances.push(this);
    this.currentTime = 10;
    this.destination = {};
    this.state = 'running';
    this.oscillators = [];
    this.gains = [];
    this.resumeCount = 0;
    this.suspendCount = 0;
  }
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  async resume() { this.resumeCount += 1; this.state = 'running'; }
  async suspend() { this.suspendCount += 1; this.state = 'suspended'; }
}
FakeAudioContext.instances = [];

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    value: (key) => values.get(key),
  };
}

test.beforeEach(() => { FakeAudioContext.instances.length = 0; });

test('the cue set covers every Mahjong interaction sound', () => {
  assert.deepEqual(
    Object.keys(CUES),
    ['select', 'pair', 'blocked', 'undo', 'hint', 'deal', 'win', 'toggle']
  );
});

test('sound is enabled by default and creates Web Audio lazily for a known cue', () => {
  const sound = createMahjongSound({ AudioContextClass: FakeAudioContext, storage: memoryStorage() });

  assert.equal(sound.isEnabled(), true);
  assert.equal(FakeAudioContext.instances.length, 0);
  assert.equal(sound.play('pair'), true);
  assert.equal(FakeAudioContext.instances.length, 1);

  const context = FakeAudioContext.instances[0];
  assert.equal(context.oscillators.length, CUES.pair.length);
  assert.equal(context.gains.length, CUES.pair.length);
  assert.deepEqual(context.oscillators.map((oscillator) => oscillator.type), ['triangle', 'triangle']);
  assert.deepEqual(context.oscillators.map((oscillator) => oscillator.started[0]), [10, 10.045]);
  assert.equal(sound.play('unknown'), false);
});

test('the persisted toggle suppresses cues and resumes them when enabled', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: 'off' });
  const sound = createMahjongSound({ AudioContextClass: FakeAudioContext, storage });

  assert.equal(sound.isEnabled(), false);
  assert.equal(sound.play('hint'), false);
  assert.equal(FakeAudioContext.instances.length, 0);

  assert.equal(sound.setEnabled(true), true);
  assert.equal(storage.value(STORAGE_KEY), 'on');
  assert.equal(sound.play('hint'), true);
  assert.equal(FakeAudioContext.instances.length, 1);

  assert.equal(sound.setEnabled(false), false);
  assert.equal(storage.value(STORAGE_KEY), 'off');
  assert.equal(FakeAudioContext.instances[0].suspendCount, 1);
  assert.equal(sound.play('hint'), false);
});

test('unsupported or unavailable audio fails quietly', () => {
  const sound = createMahjongSound({ storage: memoryStorage() });
  assert.equal(sound.play('select'), false);

  const broken = createMahjongSound({
    AudioContextClass: class { constructor() { throw new Error('no audio device'); } },
    storage: memoryStorage(),
  });
  assert.equal(broken.play('select'), false);
});
