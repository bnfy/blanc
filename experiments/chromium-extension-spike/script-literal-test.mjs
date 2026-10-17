import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {scriptLiteral} from './script-literal.mjs';
import {authoredResponse} from './fixtures/replay/synthetic/generate.mjs';
test('script literals preserve hostile data without HTML terminators or separators',()=>{
  const values=['</script><script>globalThis.injected=true</script>',`quotes"'\\\n&>\u2028\u2029`,{list:['</ScRiPt>','\\u003c',null,3]}];
  for(const value of values){
    const code=scriptLiteral(value);assert(!/[<>&\u2028\u2029]/.test(code));
    assert.deepEqual(JSON.parse(code),value);
    assert.equal(JSON.stringify(vm.runInNewContext('('+code+')')),JSON.stringify(value));
  }
  assert.throws(()=>scriptLiteral(undefined),TypeError);
});
test('generated response treats hostile ID and child URL only as data',async()=>{
  const id='</script>";globalThis.injected=true;//',url='https://fixture.test/</script>?q="\\\u2028';
  const response=authoredResponse({id,resourceType:'script',descendantUrl:url});
  assert(!response.body.includes('</script>'));
  const calls=[],window={},context={window,fetch:async value=>{calls.push(value);return {ok:true,text:async()=>''};}};
  vm.runInNewContext(response.body,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[url]);assert.deepEqual([...window.blancFixtureExecuted],[id]);
  assert.deepEqual([...window.blancFixtureChildren],[id]);assert.equal(context.injected,undefined);
});
