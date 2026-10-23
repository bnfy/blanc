'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('production updater qualification uses normal prompts and automatic successor playback',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../desktop/ecs-production-updater-linux.mjs'),'utf8');
  assert.match(source,/BLANC_ECS_UPDATER_QUALIFICATION/);
  assert.match(source,/const install=path.join\(root,'blanc'\)/);
  assert.match(source,/exact renamed image replacement/);
  assert.match(source,/automatic ECS successor/);
  assert.match(source,/inspectLinuxCdm\(successor.pid\)/);
  assert.match(source,/result.encryptedEvents>0/);
  assert.match(source,/preinstalledCdm:true/);
  assert.match(source,/looseInstallationsUnavailable=true/);
  assert.doesNotMatch(source,/\bHOME:\s*|--no-sandbox|\.quitAndInstall\(|BLANC_TEST:\s*'1'/);
});
test('production updater CI never publishes candidates or uses signing credentials',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../.github/workflows/linux-update-rehearsal.yml'),'utf8');
  const job=source.slice(source.indexOf('  ecs-production-rehearse:'),source.indexOf('\n  rehearse:'));
  assert.match(job,/contents: read/);
  assert.match(job,/github.event_name == 'workflow_dispatch'/);
  assert.match(job,/npm version "\$VERSION" --no-git-tag-version/);
  assert.match(job,/ecs-production-updater-linux.mjs/);
  assert.match(job,/path: output\/ecs-production\/\*.json/);
  assert.doesNotMatch(job,/gh release (create|upload|edit)|secrets\.|--publish always/);
});
