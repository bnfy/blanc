// Inject before navigation so readiness means the real page event fired.
export const readyMarkerSource="document.addEventListener('blancStartDataReady',()=>{window.__groupsFixtureReady=true},{once:true});";
export function usableControl(v){return !!v&&v.width>0&&v.height>0&&v.visible===true&&v.hit===true&&v.disabled===false&&v.inViewport===true;}

export function privateGroupPresent(snapshot,member,group){return Array.isArray(snapshot?.tabs)&&Array.isArray(snapshot?.groups)&&snapshot.tabs.some(t=>t.id===member&&t.private===true&&t.groupId===group)&&snapshot.groups.some(g=>g.id===group);}
