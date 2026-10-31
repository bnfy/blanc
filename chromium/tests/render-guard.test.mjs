import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {assertRendering,FRAME_PROBE} from './lib/render-guard.mjs';
const run=frames=>expression=>vm.runInNewContext(expression,{setTimeout,clearTimeout,requestAnimationFrame:frames?cb=>setTimeout(cb,1):()=>{}});
test('stops the run when the browser gets no animation frames',async()=>{
 assert.equal(await run(true)(FRAME_PROBE(50)),true);
 await assertRendering(run(true),{timeout:50});
 await assert.rejects(()=>assertRendering(run(false),{timeout:50}),e=>e.code==='BLANC_ENVIRONMENT_STOP'&&/no animation frame/.test(e.message));
});
