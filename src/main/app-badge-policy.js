'use strict';

const BADGE_GUARD_INTERVAL_MS = 100;

function installBadgeApiPolicy(targetSession, filePath) {
  return targetSession.registerPreloadScript({
    type: 'frame',
    filePath,
  });
}

function clearApplicationBadge(app, { platform = process.platform } = {}) {
  if (platform === 'darwin' && typeof app?.dock?.setBadge === 'function') {
    app.dock.setBadge('');
    return true;
  }
  if (platform === 'linux' && typeof app?.setBadgeCount === 'function') {
    app.setBadgeCount(0);
    return true;
  }
  return false;
}

function applicationBadgeIsVisible(app, { platform = process.platform } = {}) {
  if (platform === 'darwin' && typeof app?.dock?.getBadge === 'function') {
    return app.dock.getBadge() !== '';
  }
  if (platform === 'linux' && typeof app?.getBadgeCount === 'function') {
    return app.getBadgeCount() > 0;
  }
  return false;
}

function startApplicationBadgeGuard(app, {
  platform = process.platform,
  intervalMs = BADGE_GUARD_INTERVAL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const supported = clearApplicationBadge(app, { platform });
  if (!supported) {
    return { active: false, stop: () => {} };
  }

  const clearUnexpectedBadge = () => {
    if (applicationBadgeIsVisible(app, { platform })) {
      clearApplicationBadge(app, { platform });
    }
  };
  const timer = setIntervalFn(clearUnexpectedBadge, intervalMs);
  timer?.unref?.();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
  };
  app.once?.('will-quit', stop);
  return { active: true, stop, clearUnexpectedBadge };
}

module.exports = {
  BADGE_GUARD_INTERVAL_MS,
  installBadgeApiPolicy,
  clearApplicationBadge,
  applicationBadgeIsVisible,
  startApplicationBadgeGuard,
};
