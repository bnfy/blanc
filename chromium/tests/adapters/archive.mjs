import {nativeId} from '../lib/adapters.mjs';
import {nativeCall} from '../lib/test-driver.mjs';
import {runtimes} from './tabs.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
const sheet=(w,expression)=>w.hostEval(`(()=>{const document=window.document.getElementById('sheet')?.contentDocument;if(!document)return null;return (${expression});})()`);
export const archive={
 setTabArchive:(w,value)=>w.native('archiveSetting',[value]),
 setTabViewedSince:(w,id,age)=>w.native('archiveViewedAge',[nativeId(id),Number(age)]),
 setArchiveGraceUntil:(w,value)=>w.native('archiveGrace',[Number(value)]),
 runArchiveSweep:w=>w.native('archiveSweep'),
 runArchiveSweepsConcurrently:w=>Promise.all([w.native('archiveSweep'),w.native('archiveSweep')]),
 async runArchiveSweepInEveryWindow(w){const out=[];for(const host of await runtimes(w))out.push(await nativeCall(host.cdp,'archiveSweep'));return out;},
 activateCandidateDuringArchiveProbe:(w,id)=>w.native('archiveActivateAfterProbe',[nativeId(id)]),
 emitPowerResume:w=>w.native('archiveResume'),
 archiveEntries:w=>w.api('archiveList'),
 archiveNoticePending:w=>w.api('archiveNotice'),
 restoreArchived:(w,id)=>w.api('archiveRestore',[id]),
 clearBrowsingHistory:w=>w.api('clearHistory'),
 historySheetArchivedRows:w=>sheet(w,`({view:document.getElementById('viewArchived')?.getAttribute('aria-pressed')==='true'?'archived':'visits',rows:[...document.querySelectorAll('#list .row')].map(row=>({title:row.querySelector('.title')?.textContent,url:row.querySelector('.url')?.textContent}))})`),
 historySheetClick:(w,selector)=>sheet(w,`(()=>{const button=document.querySelector(${jsLiteral(selector)});if(!button||button.hidden)return false;button.click();return true;})()`),
};
