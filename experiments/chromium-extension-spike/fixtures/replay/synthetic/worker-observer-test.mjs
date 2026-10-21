import {test} from 'node:test';import assert from 'node:assert/strict';
import {detachedSetup} from './worker-observer.mjs';
test('only exact observed session disappearance is a lifecycle interruption',()=>{
 const events=[{method:'Target.detachedFromTarget',params:{sessionId:'failed-target'}}];
 assert(detachedSetup({code:-32001,sessionId:'failed-target'},events));
 assert(!detachedSetup({code:-32001,sessionId:'live-target'},events));
 assert(!detachedSetup({code:-32000,sessionId:'failed-target'},events));
 assert(detachedSetup({code:-32000,protocolMessage:'Inspected target navigated or closed',sessionId:'failed-target'},events));
 assert(!detachedSetup({code:-32000,protocolMessage:'Permission denied',sessionId:'failed-target'},events));
 assert(!detachedSetup({code:-32001},events));
 assert(!detachedSetup({code:-32001,sessionId:'failed-target'},[]));
});
