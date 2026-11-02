import CryptoKit
import XCTest

@testable import Blanc

/// Desktop's `shared-spaces-model.js`, replayed from vectors it generated.
final class SharedSpacesModelTests: XCTestCase {
  typealias M = SharedSpacesModel
  static let zeroKey = SymmetricKey(data: Data(count: 32))
  static func encrypt(pad: Int = 0) -> (String) throws -> SyncEnvelope {
    { (text: String) throws -> SyncEnvelope in
      try SyncCrypto.seal(Data((text + String(repeating: " ", count: pad)).utf8), key: zeroKey)
    }
  }
  func canon(_ v: JSONValue?) -> String { v?.canonical() ?? "null" }
  func optional(_ v: JSONValue?) -> JSONValue? { v == .null ? nil : v }

  func testPositionsMatchVectors() throws {
    for v in try SyncVectors.section("spacesPositions") {
      let i = v["input"]!
      switch v["name"]?.string {
      case "concurrent inserts":
        let ids = i["ids"]!.array.map { $0.string! }
        let ka = try M.keyFor("", "", ids[0])
        let kb = try M.keyFor("", "", ids[1])
        XCTAssertEqual(ka, v["expected"]?["keys"]?.array[0].string)
        XCTAssertEqual(kb, v["expected"]?["keys"]?.array[1].string)
        XCTAssertEqual(try M.keyFor(ka, kb, ids[2]), v["expected"]?["between"]?.string)
      case "wrong tag":
        XCTAssertEqual(M.validKey(i["key"]!.string!, i["id"]!.string!), v["expected"]?.bool)
      default:
        XCTAssertEqual(try M.mid(i["a"]!.string!, i["b"]!.string!), v["expected"]?.string, "\(i)")
      }
    }
  }
  func testMidRejectsInvalidBounds() {
    XCTAssertThrowsError(try M.mid("b", "a"))
    XCTAssertThrowsError(try M.mid("a", "a"))
    XCTAssertThrowsError(try M.mid("a0", ""))
    XCTAssertThrowsError(try M.mid("", "A1"))
    XCTAssertThrowsError(try M.tagOf("not-an-id"))
  }
  func testMidRandomPairsStayBetween() throws {
    var seed: UInt32 = 20_261_028
    func next() -> Double {
      seed = seed &* 1_664_525 &+ 1_013_904_223
      return Double(seed) / 4_294_967_296
    }
    let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")
    func position() -> String {
      String((0..<(1 + Int(next() * 8))).map { _ in alphabet[Int(next() * 36)] }) + "1"
    }
    var checked = 0
    while checked < 10_000 {
      var a = position()
      var b = position()
      if a == b { continue }
      if utf16Less(b, a) { swap(&a, &b) }
      let m = try M.mid(a, b)
      XCTAssertTrue(utf16Less(a, m) && utf16Less(m, b), "\(a) < \(m) < \(b)")
      XCTAssertNotEqual(m.last, "0")
      XCTAssertTrue(M.isKey(m))
      checked += 1
    }
  }
  func testFieldsMatchVectors() throws {
    for v in try SyncVectors.section("spacesFields") {
      let i = v["input"]!
      let name = i["name"]!.string!
      XCTAssertEqual(canon(M.mergeField(i["a"], i["b"], name: name)), canon(v["expected"]?["merged"]))
      XCTAssertEqual(M.acknowledged(i["a"], i["b"], name: name), v["expected"]?["acknowledged"]?.bool)
    }
  }
  func testRevisionMatchesVectors() throws {
    for v in try SyncVectors.section("spacesRevision") {
      XCTAssertEqual(M.revisionOf(v["input"]!), v["expected"]?.string)
    }
  }
  func testBudgetMatchesVectors() throws {
    for v in try SyncVectors.section("spacesBudget") {
      let text = String(repeating: "x", count: Int(v["input"]!["kib"]!.intValue!) * 1024)
      let e = try Self.encrypt()(text)
      let bytes = JSONValue.object([
        ("v", .number(1)), ("iv", .string(e.iv)), ("ct", .string(e.ct)), ("tag", .string(e.tag)),
      ]).jsStringify().utf8.count
      XCTAssertEqual(bytes, v["expected"]?["bytes"]?.intValue.map(Int.init))
      XCTAssertEqual(M.blobFits(.string(text), encrypt: Self.encrypt()), v["expected"]?["fits"]?.bool)
    }
  }
  func testSelectionsMatchVectors() throws {
    for v in try SyncVectors.section("spacesSelections") {
      XCTAssertEqual(canon(M.sanitizeBlob(v["input"])), canon(v["expected"]))
    }
  }
  private func assertThreeWay(_ section: String,
    _ merge: (JSONValue?, JSONValue?) throws -> JSONValue?) throws
  {
    for v in try SyncVectors.section(section) {
      let i = v["input"]!
      let (a, b, c) = (optional(i["a"]), optional(i["b"]), optional(i["c"]))
      for (x, y, z) in [(a, b, c), (a, c, b), (b, a, c), (b, c, a), (c, a, b), (c, b, a)] {
        XCTAssertEqual(canon(try merge(try merge(x, y), z)), canon(v["expected"]), v["name"]!.string!)
        XCTAssertEqual(canon(try merge(x, try merge(y, z))), canon(v["expected"]), v["name"]!.string!)
      }
    }
  }
  func testSelectionMergeMatchesVectorsInEveryOrder() throws {
    try assertThreeWay("spacesSelectionMerge") { try M.mergeBlob($0, $1) }
  }
  func testMergeBlobMatchesVectorsInEveryOrder() throws {
    try assertThreeWay("spacesMergeBlob") { try M.mergeBlob($0, $1) }
  }
  func testMergeIndexMatchesVectorsInEveryOrder() throws {
    try assertThreeWay("spacesMergeIndex") { try M.mergeIndex($0, $1) }
  }
  func testIndexRevisionMatchesVectors() throws {
    for v in try SyncVectors.section("spacesIndexRevision") {
      let i = v["input"]!
      XCTAssertEqual(try M.mergeIndex(i["a"], i["b"]).canonical(), canon(v["expected"]))
      XCTAssertEqual(try M.mergeIndex(i["b"], i["a"]).canonical(), canon(v["expected"]))
    }
  }
  func testMergeRejectsUnreadableSides() {
    XCTAssertThrowsError(try M.mergeBlob(.string("blob"), nil))
    XCTAssertThrowsError(try M.mergeIndex(.object([("v", .number(2))]), nil))
  }
  func testSanitizeMatchesVectors() throws {
    for v in try SyncVectors.section("spacesSanitize") {
      let i = v["input"]!
      let actual = i["kind"]?.string == "blob" ? M.sanitizeBlob(i["raw"]) : M.sanitizeIndex(i["raw"])
      XCTAssertEqual(canon(actual), canon(v["expected"]), v["name"]!.string!)
    }
  }
  func testExpireMatchesVectors() throws {
    for v in try SyncVectors.section("spacesExpire") {
      let i = v["input"]!
      XCTAssertEqual(
        M.expireTombstones(i["blob"]!, now: i["now"]!.intValue!).canonical(), canon(v["expected"]),
        v["name"]!.string!)
    }
  }
  func testOrderMatchesVectors() throws {
    for v in try SyncVectors.section("spacesOrder") {
      XCTAssertEqual(
        M.orderOf(v["input"]!["records"]!), v["expected"]!.array.map { $0.string! },
        v["name"]!.string!)
    }
  }
  @MainActor func testSymbolsMatchSpaceIdentity() {
    XCTAssertEqual(M.symbolIds, Set(SpaceIdentity.symbolIds))
  }
  func testActiveTabIdAndEffectiveGroup() throws {
    let blob = try XCTUnwrap(SyncVectors.section("spacesSelectionMerge").first?["expected"])
    XCTAssertEqual(M.activeTabId(blob), blob["active"]?["cleared"] == nil ? blob["active"]?["v"]?.string : nil)
    let tab: JSONValue = .object([("groupId", M.field(.string(String(repeating: "a", count: 32)), 1, "a"))])
    XCTAssertNil(M.effectiveGroup(blob, tab))
  }
}

