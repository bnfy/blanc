import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {EventEmitter} from 'node:events';
import {parsePoint,boundedLine} from './protocol.mjs';
test('point parser rejects malformed and out of bound coordinates',()=>{
 assert.deepEqual(parsePoint('point 20 100'),[20,100]);
 for(const s of ['resume','point NaN 2','point 100001 0','point 1 2 extra'])assert.throws(()=>parsePoint(s));
});
test('handoff waits only through deadline and cleans listeners',async()=>{
 const r=new EventEmitter();await assert.rejects(boundedLine(r,Date.now()+5),e=>e.code==='handoff_timeout');assert.equal(r.listenerCount('line'),0);assert.equal(r.listenerCount('close'),0);
});
test('bounded line accepts a single line and rejects closed input',async()=>{
 const r=new EventEmitter(),p=boundedLine(r,Date.now()+100);r.emit('line','resume');assert.equal(await p,'resume');
 const q=boundedLine(r,Date.now()+100);r.emit('close');await assert.rejects(q,e=>e.code==='handoff_input_closed');
});
