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
    func testConflictPreservesVersion() async throws {
        let transport = RecordingSyncTransport(status: 409, body: Data("{\"version\":\"v2\"}".utf8))
        do {
            _ = try await SyncWorkerClient(transport: transport).get(String(repeating: "a", count: 64), .settings)
            XCTFail("accepted conflict")
        } catch { XCTAssertEqual(error as? SyncError, .conflict(version: "v2")) }
    }
}
