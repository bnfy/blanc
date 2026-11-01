import XCTest

@testable import Blanc

final class SyncSendsTests: XCTestCase {
  private func names(_ v: JSONValue?) -> [String: String] {
    Dictionary(uniqueKeysWithValues: (v?.pairs ?? []).compactMap { id, e in e["name"]?.string.map { (id, $0) } })
  }
  private func dismissed(_ v: JSONValue?) -> [String: Double] {
    Dictionary(uniqueKeysWithValues: (v?.pairs ?? []).compactMap { id, at in at.number.map { (id, $0) } })
  }

  func testSendsMergeMatchesDesktopVectors() throws {
    for v in try SyncVectors.section("sendsMerge") {
      let i = v["input"]!
      let ownId = i["ownId"]!.string!
      let merged = SyncSends.merge(
        local: i["local"]!, remote: i["remote"]!, ownId: ownId, now: i["now"]!.number!)
      XCTAssertEqual(merged.canonical(), v["expected"]!["merged"]!.canonical(), v["name"]!.string!)
      let budgeted = SyncSends.applyBudget(
        merged, ownId: ownId, maxBytes: i["maxBytes"]?.intValue.map(Int.init) ?? SyncSends.budgetBytes)
      XCTAssertEqual(budgeted.canonical(), v["expected"]!["budgeted"]!.canonical(), v["name"]!.string!)
    }
  }

  func testSendsInboxMatchesDesktopVectors() throws {
    for v in try SyncVectors.section("sendsInbox") {
      let i = v["input"]!
      if i["operation"]?.string == "pruneDismissed" {
        let pruned = SyncSends.pruneDismissed(dismissed(i["dismissed"]), now: i["now"]!.number!)
        XCTAssertEqual(pruned, dismissed(v["expected"]))
        continue
      }
      let rows = SyncSends.inboxRows(
        i["devices"]!, ownId: i["ownId"]!.string!, dismissed: dismissed(i["dismissed"]),
        now: i["now"]!.number!)
      XCTAssertEqual(JSONValue.array(rows).canonical(), v["expected"]!.canonical())
    }
  }

  func testSendsTargetsMatchDesktopVectors() throws {
    for v in try SyncVectors.section("sendsTargets") {
      let i = v["input"]!
      let rows = SyncSends.targetRows(
        sends: i["sends"]!, session: i["session"]!, ownId: i["ownId"]!.string!,
        names: names(i["deviceNames"]))
      XCTAssertEqual(JSONValue.array(rows).canonical(), v["expected"]!.canonical())
    }
  }

  func testOwnEntryAndAddItemMatchDesktopVectors() throws {
    for v in try SyncVectors.section("sendsOwn") {
      let i = v["input"]!
      let previous = i["previous"].flatMap { $0 == .null ? nil : $0 }
      let label = v["name"]!.string!
      if i["operation"]?.string == "addItem" {
        let result = SyncSends.addItem(
          to: previous, url: i["url"]!.string!, title: i["title"]!.string!, to: i["to"]!.string!,
          ownId: i["ownId"]!.string!, now: i["now"]!.number!, makeId: { i["id"]!.string! })
        switch result {
        case .success(let added):
          let got: JSONValue = .object([("entry", added.entry), ("item", added.item)])
          XCTAssertEqual(got.canonical(), v["expected"]!.canonical(), label)
        case .failure(let error):
          XCTAssertEqual(v["expected"]!["error"]?.string, error == .selfTarget ? "self" : "invalid", label)
        }
        continue
      }
      let own = SyncSends.ownEntry(
        previous: previous, name: i["name"]!.string!, platform: i["platform"]!.string!,
        now: i["now"]!.number!, force: i["force"]?.bool ?? false)
      XCTAssertEqual(own.entry.canonical(), v["expected"]!["entry"]!.canonical(), label)
      XCTAssertEqual(own.changed, v["expected"]!["changed"]!.bool, label)
    }
  }

  func testRejectsNonHTTPAndSelf() {
    let now = 1_800_000_000_000.0
    for url in ["ftp://x.test/", "javascript:alert(1)", "blanc://newtab/", "https://"] {
      XCTAssertNil(SyncSends.httpURL(.string(url)), url)
    }
    if case .success = SyncSends.addItem(
      to: nil, url: "https://x.test/", title: "", to: "me", ownId: "me", now: now, makeId: { "a" })
    {
      XCTFail("sending to this device must be refused")
    }
  }
}
