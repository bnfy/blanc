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
