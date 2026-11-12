import XCTest
@testable import Blanc

/// The change check's rule (design 2026-11-02), replayed from desktop's
/// `sync-changes.js` through the shared vectors.
final class SyncChangesTests: XCTestCase {
    private func changes() throws -> JSONValue {
        guard let section = try SyncVectors.load()["changes"] else { throw SyncVectors.Failure.missingSection("changes") }
        return section
    }
    private func versions(_ value: JSONValue?) -> [String: String?] {
        Dictionary(uniqueKeysWithValues: (value?.pairs ?? []).map { ($0.0, $0.1.string) })
    }

    func testConstantsMatchDesktop() throws {
        let c = try changes()["constants"]
        XCTAssertEqual(SyncChanges.fixedStores, c?["FIXED_STORES"]?.array.compactMap(\.string))
        XCTAssertEqual(SyncChanges.checkMs, c?["CHECK_MS"]?.integer)
        XCTAssertEqual(SyncChanges.fullPassMs, c?["FULL_PASS_MS"]?.integer)
        XCTAssertEqual(SyncChanges.retryPassMs, c?["RETRY_PASS_MS"]?.integer)
        XCTAssertEqual(SyncChanges.checkRetryAfterMs, c?["CHECK_RETRY_AFTER_MS"]?.integer)
        XCTAssertEqual(SyncChanges.openTabsMs, c?["OPEN_TABS_MS"]?.integer)
        XCTAssertEqual(Int64(SyncChanges.rPerPass), c?["R_PER_PASS"]?.integer)
    }
    func testChangedStoresVectors() throws {
        let cases = try changes()["changed"]?.array ?? []
        XCTAssertFalse(cases.isEmpty)
        for vector in cases {
            let input = vector["input"]
            let result = SyncChanges.changedStores(
                named: versions(input?["named"]), seen: versions(input?["seen"]),
                now: input?["now"]?.integer ?? 0, lastOpenTabsFetch: input?["lastOpenTabsFetch"]?.integer ?? 0)
            let name = vector["name"]?.string ?? "?"
            XCTAssertEqual(result.fetch, vector["expected"]?["fetch"]?.array.compactMap(\.string), name)
            XCTAssertEqual(result.deferred, vector["expected"]?["deferred"]?.array.compactMap(\.string), name)
        }
    }
    func testConfirmFetchedVectors() throws {
        let cases = try changes()["confirmed"]?.array ?? []
        XCTAssertFalse(cases.isEmpty)
        for vector in cases {
            let input = vector["input"]
            XCTAssertEqual(
                SyncChanges.confirmFetched(
                    named: versions(input?["named"]), store: input?["store"]?.string ?? "",
                    fetchedVersion: input?["fetchedVersion"]?.string),
                vector["expected"] == .bool(true), vector["name"]?.string ?? "?")
        }
    }
}
