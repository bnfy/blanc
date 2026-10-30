import assert from 'node:assert/strict';
import {activeUrlMatches} from './fixture-readiness.mjs';
const expected='chrome://blanc-prototype/appearance-settings.html';
assert.equal(activeUrlMatches(null,expected),false);
assert.equal(activeUrlMatches({activeTabId:'1',tabs:[{id:'1',url:'chrome://blanc-prototype/settings-home.html'}]},expected),false);
assert.equal(activeUrlMatches({activeTabId:'1',tabs:[{id:'2',url:expected}]},expected),false);
assert.equal(activeUrlMatches({activeTabId:'1',tabs:[{id:'1',url:expected},{id:'1',url:expected}]},expected),false);
assert.equal(activeUrlMatches({activeTabId:'1',tabs:[{id:'1',url:expected}]},expected),true);
console.log('PASS stale, missing, duplicate and exact active snapshot cases');
