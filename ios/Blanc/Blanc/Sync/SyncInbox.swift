import Foundation

/// What a Background App Refresh pass fetched (M18 §6): the decrypted fixed
/// stores, kept on disk beside the sync state until the app is next in front,
/// where `SyncEngine.applyInbox()` merges them into the local caches. It is
/// tied to the account it was fetched for, so a phone that left or switched
/// sync in between never applies another account's data.
struct SyncInbox: Equatable {
  static let fileName = "sync-inbox.json"
  let accountId: String
  let fetchedAt: Int64
  /// Store name (`SyncStore.rawValue`) → its decrypted payload.
  var documents: [String: JSONValue]

  func payload(_ store: SyncStore) -> JSONValue? { documents[store.rawValue] }

  func save(in directory: URL) throws {
    let value: JSONValue = .object([
      ("accountId", .string(accountId)), ("fetchedAt", .number(Double(fetchedAt))),
      ("documents", .object(documents.sorted { $0.key < $1.key }.map { ($0.key, $0.value) })),
    ])
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(value.jsStringify().utf8).write(
      to: directory.appendingPathComponent(Self.fileName), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  static func load(from directory: URL) -> SyncInbox? {
    guard let data = try? Data(contentsOf: directory.appendingPathComponent(fileName)),
      let value = try? JSONValue(data: data), let accountId = value["accountId"]?.string,
      let fetchedAt = value["fetchedAt"]?.integer
    else { return nil }
    let documents = Dictionary(
      (value["documents"]?.pairs ?? []).map { ($0.0, $0.1) }, uniquingKeysWith: { a, _ in a })
    return SyncInbox(accountId: accountId, fetchedAt: fetchedAt, documents: documents)
  }

  static func remove(from directory: URL) {
    try? FileManager.default.removeItem(at: directory.appendingPathComponent(fileName))
  }
}
