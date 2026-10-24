import XCTest
import CryptoKit
@testable import Blanc

@MainActor final class InMemorySyncSecretStore: SyncSecretStore {
    var key: SymmetricKey?
    func readKey() throws -> SymmetricKey? { key }
    func writeKey(_ key: SymmetricKey) throws { self.key = key }
    func deleteKey() throws { key = nil }
}

/// Real encrypted payloads, version checks, and controllable response suspension.
/// Capture the response before suspending so an old-account reply stays old.
actor MemorySyncTransport: SyncTransport {
    struct Request: Sendable { let method: String; let path: String; let body: Data? }
    private var blobs: [String: (Int, SyncEnvelope)] = [:]
    private var requests: [Request] = []
    private var failures: [String: [Int]] = [:]
    private var heldPath: String?
    private var heldMethod: String?
    private var held: CheckedContinuation<Void, Never>?
    private var retired: Set<String> = []
    func records() -> [Request] { requests }
    /// An older Worker that doesn't serve `store` at all (M7b's `sends`).
    func retire(_ store: SyncStore) { retired.insert(store.rawValue) }
    func value(_ account: String, _ store: SyncStore, key: SymmetricKey) throws -> JSONValue? {
        guard let (_, blob) = blobs["v1/blob/\(account)/\(store.rawValue)"] else { return nil }
        return try JSONValue(data: SyncCrypto.open(blob, key: key))
    }
    func install(_ account: String, _ store: SyncStore, _ value: JSONValue, key: SymmetricKey) throws {
        blobs["v1/blob/\(account)/\(store.rawValue)"] = (1, try SyncCrypto.seal(Data(value.jsStringify().utf8), key: key))
    }
    func remove(_ account: String, _ store: SyncStore) { blobs["v1/blob/\(account)/\(store.rawValue)"] = nil }
    func fail(_ method: String, _ path: String, statuses: [Int]) { failures[method + " " + path] = statuses }
    func suspendNext(_ method: String, _ path: String) { heldMethod = method; heldPath = path }
    func isSuspended() -> Bool { held != nil }
    func release() { let continuation = held; held = nil; continuation?.resume() }
    func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) {
        requests.append(Request(method: method, path: path, body: body))
        let response: (status: Int, body: Data)
        let exactKey = method + " " + path
        let failureKey = failures[exactKey] != nil ? exactKey : (failures.keys.first { $0.hasSuffix("/") && exactKey.hasPrefix($0) } ?? exactKey)
        if let store = path.split(separator: "/").last.map(String.init), retired.contains(store), path.hasPrefix("v1/blob/") {
            response = (404, Data("unknown store".utf8))
        } else if var pending = failures[failureKey], !pending.isEmpty {
            let status = pending.removeFirst(); failures[failureKey] = pending
            response = (status, Data("{\"version\":\"1\"}".utf8))
        } else if method == "GET", let (version, blob) = blobs[path] {
            struct Wire: Encodable { let version: String; let blob: SyncEnvelope }
            response = (200, try JSONEncoder().encode(Wire(version: String(version), blob: blob)))
        } else if method == "PUT", let body {
            struct Put: Decodable { let ifVersion: String?; let blob: SyncEnvelope }
            let decoded = try JSONDecoder().decode(Put.self, from: body)
            let existing = blobs[path]
            if decoded.ifVersion != existing.map({ String($0.0) }) {
                response = (409, Data("{}".utf8))
            } else {
                let version = (existing?.0 ?? 0) + 1
                blobs[path] = (version, decoded.blob)
                response = (200, Data("{\"version\":\"\(version)\"}".utf8))
            }
        } else if method == "DELETE" { response = (200, Data("{}".utf8)) }
        else if method == "POST" { response = (201, Data("{}".utf8)) }
        else { response = (404, Data("{\"error\":\"not-found\"}".utf8)) }
        if heldMethod == method, let requestedPath = heldPath, path == requestedPath || (requestedPath.hasSuffix("/") && path.hasPrefix(requestedPath)) {
            heldMethod = nil; heldPath = nil
            await withCheckedContinuation { held = $0 }
        }
        return response
    }
}

