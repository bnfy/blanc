// Native-only identity enrichment. Electron without this independent signal stays
// a gap. No timestamp, URL-only, request-order or replacement-target inference.
export function updateLoaderIdentity(run, row) {
 const gap=reason=>({status:'gap',reason});
 if(run.browserKind!=='chromium')return gap('runtime-has-no-update-loader-token');
 if((run.workerEvidence?.faults||[]).length)return gap('update-lifecycle-observation-fault');
 const token=row.devtools_request_id;
 if(typeof token!=='string'||!token.startsWith('blanc-sw-update/'))return gap('missing-update-loader-token');
 const matches=(run.workerEvidence?.updateIdentities||[]).filter(x=>x.token===token);
 const hooks=run.records.filter(x=>x.devtools_request_id===token);
 if(matches.length!==1||hooks.length!==1)return gap('non-bijective-update-loader-token');
 const id=matches[0];
 if(id.url!==row.url||row.profile_kind!==run.kind||run.source?.isOffTheRecord!==id.private||id.private!==(run.kind==='private')||id.mainScript!==true||typeof id.storageKey!=='string'||!id.storageKey)return gap('update-loader-context-mismatch');
 const events=run.workerEvidence.events;
 const regs=events.flatMap(e=>e.method==='ServiceWorker.workerRegistrationUpdated'?e.params.registrations:[]).filter(x=>x.registrationId===id.registrationId);
 const versions=events.flatMap(e=>e.method==='ServiceWorker.workerVersionUpdated'?e.params.versions:[]).filter(x=>x.versionId===id.versionId);
 if(!regs.length||regs.some(x=>x.scopeURL!==id.scope)||!versions.length||versions.some(x=>x.registrationId!==id.registrationId||x.scriptURL!==id.url))return gap('update-loader-lifecycle-disagrees');
 return {status:'proven-native',token,registrationId:id.registrationId,checkedVersionId:id.versionId,scope:id.scope,storageKey:id.storageKey,profile:run.kind,executionRealm:'not-required-for-byte-check',crossRuntimeAcceptance:false};
}
