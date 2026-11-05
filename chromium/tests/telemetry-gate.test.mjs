// The preview must never send telemetry (owner, 2026-11-04). The only thing
// that opens the gate is a Blanc release version, and today only a test flag
// supplies one. When a release channel arrives, it changes this test on
// purpose.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=name=>fs.readFileSync(new URL(`../blanc/browser/ui/${name}`,import.meta.url),'utf8');
const body=(source,start)=>{const from=source.indexOf(start);assert.notEqual(from,-1,start);return source.slice(from,source.indexOf('\n}\n',from));};

test('only a test flag gives the preview a release version',()=>{
 const version=body(read('first_run.inc'),'std::string BlancReleaseVersion()');
 assert.match(version,/HasSwitch\("blanc-test"\)\) return command_line->GetSwitchValueASCII\("blanc-test-version"\);\n  return std::string\(\);/);
});
test('sending and minting an install id wait for the gate',()=>{
 const source=read('telemetry.inc');
 assert.match(body(source,'bool TelemetryAllowed()'),/!BlancReleaseVersion\(\)\.empty\(\) && !FirstRunPending\(\)/);
 const post=body(source,'bool TelemetryPost(');
 assert.ok(post.indexOf('TelemetryAllowed()')<post.indexOf('TelemetryPayload()'),'the payload mints the id, so the gate comes first');
 assert.match(body(source,'bool TelemetryEmitDayOne('),/if \(!TelemetryAllowed\(\)\) return false;\n  base::DictValue install = TelemetryInstall\(\);/);
 assert.match(body(source,'void TelemetryCheckDefault()'),/if \(!TelemetryAllowed\(\)\) return;\n  const base::DictValue install = TelemetryInstall\(\);/);
});
test('the collector host can only move under the test flag',()=>{
 assert.match(body(read('telemetry.inc'),'std::string TelemetryTestHost()'),/HasSwitch\("blanc-test"\)\s+\? command_line->GetSwitchValueASCII\("blanc-test-telemetry-host"\) : std::string\(\)/);
});
