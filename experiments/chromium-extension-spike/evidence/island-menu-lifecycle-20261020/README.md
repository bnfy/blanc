# Island native menu lifecycle

The Island remains visible until a native context-menu command is selected. Dismissal restores search focus and leaves the panel open. Native command execution and policy remain in ExtensionContextMenuModel; the bridge responds after menu closure instead of timing out while a user is choosing. Root-menu closure is distinguished from submenu closure.

Nine focused tests and scoped lint pass. Native authored-extension checks verify menu-open Island visibility, Escape dismissal preserving the Island, and Pin selection closing the Island. The native removal confirmation was observed and cancelled; the fixture remained listed. No user extension was removed. Initial incomplete-task-runner compile error retained; repaired incremental builds succeeded (38.78s and39.65s). Final zero-action guard passed.

No new upstream hooks; prior measured50files/118hunks remains within50/120. Windows/Linux, managed/private menu lifecycle, developer Inspect Popup and broad destruction races remain unqualified. Latency deferred; Electron diagnostic build unapproved. Retained preview not restarted for this checkpoint.
