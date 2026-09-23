const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MAPPING, STROKE_PX, validMapping, mappingOrDefault, createRecognizer,
} = require('../../src/main/mouse-gestures');

test('right-drag recognition filters small movement and recognizes turns', () => {
  const recognizer = createRecognizer();
  recognizer.start(100, 100);
  assert.equal(recognizer.move(100 + STROKE_PX - 1, 100), false);
  assert.equal(recognizer.finish(), '');
  recognizer.start(100, 100);
  assert.equal(recognizer.move(60, 100), true);
  recognizer.move(30, 100);
  recognizer.move(30, 60);
  assert.equal(recognizer.finish(), 'LU');
  assert.equal(recognizer.held, false);
});

test('cancel and excess turns never execute a partial gesture', () => {
  const recognizer = createRecognizer();
  recognizer.start(0, 0);
  recognizer.move(30, 0);
  recognizer.cancel();
  assert.equal(recognizer.finish(), '');
  recognizer.start(0, 0);
  recognizer.move(30, 0);
  recognizer.move(30, 30);
  recognizer.move(0, 30);
  recognizer.move(0, 0);
  assert.equal(recognizer.finish(), '');
});

test('mappings accept only bounded, known patterns and actions', () => {
  assert.equal(validMapping({ L: 'back', DR: 'newTab' }), true);
  for (const bad of [{ LL: 'back' }, { L: 'unknown' }, { UDLR: 'back' }, [], null]) {
    assert.equal(validMapping(bad), false);
    assert.deepEqual(mappingOrDefault(bad), DEFAULT_MAPPING);
  }
  const mapping = { R: 'forward' };
  assert.deepEqual(mappingOrDefault(mapping), mapping);
  assert.notEqual(mappingOrDefault(mapping), mapping);
});
