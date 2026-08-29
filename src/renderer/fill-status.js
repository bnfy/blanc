'use strict';

// The fill capsule renders fixed-kind messages only. The payload carries
// {kind, mode, requestId} and nothing else; every string below comes from
// the bundled copy table. No page-, vault-, or account-derived data can
// reach this document, and the only thing it ever sends back is
// {requestId, verb}.
(() => {
  const copyTable = window.blancFillCopy?.FILL_COPY ?? {};
  // Level is presentation-only: it picks the live-region role and the
  // auto-dismiss timer. Success kinds are the title-only confirmations.
  const SUCCESS_KINDS = new Set(['filled']);
  const SUCCESS_DISMISS_MS = 4000;

  const decisionEl = document.getElementById('fillDecision');
  const decisionTitle = document.getElementById('fillDecisionTitle');
  const decisionBody = document.getElementById('fillDecisionBody');
  const primaryBtn = document.getElementById('fillPrimaryBtn');
  const cancelBtn = document.getElementById('fillCancelBtn');
  const noticeEl = document.getElementById('fillNotice');
  const noticeTitle = document.getElementById('fillNoticeTitle');
  const noticeBody = document.getElementById('fillNoticeBody');
  const noticeDismiss = document.getElementById('fillNoticeDismiss');
  const liveEl = document.getElementById('fillLive');

  let current = null; // { requestId, mode, kind, primaryVerb }
  let dismissTimer = null;
  let dismissRemaining = 0;
  let dismissStartedAt = 0;

  const clearDismissTimer = () => {
    if (dismissTimer !== null) clearTimeout(dismissTimer);
    dismissTimer = null;
  };

  const hideAll = () => {
    clearDismissTimer();
    decisionEl.hidden = true;
    noticeEl.hidden = true;
    // Deliberately NOT clearing the live region here: announcement lifetime
    // is independent of visual lifetime, and an early reply or fill:hide
    // must not retract an alert assistive tech hasn't consumed yet. The
    // next announcement overwrites it (the element is sr-only regardless).
    current = null;
  };

  const reply = (verb) => {
    if (!current) return;
    const { requestId } = current;
    hideAll();
    window.blancFillStatus.reply({ requestId, verb });
  };

  const startDismissTimer = (ms) => {
    clearDismissTimer();
    dismissRemaining = ms;
    dismissStartedAt = Date.now();
    dismissTimer = setTimeout(() => reply('dismiss'), ms);
  };

  // Hover and focus pause the success timer independently; it resumes only
  // when NEITHER holds (e.g. focusing the dismiss button while hovering,
  // then moving the pointer away, must stay paused).
  let noticeHovered = false;
  let noticeFocused = false;

  const pauseDismissTimer = () => {
    if (dismissTimer === null) return;
    dismissRemaining = Math.max(0, dismissRemaining - (Date.now() - dismissStartedAt));
    clearDismissTimer();
    dismissTimer = null;
  };

  const resumeDismissTimer = () => {
    if (noticeHovered || noticeFocused) return;
    if (!current || current.mode !== 'notice' || !SUCCESS_KINDS.has(current.kind)) return;
    if (dismissTimer !== null) return;
    startDismissTimer(Math.max(250, dismissRemaining));
  };

  const showDecision = (kind, requestId, entry) => {
    decisionTitle.textContent = entry.title;
    decisionBody.textContent = entry.body;
    primaryBtn.textContent = entry.primaryLabel;
    cancelBtn.textContent = entry.cancelLabel;
    decisionEl.setAttribute('aria-label', entry.title);
    current = { requestId, mode: 'decision', kind };
    decisionEl.hidden = false;
    // Cancel is always the safe default focus target — Enter must never
    // reach the primary action unless the user deliberately moved focus.
    cancelBtn.focus();
  };

  const showNotice = (kind, requestId, entry) => {
    const success = SUCCESS_KINDS.has(kind);
    noticeTitle.textContent = entry.title;
    noticeBody.textContent = entry.body;
    noticeBody.hidden = !entry.body;
    noticeEl.classList.toggle('fill-success', success);
    // Set the live region before unhiding so it announces exactly once,
    // independent of how long the notice stays visible.
    liveEl.setAttribute('role', success ? 'status' : 'alert');
    liveEl.textContent = entry.body ? `${entry.title} ${entry.body}` : entry.title;
    current = { requestId, mode: 'notice', kind };
    noticeEl.hidden = false;
    if (success) {
      dismissRemaining = SUCCESS_DISMISS_MS;
      // Appearing under an already-hovering pointer or held focus starts
      // paused; resumeDismissTimer picks it up when both conditions clear.
      if (!noticeHovered && !noticeFocused) startDismissTimer(SUCCESS_DISMISS_MS);
    }
  };

  window.blancFillStatus.onShow(({ kind, mode, requestId } = {}) => {
    if (!Number.isSafeInteger(requestId) || requestId < 1) return;
    // Replay dedupe: the surface may resend the active request after a
    // slow load; re-rendering would steal focus and restart timers.
    if (current && current.requestId === requestId) return;
    hideAll();
    const entry = copyTable[kind];
    if (!entry || (mode !== 'decision' && mode !== 'notice')) {
      // Defensive: an unknown kind renders nothing and closes the request.
      window.blancFillStatus.reply({ requestId, verb: 'dismiss' });
      return;
    }
    if (mode === 'decision') showDecision(kind, requestId, entry);
    else showNotice(kind, requestId, entry);
  });

  window.blancFillStatus.onHide(({ requestId } = {}) => {
    if (current && current.requestId === requestId) hideAll();
  });

  primaryBtn.addEventListener('click', () => {
    if (current?.mode === 'decision') {
      const verb = current.kind === 'confirm-heuristic' ? 'fill' : 'open-settings';
      reply(verb);
    }
  });
  cancelBtn.addEventListener('click', () => { if (current?.mode === 'decision') reply('cancel'); });
  noticeDismiss.addEventListener('click', () => { if (current?.mode === 'notice') reply('dismiss'); });

  noticeEl.addEventListener('mouseenter', () => { noticeHovered = true; pauseDismissTimer(); });
  noticeEl.addEventListener('mouseleave', () => { noticeHovered = false; resumeDismissTimer(); });
  noticeEl.addEventListener('focusin', () => { noticeFocused = true; pauseDismissTimer(); });
  noticeEl.addEventListener('focusout', (event) => {
    // focusout fires even when focus moves within the notice; only a true
    // exit clears the hold.
    if (noticeEl.contains(event.relatedTarget)) return;
    noticeFocused = false;
    resumeDismissTimer();
  });

  document.addEventListener('keydown', (event) => {
    if (!current) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      reply(current.mode === 'decision' ? 'cancel' : 'dismiss');
      return;
    }
    // Two-button focus trap: Tab and Shift-Tab cycle Cancel <-> primary.
    // Enter/Space stay native — they activate only the focused button.
    if (current.mode === 'decision' && event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === cancelBtn ? primaryBtn : cancelBtn).focus();
    }
  });
})();
