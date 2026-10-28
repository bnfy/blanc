import XCTest
import CryptoKit
@testable import Blanc

/// M17c Task 16: the sync pass follows desktop's request scheduler and syncs
/// the Shared Spaces stores under the Spaces switch, against the fake Worker.
@MainActor final class SharedSpacesSyncTests: XCTestCase {
    private let account = String(repeating: "a", count: 64)
    private let start: Int64 = 1_800_000_000_000
    private struct Fixture {
        let directory: URL; let state: SyncStateStore; let transport: MemorySyncTransport
        let key: SymmetricKey; let engine: SyncEngine; let clock: TestClock; let own: String
    }
    private func make(spaces: Bool, sharing: Bool = false) async throws -> Fixture {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let state = SyncStateStore(directory: directory), secrets = InMemorySyncSecretStore()
        let key = SymmetricKey(data: Data(repeating: 42, count: 32)), transport = MemorySyncTransport()
        let clock = TestClock(start)
        try state.update { $0.enabled = true; $0.accountId = account; $0.handle = "Account"; $0.syncTabs = sharing }
        try secrets.writeKey(key)
        await transport.setClock { clock.now() }
        try await transport.install(account, .settings, .object([("values", .object([("theme", .string("light"))])), ("meta", .object([("theme", .number(100))])), ("tieBreakers", .object([]))]), key: key)
        let engine = SyncEngine(
            state: state, secrets: secrets, client: SyncWorkerClient(transport: transport),
            clock: { clock.now() }, monotonic: { clock.now() }, sleep: { clock.advance($0) },
            settingsSink: { _ in }, tabsSource: { [("https://phone.example/", "Phone")] })
        // The switch is set directly, so no delayed publish races the test's own passes.
        if spaces { XCTAssertTrue(engine.sharedState.setEnabled(true)) }
        return Fixture(directory: directory, state: state, transport: transport, key: key, engine: engine, clock: clock, own: state.state.deviceId)
    }

    // MARK: Records

    private func field(_ v: JSONValue, _ c: Int64 = 1, _ by: String = "mac") -> JSONValue {
        SharedSpacesModel.field(v, c, by)
    }
    private func id(_ n: Int) -> String { String(format: "%032x", n) }
    private func tab(_ tabId: String, _ url: String, at c: Int64 = 1, by: String = "mac") throws -> JSONValue {
        .object([
            ("nav", field(.object([("url", .string(url)), ("title", .string("Title"))]), c, by)),
            ("name", field(.null, c, by)), ("pinned", field(.bool(false), c, by)),
            ("groupId", field(.null, c, by)),
            ("pos", field(.string(try SharedSpacesModel.keyFor("", "", tabId)), c, by)),
            ("deleted", field(.bool(false), c, by)),
        ])
    }
    private func blob(_ spaceId: String, _ tabs: [(String, JSONValue)]) -> JSONValue {
        .object([("v", .number(1)), ("spaceId", .string(spaceId)), ("groups", .object([])), ("tabs", .object(tabs))])
    }
    private func indexEntry(_ spaceId: String, rev: String) throws -> JSONValue {
        .object([
            ("name", field(.string("Work"))), ("color", field(.string("#426c4c"))),
            ("symbol", field(.string("briefcase"))),
            ("pos", field(.string(try SharedSpacesModel.keyFor("", "", spaceId)))),
            ("deleted", field(.bool(false))), ("rev", .string(rev)), ("revAt", .number(1)),
            ("revBy", .string("mac")),
        ])
    }
    /// `count` Spaces on the Worker, each with one tab from the Mac, and the index naming them.
    @discardableResult private func installSpaces(_ f: Fixture, _ count: Int) async throws -> [String] {
        var entries: [(String, JSONValue)] = []
        for n in 1...count {
            let spaceId = id(n), tabId = id(1000 + n)
            let b = blob(spaceId, [(tabId, try tab(tabId, "https://mac.example/\(n)"))])
            try await f.transport.install(account, name: "space-" + spaceId, b, key: f.key)
            entries.append((spaceId, try indexEntry(spaceId, rev: SharedSpacesModel.revisionOf(b))))
        }
        try await f.transport.install(account, name: "spaces", .object([("v", .number(1)), ("spaces", .object(entries))]), key: f.key)
        return entries.map(\.0)
    }
    private func isSpacesPath(_ path: String) -> Bool {
        path.hasSuffix("/spaces") || path.hasSuffix("/closed") || path.hasSuffix("/shared") || path.contains("/space-")
    }
    private func pass(_ f: Fixture) async {
        await f.engine.syncNow()
        await f.engine.requestsSettled()
    }

