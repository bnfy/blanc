import XCTest

@testable import Blanc

@MainActor final class SharedSpacesStateTests: XCTestCase {
  typealias M = SharedSpacesModel
  var directory: URL!
  var clock: Int64 = 1_800_000_000_000
  let space = String(repeating: "0", count: 30) + "99"
  func id(_ n: Int) -> String { String(String(repeating: "0", count: 32) + String(n, radix: 16)).suffix(32).description }

  override func setUp() {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  }
  override func tearDown() { try? FileManager.default.removeItem(at: directory) }
  func make() -> SharedSpacesState { SharedSpacesState(directory: directory, now: { [unowned self] in self.clock }) }
  func f(_ v: JSONValue, _ c: Int64 = 100, _ by: String = "phone") -> JSONValue { M.field(v, c, by) }
  func tab(_ n: Int, c: Int64 = 100, by: String = "phone") throws -> JSONValue {
    .object([
      ("nav", f(.object([("url", .string("https://example.test/\(n)")), ("title", .string("Tab \(n)"))]), c, by)),
      ("name", f(.null, c, by)), ("pinned", f(.bool(false), c, by)), ("groupId", f(.null, c, by)),
      ("pos", f(.string(try M.keyFor("", "", id(n))), c, by)), ("deleted", f(.bool(false), c, by)),
    ])
  }
  func blob(_ tabs: [(String, JSONValue)]) -> JSONValue {
    .object([("v", .number(1)), ("spaceId", .string(space)), ("groups", .object([])), ("tabs", .object(tabs))])
  }

  func testRebindToAnotherAccountClearsStateButKeepsTheRequestLog() throws {
    let state = make()
    state.rebind(accountId: "a")
    state.setEnabled(true)
    state.setRequestState(.init(log: [5, 6], nextClass: "S", cursors: ["F": "session"], windowLimit: 10, backoffUntil: nil))
    try state.noteLocalSpace(id: space, blob: blob([(id(1), try tab(1))]), edits: nil)
    state.rebind(accountId: "b")
    XCTAssertEqual(state.accountId, "b")
    XCTAssertFalse(state.isEnabled)
    XCTAssertEqual(state.data["blobs"]?.pairs.count, 0)
    XCTAssertEqual(state.data["requestLog"]?.array, [.number(5), .number(6)])
    XCTAssertEqual(make().data["accountId"], .string("b"), "persisted")
  }

  func testABadContainerIsRepairedAndOthersKept() throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let stored: JSONValue = .object([
      ("accountId", .string("a")), ("enabled", .bool(true)), ("pending", .array([])),
      ("blobs", .object([(space, .object([("mergedAt", .number(7))]))])), ("dormantIds", .string("x")),
      ("future", .string("kept")),
    ])
    try Data(stored.jsStringify().utf8).write(to: directory.appendingPathComponent("shared-spaces.json"))
    let state = make()
    state.rebind(accountId: "a")
    XCTAssertEqual(state.data["pending"], .object([]))
    XCTAssertEqual(state.data["dormantIds"], .array([]))
    XCTAssertEqual(state.data["blobs"]?[space]?["mergedAt"], .number(7))
    XCTAssertEqual(state.data["future"], .string("kept"))
    XCTAssertTrue(state.isEnabled)
    let attributes = try FileManager.default.attributesOfItem(atPath: directory.appendingPathComponent("shared-spaces.json").path)
    XCTAssertEqual(attributes[.posixPermissions] as? Int, 0o600)
  }

  func testExportIndexDropsIdsNeitherKnownNorPublished() throws {
    let state = make()
    state.rebind(accountId: "a")
    func record(_ n: Int) throws -> JSONValue {
      .object([
        ("name", f(.string("Work"))), ("color", f(.string("#426c4c"))), ("symbol", f(.string("briefcase"))),
        ("pos", f(.string(try M.keyFor("", "", id(n))))), ("deleted", f(.bool(false))),
      ])
    }
    try state.setIndex(.object([("v", .number(1)), ("spaces", .object([(id(1), try record(1)), (id(2), try record(2))]))]))
    try state.mergeIndex(.object([("v", .number(1)), ("spaces", .object([(id(2), try record(2))]))]))
    let out = try state.exportIndex(deviceId: "phone", now: clock)
    XCTAssertNil(out["spaces"]?[id(1)])
    XCTAssertNotNil(out["spaces"]?[id(2)])
  }

  func testAFailedUploadKeepsPendingWrites() throws {
    let state = make()
    state.rebind(accountId: "a")
    let t = try tab(1)
    try state.noteLocalSpace(id: space, blob: blob([(id(1), t)]), edits: .object([("tabs", .object([(id(1), t)]))]))
    let plan = try state.mergeSpace(
      id: space, remote: nil, version: nil, deviceId: "phone", now: clock, encrypt: SharedSpacesModelTests.encrypt())
    XCTAssertNotNil(plan.upload)
    // An edit lands while the PUT is in flight.
    try state.noteLocalSpace(
      id: space, blob: blob([(id(1), t)]),
      edits: .object([("tabs", .object([(id(1), .object([("pinned", f(.bool(true), 200))]))]))]))
    XCTAssertTrue(state.settleSpace(id: space, plan: plan, blobStored: false, indexStored: false))
    let pending = try XCTUnwrap(state.data["pending"]?[space]?["tabs"]?[id(1)])
    XCTAssertEqual(pending["nav"]?.canonical(), t["nav"]?.canonical())
    XCTAssertEqual(pending["pinned"]?["v"], .bool(true))
    XCTAssertNil(state.data["blobs"]?[space]?["lastPublishable"])

    state.rebind(accountId: "b")
    XCTAssertFalse(state.settleSpace(id: space, plan: plan, blobStored: true, indexStored: true))
  }

  func testAStaleMergeMovesAbsentRecordsIntoRecoveriesOnce() throws {
    let state = make()
    state.rebind(accountId: "a")
    try state.noteLocalSpace(id: space, blob: blob([(id(1), try tab(1)), (id(2), try tab(2))]), edits: nil)
    clock += M.limits.tombstoneMs + 1
    let remote = blob([(id(2), try tab(2, c: 50, by: "mac"))])
    let first = try state.mergeSpace(
      id: space, remote: remote, version: "v1", deviceId: "phone", now: clock,
      encrypt: SharedSpacesModelTests.encrypt())
    XCTAssertEqual(first.recover, [id(1)])
    let recovered = try XCTUnwrap(state.data["recoveries"]?[space])
    XCTAssertNotNil(recovered["tabs"]?[id(1)])
    XCTAssertNil(state.data["blobs"]?[space]?["blob"]?["tabs"]?[id(1)])
    state.settleSpace(id: space, plan: first, blobStored: false, indexStored: false)
    let second = try state.mergeSpace(
      id: space, remote: remote, version: "v1", deviceId: "phone", now: clock + 1,
      encrypt: SharedSpacesModelTests.encrypt())
    XCTAssertTrue(second.recover.isEmpty)
    XCTAssertEqual(state.data["recoveries"]?[space]?.canonical(), recovered.canonical())
  }
}
