import Foundation

#if DEBUG
/// UI tests only (never in release builds): start from a known local state.
/// `-BlancUITestSends`: the same local cache a sync pull leaves, with one other
/// device ("MacBook Pro") that sent two pages to this phone, and no key, so
/// nothing reaches the network and a send fails fast.
/// `-BlancUITestFavorites`: sync off and no Favorites, so the heart starts empty.
/// Both start with one tab on example.com.
enum UITestSeed {
  static var sends: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSends") }
  static var favorites: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestFavorites") }
  static let pageURL = URL(string: "https://example.com/")!

  static func seedSends(into directory: URL) {
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    let state = #"{"enabled":true,"handle":"UI test","accountId":"\#(String(repeating: "c", count: 64))","deviceId":"phone-test","syncTabs":false}"#
    let sends = """
      {"devices":{"mac":{"name":"MacBook Pro","platform":"darwin","updatedAt":\(now),"items":[\
      {"id":"s1","to":"phone-test","url":"https://example.org/one","title":"Sent page one","sentAt":\(now - 240_000)},\
      {"id":"s2","to":"phone-test","url":"https://example.org/two","title":"Sent page two","sentAt":\(now - 10_800_000)}]}},\
      "dismissed":{}}
      """
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
    try? Data(sends.utf8).write(to: directory.appendingPathComponent("sync-sends.json"))
  }

  static func seedFavorites(into directory: URL) {
    let state = #"{"enabled":false,"deviceId":"phone-test","syncTabs":false}"#
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
    try? FileManager.default.removeItem(at: directory.appendingPathComponent("sync-favorites.json"))
  }
}
#endif

#if DEBUG
import CryptoKit

extension UITestSeed {
    static var settings: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSettings") }
    static var settingsDirectory: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("BlancSettingsUITests", isDirectory: true)
    }
    static func prepareSettings() {
        if ProcessInfo.processInfo.arguments.contains("-BlancUITestSettingsReset") {
            try? FileManager.default.removeItem(at: settingsDirectory)
        }
    }
}

/// Public desktop test-vector material, not credentials. The client still runs
/// its real pairing KDF. The fixture server must not repeat that expensive work
/// (or derive an unrelated account password) while a UI test is waiting.
nonisolated enum SettingsUITestFixture {
    static let pairId = "3aaa18b580b04488b044c9e1276bb37ef2506dd7e55c814a0aa5bfcb7b71d47b"
    static let wrapKey = SymmetricKey(data: Data(base64Encoded: "PTSH9f/rWuipVP/FKeWZQkLwMLue8d4c5foSKM/Tzhg=")!)
    static let payload = PairPayload(v: 1, handle: "Anthony",
        accountId: "ed29085a3fb2698b09382f8a6f4e9d1ee643036b7e8d5cd6eae89fa5c6bcafd4",
        key: "Raq7E9RlUhFA31NZaxo4Y8XsY+uWeLOchqu+GlLnuAY=")
    static let keys = SyncKeys(accountId: payload.accountId,
        contentKey: SymmetricKey(data: Data(base64Encoded: payload.key)!))
}

/// Test-only service: real encrypted payloads, no production network or Keychain.
actor SettingsUITestTransport: SyncTransport {
    private var blobs: [String: (Int, SyncEnvelope)] = [:]
    func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) {
        if ProcessInfo.processInfo.arguments.contains("-BlancUITestSettingsOffline") { throw SyncError.offline }
        let keys = SettingsUITestFixture.keys
        let settingsPath = "v1/blob/\(keys.accountId)/settings"
        if blobs[settingsPath] == nil {
            blobs[settingsPath] = (1, try SyncCrypto.seal(Data("{\"values\":{},\"clocks\":{}}".utf8), key: keys.contentKey))
        }
        if method == "GET", path == "v1/pair/" + SettingsUITestFixture.pairId {
            let blob = try SyncPairing.wrap(SettingsUITestFixture.payload, wrapKey: SettingsUITestFixture.wrapKey)
            struct Response: Encodable { let blob: SyncEnvelope }
            return (200, try JSONEncoder().encode(Response(blob: blob)))
        }
        if method == "GET", let (version, blob) = blobs[path] {
            struct Response: Encodable { let version: String; let blob: SyncEnvelope }
            return (200, try JSONEncoder().encode(Response(version: String(version), blob: blob)))
        }
        if method == "PUT", let body {
            struct Put: Decodable { let blob: SyncEnvelope }
            let blob = try JSONDecoder().decode(Put.self, from: body).blob
            let version = (blobs[path]?.0 ?? 0) + 1
            blobs[path] = (version, blob)
            return (200, Data("{\"version\":\"\(version)\"}".utf8))
        }
        if method == "POST" { return (201, Data("{}".utf8)) }
        if method == "DELETE" { return (200, Data("{}".utf8)) }
        return (404, Data("{}".utf8))
    }
}

@MainActor final class SettingsUITestSecrets: SyncSecretStore {
    private var key: SymmetricKey?
    func readKey() throws -> SymmetricKey? { key }
    func writeKey(_ key: SymmetricKey) throws { self.key = key }
    func deleteKey() throws { key = nil }
}
#endif