    // MARK: The window

    func testFixedStoresAndTwentyFiveSpacesNeverExceedTenGetsInAnyMinute() async throws {
        let f = try await make(spaces: true)
        try await f.transport.install(account, .bookmarks, .object([("items", .array([])), ("tombstones", .array([]))]), key: f.key)
        try await f.transport.install(account, .session, .object([("devices", .object([]))]), key: f.key)
        try await f.transport.install(account, .icons, .object([("devices", .object([]))]), key: f.key)
        try await f.transport.install(account, .sends, .object([("devices", .object([]))]), key: f.key)
        try await f.transport.install(account, .closed, .object([("devices", .object([]))]), key: f.key)
        let ids = try await installSpaces(f, 25)
        var merged = Set<String>()
        f.engine.onSpacesMerged = { (changed: [String]) in merged.formUnion(changed) }
        await pass(f)
        let times = await f.transport.getTimes()
        XCTAssertGreaterThan(times.count, 30)
        for t in times {
            XCTAssertLessThanOrEqual(times.filter { $0 > t - 60_000 && $0 <= t }.count, 10, "GETs in the minute ending \(t - start)")
        }
        let gets = await f.transport.records().filter { $0.method == "GET" }.map(\.path)
        for spaceId in ids {
            XCTAssertTrue(gets.contains { $0.hasSuffix("/space-" + spaceId) }, spaceId)
            XCTAssertNotNil(f.engine.sharedState.blob(spaceId)?["tabs"]?[id(1000 + Int(spaceId, radix: 16)!)])
        }
        XCTAssertTrue(merged.isSuperset(of: Set(ids + ["index"])))
        XCTAssertNil(f.state.state.lastError)
        XCTAssertNotNil(f.engine.sharedState.data["requestLog"]?.array.first, "the window is persisted")
    }

    func testRateLimitHalvesTheWindow() async throws {
        let f = try await make(spaces: false)
        await f.transport.fail("GET", "v1/blob/\(account)/session", statuses: [429])
        await pass(f)
        XCTAssertEqual(f.state.state.lastError, "rate-limited")
        XCTAssertEqual(f.engine.sharedState.data["windowLimit"], .number(5))
    }

    // MARK: Consent

    func testSwitchOffMakesNoSpacesRequestExceptAnExplicitPreview() async throws {
        let f = try await make(spaces: false)
        let ids = try await installSpaces(f, 2)
        try await f.transport.install(account, .closed, .object([("devices", .object([]))]), key: f.key)
        try await f.transport.install(account, .shared, .object([("devices", .object([]))]), key: f.key)
        f.engine.recordClosed(url: "https://closed.example/", title: "Closed", id: id(77), spaceId: nil)
        f.engine.spacesChanged()
        await pass(f)
        var requests = await f.transport.records()
        XCTAssertFalse(requests.contains { isSpacesPath($0.path) }, "no Spaces store is read or written while the switch is off")
        XCTAssertEqual(requests.filter { $0.method == "GET" }.count, 5)

        let previewed = await f.engine.previewIndex()
        XCTAssertTrue(previewed)
        XCTAssertNotNil(f.engine.sharedState.data["index"]?["spaces"]?[ids[0]], "the index preview merges, as desktop's")

        let file = f.directory.appendingPathComponent("shared-spaces.json")
        func held() throws -> String {
            var v = try JSONValue(data: Data(contentsOf: file))
            for key in ["requestLog", "nextClass", "cursors", "windowLimit", "backoffUntil"] { v[key] = nil }
            return v.canonical()
        }
        let before = try held()
        let space = await f.engine.previewSpace(id: ids[1])
        XCTAssertEqual(space?["spaceId"], .string(ids[1]))
        XCTAssertNotNil(space?["tabs"]?[id(1002)])
        XCTAssertEqual(try held(), before, "a previewed Space is never written to shared-spaces.json")
        XCTAssertNil(f.engine.sharedState.blob(ids[1]))
        let invalid = await f.engine.previewSpace(id: "../settings")
        XCTAssertNil(invalid)

        requests = await f.transport.records()
        XCTAssertEqual(requests.filter { isSpacesPath($0.path) }.map { "\($0.method) \($0.path)" },
                       ["GET v1/blob/\(account)/spaces", "GET v1/blob/\(account)/space-\(ids[1])"])
    }

