import {test} from 'node:test';import {strict as assert} from 'node:assert';import fs from 'node:fs';
import {requireOwnedForeground} from './foreground-gate.mjs';
const good={status:'window_unique',frontmost:true,owned_matches:1,birth:[123,456]};
test('only verified foreground singleton with birth passes initial gate',()=>{
 assert.equal(requireOwnedForeground(good,{requireBirth:true}),good);
 for(const sample of [{...good,frontmost:false},{...good,frontmost:null},{...good,status:'window_not_unique'},{...good,owned_matches:2},{...good,birth:null}])assert.throws(()=>requireOwnedForeground(sample,{requireBirth:true}));
});
test('post-click requires foreground and one uniquely owned window',()=>{
 assert.equal(requireOwnedForeground({...good,birth:undefined}).status,'window_unique');
 for(const sample of [null,{...good,frontmost:false},{...good,status:'guard_unavailable'}])assert.throws(()=>requireOwnedForeground(sample));
});
test('fixture does not shadow guard, has before and after checks and no handoff protocol',()=>{
 const source=fs.readFileSync(new URL('../browser-check-groups-owned-foreground-diagnostic.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:const|let|var|function|class)\s+guard\b/);
 assert.match(source,/requireOwnedForeground\(initial,\{requireBirth:true\}\)/);
 assert.match(source,/proof\.foreground\.preClick=publicSample\(check\)/);
 assert.match(source,/requireOwnedForeground\(proof\.foreground\.postClick\)/);
 assert.doesNotMatch(source,/handoff:choose_point|point X Y|activateOwnedFixture/);
});
