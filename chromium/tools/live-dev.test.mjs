// The live dev instance tool may quit only browsers it started itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {LIVE, liveProcesses} from './live-dev.mjs';

test('only main processes of live copies count as live instances', () => {
  const live = `${LIVE}/macos-abc.app/Contents/MacOS/Blanc Prototype`;
  const listing = [
    ` 101 ${live} --user-data-dir=${LIVE}/profile`,
    ` 102 ${LIVE}/macos-abc.app/Contents/Frameworks/Blanc Prototype Framework.framework/Helpers/Blanc Prototype Helper.app/Contents/MacOS/Blanc Prototype Helper --type=renderer`,
    ' 103 /Users/me/Documents/Chromium Preview/artifacts/zoom-verified-158-20261030.app/Contents/MacOS/Blanc Prototype --user-data-dir=/x',
    ' 104 /Applications/Blanc.app/Contents/MacOS/Blanc',
    ` 105 ${path.dirname(LIVE)}/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype`,
  ].join('\n');
  assert.deepEqual(liveProcesses(listing).map(p => p.pid), [101]);
});
