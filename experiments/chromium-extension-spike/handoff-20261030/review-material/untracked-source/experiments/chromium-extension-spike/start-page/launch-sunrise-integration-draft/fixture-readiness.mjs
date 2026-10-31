// The CDP target can commit before the Island's separately polled snapshot
// reports that same navigation. Require the active tab's exact destination.
export function activeUrlMatches(snapshot, expected) {
  if (!Array.isArray(snapshot?.tabs) || snapshot.activeTabId == null) return false;
  const matching=snapshot.tabs.filter(tab=>tab.id===snapshot.activeTabId);
  return matching.length===1 && matching[0].url===expected;
}
