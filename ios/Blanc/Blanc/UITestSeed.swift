import Foundation

#if DEBUG
/// UI tests only (never in release builds): start from a known local state.
/// `-BlancUITestSends`: the same local cache a sync pull leaves, with one other
/// device ("MacBook Pro") that sent two pages to this phone, and no key, so
/// nothing reaches the network and a send fails fast.
/// `-BlancUITestFavorites`: sync off and no Favorites, so the heart starts empty.
/// `-BlancUITestPrivate`: as Favorites, plus a current private tab.
/// All start with one tab on example.com.
enum UITestSeed {
  static var sends: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSends") }
  static var favorites: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestFavorites") }
  static var privateTab: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestPrivate") }
  /// `-BlancUITestStartPage`: sync off, one tab on the Start Page.
  static var startPage: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestStartPage") }
  /// `-BlancUITestTwoTabs`: sync off, example.com (current) and example.org.
  static var twoTabs: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestTwoTabs") }
  static let pageURL = URL(string: "https://example.com/")!
  /// `-BlancUITestGroups`: sync off; This iPhone has example.com and
  /// example.org loose and a "Research" group of two example.net pages, and
  /// a "Work" Space holds example.edu (M17).
  static var groups: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestGroups") }
  static func groupsState() -> SessionState {
    let research = TabGroup(id: String(repeating: "a", count: 32), name: "Research", color: "#376694")
    let iphone = SavedSet(tabs: [
      SavedTab(url: "https://example.com/", title: "Example Domain"),
      SavedTab(url: "https://example.org/", title: "Example Org"),
      SavedTab(url: "https://example.net/one", title: "Net one", groupId: research.id),
      SavedTab(url: "https://example.net/two", title: "Net two", groupId: research.id),
    ], groups: [research], activeIndex: 0)
    let work = SpaceRecord(id: String(repeating: "b", count: 32), name: "Work", color: "#426c4c", symbol: "briefcase",
                           set: SavedSet(tabs: [SavedTab(url: "https://example.edu/", title: "Example Edu")]))
    return SessionState(shown: TabSets.iphoneId, iphone: iphone, spaces: [work])
  }

  /// `-BlancUITestAppStore`: the App Store screenshots' state
  /// (`scripts/ios-app-store-screenshots.sh`). This iPhone shows blanc.day's
  /// What's New page (the home page's hero shows another site, and Download
  /// tells phone visitors Blanc is for computers), with Download loose and a
  /// "Getting started" group of
  /// two blanc.day pages, a "Work" Space holds blanc.day's support page, and a
  /// MacBook Pro sent two pages here. All Blanc's own pages, so no third
  /// party's site appears in the store.
  static var appStore: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestAppStore") }
  static func appStoreState() -> SessionState {
    let started = TabGroup(id: String(repeating: "e", count: 32), name: "Getting started", color: "#376694")
    let iphone = SavedSet(tabs: [
      SavedTab(url: "https://blanc.day/whats-new", title: "What's New"),
      SavedTab(url: "https://blanc.day/download", title: "Download Blanc"),
      SavedTab(url: "https://blanc.day/pair", title: "Pair your iPhone", groupId: started.id),
      SavedTab(url: "https://blanc.day/support", title: "Support", groupId: started.id),
    ], groups: [started], activeIndex: 0)
    let work = SpaceRecord(id: String(repeating: "f", count: 32), name: "Work", color: "#426c4c", symbol: "briefcase",
                           set: SavedSet(tabs: [SavedTab(url: "https://blanc.day/support", title: "Support")]))
    return SessionState(shown: TabSets.iphoneId, iphone: iphone, spaces: [work])
  }

  static func seedAppStoreSends(into directory: URL) {
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    let state = #"{"enabled":true,"handle":"Blanc","accountId":"\#(String(repeating: "c", count: 64))","deviceId":"phone-test","syncTabs":false}"#
    let sends = """
      {"devices":{"mac":{"name":"MacBook Pro","platform":"darwin","updatedAt":\(now),"items":[\
      {"id":"s1","to":"phone-test","url":"https://blanc.day/whats-new","title":"What's New in Blanc","sentAt":\(now - 240_000)},\
      {"id":"s2","to":"phone-test","url":"https://blanc.day/features","title":"Blanc features","sentAt":\(now - 10_800_000)}]}},\
      "dismissed":{}}
      """
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
    try? Data(sends.utf8).write(to: directory.appendingPathComponent("sync-sends.json"))
  }

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

#if DEBUG
/// `-BlancUITestSharedSpaces` (M17c): sync on with the Spaces switch off.
/// This iPhone holds example.com; the phone's Spaces are "Reading" (two tabs)
/// and "Archive" (501 tabs, too many to share). The account's library, served
/// by an in-process fake Worker (no network), holds "Travel", made on
/// "MacBook Pro", with a "Flights" group.
/// `-BlancUITestSharedSpacesOn`: sync and the switch on, showing the shared
/// Space "Work" (example.com selected, example.org/b behind it); the fake
/// Worker's copy has MacBook Pro's close of example.org/b, not yet merged here.
extension UITestSeed {
    static var sharedSpaces: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSharedSpaces") }
    static var sharedSpacesOn: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSharedSpacesOn") }
    static var sharedSeed: Bool { sharedSpaces || sharedSpacesOn }
    static let sharedAccount = String(repeating: "d", count: 64)
    static let sharedKey = SymmetricKey(data: Data(repeating: 7, count: 32))
    static func hex(_ n: Int) -> String { String(format: "%032x", n) }
    static let travelId = hex(0x71), workId = hex(0x77)

