// Generated verbatim from shipping shared-spaces-surfaces.js; pure presentation only.
const module = {exports:{}};
'use strict';
function publishedOccurrence(tab,record){return !!record&&!record.deleted.v&&record.nav.v.url===tab.url&&(record.name.v||record.nav.v.title)===(tab.customTitle||tab.title)&&record.pinned.v===!!tab.pinned&&(record.groupId.v??null)===(tab.groupId??null);}
function hideOccurrences(devices,sidecar,visible) {
  return devices.map(device=>{
    const binding=sidecar?.devices?.[device.deviceId];
    if(!binding||binding.forUpdatedAt!==device.updatedAt)return device;
    const hidden=new Set(binding.tabs.filter(row=>visible.has(row.spaceId)).map(row=>row.i));
    return {...device,tabs:device.tabs.filter((_tab,index)=>!hidden.has(index))};
  });
}
// "Waiting to upload" is this Space's own unacknowledged edits (M16 §3.8),
// never the request queue: the 60-second pass keeps it busy almost always.
function markState(queue,entry) {
  if(!queue.available)return 'unavailable';
  if(entry.reason)return 'full';
  if(entry.failed||entry.unsyncedTabIds?.length)return 'notSynced';
  if(entry.pending)return 'waiting';
  return 'shared';
}
function closedBand(local,remote) {
  const ids=new Set(local.map(row=>row.id));
  return [...local,...remote.filter(row=>!ids.has(row.id)).map(row=>({...row,remote:true,tabCount:1}))];
}
module.exports={hideOccurrences,markState,closedBand,publishedOccurrence};

export {hideOccurrences, markState, closedBand, publishedOccurrence};
