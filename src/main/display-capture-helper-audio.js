'use strict';

function helperSystemAudioProcessingMode(env = process.env) {
  const raw = String(env.BLANC_HELPER_SYSTEM_AUDIO_PROCESSING || '').trim().toLowerCase();
  return raw === 'off' ? 'off' : 'default';
}

module.exports = { helperSystemAudioProcessingMode };
