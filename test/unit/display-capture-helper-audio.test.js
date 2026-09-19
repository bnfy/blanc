'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  helperSystemAudioProcessingMode,
} = require('../../src/main/display-capture-helper-audio');

test('helper system-audio processing defaults to default', () => {
  assert.equal(helperSystemAudioProcessingMode({}), 'default');
  assert.equal(helperSystemAudioProcessingMode({ BLANC_HELPER_SYSTEM_AUDIO_PROCESSING: '' }), 'default');
  assert.equal(helperSystemAudioProcessingMode({ BLANC_HELPER_SYSTEM_AUDIO_PROCESSING: 'on' }), 'default');
});

test('helper system-audio processing off is explicit', () => {
  assert.equal(helperSystemAudioProcessingMode({
    BLANC_HELPER_SYSTEM_AUDIO_PROCESSING: 'off',
  }), 'off');
  assert.equal(helperSystemAudioProcessingMode({
    BLANC_HELPER_SYSTEM_AUDIO_PROCESSING: 'OFF',
  }), 'off');
});
