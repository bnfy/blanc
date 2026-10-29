import XCTest

@testable import Blanc

/// M17c Task 20: the palette's Recently closed band (design §11; Review Focus 3).
@MainActor final class RecentlyClosedTests: XCTestCase {
  var dir: URL!
  override func setUp() {
    super.setUp()
    dir = FileManager.default.temporaryDirectory.appendingPathComponent("Closed-\(UUID().uuidString)")
  }
  override func tearDown() {
    try? FileManager.default.removeItem(at: dir)
    super.tearDown()
  }
  func manager() -> TabsManager { TabsManager(settingsDirectory: dir, sessionDirectory: dir) }
  func row(_ id: String, at: Int64, from: String? = nil) -> ClosedRow {
    ClosedRow(id: id, url: "https://example.test/\(id)", title: id, closedAt: at, spaceId: nil, fromId: from, fromName: nil)
  }

  func testAPrivateTabIsNeverRecorded() {
    let m = manager()
    let id = m.createTab(url: URL(string: "https://example.test/secret")!, isPrivate: true)
    m.closeTab(id)
    XCTAssertTrue(m.closedBand.isEmpty)
  }

  func testAQuietTabsRowHasItsSavedAddressAndTitle() {
    let m = manager()
    let id = m.createTab(url: URL(string: "https://example.test/saved")!, title: "Saved", quiet: true)
    XCTAssertTrue(m.tabs.first { $0.id == id }?.isQuiet ?? false)
    m.closeTab(id)
    XCTAssertEqual(m.closedBand.first?.url, "https://example.test/saved")
    XCTAssertEqual(m.closedBand.first?.title, "Saved")
    XCTAssertNil(m.closedBand.first?.fromId, "the phone's own close carries no device")
  }

  func testUndoTakesTheRowBackAndReopenOpensANewTab() throws {
    let m = manager()
    let id = m.createTab(url: URL(string: "https://example.test/a")!, title: "A")
    m.closeTab(id)
    XCTAssertEqual(m.closedBand.count, 1)
    m.undoClose()
    XCTAssertTrue(m.closedBand.isEmpty, "open again, so no longer closed")
    m.closeTab(id)
    m.expireUndo()
    let closed = try XCTUnwrap(m.closedBand.first)
    let count = m.tabs.count
    m.reopenClosed(closed)
    XCTAssertEqual(m.tabs.count, count + 1)
    XCTAssertEqual(m.activeTab?.currentURL.absoluteString, "https://example.test/a")
    XCTAssertTrue(m.closedBand.isEmpty)
  }

  func testRowsAreNewestFirstForgettableAndClearable() {
    let m = manager()
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    m.recentlyClosed.add(row("old", at: now - 5000))
    m.recentlyClosed.add(row("new", at: now, from: "mac"))
    XCTAssertEqual(m.closedBand.map(\.id), ["new", "old"])
    XCTAssertEqual(m.closedDeviceName(m.closedBand[0]), "mac", "named after the device that closed it")
    m.forgetClosed(m.closedBand[1])
    XCTAssertEqual(m.closedBand.map(\.id), ["new"])
    m.clearClosedBand()
    XCTAssertTrue(m.closedBand.isEmpty)
  }

  func testTheStoreKeeps25ForADayAndSurvivesARelaunch() {
    var clock: Int64 = 1_800_000_000_000
    let store = RecentlyClosedStore(directory: dir, now: { clock })
    for n in 0..<30 { store.add(row("r\(n)", at: clock - Int64(n))) }
    XCTAssertEqual(store.current.count, 25)
    XCTAssertEqual(store.current.first?.id, "r0")
    store.add(ClosedRow(id: "file", url: "file:///etc/hosts", title: "", closedAt: clock, spaceId: nil, fromId: nil, fromName: nil))
    XCTAssertFalse(store.current.contains { $0.id == "file" }, "web pages only")
    XCTAssertEqual(RecentlyClosedStore(directory: dir, now: { clock }).current.count, 25)
    clock += 86_400_000
    XCTAssertTrue(store.current.isEmpty, "gone after 24 hours")
  }
}