@MainActor final class SyncEngineTests: XCTestCase {
    private let accountA = String(repeating: "a", count: 64)
    private let accountB = String(repeating: "b", count: 64)
    private let now: Int64 = 1_800_000_000_000
    private struct Fixture {
        let directory: URL; let state: SyncStateStore; let secrets: InMemorySyncSecretStore
        let transport: MemorySyncTransport; let key: SymmetricKey; let engine: SyncEngine
    }
    private func make(enabled: Bool = true, sharing: Bool = false, tabs: [(String, String)] = [("https://phone.example/", "Phone")]) async throws -> Fixture {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let state = SyncStateStore(directory: directory), secrets = InMemorySyncSecretStore()
        let key = SymmetricKey(data: Data(repeating: 42, count: 32)), transport = MemorySyncTransport()
        if enabled {
            try state.update { $0.enabled = true; $0.accountId = accountA; $0.handle = "Account A"; $0.syncTabs = sharing }
            try secrets.writeKey(key)
            try await transport.install(accountA, .settings, settings("light"), key: key)
        }
        let engine = SyncEngine(state: state, secrets: secrets, client: SyncWorkerClient(transport: transport), clock: { self.now }, settingsSink: { _ in }, tabsSource: { tabs })
        return Fixture(directory: directory, state: state, secrets: secrets, transport: transport, key: key, engine: engine)
    }
    private func settings(_ theme: String, at: Int64 = 100) -> JSONValue {
        .object([("values", .object([("theme", .string(theme))])), ("meta", .object([("theme", .number(Double(at)))])), ("tieBreakers", .object([]))])
    }
    private func session(_ device: String) -> JSONValue {
        .object([("devices", .object([(device, .object([("name", .string(device)), ("platform", .string("darwin")), ("updatedAt", .number(Double(now))), ("tabs", .array([.object([("url", .string("https://\(device).example/")), ("title", .string(device))])])), ("groups", .array([]))]))]))])
    }
    private func code(_ account: String, key: SymmetricKey) throws -> String {
        try SyncPairing.encodeRecovery(PairPayload(v: 1, handle: "Account B", accountId: account, key: key.withUnsafeBytes { Data($0).base64EncodedString() }))
    }
    private func waitSuspended(_ transport: MemorySyncTransport) async throws {
        for _ in 0..<2_000 {
            if await transport.isSuspended() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Request did not reach the suspension gate")
        throw SyncError.offline
    }
    private func putCount(_ transport: MemorySyncTransport, suffix: String? = nil) async -> Int {
        await transport.records().filter { $0.method == "PUT" && (suffix == nil || $0.path.hasSuffix(suffix!)) }.count
    }
    func testUnclockedRemoteSettingsSurviveFirstPull() async throws {
        let f = try await make()
        let payload: JSONValue = .object([("values", .object([("theme", .string("dark")), ("futureKey", .object([("nested", .number(7))]))])), ("meta", .object([])), ("tieBreakers", .object([]))])
        try await f.transport.install(accountA, .settings, payload, key: f.key)
        await f.engine.syncNow()
        XCTAssertEqual(f.state.load(.settings)?.canonical(), payload.canonical())
        let puts = await putCount(f.transport, suffix: "/settings")
        XCTAssertEqual(puts, 0, "an unchanged unclocked wire payload must not be rewritten")
    }
    func testSessionBudgetPreservesFullLocalSnapshot() async throws {
        let tabs = (0..<500).map { ("https://example.com/" + String($0) + String(repeating: "x", count: 950), "Tab \($0)") }
        let f = try await make(sharing: true, tabs: tabs)
        await f.engine.syncNow()
        let saved = f.state.load(.session)?["devices"]?[f.state.state.deviceId]
        XCTAssertEqual(saved?["tabs"]?.array.count, 500)
        let before = await putCount(f.transport, suffix: "/session")
        await f.engine.syncNow()
        let after = await putCount(f.transport, suffix: "/session")
        XCTAssertEqual(after, before, "the identical full snapshot must not keep repairing a trimmed upload")
    }
    func testEnableRefusesNewAccount() async throws {
        let f = try await make(enabled: false)
        let result = await f.engine.enable(handle: "Test", passphrase: "correct horse battery staple")
        XCTAssertEqual(result["ok"], .bool(false)); XCTAssertFalse(f.state.state.enabled)
        XCTAssertNil(try f.secrets.readKey())
        let puts = await putCount(f.transport); XCTAssertEqual(puts, 0)
    }
    func testDisableRefusesWipeRemote() async throws {
        let f = try await make()
        let result = await f.engine.disable(wipeRemote: true)
        XCTAssertEqual(result["ok"], .bool(false)); XCTAssertTrue(f.state.state.enabled)
        let requests = await f.transport.records(); XCTAssertTrue(requests.isEmpty)
    }
    func testJoinWithRecoveryAdoptsAccountAndPulls() async throws {
        let f = try await make(enabled: false)
        try await f.transport.install(accountB, .settings, settings("dark"), key: f.key)
        try await f.transport.install(accountB, .session, session("desktop-b"), key: f.key)
        let result = await f.engine.joinWithCode(try code(accountB, key: f.key))
        XCTAssertEqual(result["ok"], .bool(true)); XCTAssertEqual(f.state.state.accountId, accountB)
        XCTAssertEqual(f.engine.remoteDevices.map(\.id), ["desktop-b"])
        XCTAssertNotNil(try f.secrets.readKey())
    }
    func testRateLimitedPassWritesNothing() async throws {
        let f = try await make()
        await f.transport.fail("GET", "v1/blob/\(accountA)/session", statuses: [429])
        await f.engine.syncNow()
        let puts = await putCount(f.transport); XCTAssertEqual(puts, 0)
        XCTAssertEqual(f.state.state.lastError, "rate-limited")
        XCTAssertNil(f.state.load(.settings))
    }
    func testConflictRetryDoesNotRecreateDeletedStores() async throws {
        for store in [SyncStore.settings, .session] {
            let f = try await make(sharing: store == .session)
            let path = "v1/blob/\(accountA)/\(store.rawValue)"
            if store == .settings {
                f.engine.localSettingChanged(key: "theme", value: .string("dark"))
            } else {
                try await f.transport.install(accountA, .session, session("desktop-a"), key: f.key)
            }
            await f.transport.fail("PUT", path, statuses: [409])
            await f.transport.suspendNext("PUT", path)
            let pass = Task { await f.engine.syncNow() }
            try await waitSuspended(f.transport)
            // The account is deleted after our initial GET but before the
            // conflicting PUT completes. Its retry must not create fresh data.
            await f.transport.remove(accountA, .settings)
            await f.transport.remove(accountA, store)
            await f.transport.release()
            await pass.value
            XCTAssertEqual(f.state.state.lastError, "account-gone", store.rawValue)
            let writes = await f.transport.records().filter { $0.method == "PUT" && $0.path == path }
            XCTAssertEqual(writes.count, 1, "a missing retry GET must stop before a second PUT")
            let remote = try await SyncWorkerClient(transport: f.transport).get(accountA, store)
            XCTAssertNil(remote, "the deleted store must stay deleted")
            _ = await f.engine.disable()
        }
    }

    func testConflictRetriesThreeTimesAndThenStops() async throws {
        let f = try await make()
        let path = "v1/blob/\(accountA)/settings"
        await f.transport.fail("PUT", path, statuses: [409, 409, 409, 409])
        f.engine.localSettingChanged(key: "theme", value: .string("dark"))
        await f.engine.syncNow()
        let puts = await putCount(f.transport, suffix: "/settings"); XCTAssertEqual(puts, 4)
        XCTAssertEqual(f.state.state.lastError, "conflict")
        _ = await f.engine.disable()
    }
    func testConflictRetriesThreeTimesThenSucceeds() async throws {
        let f = try await make()
        await f.transport.fail("PUT", "v1/blob/\(accountA)/settings", statuses: [409, 409, 409])
        f.engine.localSettingChanged(key: "theme", value: .string("dark"))
        await f.engine.syncNow()
        let puts = await putCount(f.transport, suffix: "/settings"); XCTAssertEqual(puts, 4)
        XCTAssertNil(f.state.state.lastError)
        _ = await f.engine.disable()
    }
    func testSwitchDiscardsInFlightOldAccountResponse() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .session, session("desktop-a"), key: f.key)
        try await f.transport.install(accountB, .settings, settings("dark"), key: f.key)
        try await f.transport.install(accountB, .session, session("desktop-b"), key: f.key)
        await f.transport.suspendNext("GET", "v1/blob/\(accountA)/session")
        let pass = Task { await f.engine.syncNow() }
        try await waitSuspended(f.transport)
        let recovery = try code(accountB, key: f.key)
        let switchTask = Task { await f.engine.switchWithCode(recovery) }
        await Task.yield(); await f.transport.release()
        await pass.value; let result = await switchTask.value
        XCTAssertEqual(result["ok"], .bool(true))
        XCTAssertEqual(f.engine.remoteDevices.map(\.id), ["desktop-b"])
        XCTAssertFalse(f.state.load(.session)?.jsStringify().contains("desktop-a") ?? true)
        let requests = await f.transport.records()
        let oldSessionIndex = requests.firstIndex { $0.path == "v1/blob/\(accountA)/session" }!
        XCTAssertFalse(requests.dropFirst(oldSessionIndex + 1).contains { $0.path.contains(accountA) })
    }
    func testDisableWaitsForInFlightPutAndStops() async throws {
        let f = try await make()
        f.engine.localSettingChanged(key: "theme", value: .string("dark"))
        await f.transport.suspendNext("PUT", "v1/blob/\(accountA)/settings")
        let pass = Task { await f.engine.syncNow() }
        try await waitSuspended(f.transport)
        let disable = Task { await f.engine.disable() }
        await Task.yield()
        XCTAssertTrue(f.state.state.enabled); XCTAssertNotNil(try f.secrets.readKey())
        await f.transport.release(); await pass.value
        let result = await disable.value
        XCTAssertEqual(result["ok"], .bool(true)); XCTAssertFalse(f.state.state.enabled)
        XCTAssertNil(try f.secrets.readKey()); XCTAssertNil(f.state.load(.settings))
        let requests = await f.transport.records()
        XCTAssertEqual(requests.last?.method, "PUT")
    }
    func testConflictReplyAfterDisableDoesNotStartAnotherRequest() async throws {
        let f = try await make()
        let path = "v1/blob/\(accountA)/settings"
        f.engine.localSettingChanged(key: "theme", value: .string("dark"))
        await f.transport.fail("PUT", path, statuses: [409])
        await f.transport.suspendNext("PUT", path)
        let pass = Task { await f.engine.syncNow() }
        try await waitSuspended(f.transport)
        let countAtBarrier = await f.transport.records().count
        let disable = Task { await f.engine.disable() }
        await Task.yield(); await f.transport.release()
        await pass.value; _ = await disable.value
        let countAfter = await f.transport.records().count
        XCTAssertEqual(countAfter, countAtBarrier)
    }
    func testLocalEditDuringPutSurvivesAndIsPublished() async throws {
        let f = try await make()
        f.engine.localSettingChanged(key: "theme", value: .string("dark"))
        await f.transport.suspendNext("PUT", "v1/blob/\(accountA)/settings")
        let pass = Task { await f.engine.syncNow() }
        try await waitSuspended(f.transport)
        f.engine.localSettingChanged(key: "theme", value: .string("system"))
        await f.transport.release(); await pass.value
        XCTAssertEqual(f.state.load(.settings)?["values"]?["theme"], .string("system"))
        await f.engine.syncNow()
        let client = SyncWorkerClient(transport: f.transport)
        let saved = try await client.get(accountA, .settings)
        let data = try SyncCrypto.open(XCTUnwrap(saved).blob, key: f.key)
        XCTAssertEqual(try JSONValue(data: data)["values"]?["theme"], .string("system"))
        _ = await f.engine.disable()
    }
    func testShareOffPublishesRetractionAndNeverSharedDoesNotPublishSession() async throws {
        let f = try await make(sharing: true)
        await f.engine.syncNow()
        await f.engine.setShareTabs(false)
        let data = try await SyncWorkerClient(transport: f.transport).get(accountA, .session)
        let payload = try JSONValue(data: SyncCrypto.open(XCTUnwrap(data).blob, key: f.key))
        XCTAssertEqual(payload["devices"]?[f.state.state.deviceId]?["retracted"], .bool(true))
        let g = try await make()
        await g.engine.syncNow()
        let puts = await putCount(g.transport, suffix: "/session"); XCTAssertEqual(puts, 0)
    }
    // Leaving a sync never depends on the retraction (review of #1068, P1-2).
    func testDisableWithoutKeyStillTurnsSyncOff() async throws {
        let f = try await make(sharing: true)
        f.secrets.key = nil  // a backup restored to a new phone: sync.json, no device-only key
        let result = await f.engine.disable()
        XCTAssertEqual(result["ok"], .bool(true))
        XCTAssertFalse(f.state.state.enabled); XCTAssertNil(f.state.state.accountId)
        let requests = await f.transport.records(); XCTAssertTrue(requests.isEmpty)
    }
    func testDisableWhenRetractionFailsStillTurnsSyncOff() async throws {
        let f = try await make(sharing: true)
        await f.engine.syncNow()
        let before = await putCount(f.transport)
        await f.transport.fail("GET", "v1/blob/\(accountA)/session", statuses: [503])
        let result = await f.engine.disable()
        XCTAssertEqual(result["ok"], .bool(true))
        XCTAssertFalse(f.state.state.enabled); XCTAssertNil(try f.secrets.readKey())
        let after = await putCount(f.transport); XCTAssertEqual(after, before)
    }
    func testSwitchWithoutKeyJoinsTheNewAccount() async throws {
        let f = try await make(sharing: true)
        f.secrets.key = nil
        try await f.transport.install(accountB, .settings, settings("dark"), key: f.key)
        let result = await f.engine.switchWithCode(try code(accountB, key: f.key))
        XCTAssertEqual(result["ok"], .bool(true)); XCTAssertEqual(f.state.state.accountId, accountB)
        let toA = await f.transport.records().filter { $0.path.contains(accountA) }
        XCTAssertTrue(toA.isEmpty)
    }
    // A sync deleted from desktop is never recreated by the phone (P2-3).
    func testDeletedAccountIsNotRecreated() async throws {
        let f = try await make()
        await f.transport.remove(accountA, .settings)
        f.engine.localSettingChanged(key: "theme", value: .string("dark"))
        await f.engine.syncNow()
        XCTAssertEqual(f.state.state.lastError, "account-gone")
        let puts = await putCount(f.transport); XCTAssertEqual(puts, 0)
    }
    func testRetractionNeverCreatesAMissingTabList() async throws {
        let f = try await make(sharing: true)
        await f.engine.setShareTabs(false)
        XCTAssertFalse(f.state.state.syncTabs)
        let puts = await putCount(f.transport, suffix: "/session"); XCTAssertEqual(puts, 0)
    }
    // Favicons are optional, as on desktop (P2-4).
    func testIconsFailureDoesNotBlockThePass() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .session, session("desktop-a"), key: f.key)
        await f.transport.fail("GET", "v1/blob/\(accountA)/icons", statuses: [503])
        await f.engine.syncNow()
        XCTAssertNil(f.state.state.lastError)
        XCTAssertEqual(f.engine.remoteDevices.map(\.id), ["desktop-a"])
        XCTAssertEqual(f.state.load(.settings)?["values"]?["theme"], .string("light"))
    }
    func testDisablePersistenceFailurePreservesOldKeyAndAccount() async throws {
        let f = try await make()
        try f.state.save(.settings, settings("dark"))
        let stateFile = f.directory.appendingPathComponent("sync.json")
        try FileManager.default.removeItem(at: stateFile)
        try FileManager.default.createDirectory(at: stateFile, withIntermediateDirectories: false)
        let result = await f.engine.disable()
        XCTAssertEqual(result["ok"], .bool(false))
        XCTAssertTrue(f.state.state.enabled)
        XCTAssertEqual(f.state.state.accountId, accountA)
        let restored = try XCTUnwrap(f.secrets.readKey())
        XCTAssertEqual(restored.withUnsafeBytes { Data($0) }, f.key.withUnsafeBytes { Data($0) })
        XCTAssertEqual(f.state.load(.settings)?["values"]?["theme"], .string("dark"))
    }

    func testCancelDuringPairingPostRevokesEntryAndKeepsCodeHidden() async throws {
        let f = try await make()
        await f.transport.suspendNext("POST", "v1/pair/")
        let begin = Task { await f.engine.beginPairing() }
        try await waitSuspended(f.transport)
        await f.engine.cancelPairing()
        await f.transport.release()
        let result = await begin.value
        XCTAssertEqual(result["ok"], .bool(false))
        XCTAssertNil(f.engine.pairing)
        XCTAssertEqual(f.engine.pairingStatus()["active"], .bool(false))
        let calls = await f.transport.records()
        XCTAssertEqual(calls.map(\.method), ["POST", "DELETE"])
        XCTAssertEqual(calls[0].path, calls[1].path)
    }
    func testPairingRegeneratesCodeAfterConflicts() async throws {
        let f = try await make()
        await f.transport.fail("POST", "v1/pair/", statuses: [409, 409])
        let result = await f.engine.beginPairing()
        XCTAssertEqual(result["ok"], .bool(true))
        let posts = await f.transport.records().filter { $0.method == "POST" }
        XCTAssertEqual(posts.count, 3)
        XCTAssertEqual(Set(posts.map(\.path)).count, 3)
        XCTAssertNotNil(f.engine.pairing)
        await f.engine.cancelPairing()
    }
    func testForegroundDoesNotRepeatACompletedPassWithinAMinute() async throws {
        let f = try await make()
        await f.engine.appDidBecomeActive()
        let first = await f.transport.records().count
        await f.engine.appDidBecomeActive()
        let second = await f.transport.records().count
        XCTAssertEqual(first, second)
        XCTAssertGreaterThan(first, 0)
    }


    // MARK: Send to device (M7b)

    private func sendsStore(_ entries: [(String, JSONValue)]) -> JSONValue {
        .object([("devices", .object(entries))])
    }
    private func macEntry(items: [JSONValue] = [], at: Int64? = nil) -> JSONValue {
        .object([("name", .string("Mac")), ("platform", .string("darwin")), ("updatedAt", .number(Double(at ?? now - 1000))), ("items", .array(items))])
    }
    private func sentItem(_ id: String, to: String) -> JSONValue {
        .object([("id", .string(id)), ("to", .string(to)), ("url", .string("https://sent.example/\(id)")), ("title", .string("Sent \(id)")), ("sentAt", .number(Double(now - 60_000)))])
    }
    private func requestCount(_ t: MemorySyncTransport, _ method: String, suffix: String? = nil) async -> Int {
        await t.records().filter { $0.method == method && (suffix == nil || $0.path.hasSuffix(suffix!)) }.count
    }

    func testPassIsFiveGetsAndPresenceAloneNeverCreatesTheStore() async throws {
        let f = try await make()
        await f.engine.syncNow()
        let gets = await requestCount(f.transport, "GET")
        XCTAssertEqual(gets, 5)
        let sendsPuts = await requestCount(f.transport, "PUT", suffix: "/sends")
        XCTAssertEqual(sendsPuts, 0)
        let stored = try await f.transport.value(accountA, .sends, key: f.key)
        XCTAssertNil(stored)
    }
    func testPresencePublishedOncePerDay() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry())]), key: f.key)
        await f.engine.syncNow()
        let own = try await f.transport.value(accountA, .sends, key: f.key)?["devices"]?[f.state.state.deviceId]
        XCTAssertEqual(own?["name"], .string("iPhone"))
        XCTAssertEqual(own?["platform"], .string("ios"))
        await f.engine.syncNow()
        let puts = await requestCount(f.transport, "PUT", suffix: "/sends")
        XCTAssertEqual(puts, 1, "an unchanged presence entry is not republished within a day")
    }
    func testSendPutsImmediatelyToAPresenceOnlyTarget() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry())]), key: f.key)
        await f.engine.syncNow()
        XCTAssertEqual(f.engine.sendTargets.map(\.id), ["mac"], "a device that shares no tabs is still a target")
        let result = await f.engine.send(url: "https://example.org/a", title: "A", to: "mac")
        XCTAssertEqual(result, .sent)
        let items = try await f.transport.value(accountA, .sends, key: f.key)?["devices"]?[f.state.state.deviceId]?["items"]?.array ?? []
        XCTAssertEqual(items.map { $0["to"]?.string }, ["mac"])
        XCTAssertEqual(items.first?["url"], .string("https://example.org/a"))
    }
    func testSendRetries409KeepingOtherEntries() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry())]), key: f.key)
        await f.engine.syncNow()
        await f.transport.fail("PUT", "v1/blob/\(accountA)/sends", statuses: [409])
        let result = await f.engine.send(url: "https://example.org/b", title: "B", to: "mac")
        XCTAssertEqual(result, .sent)
        let devices = try await f.transport.value(accountA, .sends, key: f.key)?["devices"]
        XCTAssertNotNil(devices?["mac"])
        XCTAssertEqual(devices?[f.state.state.deviceId]?["items"]?.array.count, 1)
    }
    func testSendOnOldWorkerReportsUnavailable() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .session, session("desktop-a"), key: f.key)
        await f.transport.retire(.sends)
        await f.engine.syncNow()
        XCTAssertNil(f.state.state.lastError, "an older Worker never makes the pass fail")
        XCTAssertEqual(f.state.state.lastSyncedAt, now)
        XCTAssertEqual(f.engine.sendTargets.map(\.id), ["desktop-a"])
        let result = await f.engine.send(url: "https://example.org/c", title: "C", to: "desktop-a")
        XCTAssertEqual(result, .unavailable)
        let puts = await requestCount(f.transport, "PUT", suffix: "/sends")
        XCTAssertEqual(puts, 0)
        XCTAssertNil(f.state.load(.sends)?["devices"]?[f.state.state.deviceId]?["items"]?.array.first)
    }
    func testSendRefusesThisDeviceAndUnknownDevices() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry())]), key: f.key)
        await f.engine.syncNow()
        let toSelf = await f.engine.send(url: "https://example.org/", title: "", to: f.state.state.deviceId)
        XCTAssertEqual(toSelf, .invalid)
        let toNobody = await f.engine.send(url: "https://example.org/", title: "", to: "nobody")
        XCTAssertEqual(toNobody, .invalid)
        let notHttp = await f.engine.send(url: "file:///etc/hosts", title: "", to: "mac")
        XCTAssertEqual(notHttp, .invalid)
    }
    func testDismissSurvivesRepullAndRelaunch() async throws {
        let f = try await make()
        let own = f.state.state.deviceId
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry(items: [sentItem("p1", to: own), sentItem("p2", to: "pc")]))]), key: f.key)
        await f.engine.syncNow()
        XCTAssertEqual(f.engine.inbox.map(\.id), ["p1"])
        XCTAssertEqual(f.engine.inbox.first?.fromName, "Mac")
        f.engine.dismiss("p1")
        XCTAssertTrue(f.engine.inbox.isEmpty)
        await f.engine.syncNow()
        XCTAssertTrue(f.engine.inbox.isEmpty, "a re-pull does not bring it back")
        let relaunched = SyncEngine(state: SyncStateStore(directory: f.directory), secrets: f.secrets, client: SyncWorkerClient(transport: f.transport), clock: { self.now }, settingsSink: { _ in }, tabsSource: { [] })
        XCTAssertTrue(relaunched.inbox.isEmpty)
    }
    func testSwitchAccountClearsInbox() async throws {
        let f = try await make()
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry(items: [sentItem("p1", to: f.state.state.deviceId)]))]), key: f.key)
        await f.engine.syncNow()
        XCTAssertEqual(f.engine.inbox.count, 1)
        try await f.transport.install(accountB, .settings, settings("dark"), key: f.key)
        _ = await f.engine.switchWithCode(try code(accountB, key: f.key))
        XCTAssertTrue(f.engine.inbox.isEmpty)
        XCTAssertTrue(f.engine.sendTargets.isEmpty)
    }
    func testDisablePublishesSendsRetraction() async throws {
        let f = try await make()
        let own = f.state.state.deviceId
        try await f.transport.install(accountA, .sends, sendsStore([("mac", macEntry())]), key: f.key)
        await f.engine.syncNow()
        _ = await f.engine.disable()
        let devices = try await f.transport.value(accountA, .sends, key: f.key)?["devices"]
        XCTAssertEqual(devices?[own]?["retracted"], .bool(true))
        XCTAssertNotNil(devices?["mac"])
        XCTAssertTrue(f.engine.inbox.isEmpty)
        XCTAssertNil(f.state.load(.sends))
    }

}
