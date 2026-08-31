// Locally synthesized Mahjong cues. AudioContext is created lazily on the
// first user-triggered cue; there are no audio assets, network requests, or
// startup sounds. The factory is exported for Node unit tests.
(() => {
  'use strict';

  const STORAGE_KEY = 'mahjong.sound';
  // [start offset, frequency, duration, peak gain, oscillator type]
  const CUES = Object.freeze({
    select: [[0, 190, 0.035, 0.07, 'triangle']],
    pair: [[0, 220, 0.055, 0.13, 'triangle'], [0.045, 330, 0.07, 0.11, 'triangle']],
    blocked: [[0, 105, 0.06, 0.08, 'triangle']],
    undo: [[0, 330, 0.055, 0.09, 'triangle'], [0.045, 220, 0.07, 0.09, 'triangle']],
    hint: [[0, 520, 0.08, 0.07, 'sine'], [0.07, 660, 0.1, 0.07, 'sine']],
    deal: [[0, 170, 0.04, 0.08, 'triangle'], [0.035, 210, 0.04, 0.08, 'triangle'], [0.07, 255, 0.055, 0.08, 'triangle']],
    win: [[0, 392, 0.24, 0.1, 'sine'], [0.12, 523.25, 0.28, 0.1, 'sine'], [0.24, 659.25, 0.36, 0.11, 'sine']],
    toggle: [[0, 440, 0.08, 0.08, 'sine']],
  });

  function createMahjongSound({ AudioContextClass, storage } = {}) {
    let context = null;
    let enabled = true;
    try { enabled = storage?.getItem(STORAGE_KEY) !== 'off'; } catch { /* default on */ }

    function ensureContext() {
      if (!AudioContextClass) return null;
      try {
        if (context?.state === 'closed') context = null;
        if (!context) context = new AudioContextClass();
        if (context.state === 'suspended') {
          Promise.resolve(context.resume()).catch(() => {});
        }
        return context;
      } catch {
        return null;
      }
    }

    function discardContext() {
      const discarded = context;
      context = null;
      if (!discarded || discarded.state === 'closed') return;
      try { Promise.resolve(discarded.close()).catch(() => {}); } catch { /* already gone */ }
    }

    function play(name) {
      const cue = CUES[name];
      if (!enabled || !cue) return false;
      const audio = ensureContext();
      if (!audio) return false;

      try {
        const now = audio.currentTime;
        for (const [offset, frequency, duration, peak, type] of cue) {
          const start = now + offset;
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(peak, start + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start(start);
          oscillator.stop(start + duration + 0.01);
        }
        return true;
      } catch {
        // Audio is optional: a partially failed graph must never interrupt a
        // game interaction or leave scheduled nodes around for a later cue.
        discardContext();
        return false;
      }
    }

    function setEnabled(next) {
      enabled = !!next;
      try { storage?.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* session only */ }
      // Closing rather than suspending cancels scheduled tails and avoids an
      // asynchronous off/on race that can leave an enabled context paused.
      if (!enabled) discardContext();
      return enabled;
    }

    return { isEnabled: () => enabled, setEnabled, play };
  }

  const exports = { CUES, STORAGE_KEY, createMahjongSound };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let storage;
    try { storage = window.localStorage; } catch { /* preference stays in memory */ }
    window.MahjongSound = createMahjongSound({ AudioContextClass, storage });
  }
})();
