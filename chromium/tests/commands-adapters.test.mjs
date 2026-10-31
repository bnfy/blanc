import test from 'node:test';
import assert from 'node:assert/strict';
import {engineOfUrl,submissionOf} from './adapters/commands.mjs';
test('engineOfUrl names only a known provider prefix',()=>{
 assert.equal(engineOfUrl('https://duckduckgo.com/?q=a'),'duckduckgo');
 assert.equal(engineOfUrl('https://www.google.com/search?q=a'),'google');
 assert.equal(engineOfUrl('https://search.brave.com/search?q=a'),'brave');
 assert.equal(engineOfUrl('https://searx.example.org/search?q=a'),null);
});
test('submissionOf keeps shipping routes: typed text is an address submission',()=>{
 assert.equal(submissionOf(null),null);
 assert.deepEqual(submissionOf({route:'navigate',input:['7','cats '],url:'https://www.google.com/search?q=cats'}),
  {engine:'address',query:'cats ',url:'https://www.google.com/search?q=cats'});
 assert.deepEqual(submissionOf({route:'search',input:['7',' cats '],url:'https://www.google.com/search?q=cats'}),
  {engine:'google',query:'cats',url:'https://www.google.com/search?q=cats'});
 assert.equal(submissionOf({route:'search',input:['7','x'],url:'https://other.test/?q=x'}).engine,'unknown');
 assert.equal(submissionOf({route:'createTab',input:['example.com'],url:'https://example.com'}).query,'example.com');
});
