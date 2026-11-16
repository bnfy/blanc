import test from 'node:test';
import assert from 'node:assert/strict';
import {jsLiteral} from './lib/js-literal.mjs';
test('escapes characters that could end a script context and round-trips', () => {
 const separators = String.fromCharCode(0x2028, 0x2029);
 const value = {s: '</script><x>' + separators + '"\\', n: 3, a: [null, true]};
 const literal = jsLiteral(value);
 assert.equal(/[<>/]/.test(literal) || literal.includes(separators[0]) || literal.includes(separators[1]), false);
 assert.deepEqual(eval('(' + literal + ')'), value);
 assert.equal(jsLiteral(undefined), 'undefined');
 assert.equal(eval(jsLiteral('a/b')), 'a/b');
});
