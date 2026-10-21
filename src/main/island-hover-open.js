'use strict';

const HOVER_OPEN_DWELL_MS = 300;

function initialHoverState() {
  return Object.freeze({ inside: false, armed: true, dwelling: false });
}

function pointInRect(point, rect) {
  return !!point && !!rect && rect.width > 0 && rect.height > 0 &&
    point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
}

function result(inside, armed, dwelling, effect = null) {
  return { state: Object.freeze({ inside, armed, dwelling }), effect };
}

function hoverStep(state, event) {
  if (event.type === 'ineligible') {
    return result(state.inside, false, false, state.dwelling ? 'cancel' : null);
  }
  if (event.type === 'fired') {
    if (state.dwelling && state.inside) return result(true, false, false, 'open');
    return result(state.inside, state.armed, false);
  }
  if (event.type !== 'move') return result(state.inside, state.armed, state.dwelling);

  if (!event.inside) {
    return result(false, true, false, state.dwelling ? 'cancel' : null);
  }
  if (!state.inside) {
    if (event.sampled || !event.eligible || event.buttonsDown) return result(true, false, false);
    if (state.armed) return result(true, true, true, 'start');
    return result(true, false, false);
  }
  if (state.dwelling && (!event.eligible || event.buttonsDown)) {
    return result(true, false, false, 'cancel');
  }
  return result(true, state.armed, state.dwelling);
}

module.exports = { HOVER_OPEN_DWELL_MS, initialHoverState, pointInRect, hoverStep };
