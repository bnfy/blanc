import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-trust-receipt-'));
const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
void _ignored;
const app = await _electron.launch({
  args: [path.resolve('.'), `--user-data-dir=${profile}`],
  env: { ...cleanEnv, BLANC_TEST: '1' },
});

async function waitFor(read, accept, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
}

try {
  await app.firstWindow();
  await waitFor(
    () => app.evaluate(() => !!globalThis.__blanc?.startupReady?.()),
    Boolean,
    'startup',
  );
  await app.evaluate(() => globalThis.__blanc.openSettings());
  const receipt = await waitFor(
    () => app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://settings/'));
      if (!wc) return null;
      return wc.executeJavaScript('window.bowserPages?.settings?.trustReceipt?.()');
    }),
    (value) => value?.app?.version === '1.21.0',
    'trust receipt',
  );
  assert.equal(receipt.app.packaged, false);
  assert.equal(receipt.signature.status, 'development');
  assert.deepEqual(receipt.blocker.lists.map((list) => list.name), ['easylist', 'easyprivacy']);
  assert.equal(receipt.choices.crashLedger.automaticUpload, false);
  assert.doesNotMatch(JSON.stringify(receipt), /accountId|protectedKey|passphrase|secureDnsTemplate/);

  const rendered = await waitFor(
    () => app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://settings/'));
      return wc?.executeJavaScript(`({
        status: document.getElementById('trustReceiptStatus')?.textContent,
        facts: document.getElementById('trustReceiptList')?.textContent,
        links: [...document.querySelectorAll('#trustReceiptLinks button')].map((button) => button.textContent),
      })`) ?? null;
    }),
    (value) => value?.status === 'Receipt checked locally.',
    'rendered receipt',
  );
  assert.match(rendered.facts, /Development build — not a signed release build/);
  assert.match(rendered.facts, /Blocker · easylist/);
  assert.match(rendered.facts, new RegExp(receipt.blocker.lists[0].sha256));
  assert.match(rendered.facts, /Combined blocker digest/);
  assert.match(rendered.facts, /automatic upload off/);
  assert.deepEqual(rendered.links, ['Matching release', 'Verification guide', 'Release SBOM', 'Provenance attestations']);
  assert.doesNotMatch(rendered.facts, /security score|secure badge|anonymous/i);
  if (process.env.BLANC_CAPTURE_TRUST === '1') {
    const png = await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://settings/'));
      await wc.executeJavaScript(`(async () => {
        document.querySelector('a[data-group="trust"]').click();
        await new Promise((resolve) => setTimeout(resolve, 900));
      })()`);
      return (await wc.capturePage()).toPNG().toString('base64');
    });
    fs.mkdirSync('output/playwright', { recursive: true });
    fs.writeFileSync('output/playwright/trust-receipt.png', Buffer.from(png, 'base64'));
  }
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
