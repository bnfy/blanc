// Pure gesture policy. Patterns use U/D/L/R and are device-local settings.
const ACTIONS = Object.freeze({
  back: 'Back', forward: 'Forward', reload: 'Reload', newTab: 'New tab',
  closeTab: 'Close tab', reopenTab: 'Reopen closed tab',
  previousTab: 'Previous tab', nextTab: 'Next tab', island: 'Open Island',
});
const DEFAULT_MAPPING = Object.freeze({ L: 'back', R: 'forward', U: 'newTab', D: 'closeTab' });
const DIRECTIONS = /^[UDLR]{1,3}$/;
const STROKE_PX = 24;

function validMapping(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 16 && entries.every(([pattern, action]) =>
    DIRECTIONS.test(pattern) && !/(UU|DD|LL|RR)/.test(pattern)
    && Object.hasOwn(ACTIONS, action));
}

function mappingOrDefault(value) {
  return validMapping(value) ? { ...value } : { ...DEFAULT_MAPPING };
}

function createRecognizer() {
  let held = false;
  let anchor = null;
  let pattern = '';
  let moved = false;
  let overflow = false;
  const reset = () => { held = false; anchor = null; pattern = ''; moved = false; overflow = false; };
  return {
    start(x, y) { reset(); held = true; anchor = { x, y }; },
    move(x, y) {
      if (!held || !anchor) return false;
      const dx = x - anchor.x; const dy = y - anchor.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < STROKE_PX) return moved;
      const direction = Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
      moved = true;
      if (pattern.at(-1) !== direction) {
        if (pattern.length < 3) pattern += direction;
        else overflow = true;
      }
      anchor = { x, y };
      return true;
    },
    finish() { const result = moved && !overflow ? pattern : ''; reset(); return result; },
    cancel: reset,
    get held() { return held; },
    get moved() { return moved; },
  };
}

module.exports = { ACTIONS, DEFAULT_MAPPING, STROKE_PX, validMapping, mappingOrDefault, createRecognizer };
