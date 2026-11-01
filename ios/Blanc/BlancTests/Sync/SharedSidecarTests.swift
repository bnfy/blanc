import XCTest

@testable import Blanc

final class SharedSidecarTests: XCTestCase {
  func canon(_ v: JSONValue?) -> String { v?.canonical() ?? "null" }

  func testSidecarMatchesVectors() throws {
    var merges = 0
    for v in try SyncVectors.section("sidecar") {
      let i = v["input"]!
      let name = v["name"]!.string!
      let now = i["now"]!.intValue!
      if i["op"]?.string == "own" {
        XCTAssertEqual(canon(SharedSidecar.entry(i["binding"], now: now)), canon(v["expected"]), name)
        continue
      }
      merges += 1
      let merged = try XCTUnwrap(SharedSidecar.merge(local: i["local"], remote: i["remote"]!, now: now))
      XCTAssertEqual(merged.canonical(), canon(v["expected"]?["sidecar"]), name)
      let hidden = SharedSidecar.hiddenIndices(
        devices: merged["devices"]!, sessionEntries: i["session"]!,
        visibleSpaceIds: Set(i["visible"]!.array.compactMap(\.string)))
      let expected = Dictionary(
        uniqueKeysWithValues: (v["expected"]?["hidden"]?.pairs ?? []).map { (id: String, list: JSONValue) in
          (id, Set(list.array.compactMap { $0.intValue.map(Int.init) }))
        })
      XCTAssertEqual(hidden, expected, name)
    }
    XCTAssertEqual(merges, 3)
  }
  func testOwnEntryFromBindings() {
    let space = String(repeating: "0", count: 31) + "4"
    let entry = SharedSidecar.ownEntry(forUpdatedAt: 1000, bindings: [(i: 2, spaceId: space)], now: 2000)
    XCTAssertEqual(entry?["tabs"]?.array.first?["i"]?.intValue, 2)
    XCTAssertNil(SharedSidecar.ownEntry(forUpdatedAt: 1, bindings: [], now: 2_592_000_001))
  }
  func testOversizedRemoteIsNotTrusted() {
    let huge: JSONValue = .object([("devices", .object([("x", .string(String(repeating: "a", count: 70_000)))]))])
    XCTAssertNil(SharedSidecar.merge(local: nil, remote: huge, now: 1))
  }
  func testExportDropsOwnEntryBeforeAPeers() {
    let space = String(repeating: "0", count: 31) + "4"
    let rows: JSONValue = .array((0..<700).map { .object([("i", .number(Double($0))), ("spaceId", .string(space))]) })
    let state: JSONValue = .object([
      (
        "devices",
        .object([
          ("me", .object([("forUpdatedAt", .number(1000)), ("tabs", rows)])),
          ("peer", .object([("forUpdatedAt", .number(1000)), ("tabs", rows)])),
        ])
      )
    ])
    let out = SharedSidecar.export(state, ownId: "me", now: 2000)
    XCTAssertNil(out?["devices"]?["me"])
    XCTAssertNotNil(out?["devices"]?["peer"])
  }
}
