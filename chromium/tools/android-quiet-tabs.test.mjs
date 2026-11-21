// The Quiet Tabs check (tests/android/quiet-tabs.mjs) counts open pages from DevTools.
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderers} from '../tests/android/quiet-tabs.mjs';

test('only Blanc\'s renderer processes count', () => {
  const ps = ['u0_i1 5071 4916 S me.bnfy.blanc.dev:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0',
    'u0_a216 5096 489 S me.bnfy.blanc.dev:privileged_process0',
    'u0_i9 6000 4916 S com.android.chrome:sandboxed_process0'].join('\n');
  assert.equal(renderers(ps), 1);
});
