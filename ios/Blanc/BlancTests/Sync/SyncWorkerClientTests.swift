import XCTest
@testable import Blanc

final class SyncWorkerClientTests: XCTestCase {
    func testGetNotFoundReturnsNil() async throws {
        let client = SyncWorkerClient(transport: StubSyncTransport(status: 404, body: Data()))
        let result = try await client.get(String(repeating: "a", count: 64), .settings)
        XCTAssertNil(result)
    }
    func testStatusMapping() async {
        for (status, expected) in [(429, SyncError.rateLimited), (503, .busy), (413, .tooLarge)] {
            do {
                _ = try await SyncWorkerClient(transport: StubSyncTransport(status: status, body: Data())).get(String(repeating: "a", count: 64), .settings)
                XCTFail("accepted HTTP \(status)")
            } catch { XCTAssertEqual(error as? SyncError, expected) }
        }
    }
    func testTakePairDistinguishesJSONAndPlain404() async {
        for (body, expected) in [("{\"error\":\"not-found\"}", SyncError.pairNotFound), ("not found", .pairUnavailable)] {
            do {
                _ = try await SyncWorkerClient(transport: StubSyncTransport(status: 404, body: Data(body.utf8))).takePair(String(repeating: "a", count: 64))
                XCTFail("accepted missing pair")
            } catch { XCTAssertEqual(error as? SyncError, expected) }
        }
    }
}
struct StubSyncTransport: SyncTransport {
    let status: Int
    let body: Data
    func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) { (status, self.body) }
}

