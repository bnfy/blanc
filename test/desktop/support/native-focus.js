'use strict';

/** Keep desktop acceptance on native focus instead of Playwright's synthetic
 * focus. Chromium 152 can dereference a detached document when an emulation
 * agent restores focus while its frame is being swapped during navigation.
 * Turning the override off while the frame is live also makes blur/background
 * assertions exercise the same focus rules as a person using Blanc.
 *
 * Use public CDP sessions, including after main-frame navigations that replace
 * Playwright's target session. Keep unexpected protocol errors observable;
 * ordinary page closure is the only ignored race. */
async function useNativeFocus(electronApp) {
  const context = electronApp.context();
  const pending = new Set();
  const failures = [];
  const watched = new WeakSet();

  function watch(page) {
    if (watched.has(page)) return;
    watched.add(page);
    let session;
    let queue = Promise.resolve();
    const update = () => {
      const task = queue.then(async () => {
        if (page.isClosed()) return;
        session ??= await context.newCDPSession(page);
        await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      }).catch((error) => {
        if (!page.isClosed()) failures.push(error);
      });
      queue = task;
      pending.add(task);
      void task.finally(() => pending.delete(task));
    };
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) update();
    });
    update();
  }

  context.on('page', watch);
  for (const page of context.pages()) watch(page);
  async function settled() {
    while (pending.size) await Promise.all([...pending]);
    if (failures.length) throw failures[0];
  }
  await settled();
  return settled;
}

module.exports = { useNativeFocus };