    private static func field(_ v: JSONValue, _ c: Int64 = 100) -> JSONValue { SharedSpacesModel.field(v, c, "mac") }
    private static func tabRecord(_ url: String, _ title: String, pos: String, group: String? = nil,
                                  deleted: Bool = false, c: Int64 = 100) -> JSONValue {
        .object([
            ("nav", field(.object([("url", .string(url)), ("title", .string(title))]))), ("name", field(.null)),
            ("pinned", field(.bool(false))), ("groupId", field(group.map(JSONValue.string) ?? .null)),
            ("pos", field(.string(pos))), ("deleted", field(.bool(deleted), c)),
        ])
    }
    private static func blob(_ id: String, tabs: [(String, String, String, String?)], groups: [(String, String)] = [],
                             closed: Set<String> = []) -> JSONValue {
        var left = ""
        var records: [(String, JSONValue)] = []
        for (tid, url, title, group) in tabs {
            left = (try? SharedSpacesModel.keyFor(left, "", tid)) ?? left
            records.append((tid, tabRecord(url, title, pos: left, group: group, deleted: closed.contains(tid),
                                           c: closed.contains(tid) ? Int64(Date().timeIntervalSince1970 * 1000) : 100)))
        }
        var groupLeft = ""
        let groupRecords: [(String, JSONValue)] = groups.map { (gid, name) in
            groupLeft = (try? SharedSpacesModel.keyFor(groupLeft, "", gid)) ?? groupLeft
            return (gid, .object([("name", field(.string(name))), ("color", field(.string("#376694"))),
                                  ("collapsed", field(.bool(false))), ("pos", field(.string(groupLeft))),
                                  ("deleted", field(.bool(false)))]))
        }
        return .object([("v", .number(1)), ("spaceId", .string(id)), ("groups", .object(groupRecords)),
                        ("tabs", .object(records)), ("active", field(.string(tabs.first?.0 ?? "")))])
    }
    static func travelBlob() -> JSONValue {
        blob(travelId, tabs: [(hex(0x701), "https://example.net/flight1", "Flight one", hex(0x791)),
                              (hex(0x702), "https://example.net/flight2", "Flight two", hex(0x791)),
                              (hex(0x703), "https://example.net/hotel", "Hotel", nil)],
             groups: [(hex(0x791), "Flights")])
    }
    static func workBlob(closed: Bool) -> JSONValue {
        blob(workId, tabs: [(hex(0x771), "https://example.com/", "Example Domain", nil),
                            (hex(0x772), "https://example.org/b", "Example B", nil)],
             closed: closed ? [hex(0x772)] : [])
    }
    private static func index(_ entries: [(id: String, name: String, blob: JSONValue)]) -> JSONValue {
        var left = ""
        return .object([("v", .number(1)), ("spaces", .object(entries.map { entry in
            left = (try? SharedSpacesModel.keyFor(left, "", entry.id)) ?? left
            return (entry.id, .object([
                ("name", field(.string(entry.name))), ("color", field(.string("#376694"))),
                ("symbol", field(.string("plane"))), ("pos", field(.string(left))), ("deleted", field(.bool(false))),
                ("createdAt", .number(100)), ("createdBy", .string("mac")),
                ("rev", .string(SharedSpacesModel.revisionOf(entry.blob))), ("revAt", .number(100)),
                ("revBy", .string("mac")),
            ]))
        }))])
    }
    private static func macSession() -> JSONValue {
        let now = Double(Int64(Date().timeIntervalSince1970 * 1000))
        return .object([("devices", .object([("mac", .object([
            ("name", .string("MacBook Pro")), ("platform", .string("darwin")), ("updatedAt", .number(now)),
            ("tabs", .array([.object([("url", .string("https://example.edu/")), ("title", .string("Example Edu")),
                                       ("groupId", .null), ("pinned", .bool(false))])])),
            ("groups", .array([])),
        ]))]))])
    }
    /// What the fake Worker serves, by store name.
    static func workerStores() -> [String: JSONValue] {
        var stores: [String: JSONValue] = [
            "settings": .object([("values", .object([])), ("clocks", .object([]))]),
            "session": macSession(),
        ]
        if sharedSpacesOn {
            stores["spaces"] = index([(workId, "Work", workBlob(closed: true))])
            stores["space-" + workId] = workBlob(closed: true)
        } else {
            stores["spaces"] = index([(travelId, "Travel", travelBlob())])
            stores["space-" + travelId] = travelBlob()
        }
        return stores
    }

