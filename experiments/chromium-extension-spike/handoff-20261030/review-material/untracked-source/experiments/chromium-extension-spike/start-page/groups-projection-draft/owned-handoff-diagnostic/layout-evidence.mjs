import assert from 'node:assert/strict';
import {requireOwnedForeground} from './foreground-gate.mjs';
export const remainingLayouts=Object.freeze([['billboard','bbGroups'],['shelf','shGroups'],['tally','tlGroups']].map(x=>Object.freeze(x)));
export function verifyLayout({groupId,index,clickCount,callCount,click,observation,raw,post,activeTabId,firstId}) {
 assert.equal(clickCount,index+1);assert.equal(callCount,index+1);
 assert.equal(click?.id,groupId);assert.equal(click?.trusted,true);assert.equal(observation?.args?.[0],groupId);
 assert.equal(raw?.requests?.length,index+1);assert.equal(raw?.replies?.length,index+1);
 assert.equal(raw.requests[index]?.groupId,groupId);assert.equal(raw.replies[index]?.id,raw.requests[index]?.id);
 assert.equal(raw.replies[index]?.success,true);assert.equal(raw.replies[index]?.value,true);
 requireOwnedForeground(post);assert.equal(observation?.result,true);assert.equal(activeTabId,firstId);
}
export function groupMembership(snapshot,groupId,firstId,secondId) {
 return {groupPresent:Array.isArray(snapshot?.groups)&&snapshot.groups.some(g=>g.id===groupId),firstMember:Array.isArray(snapshot?.tabs)&&snapshot.tabs.some(t=>t.id===firstId&&t.groupId===groupId&&t.private===false),secondMember:Array.isArray(snapshot?.tabs)&&snapshot.tabs.some(t=>t.id===secondId&&t.groupId===groupId&&t.private===false)};
}
export function verifyBackgroundBefore({snapshot,groupId,controlId,firstId,secondId}) {
 assert.notEqual(controlId,firstId);assert.notEqual(controlId,secondId);assert.equal(snapshot?.activeTabId,controlId);
 assert.deepEqual(groupMembership(snapshot,groupId,firstId,secondId),{groupPresent:true,firstMember:true,secondMember:true});
}
export function verifyBackground({denied,before,after,groupId,controlId,firstId,secondId,post}) {
 verifyBackgroundBefore({snapshot:before,groupId,controlId,firstId,secondId});
 assert.equal(denied,false);verifyBackgroundBefore({snapshot:after,groupId,controlId,firstId,secondId});requireOwnedForeground(post);
}
