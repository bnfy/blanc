import XCTest
import SwiftUI
@testable import Blanc

/// Space colours and symbols follow desktop's `space-identity.js`.
final class SpaceIdentityTests: XCTestCase {
    func testPaintMatchesDesktop() throws {
        for vector in try SyncVectors.section("spaceInk") {
            let input = vector["input"]
            let paint = SpaceIdentity.paint(input?["hex"]?.text ?? "", theme: input?["theme"]?.text ?? "")
            if case .null? = vector["expected"] { XCTAssertNil(paint, vector["name"]?.text ?? ""); continue }
            XCTAssertEqual(paint, SpaceIdentity.Paint(fill: vector["expected"]?["fill"]?.text ?? "",
                                                      on: vector["expected"]?["on"]?.text ?? "",
                                                      edge: vector["expected"]?["edge"]?.boolean ?? false),
                           vector["name"]?.text ?? "")
        }
    }

    func testDefaultsMatchDesktop() throws {
        for vector in try SyncVectors.section("spaceDefaults") {
            let existing = (vector["input"]?["existing"]?.array ?? []).map { ($0["color"]?.text ?? "", $0["symbol"]?.text ?? "") }
            let picked = SpaceIdentity.defaults(existing: existing)
            XCTAssertEqual(picked.color, vector["expected"]?["color"]?.text)
            XCTAssertEqual(picked.symbol, vector["expected"]?["symbol"]?.text)
        }
    }

    func testEverySymbolDrawsInsideItsBox() {
        XCTAssertEqual(SpaceIdentity.presets.count, 8)
        XCTAssertEqual(SpaceIdentity.symbolIds.count, 16)
        let box = CGRect(x: 0, y: 0, width: 24, height: 24)
        for id in SpaceIdentity.symbolIds {
            let bounds = SpaceIdentity.symbolPath(id, in: box).boundingRect
            XCTAssertGreaterThan(bounds.width, 4, id)
            XCTAssertGreaterThan(bounds.height, 4, id)
            XCTAssertTrue(box.insetBy(dx: -1, dy: -1).contains(bounds), "\(id) \(bounds)")
        }
        XCTAssertFalse(SpaceIdentity.glyphPath(in: box).isEmpty)
    }

    func testArcCommandDrawsAQuarterCircle() {
        let bounds = SVGPath.parse("M0 10a10 10 0 0 1 10-10").boundingRect
        XCTAssertEqual(bounds.minX, 0, accuracy: 0.01)
        XCTAssertEqual(bounds.minY, 0, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxY, 10, accuracy: 0.01)
    }
}
