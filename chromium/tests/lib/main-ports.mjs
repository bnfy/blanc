// Shipping steps that evaluate in Electron's main process, ported one at a
// time (createAppShim's evaluate in page-shim.mjs). Each port is keyed by the
// SHA-256 of the exact function source shipping passes to app.evaluate, so a
// changed shipping step finds no port and stays undefined instead of running
// a stale one. tests/main-ports.test.mjs checks every key against shipping.
import crypto from 'node:crypto';
import {nativeCall} from './test-driver.mjs';

export const sourceKey = fn => crypto.createHash('sha256').update(String(fn)).digest('hex');

// The function sources a shipping step file passes to ctx.app.evaluate, in
// order: each first argument, up to its top-level comma or closing paren.
export function shippingEvaluations(text) {
  const found = [];
  for (let at = text.indexOf('ctx.app.evaluate('); at >= 0; at = text.indexOf('ctx.app.evaluate(', at + 1)) {
    let i = at + 'ctx.app.evaluate('.length, depth = 0, quote = null;
    const start = i;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
    found.push(text.slice(start, i).trim());
  }
  return found;
}

// Island windows open in this browser (one host document each).
const windows = async fixture => (await fixture.targets())
  .filter(t => t.type === 'page' && t.url === 'chrome://blanc-prototype/host.html').length;

export const PORTS = {
  // Whether a pane's contents hold focus: the host's focused tab.
  'ffe82b57714edbb86a70d42ba87b0e6582b9138abb48ee03d3b4241e44da35a0': async (fixture, state, id) => String((await nativeCall(fixture.host, 'snapshot')).focusedTabId) === String(id),
  // process.platform, for the platform's new-tab modifier.
  '5ab682247983acf33b7a57d5d4aec583451f33be98a23aacabdd3ae0e2485a60': async () => process.platform,
  // test/desktop/steps/http-auth.steps.js (F20), installProbe: Blanc's
  // refusal records each challenge natively (http_auth.h). A credential
  // dialog could only be a new window or a tab-modal one, and with no login
  // delegate Chromium builds neither; windows are still counted.
  '6eff2f86c52908408309a7cd0dfe2815eafd02a22b6043109c9094a3547ca01d': async (fixture, state) => {
    await nativeCall(fixture.host, 'resetAuthChallenges');
    state.authProbe = {windows: await windows(fixture)};
  },
  // readProbe: the challenges since installProbe, as shipping's login events.
  'bd1f99ce463c197760613b7d483716fb162610d2533187ca3367d11f9a77558f': async (fixture, state) => state.authProbe ? {
    logins: await nativeCall(fixture.host, 'authChallenges'),
    windowsCreated: Math.max(0, await windows(fixture) - state.authProbe.windows),
  } : null,
  // The proxy scenario's setup: the fixture's own proxy already fronts every
  // non-loopback page, so it now demands sign-in, as shipping's fixtures
  // server does for absolute-form requests.
  '77d42a707dec9700293a4f304e19fa164d201476106bcf04d0860b88c66f5c1a': async fixture => {
    fixture.proxyAuthRequired = true;
  },
  // Whether the tab uses the session the proxy was set on: a regular tab's
  // contents are the window profile's, which the fixture proxy fronts.
  '51a467af320c6f3451f8662c0e5d29ebf411d8d8ff79cb4af60c205c839f1eea': async (fixture, state, id) => {
    const snapshot = await nativeCall(fixture.host, 'snapshot');
    const tab = snapshot.tabs.find(t => Number(t.id) === Number(id));
    return !!tab && !tab.private;
  },
};
