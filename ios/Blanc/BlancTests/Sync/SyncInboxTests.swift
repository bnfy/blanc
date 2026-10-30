import XCTest
import CryptoKit
@testable import Blanc

/// M18 §6: a background pass fetches and keeps; the next foreground applies.
@MainActor final class SyncInboxTests: XCTestCase {
    private let account = String(repeating: "a", count: 64)
    private let other = String(repeating: "b", count: 64)
    private let now: Int64 = 1_800_000_000_000
    private let key = SymmetricKey(data: Data(repeating: 42, count: 32))

    private struct Fixture { let directory: URL; let state: SyncStateStore; let transport: MemorySyncTransport; let engine: SyncEngine }

    private func make(enabled: Bool = true, account: String? = nil) throws -> Fixture {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let state = SyncStateStore(directory: directory), secrets = InMemorySyncSecretStore()
        let transport = MemorySyncTransport()
        if enabled {
            try state.update { $0.enabled = true; $0.accountId = account ?? self.account; $0.handle = "Account A" }
            try secrets.writeKey(key)
        }
        let monotonic = TestClock(0)
        let engine = SyncEngine(
            state: state, secrets: secrets, client: SyncWorkerClient(transport: transport), clock: { self.now },
            monotonic: { monotonic.now() }, sleep: { monotonic.advance($0) }, settingsSink: { _ in }, tabsSource: { [] })
        return Fixture(directory: directory, state: state, transport: transport, engine: engine)
    }
    private func settings(_ theme: String, at: Int64) -> JSONValue {
        .object([("values", .object([("theme", .string(theme))])), ("meta", .object([("theme", .number(Double(at)))])), ("tieBreakers", .object([]))])
    }
    private func session(_ device: String) -> JSONValue {
        .object([("devices", .object([(device, .object([
            ("name", .string(device)), ("platform", .string("darwin")), ("updatedAt", .number(Double(now))),
            ("tabs", .array([.object([("url", .string("https://\(device).example/")), ("title", .string(device))])])),
            ("groups", .array([])),
        ]))]))])
    }
    private func installRemote(_ f: Fixture) throws {
        try f.transport.install(account, .settings, settings("dark", at: 500), key: key)
        try f.transport.install(account, .session, session("mac"), key: key)
    }

    func testFetchAndKeepPublishesNothing() async throws {
        let f = try make()
        try installRemote(f)
        let kept = await f.engine.fetchAndKeep()
        XCTAssertEqual(kept?.accountId, account)
        XCTAssertNotNil(kept?.payload(.session))
        XCTAssertEqual(f.transport.records().filter { $0.method != "GET" }.count, 0, "reads only")
        XCTAssertEqual(SyncInbox.load(from: f.directory), kept)
        XCTAssertTrue(f.engine.remoteDevices.isEmpty, "nothing applied in the background")
        XCTAssertNil(f.state.load(.session)?["devices"]?["mac"], "the local cache is untouched")
    }

    func testFetchAndKeepWithoutAccountKeepsNothing() async throws {
        let f = try make(enabled: false)
        let kept = await f.engine.fetchAndKeep()
        XCTAssertNil(kept)
        XCTAssertNil(SyncInbox.load(from: f.directory))
        XCTAssertTrue(f.transport.records().isEmpty)
    }

    func testOfflineKeepsNothing() async throws {
        let f = try make()
        f.transport.fail("GET", "v1/blob/", statuses: [503, 503, 503, 503, 503, 503, 503, 503])
        let kept = await f.engine.fetchAndKeep()
        XCTAssertNil(kept)
        XCTAssertNil(SyncInbox.load(from: f.directory))
    }

    func testApplyInboxMergesThenDeletes() async throws {
        let f = try make()
        try installRemote(f)
        await f.engine.fetchAndKeep()
        f.engine.applyInbox()
        XCTAssertEqual(f.engine.remoteDevices.map(\.id), ["mac"])
        XCTAssertNotNil(f.state.load(.session)?["devices"]?["mac"])
        XCTAssertEqual(f.state.load(.settings)?["values"]?["theme"]?.string, "dark")
        XCTAssertNil(SyncInbox.load(from: f.directory), "applied once")
    }

    func testApplyInboxIgnoresAnotherAccount() throws {
        let f = try make(account: other)
        try SyncInbox(accountId: account, fetchedAt: now, documents: ["session": session("mac")]).save(in: f.directory)
        f.engine.applyInbox()
        XCTAssertTrue(f.engine.remoteDevices.isEmpty)
        XCTAssertNil(SyncInbox.load(from: f.directory), "another account's inbox is deleted unread")
    }

    func testApplyInboxAfterSyncTurnedOffDeletesUnread() throws {
        let f = try make(enabled: false)
        try SyncInbox(accountId: account, fetchedAt: now, documents: ["session": session("mac")]).save(in: f.directory)
        f.engine.applyInbox()
        XCTAssertTrue(f.engine.remoteDevices.isEmpty)
        XCTAssertNil(SyncInbox.load(from: f.directory))
    }

    /// Review Focus 3: sync is turned off while the background pass waits on
    /// the network; nothing is kept for the next foreground to apply.
    func testDisconnectMidPassKeepsNothing() async throws {
        let f = try make()
        try installRemote(f)
        f.transport.suspendNext("GET", "v1/blob/\(account)/")
        let pass = Task { await f.engine.fetchAndKeep() }
        for _ in 0..<2_000 where !f.transport.isSuspended() { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(f.transport.isSuspended())
        let leaving = Task { await f.engine.disable() }
        try await Task.sleep(for: .milliseconds(50))
        f.transport.release()
        _ = await leaving.value
        let kept = await pass.value
        XCTAssertNil(kept)
        XCTAssertNil(SyncInbox.load(from: f.directory))
    }

    func testExpiredBudgetStopsWaitingReads() async throws {
        let f = try make()
        try installRemote(f)
        let kept = await f.engine.fetchAndKeep(expired: { true })
        XCTAssertNil(kept, "no read started, so there's nothing to keep")
        XCTAssertTrue(f.transport.records().isEmpty)
    }

    func testInboxRoundTrips() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let inbox = SyncInbox(accountId: account, fetchedAt: now, documents: ["settings": settings("light", at: 1)])
        try inbox.save(in: directory)
        XCTAssertEqual(SyncInbox.load(from: directory), inbox)
        SyncInbox.remove(from: directory)
        XCTAssertNil(SyncInbox.load(from: directory))
    }
}
