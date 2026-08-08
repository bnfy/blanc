import { createRequire } from 'node:module';
const require = createRequire('/Users/anthonyjloria/Projects/Blanc Browser/');
const { _electron } = require('playwright');

const app = await _electron.launch({
  args: ['/Users/anthonyjloria/Projects/Blanc Browser', '--user-data-dir=/tmp/blanc-dump'],
  env: { ...process.env, BLANC_TEST: '1', BLANC_GLASS: '1' },
});
await app.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (globalThis.__blanc) { clearInterval(t); r(); } }, 50);
}));
await new Promise((r) => setTimeout(r, 3000));

const tree = await app.evaluate(({ BrowserWindow }) =>
  globalThis.__glass
    ? globalThis.__glass.describe(BrowserWindow.getAllWindows()[0])
    : ['__glass missing']);
console.log(tree.join('\n'));
await app.close();
