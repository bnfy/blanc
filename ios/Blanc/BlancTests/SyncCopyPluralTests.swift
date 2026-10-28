import XCTest
@testable import Blanc

final class SyncCopyPluralTests: XCTestCase {
    func testPluralBranches() {
        let m = "{count, plural, one {# tab} other {# tabs}}"
        XCTAssertEqual(SyncCopy.format(m, count: 1, locale: "en"), "1 tab")
        XCTAssertEqual(SyncCopy.format(m, count: 3, locale: "en"), "3 tabs")
        XCTAssertEqual(SyncCopy.format(m, count: 0, locale: "en"), "0 tabs")
        XCTAssertEqual(SyncCopy.format(m, count: 0, locale: "fr"), "0 tab")
    }

    func testNestedPlaceholdersAndSurroundingText() {
        let m = "{count, plural, one {{name} · # tab} other {{name} · # tabs}} left"
        XCTAssertEqual(SyncCopy.format(m, count: 2, locale: "en", ["name": "Work"]), "Work · 2 tabs left")
    }

    func testCatalogMessage() {
        XCTAssertEqual(SyncCopy.plural("newtab.groups.count", count: 4), "4 tabs")
    }
}