actor RecordingSyncTransport: SyncTransport {
    private(set) var calls: [(String, String, Data?)] = []
    let status: Int
    let body: Data
    init(status: Int, body: Data) { self.status = status; self.body = body }
    func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) {
        calls.append((method, path, body)); return (status, self.body)
    }
}
extension SyncWorkerClientTests {
    func testPutSendsIfVersionNullOnCreate() async throws {
        let transport = RecordingSyncTransport(status: 200, body: Data("{\"version\":\"v1\"}".utf8))
        let envelope = SyncEnvelope(v: 1, iv: "aXY=", ct: "Y3Q=", tag: "dGFn")
        let version = try await SyncWorkerClient(transport: transport).put(String(repeating: "a", count: 64), .settings, ifVersion: nil, blob: envelope)
        XCTAssertEqual(version, "v1")
        let calls = await transport.calls
        XCTAssertEqual(calls.count, 1); XCTAssertEqual(calls[0].0, "PUT")
        XCTAssertEqual(calls[0].1, "v1/blob/" + String(repeating: "a", count: 64) + "/settings")
        let object = try JSONSerialization.jsonObject(with: XCTUnwrap(calls[0].2)) as? [String: Any]
        XCTAssertTrue(object?["ifVersion"] is NSNull)
        XCTAssertEqual((object?["blob"] as? [String: Any])?["ct"] as? String, "Y3Q=")
    }
    func testGetParsesVersionAndBlob() async throws {
        let envelope = SyncEnvelope(v: 1, iv: "aXY=", ct: "Y3Q=", tag: "dGFn")
        struct Response: Encodable { let version: String; let blob: SyncEnvelope }
        let transport = RecordingSyncTransport(status: 200, body: try JSONEncoder().encode(Response(version: "v2", blob: envelope)))
        let result = try await SyncWorkerClient(transport: transport).get(String(repeating: "a", count: 64), .settings)
        XCTAssertEqual(result?.version, "v2"); XCTAssertEqual(result?.blob, envelope)
    }
    func testSpaceStoresUseTheirOwnPathAndBadNamesAreRefused() async throws {
        let account = String(repeating: "a", count: 64), space = String(repeating: "0", count: 31) + "f"
        let transport = RecordingSyncTransport(status: 200, body: Data("{\"version\":\"v1\"}".utf8))
        let client = SyncWorkerClient(transport: transport)
        let envelope = SyncEnvelope(v: 1, iv: "aXY=", ct: "Y3Q=", tag: "dGFn")
        _ = try await client.put(account, storeName: "space-" + space, ifVersion: nil, blob: envelope)
        _ = try await client.put(account, .spaces, ifVersion: nil, blob: envelope)
        for name in ["closed", "shared"] { _ = try await client.put(account, storeName: name, ifVersion: "v1", blob: envelope) }
        let paths = await transport.calls.map(\.1)
        XCTAssertEqual(paths, ["space-" + space, "spaces", "closed", "shared"].map { "v1/blob/\(account)/\($0)" })
        for bad in ["space-" + space.uppercased(), "space-abc", "space-", "../settings", "favorites", "space-\(space)/x"] {
            do {
                _ = try await client.get(account, storeName: bad)
                XCTFail("accepted \(bad)")
            } catch { XCTAssertEqual(error as? SyncError, .invalidStore, bad) }
        }
        let afterBad = await transport.calls.count
        XCTAssertEqual(afterBad, 4, "a refused name never reaches the Worker")
    }
    func testUnknownStoreIsNotAPlainMiss() async throws {
        let account = String(repeating: "a", count: 64)
        let missing = try await SyncWorkerClient(transport: StubSyncTransport(status: 404, body: Data("not found".utf8))).get(account, storeName: "spaces")
        XCTAssertNil(missing, "a blob not yet written")
        do {
            _ = try await SyncWorkerClient(transport: StubSyncTransport(status: 404, body: Data("unknown store".utf8))).get(account, storeName: "space-" + String(repeating: "1", count: 32))
            XCTFail("an older Worker read as a missing blob")
        } catch { XCTAssertEqual(error as? SyncError, .unknownStore) }
    }
    func testConflictPreservesVersion() async throws {
        let transport = RecordingSyncTransport(status: 409, body: Data("{\"version\":\"v2\"}".utf8))
        do {
            _ = try await SyncWorkerClient(transport: transport).get(String(repeating: "a", count: 64), .settings)
            XCTFail("accepted conflict")
        } catch { XCTAssertEqual(error as? SyncError, .conflict(version: "v2")) }
    }
}
extension SyncWorkerClientTests {
    private var account: String { String(repeating: "a", count: 64) }
    private func versions(_ status: Int, _ body: String) async throws -> [String: String?]? {
        try await SyncWorkerClient(transport: StubSyncTransport(status: status, body: Data(body.utf8))).versions(account)
    }
    func testVersionsReadsEveryFixedStore() async throws {
        let transport = RecordingSyncTransport(status: 200, body: Data(#"{"v":1,"stores":{"bookmarks":"b1","settings":"s1","session":null,"icons":null,"sends":"x","closed":null,"shared":null,"spaces":"i9"}}"#.utf8))
        let named = try await SyncWorkerClient(transport: transport).versions(account)
        XCTAssertEqual(named?["settings"], .some("s1"))
        XCTAssertEqual(named?["spaces"], .some("i9"))
        XCTAssertEqual(named?["session"], .some(nil), "a store not written yet is named null")
        XCTAssertEqual(named?.count, 8)
        let calls = await transport.calls
        XCTAssertEqual(calls.map(\.0), ["GET"]); XCTAssertEqual(calls.map(\.1), ["v1/versions/" + account])
    }
    func testVersionsWithoutALedgerIsUnsupported() async throws {
        let named = try await versions(200, #"{"v":1,"stores":null}"#)
        XCTAssertNil(named)
    }
    func testAnOlderWorkerIsUnsupported() async throws {
        let named = try await versions(404, "not found")
        XCTAssertNil(named)
    }
    func testABadBodyOrAServerErrorIsUnsupported() async throws {
        for (status, body) in [(200, "{"), (200, #"{"v":2,"stores":{}}"#), (200, #"{"v":1,"stores":{"settings":"s1"}}"#), (200, #"{"v":1,"stores":{"bookmarks":1,"settings":null,"session":null,"icons":null,"sends":null,"closed":null,"shared":null,"spaces":null}}"#), (500, ""), (503, "")] {
            let named = try await versions(status, body)
            XCTAssertNil(named, "\(status) \(body)")
        }
    }
    func testVersionsRateLimitedThrows() async throws {
        do {
            _ = try await versions(429, "")
            XCTFail("a 429 read as unsupported")
        } catch { XCTAssertEqual(error as? SyncError, .rateLimited) }
    }
}
