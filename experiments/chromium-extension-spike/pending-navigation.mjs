// Keep a newly opened GET tab even when shutdown precedes its first commit.
// Existing committed history remains authoritative for navigations in old tabs.
export function preparePendingNavigation(edit) {
  edit('chrome/browser/sessions/session_service_base.cc', [
    {
      anchor: '  const int current_index = tab->GetController().GetCurrentEntryIndex();\n',
      replacement: `  // A first navigation is not in the committed entry list yet. Preserve its
  // GET destination at shutdown/rebuild, without replaying POST bodies or
  // replacing the history of an already committed tab.
  auto& controller = tab->GetController();
  NavigationEntry* pending = controller.GetPendingEntry();
  const NavigationEntry* committed = controller.GetLastCommittedEntry();
  const bool pending_initial = tab->IsLoading() && pending &&
      controller.GetPendingEntryIndex() == -1 &&
      (!committed || committed->IsInitialEntry()) &&
      pending->GetVirtualURL().SchemeIsHTTPOrHTTPS() &&
      !pending->GetHasPostData();
  const int current_index = pending_initial ? 0 : controller.GetCurrentEntryIndex();
`,
      present: '  const bool pending_initial = tab->IsLoading() && pending &&\n'
    },
    {
      anchor: '               tab->GetController().GetEntryCount());\n',
      replacement: '               pending_initial ? 1 : controller.GetEntryCount());\n',
      present: '               pending_initial ? 1 : controller.GetEntryCount());\n'
    },
    {
      anchor: '    NavigationEntry* entry = (i == pending_index)\n',
      replacement: '    NavigationEntry* entry = pending_initial ? pending : (i == pending_index)\n',
      present: '    NavigationEntry* entry = pending_initial ? pending : (i == pending_index)\n'
    }
  ]);
  edit('chrome/browser/sessions/session_service.cc', [
    {
      anchor: '  // If Chrome is closed immediately after a history deletion, we have to\n',
      replacement: `  // Snapshot while pending first navigations and tab order still exist.
  // The subsequent close commands retain normal last-window semantics.
  ResetFromCurrentBrowsers();

  // If Chrome is closed immediately after a history deletion, we have to
`,
      present: '  // Snapshot while pending first navigations and tab order still exist.\n'
    },
    {
      anchor: 'void SessionService::OnClosingAllBrowsersChanged(bool closing) {\n  if (closing) {\n',
      replacement: `void SessionService::OnClosingAllBrowsersChanged(bool closing) {
  if (closing) {
    // Quit destroys this service before WindowClosing. Capture pending GET
    // tabs now; preserve the last session when there are no remaining windows.
    if (HasOpenTrackableBrowsers(SessionID::InvalidValue()))
      ResetFromCurrentBrowsers();
`,
      present: '    // Quit destroys this service before WindowClosing. Capture pending GET\n'
    }
  ]);
}