/// Pending writes, admission and upload plans (`shared-spaces-model.js` lines 286–520).
final class SharedSpacesPlanTests: XCTestCase {
  typealias M = SharedSpacesModel
  func canon(_ v: JSONValue?) -> String { v?.canonical() ?? "null" }
  func sortedStrings(_ v: JSONValue?) -> JSONValue {
    .array((v?.array ?? []).compactMap(\.string).sorted(by: utf16Less).map(JSONValue.string))
  }
  func sortedStrings<S: Sequence<String>>(_ v: S) -> JSONValue {
    .array(v.sorted(by: utf16Less).map(JSONValue.string))
  }
  /// The plan as the vectors print it, every id list sorted.
  func json(_ plan: PushPlan) -> JSONValue {
    .object([
      ("upload", plan.upload ?? .null), ("pendingAfter", plan.pendingAfter),
      (
        "expiredRecords",
        .object([
          ("tabs", sortedStrings(plan.expiredRecords["tabs"] ?? [])),
          ("groups", sortedStrings(plan.expiredRecords["groups"] ?? [])),
        ])
      ),
      ("recover", sortedStrings(plan.recover)), ("unsynced", sortedStrings(plan.unsynced)),
      ("mergedBlob", plan.mergedBlob), ("nextLastMergeAt", .number(Double(plan.nextLastMergeAt))),
      ("indexEntry", plan.indexEntry ?? .null), ("reason", plan.reason.map(JSONValue.string) ?? .null),
    ])
  }
  func normalized(_ expected: JSONValue) -> JSONValue {
    var e = expected
    for key in ["recover", "unsynced"] { e[key] = sortedStrings(e[key]) }
    e["expiredRecords"] = .object([
      ("tabs", sortedStrings(e["expiredRecords"]?["tabs"])),
      ("groups", sortedStrings(e["expiredRecords"]?["groups"])),
    ])
    return e
  }
  func plan(from j: JSONValue) -> PushPlan {
    PushPlan(
      mergedBlob: j["mergedBlob"]!, upload: j["upload"] == .null ? nil : j["upload"],
      pendingAfter: j["pendingAfter"]!, recover: Set(j["recover"]!.array.compactMap(\.string)),
      unsynced: Set(j["unsynced"]!.array.compactMap(\.string)),
      expiredRecords: [
        "tabs": j["expiredRecords"]?["tabs"]?.array.compactMap(\.string) ?? [],
        "groups": j["expiredRecords"]?["groups"]?.array.compactMap(\.string) ?? [],
      ], indexEntry: j["indexEntry"] == .null ? nil : j["indexEntry"],
      reason: j["reason"]?.string, nextLastMergeAt: j["nextLastMergeAt"]!.intValue!)
  }
  func runPlan(_ i: JSONValue) throws -> PushPlan {
    func opt(_ v: JSONValue?) -> JSONValue? { v == .null ? nil : v }
    return try M.pushPlan(
      fetchedBlob: opt(i["fetchedBlob"]), fetchedVersion: i["fetchedVersion"]?.string,
      localBlob: opt(i["localBlob"]), pending: opt(i["pending"]),
      lastMergeAt: i["lastMergeAt"]?.intValue, now: i["now"]!.intValue!,
      deviceId: i["deviceId"]!.string!, encrypt: SharedSpacesModelTests.encrypt(),
      lastPublishable: opt(i["lastPublishable"]),
      admissionOrder: i["admissionOrder"]?.array.compactMap(\.string) ?? [])
  }

