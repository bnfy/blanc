import Foundation

/// The change check (design 2026-11-02), desktop's `sync-changes.js`: which
/// fixed stores to fetch, given the versions the Worker named and the ones
/// this phone last read or wrote. Replayed from the shared sync vectors.
nonisolated enum SyncChanges {
  static let fixedStores = ["bookmarks", "settings", "session", "icons", "sends", "closed", "shared", "spaces"]
  private static let openTabs: Set<String> = ["session", "icons"]
  /// While Blanc is in front with the Spaces switch on.
  static let checkMs: Int64 = 15_000
  /// Every store and class R, while the check works.
  static let fullPassMs: Int64 = 300_000
  /// Pending and failed uploads.
  static let retryPassMs: Int64 = 60_000
  /// After a fallback to the minute pass.
  static let checkRetryAfterMs: Int64 = 600_000
  /// Open tabs (`session`, `icons`) at most once a minute.
  static let openTabsMs: Int64 = 60_000
  /// Class R re-reads per full pass.
  static let rPerPass = 5

  /// A store is fetched when its named version differs from the one seen (a
  /// store never seen counts as absent). Open tabs that moved wait until a
  /// minute after their last fetch.
  static func changedStores(
    named: [String: String?], seen: [String: String?], now: Int64, lastOpenTabsFetch: Int64
  ) -> (fetch: [String], deferred: [String]) {
    var fetch: [String] = [], deferred: [String] = []
    for store in fixedStores where (named[store] ?? nil) != (seen[store] ?? nil) {
      if openTabs.contains(store) && now - lastOpenTabsFetch < openTabsMs {
        deferred.append(store)
      } else {
        fetch.append(store)
      }
    }
    return (fetch, deferred)
  }
  /// A fetch that read another version than the check named (a read that
  /// raced a newer write) leaves the store changed for the next check.
  static func confirmFetched(named: [String: String?], store: String, fetchedVersion: String?) -> Bool {
    (named[store] ?? nil) == fetchedVersion
  }
}
