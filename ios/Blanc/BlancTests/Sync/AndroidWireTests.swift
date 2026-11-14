import CryptoKit
import XCTest
@testable import Blanc

/// Blanc for Android writes through the shipping sync code on its own platform. `android-written.json`
/// is what it put on the wire (chromium/tests/android/a4-iphone-fixture.mjs); `iphone-written.json` is
/// what this phone writes, which chromium/tools/sync-iphone.test.mjs hands to Android's runner.
final class AndroidWireTests: XCTestCase {
  private func json(_ name: String) throws -> JSONValue {
    let bundle = Bundle(for: Self.self)
    let url = try XCTUnwrap(
      bundle.url(forResource: name, withExtension: "json")
        ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "Sync/Fixtures")
        ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try JSONValue(data: Data(contentsOf: url))
  }

  private func stored(_ fixture: JSONValue, _ name: String) throws -> JSONValue {
    let hex = Array(try XCTUnwrap(fixture["contentKey"]?.string))
    let bytes = stride(from: 0, to: hex.count, by: 2).compactMap { UInt8(String(hex[$0...$0 + 1]), radix: 16) }
    let raw = try XCTUnwrap(fixture["stores"]?[name]).canonical()
    let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: Data(raw.utf8))
    return try JSONValue(data: SyncCrypto.open(envelope, key: SymmetricKey(data: bytes)))
  }

  func testTheIPhoneReadsWhatAndroidWrote() throws {
    let fixture = try json("android-written")
    let now = try XCTUnwrap(fixture["now"]?.number)
    let pixel = try XCTUnwrap(fixture["deviceId"]?.string)

    let session = try stored(fixture, "session")
    let devices = TabSnapshots.devices(try XCTUnwrap(session["devices"]), excluding: "iphone", names: [:])
    let phone = try XCTUnwrap(devices.first { $0.id == pixel })
    XCTAssertEqual(phone.platform, "android")
    XCTAssertEqual(phone.tabs.map(\.url), ["https://tab.example/"])

    let closed = try stored(fixture, "closed")
    let rows = SyncedClosed.inbox(try XCTUnwrap(closed["devices"]), ownId: "iphone", dismissed: .object([]), now: now)
    XCTAssertEqual(rows.map(\.url), ["https://closed.example/"])

    let sends = try stored(fixture, "sends")
    let inbox = SyncSends.inbox(
      try XCTUnwrap(sends["devices"]), ownId: try XCTUnwrap(fixture["sentTo"]?.string), dismissed: [:], now: now)
    XCTAssertEqual(inbox.map(\.url), ["https://sent.example/"])

    let index = try XCTUnwrap(SharedSpacesModel.sanitizeIndex(try stored(fixture, "spaces")))
    XCTAssertEqual(index["spaces"]?.pairs.first?.1["name"]?["v"]?.string, "Work")
    let blob = try XCTUnwrap(SharedSpacesModel.sanitizeBlob(fixture["spaceBlob"]))
    let urls = blob["tabs"]?.pairs.compactMap { $0.1["nav"]?["v"]?["url"]?.string }
    XCTAssertEqual(urls, ["https://space.example/"])
  }

  func testWhatTheIPhoneWritesIsWhatAndroidIsGiven() throws {
    let now = 1_800_000_000_000.0
    // An iPhone's entry, named as one: on an iPad simulator the device's own name is "iPad".
    let session = TabSnapshots.ownEntry(
      tabs: [(url: "https://iphone-tab.example/", title: "From iPhone")], previous: nil, name: "iPhone", now: Int64(now))
    let closed = try XCTUnwrap(
      SyncedClosed.addItem(
        to: nil,
        item: .object([
          ("id", .string(String(repeating: "d", count: 32))), ("url", .string("https://iphone-closed.example/")),
          ("title", .string("From iPhone")), ("closedAt", .number(now)), ("spaceId", .null),
        ]), name: "iPhone", platform: "ios", now: now))
    let sent = try SyncSends.addItem(
      to: nil, url: "https://iphone-sent.example/", title: "From iPhone", to: "android-phone", ownId: "iphone",
      now: now, makeId: { "11111111-2222-4333-8444-555555555555" }
    ).get().entry
    let made: JSONValue = .object([("closed", closed), ("sends", sent), ("session", session)])
    XCTAssertEqual(made.canonical(), try json("iphone-written").canonical())
  }
}
