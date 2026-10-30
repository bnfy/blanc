// Test result predicate only; does not manipulate the browser.
export function phaseReady(phase,name) {
 if(!phase||phase.name!==name||phase.timeoutSeen!==true||!Number.isFinite(phase.timeoutAt)||phase.dropped!==true||phase.droppedSuccess!==true||!Array.isArray(phase.successes))return false;
 if(name==='unrelated'&&phase.warningInjected!==true)return false;
 return phase.successes.some(s=>Number.isFinite(s.timeMs)&&s.timeMs>=phase.timeoutAt&&(name==='recovery'?s.hidden===true&&s.timeoutVisible===false:name==='unrelated'&&s.unrelatedVisible===true));
}
