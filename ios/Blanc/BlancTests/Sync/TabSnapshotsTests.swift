import XCTest

@testable import Blanc

final class TabSnapshotsTests: XCTestCase {
  func testSessionMergeMatchesVectors() throws {
    for v in try SyncVectors.section("sessionMerge") where v["input"]?["operation"] == nil {
      let i = v["input"]!
      XCTAssertEqual(
        TabSnapshots.merge(
          local: i["local"]!, remote: i["remote"]!, ownId: i["ownId"]!.string!,
          now: i["now"]!.intValue!
        ).canonical(), v["expected"]!.canonical())
    }
  }
  func testOwnEntryMatchesDesktopBuild() throws {
    let v = try XCTUnwrap(
      SyncVectors.section("sessionMerge").first { $0["input"]?["operation"]?.string == "ownEntry" })
    let i = v["input"]!
    let tabs = i["tabs"]!.array.map { (url: $0["url"]!.string!, title: $0["title"]!.string!) }
    XCTAssertEqual(
      TabSnapshots.ownEntry(tabs: tabs, previous: nil, now: i["now"]!.intValue!).canonical(),
      v["expected"]!.canonical())
  }
  func testOwnEntryKeepsClockWithoutChange() {
    let tabs = [(url: "https://example.com", title: "Example")]
    let first = TabSnapshots.ownEntry(tabs: tabs, previous: nil, now: 1000)
    XCTAssertEqual(TabSnapshots.ownEntry(tabs: tabs, previous: first, now: 3_601_000), first)
    XCTAssertEqual(
      TabSnapshots.ownEntry(tabs: tabs, previous: first, now: 90_001_000)["updatedAt"]?.intValue,
      90_001_000)
  }
  /// Desktop's F27 export with groups, the membership clock and sidecar bindings.
  func testMembershipScriptMatchesDesktop() throws {
    let steps = try XCTUnwrap(SyncVectors.section("tabSnapshotMembership").first?["input"]?["steps"]).array
    var previous: JSONValue?
    var previousMembership: String?
    for (n, step) in steps.enumerated() {
      // Private tabs never reach the snapshot: the caller leaves them out.
      let tabs = step["tabs"]!.array.filter { $0["private"] != .bool(true) }.map { t in
        SnapshotTab(
          url: t["url"]!.string!, title: t["customTitle"]?.string ?? t["title"]!.string!,
          groupId: t["groupId"]?.string, pinned: t["pinned"]?.bool ?? false,
          sharedSpaceId: t["sharedSpaceId"]?.string)
      }
      let groups = step["groups"]!.array.map { (id: $0["id"]!.string!, name: $0["name"]!.string!) }
      let membership = TabSnapshots.membership(tabs)
      let entry = TabSnapshots.ownEntry(
        tabs: tabs, groups: groups, previous: previous, now: step["now"]!.intValue!,
        membership: membership, previousMembership: previousMembership)
      let expected = step["expected"]!
      XCTAssertEqual(entry.canonical(), expected["entry"]!.canonical(), "step \(n)")
      XCTAssertEqual(entry.canonical(), expected["stored"]!.canonical(), "step \(n)")
      let bindings = TabSnapshots.bindings(tabs: tabs, entry: entry)
      let sidecar: JSONValue = .object([
        ("forUpdatedAt", entry["updatedAt"]!),
        ("tabs", .array(bindings.map { .object([("i", .number(Double($0.i))), ("spaceId", .string($0.spaceId))]) })),
      ])
      XCTAssertEqual(sidecar.canonical(), expected["bindings"]!.canonical(), "step \(n)")
      previous = entry
      previousMembership = membership
    }
  }
  func testTrimmedForUploadFitsBudget() {
    let tabs = (0..<500).map {
      (url: "https://example.com/\($0)", title: String(repeating: "😀", count: 100))
    }
    let own = TabSnapshots.ownEntry(tabs: tabs, previous: nil, now: 1000)
    let full: JSONValue = .object([("own", own), ("other", own)])
    let trimmed = TabSnapshots.trimmedForUpload(full, ownId: "own")
    XCTAssertLessThanOrEqual(trimmed.canonical().utf8.count, TabSnapshots.budgetBytes)
    XCTAssertNotNil(trimmed["other"])
    XCTAssertLessThan(trimmed["own"]!["tabs"]!.array.count, 500)
  }
  func testDevicesUsesSyncedNamesAndSkipsRetracted() {
    let e = TabSnapshots.ownEntry(
      tabs: [(url: "https://example.com", title: "Example")], previous: nil, now: 1000)
    let list = TabSnapshots.devices(
      .object([("phone", e), ("gone", TabSnapshots.retraction(now: 2000))]), excluding: "mine",
      names: ["phone": "My phone"])
    XCTAssertEqual(list.count, 1)
    XCTAssertEqual(list.first?.name, "My phone")
  }
  func testIconRejectsInvalidPNG() {
    XCTAssertNil(SyncedIcons.valid("https://example.com/icon.png"))
    var data = Data([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 48, 0, 0, 0, 48,
    ])
    XCTAssertNil(SyncedIcons.valid("data:image/png;base64," + data.base64EncodedString()))
    data[19] = 32
    data[23] = 32
    XCTAssertNotNil(SyncedIcons.valid("data:image/png;base64," + data.base64EncodedString()))
    XCTAssertNil(SyncedIcons.valid("data:image/png;base64," + String(repeating: "A", count: 9000)))
  }
}
