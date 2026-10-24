'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../../scripts/ci-intel-apple-tickets.sh');
test('Apple ticket workaround cannot run on a developer host',()=>{
 const result=spawnSync('bash',[script,'/Applications/Blanc.app'],{env:{...process.env,GITHUB_ACTIONS:'false'},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/restricted to disposable Intel CI/);
});
test('ticket validation preserves TLS and cleans only its own filter anchor and reference',()=>{
 const source=fs.readFileSync(script,'utf8');
 assert.match(source,/block return out quick proto udp/);
 assert.match(source,/pfctl -a "\$ECS_TICKET_ANCHOR" -F rules/);
 assert.match(source,/pfctl -X "\$ECS_TICKET_TOKEN"/);
 assert.match(source,/xcrun stapler validate/);assert.match(source,/spctl --assess/);
 assert.doesNotMatch(source,/pfctl -f|pfctl -d|curl -k|--insecure/);
});