    // Review Focus 5: an older Worker without the Spaces stores.
    func testOlderWorkerLeavesTheSwitchOffAndTheRestStillSyncs() async throws {
        let f = try await make(spaces: true)
        for name in ["spaces", "closed", "shared"] { await f.transport.retire(name: name) }
        try await f.transport.install(account, .session, .object([("devices", .object([]))]), key: f.key)
        f.engine.editFavorites { SyncedFavorites.toggle($0, url: "https://fav.example/", title: "Fav", favicon: nil, now: Double(self.start), makeId: { UUID().uuidString }).store }
        await pass(f)
        XCTAssertEqual(f.engine.spacesAvailability, .unavailable)
        XCTAssertFalse(f.engine.sharedState.isEnabled)
        XCTAssertNil(f.state.state.lastError)
        XCTAssertNotNil(f.state.state.lastSyncedAt)
        let favorites = try await f.transport.value(account, .bookmarks, key: f.key)
        XCTAssertEqual(favorites?["items"]?.array.first?["url"], .string("https://fav.example/"))
        XCTAssertEqual(f.state.load(.settings)?["values"]?["theme"], .string("light"))
        let presence = try await f.transport.value(account, .session, key: f.key)?["devices"]?[f.own]
        XCTAssertEqual(presence?["platform"], .string("ios"))
        let before = await f.transport.records().filter { isSpacesPath($0.path) }.count
        await pass(f)
        let after = await f.transport.records().filter { isSpacesPath($0.path) }.count
        XCTAssertEqual(after, before, "an unavailable Worker isn't asked again")
    }

    // MARK: Spaces

    func testPendingEditIsPutBlobFirstThenIndexAndA409MergesAndRetries() async throws {
        let f = try await make(spaces: true)
        let spaceId = id(1), remoteTab = id(100), localTab = id(200)
        let remote = blob(spaceId, [(remoteTab, try tab(remoteTab, "https://mac.example/"))])
        try await f.transport.install(account, name: "space-" + spaceId, remote, key: f.key)
        try await f.transport.install(account, name: "spaces", .object([("v", .number(1)), ("spaces", .object([(spaceId, try indexEntry(spaceId, rev: SharedSpacesModel.revisionOf(remote)))]))]), key: f.key)
        await pass(f)
        var local = try XCTUnwrap(f.engine.sharedState.blob(spaceId))
        XCTAssertNotNil(local["tabs"]?[remoteTab])

        let record = try tab(localTab, "https://phone.example/", at: start, by: f.own)
        local["tabs"]?[localTab] = record
        try f.engine.sharedState.noteLocalSpace(id: spaceId, blob: local, edits: .object([("tabs", .object([(localTab, record)]))]))
        await f.transport.fail("PUT", "v1/blob/\(account)/space-\(spaceId)", statuses: [409])
        let mark = await f.transport.records().count
        await pass(f)
        let later = Array(await f.transport.records().dropFirst(mark))
        let blobPuts = later.indices.filter { later[$0].method == "PUT" && later[$0].path.hasSuffix("/space-" + spaceId) }
        let indexPuts = later.indices.filter { later[$0].method == "PUT" && later[$0].path.hasSuffix("/spaces") }
        XCTAssertEqual(blobPuts.count, 2, "the 409 is merged and retried")
        XCTAssertGreaterThanOrEqual(later.filter { $0.method == "GET" && $0.path.hasSuffix("/space-" + spaceId) }.count, 2)
        XCTAssertEqual(indexPuts.count, 1)
        if let lastBlob = blobPuts.last, let index = indexPuts.first {
            XCTAssertGreaterThan(index, lastBlob, "the index is written after the blob")
        }
        let storedValue = try await f.transport.value(account, name: "space-" + spaceId, key: f.key)
        let stored = try XCTUnwrap(storedValue)
        XCTAssertNotNil(stored["tabs"]?[remoteTab])
        XCTAssertNotNil(stored["tabs"]?[localTab])
        let index = try await f.transport.value(account, name: "spaces", key: f.key)
        XCTAssertEqual(index?["spaces"]?[spaceId]?["rev"], .string(SharedSpacesModel.revisionOf(stored)))
        XCTAssertFalse(f.engine.sharedState.hasPendingEdits(spaceId))
    }

