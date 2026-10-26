'use strict';
async function browserStartupReady(app) {
  const page = app.pages().find(p => !p.isClosed() && p.url() === 'blanc://newtab/');
  if (!page) return false;
  try {
    return await page.evaluate(async () => (await window.bowserPages?.start.data())?.startup?.phase) === 'ready';
  } catch (error) {
    // Session restoration may replace the initial new-tab WebContents.
    // Retry that lifecycle event only; programming errors must still fail.
    if (/Target page, context or browser has been closed|Execution context was destroyed/.test(error.message)) return false;
    throw error;
  }
}
module.exports = { browserStartupReady };
