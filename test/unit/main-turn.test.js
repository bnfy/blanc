const assert = require('node:assert/strict');
const test = require('node:test');
const { inMainTurn } = require('../desktop/support/main-turn');

/** A stand-in for Playwright's ElectronApplication: runs the evaluated
 * function in this process, as the main process would. */
function fakeApp(electron) {
  const calls = [];
  return {
    calls,
    evaluate(fn, arg) {
      const record = { ranBeforeReturn: false };
      calls.push(record);
      const result = fn(electron, arg);
      record.ranBeforeReturn = electron.ran;
      return result;
    },
  };
}

test('inMainTurn starts the evaluated function from its own event-loop turn', async () => {
  const electron = { ran: false };
  globalThis.__mainTurnElectron = electron;
  const app = fakeApp(electron);
  try {
    const result = await inMainTurn(app, (modules, value) => {
      modules.ran = true;
      return { value, sameModules: modules === globalThis.__mainTurnElectron };
    }, 42);
    assert.equal(app.calls[0].ranBeforeReturn, false, 'nothing runs inside the dispatching callback');
    assert.equal(electron.ran, true);
    assert.deepEqual(result, { value: 42, sameModules: true });
  } finally {
    delete globalThis.__mainTurnElectron;
  }
});

test('inMainTurn passes an async function\'s result and rejection through', async () => {
  const app = fakeApp({});
  assert.equal(await inMainTurn(app, async (_modules, { a, b }) => a + b, { a: 2, b: 3 }), 5);
  await assert.rejects(inMainTurn(app, async () => { throw new Error('page gone'); }), /page gone/);
});

test('inMainTurn accepts a call without an argument', async () => {
  const app = fakeApp({});
  assert.equal(await inMainTurn(app, (_modules, arg) => arg === undefined), true);
});
