import test from 'node:test';
import assert from 'node:assert/strict';
import {cdpMouse,cdpKey} from './adapters/island.mjs';
test('Electron mouse input maps to CDP mouse events at a frame offset',()=>{
 assert.deepEqual(cdpMouse({type:'mouseMove',x:10,y:20},{x:5,y:7}),{type:'mouseMoved',x:15,y:27,button:'none',clickCount:0});
 assert.deepEqual(cdpMouse({type:'mouseDown',x:1,y:2}),{type:'mousePressed',x:1,y:2,button:'left',clickCount:1});
 assert.throws(()=>cdpMouse({type:'mouseWheel'}),e=>e.code==='BLANC_ADAPTER_UNDEFINED');
});
test('Electron key input maps to CDP key events',()=>{
 assert.deepEqual(cdpKey({type:'keyDown',keyCode:'a'}),{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
 assert.equal(cdpKey({type:'char',keyCode:'g'}).text,'g');
 assert.throws(()=>cdpKey({type:'keyDown',keyCode:'Enter'}),e=>e.code==='BLANC_ADAPTER_UNDEFINED');
});