  func testPipelineMatchesVectors() throws {
    for v in try SyncVectors.section("spacesPipeline") {
      XCTAssertEqual(
        json(try runPlan(v["input"]!)).canonical(), normalized(v["expected"]!).canonical(),
        v["name"]!.string!)
    }
  }
  func testRelayMatchesVectors() throws {
    for v in try SyncVectors.section("spacesRelay") {
      XCTAssertEqual(
        json(try runPlan(v["input"]!)).canonical(), normalized(v["expected"]!).canonical(),
        v["name"]!.string!)
    }
  }
  func testSettlementsMatchVectors() throws {
    for v in try SyncVectors.section("spacesSettlements") {
      let i = v["input"]!
      let result = M.settleUpload(
        plan(from: i["plan"]!), i["originalPending"], blobStored: i["outcome"]?["blobStored"]?.bool ?? false,
        indexStored: i["outcome"]?["indexStored"]?.bool ?? false)
      XCTAssertEqual(
        JSONValue.object([("pending", result.pending), ("indexEntry", result.indexEntry ?? .null)]).canonical(),
        canon(v["expected"]))
    }
  }
  func testSettleUploadAfterAStoredBlob() throws {
    let v = try XCTUnwrap(SyncVectors.section("spacesPipeline").first)
    let p = try runPlan(v["input"]!)
    let stored = M.settleUpload(p, v["input"]!["pending"], blobStored: true, indexStored: false)
    XCTAssertEqual(stored.pending["index"]?.canonical(), p.indexEntry?.canonical())
    let both = M.settleUpload(p, v["input"]!["pending"], blobStored: true, indexStored: true)
    XCTAssertNil(both.pending["index"])
  }
  func testRecoveryMatchesVectors() throws {
    for v in try SyncVectors.section("spacesRecovery") {
      let i = v["input"]!
      let r = M.recoveryDecision(
        localBlob: i["localBlob"], fetchedBlob: i["fetchedBlob"] == .null ? nil : i["fetchedBlob"],
        lastMergeAt: i["lastMergeAt"]?.intValue, now: i["now"]!.intValue!)
      XCTAssertEqual(
        JSONValue.object([("keep", sortedStrings(r.keep)), ("recover", sortedStrings(r.recover))]).canonical(),
        canon(v["expected"]), v["name"]!.string!)
    }
  }
  func testAdmitMatchesVectors() throws {
    for v in try SyncVectors.section("spacesAdmit") {
      let i = v["input"]!
      let changes = i["changes"]!.array.map { u in
        AdmissionUnit(
          kind: u["kind"]!.string!, id: u["id"]!.string!, key: u["key"]!.string!,
          before: u["before"] == .null ? nil : u["before"], after: u["after"]!,
          required: u["required"]?.bool ?? false, clock: u["clock"]?.number ?? 0,
          dependencies: u["dependencies"]?.array.compactMap(\.string) ?? [],
          admissionRank: u["admissionRank"]?.intValue.map(Int.init))
      }
      let relay = i["relay"]
      let now = i["now"]?.intValue ?? 0
      let retired: [String: [String]] = [
        "tabs": i["retired"]?["tabs"]?.array.compactMap(\.string) ?? [],
        "groups": i["retired"]?["groups"]?.array.compactMap(\.string) ?? [],
      ]
      let finish: (JSONValue) -> JSONValue = { (blob: JSONValue) -> JSONValue in
        relay == nil ? blob : M.relayInto(blob, relay, now: now, retired: retired)
      }
      let r = M.admit(
        candidate: i["candidate"]!, changes: changes,
        encrypt: SharedSpacesModelTests.encrypt(pad: Int(i["pad"]!.intValue!)), finish: finish)
      XCTAssertEqual(
        JSONValue.object([
          ("blob", r.blob ?? .null), ("unsynced", sortedStrings(r.unsynced)),
          ("reason", r.reason.map(JSONValue.string) ?? .null),
        ]).canonical(), canon(v["expected"]), v["name"]!.string!)
    }
  }
  func testLocalEditsMatchVectors() throws {
    for v in try SyncVectors.section("spacesLocalEdits") {
      let i = v["input"]!
      let actual =
        i["op"]?.string == "apply"
        ? M.applyLocalEdits(i["pending"], i["edits"]) : M.settlePending(i["pending"], i["fetched"])
      XCTAssertEqual(actual.canonical(), canon(v["expected"]), v["name"]!.string!)
    }
  }
  /// A remote `deleted: false`, however new, never acknowledges a pending close.
  func testFetchedFalseNeverClearsPendingDelete() throws {
    let id = String(repeating: "0", count: 31) + "1"
    let space = String(repeating: "0", count: 30) + "99"
    let pending: JSONValue = .object([
      ("tabs", .object([(id, .object([("deleted", M.field(.bool(true), 100, "phone"))]))]))
    ])
    var tab: JSONValue = .object([
      ("nav", M.field(.object([("url", .string("https://example.test/")), ("title", .string("E"))]), 900, "mac")),
      ("name", M.field(.null, 900, "mac")), ("pinned", M.field(.bool(false), 900, "mac")),
      ("groupId", M.field(.null, 900, "mac")), ("pos", M.field(.string(try M.keyFor("", "", id)), 900, "mac")),
    ])
    tab["deleted"] = M.field(.bool(false), 900, "mac")
    let fetched: JSONValue = .object([
      ("v", .number(1)), ("spaceId", .string(space)), ("groups", .object([])),
      ("tabs", .object([(id, tab)])),
    ])
    XCTAssertEqual(M.settlePending(pending, fetched).canonical(), pending.canonical())
    let p = try M.pushPlan(
      fetchedBlob: fetched, fetchedVersion: "v1", localBlob: fetched, pending: pending, lastMergeAt: 1000,
      now: 2000, deviceId: "phone", encrypt: SharedSpacesModelTests.encrypt(), lastPublishable: nil)
    XCTAssertEqual(p.pendingAfter["tabs"]?[id]?["deleted"]?["v"], .bool(true))
    XCTAssertEqual(p.upload?["blob"]?["tabs"]?[id]?["deleted"]?["v"], .bool(true))
  }
}
