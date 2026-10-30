// Fixture eligibility assertions only; these do not authorize browser grants.
export function hasPair(s,first,second){
  return Array.isArray(s?.splits)&&s.splits.some(split=>Array.isArray(split.tabIds)&&split.tabIds.length===2&&split.tabIds.includes(first)&&split.tabIds.includes(second));
}
export function outsideVisiblePair(s,target,control){
  return !!s&&Array.isArray(s.splits)&&s.activeTabId===control&&target!==control&&s.glanceTabId!==target&&
    !s.splits.some(split=>Array.isArray(split.tabIds)&&split.tabIds.includes(control)&&split.tabIds.includes(target));
}
