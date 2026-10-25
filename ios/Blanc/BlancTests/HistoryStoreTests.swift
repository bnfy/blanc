import XCTest

@testable import Blanc

@MainActor final class HistoryStoreTests: XCTestCase {
  private var now: Int64 = 1_000
  private func directory() -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
    return dir
  }
  private func store(_ dir: URL? = nil) -> HistoryStore {
    HistoryStore(directory: dir ?? directory(), clock: { self.now })
  }
  private func url(_ s: String) -> URL { URL(string: s)! }

  func testAddsNewestFirst() {
    let h = store()
    h.addVisit(url: url("https://a.test/"), title: "A")
    now += 1
    h.addVisit(url: url("https://b.test/"), title: "B")
    XCTAssertEqual(h.entries.map(\.url), ["https://b.test/", "https://a.test/"])
    XCTAssertEqual(h.entries.map(\.visitedAt), [1_001, 1_000])
  }
  func testConsecutiveSameURLUpdatesInsteadOfAppending() {
    let h = store()
    h.addVisit(url: url("https://a.test/"), title: "A")
    now += 5
    h.addVisit(url: url("https://a.test/"), title: "")
    XCTAssertEqual(h.entries, [HistoryEntry(url: "https://a.test/", title: "A", visitedAt: 1_005)])
    h.updateTitle(url: url("https://a.test/"), title: "A, renamed")
    XCTAssertEqual(h.entries.first?.title, "A, renamed")
  }
  func testIgnoresNonHTTP() {
    let h = store()
    h.addVisit(url: url("blanc://newtab/"), title: "New Tab")
    h.addVisit(url: url("file:///etc/hosts"), title: "hosts")
    XCTAssertTrue(h.entries.isEmpty)
  }
  func testCapsAtFiveThousand() {
    let h = store()
    for i in 0...HistoryStore.maxEntries { h.addVisit(url: url("https://site.test/\(i)"), title: "") }
    XCTAssertEqual(h.entries.count, 5_000)
    XCTAssertEqual(h.entries.first?.url, "https://site.test/5000")
    XCTAssertFalse(h.entries.contains { $0.url == "https://site.test/0" })
    XCTAssertEqual(h.entries.last?.title, "https://site.test/1", "an untitled visit shows its address")
  }
  func testListFiltersAndLimits() {
    let h = store()
    h.addVisit(url: url("https://news.test/"), title: "Morning News")
    h.addVisit(url: url("https://mail.test/"), title: "Inbox")
    h.addVisit(url: url("https://docs.test/news"), title: "Docs")
    XCTAssertEqual(h.list(query: "  NEWS ").map(\.url), ["https://docs.test/news", "https://news.test/"])
    XCTAssertEqual(h.list(query: "", limit: 2).count, 2)
    XCTAssertEqual(h.list(query: "inbox").map(\.url), ["https://mail.test/"])
  }
  func testRemoveAndClear() {
    let h = store()
    h.addVisit(url: url("https://a.test/"), title: "A")
    now += 1
    h.addVisit(url: url("https://b.test/"), title: "B")
    h.remove(url: "https://a.test/", visitedAt: 999)
    XCTAssertEqual(h.entries.count, 2, "a different visit time removes nothing")
    h.remove(url: "https://a.test/", visitedAt: 1_000)
    XCTAssertEqual(h.entries.map(\.url), ["https://b.test/"])
    h.clear()
    XCTAssertTrue(h.entries.isEmpty)
  }
  func testPersistsAcrossInstances() {
    let dir = directory()
    let h = store(dir)
    h.addVisit(url: url("https://a.test/"), title: "A")
    h.flush()
    XCTAssertEqual(store(dir).entries, h.entries)
  }
}
