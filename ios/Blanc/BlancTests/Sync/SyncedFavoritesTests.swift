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
  func testFavoritesEditsMatchDesktopVectors() throws {
    for v in try SyncVectors.section("favoritesEdit") {
      let i = v["input"]!, a = i["args"]!, store = i["store"]!, now = i["now"]!.number!
      let name = v["name"]!.string!
      let result: JSONValue
      switch i["operation"]!.string! {
      case "toggle":
        result = SyncedFavorites.toggle(
          store, url: a["url"]!.string!, title: a["title"]!.string!,
          favicon: a["favicon"]?.string, now: now, makeId: { i["id"]!.string! }
        ).store
      case "remove": result = SyncedFavorites.remove(store, id: a["id"]!.string!, now: now)
      case "setFolder":
        result = SyncedFavorites.setFolder(
          store, id: a["id"]!.string!, folder: a["folder"]?.string, now: now)
      case "renameFolder":
        result = SyncedFavorites.renameFolder(
          store, from: a["from"]!.string!, to: a["to"]!.string!, now: now)
      default: result = SyncedFavorites.removeFolder(store, name: a["name"]!.string!, now: now)
      }
      XCTAssertEqual(result.canonical(), v["expected"]!.canonical(), name)
    }
  }
  func testToggleReportsState() {
    let empty: JSONValue = .object([("items", .array([])), ("tombstones", .array([]))])
    let on = SyncedFavorites.toggle(
      empty, url: "https://a.test/", title: "A", favicon: nil, now: 1, makeId: { "x" })
    XCTAssertTrue(on.favorited)
    XCTAssertTrue(SyncedFavorites.isFavorite(on.store, url: "https://a.test/"))
    let off = SyncedFavorites.toggle(
      on.store, url: "https://a.test/", title: "A", favicon: nil, now: 2, makeId: { "y" })
    XCTAssertFalse(off.favorited)
    XCTAssertFalse(SyncedFavorites.isFavorite(off.store, url: "https://a.test/"))
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
