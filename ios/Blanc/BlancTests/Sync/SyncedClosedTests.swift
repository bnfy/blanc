import XCTest

@testable import Blanc

final class SyncedClosedTests: XCTestCase {
  func canon(_ v: JSONValue?) -> String { v?.canonical() ?? "null" }
  func opt(_ v: JSONValue?) -> JSONValue? { v == .null ? nil : v }

  func testClosedModelMatchesVectors() throws {
    var ops = Set<String>()
    for v in try SyncVectors.section("closedModel") {
      let i = v["input"]!
      let name = v["name"]!.string!
      let now = i["now"]?.number ?? 0
      let op = i["op"]!.string!
      ops.insert(op)
      switch op {
      case "own":
        let r = SyncedClosed.ownEntry(
          previous: opt(i["previous"]), name: i["name"]!.string!, platform: i["platform"]!.string!,
          now: now, force: i["force"]?.bool ?? false)
        XCTAssertEqual(
          JSONValue.object([("entry", r.entry), ("changed", .bool(r.changed))]).canonical(),
          canon(v["expected"]), name)
      case "merge":
        XCTAssertEqual(
          SyncedClosed.mergeDevices(local: i["local"], remote: i["remote"], ownId: i["ownId"]!.string!, now: now)
            .canonical(), canon(v["expected"]), name)
      case "budget":
        XCTAssertEqual(
          SyncedClosed.applyBudget(i["devices"]!, ownId: i["ownId"]!.string!, maxBytes: Int(i["maxBytes"]!.intValue!))
            .canonical(), canon(v["expected"]), name)
      case "inbox":
        let rows = SyncedClosed.inboxRows(
          i["devices"]!, ownId: i["ownId"]!.string!, dismissed: i["dismissed"]!, now: now)
        XCTAssertEqual(JSONValue.array(rows).canonical(), canon(v["expected"]), name)
        XCTAssertEqual(
          SyncedClosed.inbox(i["devices"]!, ownId: i["ownId"]!.string!, dismissed: i["dismissed"]!, now: now)
            .map(\.id), rows.compactMap { $0["id"]?.string })
      case "prune":
        XCTAssertEqual(
          SyncedClosed.pruneDismissed(i["dismissed"]!, now: now).canonical(), canon(v["expected"]), name)
      case "add":
        let entry = SyncedClosed.addItem(
          to: opt(i["previous"]), item: i["item"]!, name: i["name"]!.string!, platform: i["platform"]!.string!,
          now: now)
        XCTAssertEqual(entry != nil, v["expected"]?["added"]?.bool, name)
        XCTAssertEqual(canon(entry ?? opt(i["previous"])), canon(v["expected"]?["entry"]), name)
      default: XCTFail(op)
      }
    }
    XCTAssertEqual(ops, ["own", "merge", "budget", "inbox", "prune", "add"])
  }
}