    func testClosedEntryIsPublishedOnlyWithTheSwitchOn() async throws {
        let f = try await make(spaces: false)
        let mac: JSONValue = .object([
            ("name", .string("Mac")), ("platform", .string("darwin")), ("updatedAt", .number(Double(start - 1000))),
            ("items", .array([.object([("id", .string("c1")), ("url", .string("https://closed.example/")), ("title", .string("Closed")), ("closedAt", .number(Double(start - 1000))), ("spaceId", .null)])])),
        ])
        try await f.transport.install(account, .closed, .object([("devices", .object([("mac", mac)]))]), key: f.key)
        f.engine.recordClosed(url: "https://phone.example/", title: "Phone", id: id(300), spaceId: nil)
        await pass(f)
        var touched = await f.transport.records().contains { $0.path.hasSuffix("/closed") }
        XCTAssertFalse(touched)
        XCTAssertTrue(f.engine.closedInbox.isEmpty)

        f.engine.setSpacesEnabled(true)
        f.engine.recordClosed(url: "https://phone.example/", title: "Phone", id: id(300), spaceId: id(5))
        f.engine.recordClosed(url: "file:///etc/hosts", title: "Hosts", id: id(301), spaceId: nil)
        await pass(f)
        touched = await f.transport.records().contains { $0.method == "PUT" && $0.path.hasSuffix("/closed") }
        XCTAssertTrue(touched)
        let devices = try await f.transport.value(account, .closed, key: f.key)?["devices"]
        XCTAssertEqual(devices?[f.own]?["items"]?.array.map { $0["id"] }, [.string(id(300))])
        XCTAssertEqual(devices?[f.own]?["items"]?.array.first?["spaceId"], .string(id(5)))
        XCTAssertNotNil(devices?["mac"])
        XCTAssertEqual(f.engine.closedInbox.map(\.id), ["c1"])
        XCTAssertEqual(f.engine.closedInbox.first?.fromName, "Mac")
        f.engine.forgetClosed(id: "c1")
        XCTAssertTrue(f.engine.closedInbox.isEmpty)
    }

    func testSidecarIsBoundToThePublishedSessionEntry() async throws {
        let f = try await make(spaces: true, sharing: true)
        let spaceId = id(1)
        let remote = blob(spaceId, [])
        try await f.transport.install(account, name: "space-" + spaceId, remote, key: f.key)
        try await f.transport.install(account, name: "spaces", .object([("v", .number(1)), ("spaces", .object([(spaceId, try indexEntry(spaceId, rev: SharedSpacesModel.revisionOf(remote)))]))]), key: f.key)
        try await f.transport.install(account, .session, .object([("devices", .object([]))]), key: f.key)
        var tabs = [SnapshotTab(url: "https://shared.example/", title: "Shared", sharedSpaceId: spaceId),
                    SnapshotTab(url: "https://own.example/", title: "Own")]
        f.engine.sharedTabsSource = { tabs }
        await pass(f)
        var session = try await f.transport.value(account, .session, key: f.key)?["devices"]?[f.own]
        var sidecar = try await f.transport.value(account, .shared, key: f.key)?["devices"]?[f.own]
        XCTAssertEqual(session?["tabs"]?.array.count, 2)
        XCTAssertNotNil(session?["updatedAt"])
        XCTAssertEqual(sidecar?["forUpdatedAt"], session?["updatedAt"])
        XCTAssertEqual(sidecar?["tabs"], .array([.object([("i", .number(0)), ("spaceId", .string(spaceId))])]))

        // Membership alone changes: the snapshot gets a fresh clock and the sidecar follows it.
        tabs[1].sharedSpaceId = spaceId
        let previous = session?["updatedAt"]?.number ?? 0
        await pass(f)
        session = try await f.transport.value(account, .session, key: f.key)?["devices"]?[f.own]
        sidecar = try await f.transport.value(account, .shared, key: f.key)?["devices"]?[f.own]
        XCTAssertGreaterThan(session?["updatedAt"]?.number ?? 0, previous)
        XCTAssertEqual(sidecar?["forUpdatedAt"], session?["updatedAt"])
        XCTAssertEqual(sidecar?["tabs"]?.array.count, 2)
    }
    func testTheSnapshotPublishesGroupsAndNoSpaceWithTheSwitchOff() async throws {
        let f = try await make(spaces: false, sharing: true)
        try await f.transport.install(account, .session, .object([("devices", .object([]))]), key: f.key)
        let group = id(9)
        f.engine.sharedTabsSource = {
            [SnapshotTab(url: "https://grouped.example/", title: "Grouped", groupId: group, sharedSpaceId: self.id(1))]
        }
        f.engine.sharedGroupsSource = { [(id: group, name: "Reading")] }
        await pass(f)
        let session = try await f.transport.value(account, .session, key: f.key)?["devices"]?[f.own]
        XCTAssertEqual(session?["tabs"]?.array.first?["groupId"], .string(group))
        XCTAssertEqual(session?["groups"], .array([.object([("id", .string(group)), ("name", .string("Reading"))])]))
        let requests = await f.transport.records()
        XCTAssertFalse(requests.contains { isSpacesPath($0.path) }, "no Spaces store with the switch off")
    }

