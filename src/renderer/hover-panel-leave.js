'use strict';

// A panel opened by resting on the Island (hover-open) closes again once the
// pointer has left it, unless it has been used. While any panel is open its
// overlay covers the strip and the strip stops dragging the window, so a
// panel left open by a passing pointer would swallow the next grab.
//
// Pure policy, no IPC and no application data: overlay.js owns the DOM events
// and the timer; the unit tests load this file directly.
(function () {
  /** How long the pointer may stay off the panel before it closes, in ms. */
  const LEAVE_GRACE_MS = 200;
  /** How far outside the panel card the pointer still counts as on it, in px. */
  const CARD_SLACK_PX = 8;

  function initialLeaveState() {
    return Object.freeze({ watching: false, outside: false });
  }

  function result(watching, outside, effect = null) {
    return { state: Object.freeze({ watching, outside }), effect };
  }

  /** Whether a point (overlay coordinates) is on the card or within its slack. */
  function pointNearCard(point, card, slack = CARD_SLACK_PX) {
    if (!point || !card || !(card.right > card.left) || !(card.bottom > card.top)) return false;
    return point.x >= card.left - slack && point.x <= card.right + slack &&
      point.y >= card.top - slack && point.y <= card.bottom + slack;
  }

  /**
   * Events: open {hoverOpened}, move {inside}, exit (the pointer left the
   * overlay view), interact (typing, or a press or scroll on the card), fired
   * (the grace timer ran out) and close (the overlay closed any other way).
   * Effects: 'start' and 'cancel' the grace timer, or 'close' the panel.
   */
  function leaveStep(state, event) {
    const pending = state.watching && state.outside;
    switch (event.type) {
      case 'open':
        return result(event.hoverOpened === true, false, pending ? 'cancel' : null);
      case 'interact':
      case 'close':
        return result(false, false, pending ? 'cancel' : null);
      case 'move':
      case 'exit': {
        if (!state.watching) return result(false, false);
        const inside = event.type === 'move' && event.inside === true;
        if (inside) return result(true, false, pending ? 'cancel' : null);
        return result(true, true, pending ? null : 'start');
      }
      case 'fired':
        if (pending) return result(false, false, 'close');
        return result(state.watching, state.outside);
      default:
        return result(state.watching, state.outside);
    }
  }

  const api = { LEAVE_GRACE_MS, CARD_SLACK_PX, initialLeaveState, pointNearCard, leaveStep };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.blancHoverPanelLeave = api;
})();
