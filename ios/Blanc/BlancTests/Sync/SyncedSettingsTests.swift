import XCTest

@testable import Blanc

final class SyncedSettingsTests: XCTestCase {
  func testMergeMatchesDesktopVectors() throws {
    for v in try SyncVectors.load()["settingsMerge"]!.array {
      var local = SyncedSettings(payload: v["input"]!["local"]!)
      local.merge(remote: SyncedSettings(payload: v["input"]!["remote"]!))
      XCTAssertEqual(
        local.payload().jsStringify(), v["expected"]!["serialized"]!.string, v["name"]!.string ?? ""
      )
    }
    for v in try SyncVectors.load()["deviceNamesMerge"]!.array {
      XCTAssertEqual(
        SyncedSettings.mergeNames(v["input"]!["local"]!, v["input"]!["remote"]!).canonical(),
        v["expected"]!.canonical())
    }
  }
  func testUnknownKeysRoundTripUnchanged() throws {
    let wire =
      "{\"values\":{\"searchEngine\":\"custom\",\"searchEngineTemplate\":\"https://test/?q=%s\",\"newtabClockFont\":\"future\",\"futureKey\":{\"b\":1,\"a\":2}},\"meta\":{\"futureKey\":100},\"tieBreakers\":{\"futureKey\":\"x\"}}"
    XCTAssertEqual(
      SyncedSettings(payload: try JSONValue(data: Data(wire.utf8))).payload().jsStringify(), wire)
  }
  func testUnclockedDefaultsCarriedOnlyWhenLocalValueAbsent() {
    var local = SyncedSettings(payload: .object([]))
    let defaults = SyncedSettings(
      payload: .object([
        ("values", .object([("theme", .string("dark")), ("futureKey", .string("kept"))]))
      ]))
    local.merge(remote: defaults)
    XCTAssertEqual(local.values["theme"]?.string, "dark")
    XCTAssertEqual(local.values["futureKey"]?.string, "kept")
    XCTAssertNil(local.meta["theme"])
    local.stampLocal(key: "theme", value: .string("light"), now: 100, tie: "local")
    local.merge(remote: defaults)
    XCTAssertEqual(local.values["theme"]?.string, "light")
    XCTAssertEqual(local.meta["theme"], 100)
  }
  func testStampLocalAdvancesPastPrevious() {
    var s = SyncedSettings(payload: .object([]))
    s.stampLocal(key: "theme", value: .string("dark"), now: 5000, tie: "a")
    s.stampLocal(key: "theme", value: .string("light"), now: 4000, tie: "a")
    XCTAssertEqual(s.meta["theme"], 5001)
  }
  func testInvalidRemoteClockIgnored() {
    for clock in [0.0, -1, Double(SyncedSettings.maxClock)] {
      var s = SyncedSettings(payload: .object([]))
      s.merge(
        remote: SyncedSettings(
          payload: .object([
            ("values", .object([("theme", .string("dark"))])),
            ("meta", .object([("theme", .number(clock))])),
          ])))
      XCTAssertNil(s.values["theme"])
    }
  }
  // A rename made on the phone must converge with desktop, which records no
  // whole-key tie for deviceNames (review of #1068, P1-1).
  func testPhoneRenameConvergesWithDesktop() throws {
    let vector = try XCTUnwrap(SyncVectors.section("deviceNamesRename").first)
    let input = try XCTUnwrap(vector["input"])
    var phone = SyncedSettings(payload: .object([]))
    phone.setDeviceName(
      id: try XCTUnwrap(input["deviceId"]?.string), name: try XCTUnwrap(input["name"]?.string),
      now: try XCTUnwrap(input["now"]?.integer), tie: try XCTUnwrap(input["tie"]?.string))
    XCTAssertNil(phone.tieBreakers["deviceNames"])
    let desktop = try XCTUnwrap(vector["expected"])
    phone.merge(remote: SyncedSettings(payload: desktop))
    XCTAssertEqual(phone.payload().canonical(), desktop.canonical(), "no further write after desktop merges the rename")
  }
  func testStoredDeviceNamesTieIsDroppedOnMerge() {
    var phone = SyncedSettings(
      payload: .object([
        ("values", .object([("deviceNames", .object([]))])), ("meta", .object([("deviceNames", .number(5))])),
        ("tieBreakers", .object([("deviceNames", .string("t1"))])),
      ]))
    phone.merge(remote: SyncedSettings(payload: .object([("values", .object([("deviceNames", .object([]))]))])))
    XCTAssertNil(phone.tieBreakers["deviceNames"])
  }
}
