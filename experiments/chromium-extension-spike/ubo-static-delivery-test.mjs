import test from 'node:test';import assert from 'node:assert/strict';
import {createDeliveryBarrier} from './ubo-static-delivery.mjs';
const sender={id:'extension',tab:{id:1},frameId:2,documentId:'document',url:'about:srcdoc',origin:'null'};
test('reload cannot drain until every dispatched document completes',async()=>{
 const b=createDeliveryBarrier(1000),a=b.acquire(sender),other={...sender,documentId:'other'},c=b.acquire(other);let done=false;
 const waiting=b.drain().then(()=>{done=true;});await Promise.resolve();assert(!done);
 assert(b.acknowledge(a,sender));await Promise.resolve();assert(!done);
 assert(b.acknowledge(c,other));await waiting;assert(done);assert.equal(b.size(),0);
});
test('all sender fields bind acknowledgement; replay and guessed tokens fail',()=>{
 const b=createDeliveryBarrier(),token=b.acquire(sender);
 for(const patch of [{id:'page'},{tab:{id:2}},{frameId:3},{documentId:'replacement'},{url:'about:blank'},{origin:'https://other.test'}])assert(!b.acknowledge(token,{...sender,...patch}));
 assert(!b.acknowledge('unknown',sender));assert.equal(b.size(),1);assert(b.acknowledge(token,sender));assert(!b.acknowledge(token,sender));
});
test('lost receiver times out fail closed and remains outstanding on retry',async()=>{
 const b=createDeliveryBarrier(5),token=b.acquire(sender);
 await assert.rejects(b.drain(),/remains held/);assert.equal(b.size(),1);
 await assert.rejects(b.drain(),/remains held/);assert.equal(b.size(),1);
 assert(b.acknowledge(token,sender));await b.drain();
});
test('dispatch bounds memory and tokens are unique',()=>{
 const b=createDeliveryBarrier(),tokens=Array.from({length:64},()=>b.acquire(sender));assert.equal(new Set(tokens).size,64);assert.equal(b.acquire(sender),undefined);
 for(const token of tokens)assert(b.acknowledge(token,sender));assert.equal(b.size(),0);
});

test('destroyed proof is polled; live, unknown and failed queries retain leases',async()=>{
 const b=createDeliveryBarrier(10),token=b.acquire(sender);let asked;
 await assert.rejects(b.drain(async id=>{asked=id;return false;}),/remains held/);assert.equal(asked,sender.documentId);assert.equal(b.size(),1);
 await assert.rejects(b.drain(async()=>{throw Error('unreachable');}),/remains held/);assert.equal(b.size(),1);
 await b.drain(async()=>true);assert.equal(b.size(),0);assert(!b.acknowledge(token,sender));
});
test('late lifetime response after timeout cannot silently retire a lease',async()=>{
 const b=createDeliveryBarrier(5);b.acquire(sender);let resolve;
 await assert.rejects(b.drain(()=>new Promise(r=>{resolve=r;})),/remains held/);resolve(true);await new Promise(r=>setImmediate(r));assert.equal(b.size(),1);
});
