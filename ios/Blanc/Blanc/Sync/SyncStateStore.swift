import Foundation
import Observation

nonisolated struct SyncState: Codable, Equatable, Sendable {
  var enabled = false
  var handle: String?
  var accountId: String?
  var deviceId = UUID().uuidString.lowercased()
  var syncTabs = false
  var lastSyncedAt: Int64?
  var lastError: String?
}

@MainActor @Observable final class SyncStateStore {
  private(set) var state: SyncState
  private let directory: URL
  /// Where the sync files live; `shared-spaces.json` sits beside them.
  var directoryURL: URL { directory }
  init(directory: URL) {
    self.directory = directory
    let file = directory.appendingPathComponent("sync.json")
    state =
      (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(SyncState.self, from: $0) }
      ?? SyncState()
    try? persist(state)
  }
  private func persist(_ value: SyncState) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try JSONEncoder().encode(value).write(
      to: directory.appendingPathComponent("sync.json"),
      options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  func update(_ change: (inout SyncState) -> Void) throws {
    var next = state
    change(&next)
    try persist(next)
    state = next
  }
  private func url(_ store: SyncStore) -> URL {
    directory.appendingPathComponent(
      "sync-\(store == .bookmarks ? "favorites" : store.rawValue).json")
  }
  func load(_ store: SyncStore) -> JSONValue? {
    guard let data = try? Data(contentsOf: url(store)) else { return nil }
    return try? JSONValue(data: data)
  }
  func save(_ store: SyncStore, _ value: JSONValue) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(value.jsStringify().utf8).write(
      to: url(store), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  func clearData(keeping kept: Set<SyncStore> = []) throws {
    for store in SyncStore.allCases where !kept.contains(store) {
      let file = url(store)
      if FileManager.default.fileExists(atPath: file.path) {
        try FileManager.default.removeItem(at: file)
      }
    }
  }
}
