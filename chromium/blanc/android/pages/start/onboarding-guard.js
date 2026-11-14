'use strict';
// The shipping tour requires actual persisted privacy consent, imports, default
// browser, blocker, archive and theme APIs. Never expose it with fake stubs.
(() => {
  const onboarding = window.blancOnboarding;
  if (!onboarding || typeof onboarding.maybeShow !== 'function') return;
  const show = onboarding.maybeShow;
  onboarding.maybeShow = (...args) => {
    const start = window.bowserPages?.start;
    const bookmarks = window.bowserPages?.bookmarks;
    const methods = ['onboardingSet', 'completePrivacy', 'defaultBrowser',
      'setDefaultBrowser', 'layoutUsed'];
    if (start?.onboardingReady !== true ||
        !methods.every(name => typeof start[name] === 'function') ||
        !['browserSources', 'import', 'importBrowser'].every(name => typeof bookmarks?.[name] === 'function')) return;
    return show(...args);
  };
})();
