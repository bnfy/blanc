import XCTest
@testable import Blanc

/// The desktop sheet's QR link (design 2026-10-28 §7.3), checked against the
/// cases desktop's `pairLinkCode` was built from, so both platforms agree.
final class PairLinkTests: XCTestCase {
    func testSharedPairLinkVectors() throws {
        let vectors = try SyncVectors.section("pairLinks")
        XCTAssertGreaterThanOrEqual(vectors.count, 30)
        for vector in vectors {
            let name = vector["name"]?.string ?? "?"
            let input = try XCTUnwrap(vector["input"]?.string, name)
            XCTAssertEqual(PairLink.code(from: input), vector["expected"]?.string, name)
        }
    }

    func testLinkRoundTrips() throws {
        for _ in 0..<3 {
            let code = SyncPairing.generateCode()
            let link = try XCTUnwrap(PairLink.link(for: code))
            XCTAssertEqual(link.absoluteString, "https://blanc.day/pair#\(code)")
            XCTAssertEqual(PairLink.code(from: link), code)
        }
        XCTAssertNil(PairLink.link(for: "k7mr-4px2"), "only a normalized code makes a link")
    }
}
