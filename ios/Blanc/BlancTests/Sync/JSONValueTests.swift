import XCTest

@testable import Blanc

final class JSONValueTests: XCTestCase {
  func testCanonicalMatchesVectors() throws {
    for vector in try SyncVectors.load()["canonical"]!.array {
      XCTAssertEqual(vector["input"]!.canonical(), vector["expected"]!.string)
    }
  }
  func testJsStringifyKeepsInsertionOrder() throws {
    XCTAssertEqual(
      try JSONValue(data: Data("{\"b\":1,\"a\":2}".utf8)).jsStringify(), "{\"b\":1,\"a\":2}")
  }
  func testNumbersFormatLikeJavaScript() {
    XCTAssertEqual(
      JSONValue.array([
        .number(1), .number(1.5), .number(1e21), .number(-0.0), .number(1e-6), .number(1e-7),
      ]).jsStringify(), "[1,1.5,1e+21,0,0.000001,1e-7]")
  }
  func testStringEscaping() {
    XCTAssertEqual(
      JSONValue.string("\u{2028}\"\u{7f}\u{8}").jsStringify(), "\"\u{2028}\\\"\u{7f}\\b\"")
  }
  func testUnpairedSurrogateValuesRoundTrip() throws {
    let wire = "{\"value\":\"\\ud83d\"}"
    XCTAssertEqual(try JSONValue(data: Data(wire.utf8)).jsStringify(), wire)
  }
  func testUTF16Less() { XCTAssertTrue(utf16Less("😀", "\u{ffff}")) }
  func testMalformedJSONRejected() {
    for s in ["{", "[1,]", "01", "{\"a\":}", "true false", "\"\\u+aaa\""] {
      XCTAssertThrowsError(try JSONValue(data: Data(s.utf8)))
    }
  }
}