    static func seedSharedSpaces(into directory: URL) {
        let state = #"{"enabled":true,"handle":"UI test","accountId":"\#(sharedAccount)","deviceId":"phone-test","syncTabs":false}"#
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for name in ["shared-spaces.json", "sync-closed.json", "sync-sends.json", "sync-favorites.json",
                     "recently-closed.json", "sync-settings.json", "sync-icons.json"] {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
        try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
        try? Data(macSession().jsStringify().utf8).write(to: directory.appendingPathComponent("sync-session.json"))
        guard sharedSpacesOn else { return }
        let shared = SharedSpacesState(directory: directory)
        shared.rebind(accountId: sharedAccount)
        shared.setEnabled(true)
        let old = workBlob(closed: false)
        try? shared.setIndex(index([(workId, "Work", old)]))
        try? shared.noteLocalSpace(id: workId, blob: old, edits: nil)
    }

    static func sharedSpacesState() -> SessionState {
        if sharedSpacesOn {
            let work = SpaceRecord(
                id: hex(0xa1), name: "Work", color: "#376694", symbol: "plane",
                set: SavedSet(tabs: [SavedTab(url: "https://example.com/", title: "Example Domain", tabId: hex(0x771)),
                                     SavedTab(url: "https://example.org/b", title: "Example B", tabId: hex(0x772))]),
                sharedId: workId, link: .active)
            return SessionState(shown: work.id, iphone: SavedSet(tabs: [SavedTab(url: pageURL.absoluteString, title: "")]),
                                spaces: [work], sharedBaselines: [workId: workBlob(closed: false)],
                                sharedAccount: sharedAccount)
        }
        let reading = SpaceRecord(
            id: hex(0xb1), name: "Reading", color: "#426c4c", symbol: "book",
            set: SavedSet(tabs: [SavedTab(url: "https://example.org/r1", title: "Read one"),
                                 SavedTab(url: "https://example.org/r2", title: "Read two")]))
        let archive = SpaceRecord(
            id: hex(0xb2), name: "Archive", color: "#6b6f76", symbol: "briefcase",
            set: SavedSet(tabs: (1...501).map { SavedTab(url: "https://example.net/a\($0)", title: "Archived \($0)") }))
        return SessionState(shown: TabSets.iphoneId,
                            iphone: SavedSet(tabs: [SavedTab(url: pageURL.absoluteString, title: "Example Domain")]),
                            spaces: [reading, archive])
    }
}

/// The fake Worker for the Shared Spaces seeds: real encrypted payloads in
/// memory, nothing over the network.
actor SharedSpacesUITestTransport: SyncTransport {
    private var blobs: [String: (Int, SyncEnvelope)] = [:]
    init(stores: [String: JSONValue], account: String, key: SymmetricKey) {
        for (name, value) in stores {
            if let sealed = try? SyncCrypto.seal(Data(value.jsStringify().utf8), key: key) {
                blobs["v1/blob/\(account)/\(name)"] = (1, sealed)
            }
        }
    }
    func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) {
        if method == "GET", let (version, blob) = blobs[path] {
            struct Response: Encodable { let version: String; let blob: SyncEnvelope }
            return (200, try JSONEncoder().encode(Response(version: String(version), blob: blob)))
        }
        if method == "PUT", let body {
            struct Put: Decodable { let ifVersion: String?; let blob: SyncEnvelope }
            let put = try JSONDecoder().decode(Put.self, from: body)
            let current = blobs[path]?.0
            if let current, put.ifVersion != String(current) { return (409, Data("{\"version\":\"\(current)\"}".utf8)) }
            let version = (current ?? 0) + 1
            blobs[path] = (version, put.blob)
            return (200, Data("{\"version\":\"\(version)\"}".utf8))
        }
        if method == "DELETE" { return (200, Data("{}".utf8)) }
        return (404, Data("{}".utf8))
    }
}

@MainActor final class SharedSpacesUITestSecrets: SyncSecretStore {
    private var key: SymmetricKey? = UITestSeed.sharedKey
    func readKey() throws -> SymmetricKey? { key }
    func writeKey(_ key: SymmetricKey) throws { self.key = key }
    func deleteKey() throws { key = nil }
}
#endif
