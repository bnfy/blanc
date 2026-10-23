import XCTest

@testable import Blanc

final class SyncedFavoritesTests: XCTestCase {
  func testFavoritesMergeMatchesVectors() throws {
    for v in try SyncVectors.section("favoritesMerge") {
      let i = v["input"]!
      XCTAssertEqual(
        SyncedFavorites.merge(local: i["local"]!, remote: i["remote"]!, now: i["now"]!.number!)
          .canonical(),
        v["expected"]!.canonical())
    }
  }
  func testReadListKeepsSafeIconsOnly() {
    let f: JSONValue = .object([
      (
        "items",
        .array([
          .object([
            ("id", .string("id")), ("url", .string("https://example.com")),
            ("favicon", .string("https://example.com/remote.png")),
          ])
        ])
      )
    ])
    XCTAssertNil(SyncedFavorites.list(f).first?.favicon)
  }
}
