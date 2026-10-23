'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('temporary fresh signed Mac intake job, inputs and draft access are removed', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/ublock-origin.yml'), 'utf8');
  assert.doesNotMatch(workflow, /ecs_fresh_mac|ecs-fresh-mac:|ecs-private-mac-fd8654147|BLANC_ECS_ALLOW_NATIVE_AUDIO_PROMPT|contents: write/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
});
test('owner-approved Intel audio permission is confined to system dialogs and fixed tests',()=>{
  const wrapper=fs.readFileSync('test/desktop/support/run-with-mac-audio-permission.mjs','utf8');
  const script=fs.readFileSync('test/desktop/support/approve-mac-audio-dialog.applescript','utf8');
  assert.match(wrapper,/process\.arch,'x64'/);assert.match(wrapper,/process\.env\.GITHUB_ACTIONS,'true'/);
  assert.match(wrapper,/process\.env\.BLANC_ECS_ALLOW_NATIVE_AUDIO_PROMPT,'1'/);
  assert.match(wrapper,/only the fixed qualification scripts may run/);
  assert.match(script,/application processes whose bundle identifier/);
  assert.match(script,/promptText contains "Blanc" and promptText contains "microphone"/);
  assert.match(script,/denyCount is 1/);assert.match(script,/\(count of candidates\) is not 1/);
  assert.doesNotMatch(wrapper+script,/sqlite3|tccutil|killall|launchctl|chmod|codesign/);
});
