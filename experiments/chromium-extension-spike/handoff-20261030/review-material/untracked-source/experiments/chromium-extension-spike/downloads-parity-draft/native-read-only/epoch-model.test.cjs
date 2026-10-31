'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Model}=require('./epoch-model.cjs');
test('independent regular and private generations',()=>{const m=new Model();assert(m.adopt('regular'));assert(m.adopt('private'));const a=m.capture('regular'),b=m.capture('private');assert(m.current(a)&&m.current(b));m.invalidate('private');assert(m.current(a));assert(!m.current(b))});
test('recreated private context invalidates old leases including same conceptual manager',()=>{const m=new Model();m.adopt('private');const old=m.capture('private');m.invalidate('private');m.adopt('private');assert(!m.current(old));assert(m.current(m.capture('private')))});
test('shutdown denies every lease and adoption',()=>{const m=new Model();m.adopt('regular');m.adopt('private');const a=m.capture('regular'),b=m.capture('private');m.shutdown();assert(!m.current(a)&&!m.current(b));assert.equal(m.adopt('regular'),false)});
test('manager removal during adoption invalidates work',()=>{const m=new Model();assert.equal(m.adopt('private',()=>m.invalidate('private')),false);assert.equal(m.capture('private'),null)});
test('owner shutdown during adoption denies delivery',()=>{const m=new Model();assert.equal(m.adopt('regular',()=>m.shutdown()),false);assert.equal(m.capture('regular'),null)});
test('wrong context and duplicate manager adoption fail',()=>{const m=new Model();assert.equal(m.adopt('guest'),false);assert(m.adopt('regular'));assert.equal(m.adopt('regular'),false)});
test('document-style delayed delivery must recheck after teardown',()=>{const m=new Model();m.adopt('private');const captured=m.capture('private');m.invalidate('private');assert.equal(m.current(captured),false)});

test('profile shutdown start revokes leases before destruction notification',()=>{const m=new Model();m.adopt('regular');m.adopt('private');const a=m.capture('regular'),b=m.capture('private');m.beginOwnerShutdown();assert(!m.current(a)&&!m.current(b));assert.equal(m.adopt('private'),false)});
test('private shutdown start revokes only private lease immediately',()=>{const m=new Model();m.adopt('regular');m.adopt('private');const a=m.capture('regular'),b=m.capture('private');m.beginContextShutdown('private');assert(m.current(a));assert(!m.current(b))});
test('shutdown start during manager adoption does not issue a lease',()=>{const m=new Model();assert.equal(m.adopt('private',()=>m.beginContextShutdown('private')),false);assert.equal(m.capture('private'),null)});
