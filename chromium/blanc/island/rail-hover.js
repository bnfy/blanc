'use strict';

// Hover previews in the vertical tab rail (fork-only; design
// docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md).
// Resting on a tab row shows a picture card beside the rail; resting on a
// collapsed group's header shows a list card, whose rows show the picture
// card beside it. Once a card is up, the next row's card replaces it at once.
//
// Pure policy, no DOM, no timers and no application data: host.js owns the
// events, the timers and the cards; the unit tests load this file directly.
(function (root) {
  /** How long the pointer (or keyboard focus) rests on a row before a card opens, in ms. */
  const OPEN_DELAY_MS = 500;
  /** How long the cards stay after the pointer leaves the rail or the list, in ms. */
  const LEAVE_GRACE_MS = 150;

  const sameTarget = (a, b) => !!a && !!b && a.kind === b.kind &&
    a.tabId === b.tabId && a.splitId === b.splitId && a.groupId === b.groupId && !!a.inList === !!b.inList;
  const cardFor = target => target.kind === 'group' ? 'list' : 'picture';

  function freeze(state) {
    return Object.freeze({phase: 'idle', target: null, list: null, row: null, pending: null, ...state});
  }
  function initialState() { return freeze({}); }
  const result = (state, effects = []) => ({state: freeze(state), effects});
  const IDLE = () => result({}, [{type: 'cancel-timers'}, {type: 'hide', card: 'all'}]);

  // A rail row (tab, split or group) was entered or focused.
  function enter(state, target) {
    const up = state.phase === 'shown' || state.phase === 'leaving';
    // The same row again (Blink repeats a pointerover after each redraw)
    // keeps the running wait, so a busy tab's card still opens.
    if (state.phase === 'waiting' && sameTarget(state.target, target)) return result(state);
    if (!up) {
      return result({phase: 'waiting', target, pending: target},
        [{type: 'cancel-timers'}, {type: 'start-timer', ms: OPEN_DELAY_MS}]);
    }
    if (sameTarget(state.target, target)) return result({...state, phase: 'shown', pending: null}, [{type: 'cancel-timers'}]);
    // A card is up: swap at once. The other card goes, so a list and a
    // rail tab's picture never show together.
    const effects = [{type: 'cancel-timers'}];
    const card = cardFor(target);
    if (card === 'picture' && state.list) effects.push({type: 'hide', card: 'list'});
    if (card === 'list' && (state.row || !state.list)) effects.push({type: 'hide', card: 'picture'});
    effects.push({type: 'show', card, target});
    return result({phase: 'shown', target, list: card === 'list' ? target : null}, effects);
  }

  function step(state, event) {
    switch (event?.type) {
      case 'enter':
      case 'focus':
        return enter(state, event.target);
      case 'timer': {
        if (!state.pending) return result(state);
        if (state.phase === 'waiting') {
          const card = cardFor(state.pending);
          return result({phase: 'shown', target: state.pending, list: card === 'list' ? state.pending : null},
            [{type: 'show', card, target: state.pending}]);
        }
        // A list row's first picture.
        if (state.list && state.pending.inList) {
          return result({...state, row: state.pending, pending: null},
            [{type: 'show', card: 'picture', target: state.pending}]);
        }
        return result({...state, pending: null});
      }
      case 'leave-rail':
      case 'leave-list':
      case 'leave-row': // the rail's other parts: its edges, buttons, an open group's header
        if (state.phase === 'waiting') return result({}, [{type: 'cancel-timers'}]);
        if (state.phase !== 'shown') return result(state);
        // A pending list-row picture is dropped with the timer it was waiting on.
        return result({...state, phase: 'leaving', pending: null},
          [{type: 'cancel-timers'}, {type: 'start-grace', ms: LEAVE_GRACE_MS}]);
      case 'enter-list':
        if (!state.list || state.phase === 'idle') return result(state);
        return result({...state, phase: 'shown'}, [{type: 'cancel-timers'}]);
      case 'enter-row': {
        if (!state.list || !event.target) return result(state);
        const target = {...event.target, inList: true};
        if (sameTarget(state.row, target)) return result({...state, phase: 'shown', pending: null}, [{type: 'cancel-timers'}]);
        if (state.row) {
          return result({...state, phase: 'shown', row: target, pending: null},
            [{type: 'cancel-timers'}, {type: 'show', card: 'picture', target}]);
        }
        return result({...state, phase: 'shown', pending: target},
          [{type: 'cancel-timers'}, {type: 'start-timer', ms: OPEN_DELAY_MS}]);
      }
      case 'grace':
        return state.phase === 'leaving' ? IDLE() : result(state);
      case 'dismiss':
        return IDLE();
      default:
        return result(state);
    }
  }

  const ROW_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
  /**
   * A key pressed in the strip while a card is up or opening: the rail's row
   * keys move its focus (which swaps the card); Escape is taken only from a
   * card on screen; anything else closes it and goes on as usual.
   */
  function keyAction(key, {onRow = false, cardUp = false} = {}) {
    if (onRow && ROW_KEYS.includes(key)) return 'keep';
    if (key === 'Escape' && cardUp) return 'swallow';
    return 'dismiss';
  }
  /** Rows get focus from redraws too; only focus that follows a key press opens a card. */
  const KEY_FOCUS_MS = 500;
  function keyboardFocus(lastKeyAt, now) {
    return Number.isFinite(lastKeyAt) && now >= lastKeyAt && now - lastKeyAt <= KEY_FOCUS_MS;
  }

  /** What a card may show for a tab: never a private tab's picture, never the page already in view. */
  function pictureFor(tab, {activeTabId = null, visibleTabIds = []} = {}) {
    if (!tab) return 'none';
    if (tab.private) return 'private';
    const url = String(tab.url ?? '');
    if (url.startsWith('blanc://') || url.startsWith('chrome://')) return 'page';
    if (tab.id === activeTabId || visibleTabIds.includes(tab.id)) return 'none';
    if (tab.asleep) return 'quiet';
    return 'live';
  }

  /** An open group already lists its tabs in the rail; only a collapsed one gets a card. */
  function groupCardFor(group) { return !!group?.collapsed; }

  function suppressed({layout, glanceOpen, surfaceOpen, dragging, railHidden} = {}) {
    return layout !== 'vertical' || !!glanceOpen || !!surfaceOpen || !!dragging || !!railHidden;
  }

  root.BlancRailHover = Object.freeze({OPEN_DELAY_MS, LEAVE_GRACE_MS, initialState, step, keyAction, keyboardFocus, pictureFor, groupCardFor, suppressed});
})(typeof self !== 'undefined' ? self : globalThis);
