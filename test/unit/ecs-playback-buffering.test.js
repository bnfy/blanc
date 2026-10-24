'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('native DRM sampling waits for buffered media and retains the advancement/error gates',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../desktop/ecs-production-drm-smoke.mjs'),'utf8');
  assert.match(source,/bufferedAhead >= 6/);
  assert(source.indexOf('six seconds of protected playback buffered')<source.indexOf('report.first = await sample()'));
  assert.match(source,/assert\(report.second.time - report.first.time > 2\)/);
  assert.match(source,/assert.equal\(report.mediaErrors.length, 0\)/);
  assert.match(source,/assert.equal\(report.first.muted, false\)/);
  assert.match(source,/assert.equal\(report.second.muted, false\)/);
  assert.match(source,/report.first.volume > 0 && report.second.volume > 0/);
  assert.match(source,/report.hostAudio/);
  assert.doesNotMatch(source.slice(0,source.indexOf('report.failure =')),/video.muted\s*=|disable-audio/);
  assert.doesNotMatch(source.slice(source.indexOf('report.failure =')),/report.passed = true/);
});