    // MARK: Status and shown-once (Task 21)

    /// The Mac's three tabs (the last two on the same page) and its sidecar
    /// binding tab 1 to shared Space 1, as the Worker holds them.
    private func installMac(_ f: Fixture, sidecarAt: Double, sessionAt: Double) async throws {
        let spaceId = id(1)
        let remote = blob(spaceId, [])
        try await f.transport.install(account, name: "space-" + spaceId, remote, key: f.key)
        try await f.transport.install(account, name: "spaces", .object([("v", .number(1)), ("spaces", .object([(spaceId, try indexEntry(spaceId, rev: SharedSpacesModel.revisionOf(remote)))]))]), key: f.key)
        func tab(_ url: String) -> JSONValue {
            .object([("url", .string(url)), ("title", .string(url)), ("groupId", .null), ("pinned", .bool(false))])
        }
        try await f.transport.install(account, .session, .object([("devices", .object([("mac", .object([
            ("name", .string("Mac")), ("platform", .string("darwin")), ("updatedAt", .number(sessionAt)),
            ("tabs", .array([tab("https://a.example/"), tab("https://b.example/"), tab("https://b.example/")])),
            ("groups", .array([])),
        ]))]))]), key: f.key)
        try await f.transport.install(account, .shared, .object([("devices", .object([("mac", .object([
            ("forUpdatedAt", .number(sidecarAt)),
            ("tabs", .array([.object([("i", .number(1)), ("spaceId", .string(spaceId))])])),
        ]))]))]), key: f.key)
    }

    func testABoundSidecarHidesExactlyItsTabs() async throws {
        let f = try await make(spaces: true)
        let at = Double(start - 1000)
        try await installMac(f, sidecarAt: at, sessionAt: at)
        await pass(f)
        await pass(f)
        let mac = try XCTUnwrap(f.engine.remoteDevices.first { $0.id == "mac" })
        XCTAssertEqual(mac.tabs.map(\.url), ["https://a.example/", "https://b.example/"],
                       "the bound occurrence is shown under the Space; an unbound tab on the same page stays")
    }

    func testAStaleSidecarHidesNothing() async throws {
        let f = try await make(spaces: true)
        let at = Double(start - 1000)
        try await installMac(f, sidecarAt: at - 1, sessionAt: at)
        await pass(f)
        await pass(f)
        XCTAssertEqual(f.engine.remoteDevices.first { $0.id == "mac" }?.tabs.count, 3)
    }

    func testASpaceOverItsBudgetReportsFull() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let spaceId = id(2)
        var tabs: [(String, JSONValue)] = []
        var left = ""
        for n in 1...501 {
            let tid = id(5000 + n)
            left = try SharedSpacesModel.keyFor(left, "", tid)
            tabs.append((tid, .object([
                ("nav", field(.object([("url", .string("https://full.example/\(n)")), ("title", .string("T"))]), 1, "phone")),
                ("name", field(.null, 1, "phone")), ("pinned", field(.bool(false), 1, "phone")),
                ("groupId", field(.null, 1, "phone")), ("pos", field(.string(left), 1, "phone")),
                ("deleted", field(.bool(false), 1, "phone")),
            ])))
        }
        let local = blob(spaceId, tabs)
        let state = SyncStateStore(directory: directory)
        try state.update { $0.enabled = true; $0.accountId = account }
        // The Spaces state stamps its merges with the real clock, so this test does too.
        let engine = SyncEngine(state: state, secrets: InMemorySyncSecretStore(), client: SyncWorkerClient(transport: MemorySyncTransport()),
                                settingsSink: { _ in }, tabsSource: { [] })
        XCTAssertTrue(engine.sharedState.setEnabled(true))
        try engine.sharedState.noteLocalSpace(id: spaceId, blob: local, edits: local)
        let key = SymmetricKey(data: Data(repeating: 1, count: 32))
        _ = try engine.sharedState.mergeSpace(id: spaceId, remote: blob(spaceId, []), version: "1", deviceId: "phone",
                                              now: Int64(Date().timeIntervalSince1970 * 1000),
                                              encrypt: { try SyncCrypto.seal(Data($0.utf8), key: key) })
        XCTAssertEqual(engine.spaceSyncState(spaceId), .full)
        XCTAssertFalse(engine.unsyncedTabIds(spaceId).isEmpty, "the tabs past the budget carry the dot")
    }
}
