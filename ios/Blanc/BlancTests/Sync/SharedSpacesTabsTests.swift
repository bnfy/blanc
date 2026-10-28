import UIKit
import XCTest

@testable import Blanc

/// M17c Task 17: shared Space records driving the shown tabs (design §10;
/// Review Focus 2 and 3).
@MainActor final class SharedSpacesTabsTests: XCTestCase {
  typealias M = SharedSpacesModel
  var sessionDir: URL!
  var settingsDir: URL!
  var syncDir: URL!
  let sid = String(repeating: "0", count: 30) + "77"
  let now: Int64 = 1_800_000_000_000
  func id(_ n: Int) -> String { String((String(repeating: "0", count: 32) + String(n, radix: 16)).suffix(32)) }

  override func setUp() {
    super.setUp()
    let tmp = FileManager.default.temporaryDirectory
    sessionDir = tmp.appendingPathComponent("SharedTabs-\(UUID().uuidString)")
    settingsDir = tmp.appendingPathComponent("SharedTabs-\(UUID().uuidString)")
    syncDir = tmp.appendingPathComponent("SharedTabs-\(UUID().uuidString)")
  }
  override func tearDown() {
    for dir in [sessionDir, settingsDir, syncDir] { try? FileManager.default.removeItem(at: dir!) }
    super.tearDown()
  }

  func nav(_ url: String, _ title: String) -> JSONValue {
    .object([("url", .string(url)), ("title", .string(title))])
  }
  func f(_ v: JSONValue, _ c: Int64 = 100, _ by: String = "mac") -> JSONValue { M.field(v, c, by) }
  func library(count: Int) throws -> JSONValue {
    var tabs: [(String, JSONValue)] = []
    var left = ""
    for n in 1...count {
      left = try M.keyFor(left, "", id(0x100 + n))
      tabs.append(
        (
          id(0x100 + n),
          .object([
            ("nav", f(nav("https://example.test/\(n)", "Tab \(n)"))), ("name", f(.null)), ("pinned", f(.bool(false))),
            ("groupId", f(.null)), ("pos", f(.string(left))), ("deleted", f(.bool(false))),
          ])
        ))
    }
    return .object([
      ("v", .number(1)), ("spaceId", .string(sid)), ("groups", .object([])), ("tabs", .object(tabs)),
      ("active", f(.string(id(0x101)))),
    ])
  }

  /// A phone showing shared Space "Work" with `count` tabs, the first selected.
  /// Sync on for "account" (not a Worker locator, so no pass can reach a network).
  func writeSyncOn() throws {
    try FileManager.default.createDirectory(at: settingsDir, withIntermediateDirectories: true)
    try Data(#"{"enabled":true,"accountId":"account","deviceId":"phone","syncTabs":false}"#.utf8)
      .write(to: settingsDir.appendingPathComponent("sync.json"))
  }
  func showShared(_ count: Int = 3) throws -> TabsManager {
    try writeSyncOn()
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    m.sharedAdapterEnabled = true
    XCTAssertTrue(m.applyAcceptedOnColdStart().isEmpty, "launch: nothing waits yet")
    let state = m.syncEngine.sharedState
    state.rebind(accountId: "account")
    state.setEnabled(true)
    try state.setIndex(
      .object([
        ("v", .number(1)),
        (
          "spaces",
          .object([
            (
              sid,
              .object([
                ("name", f(.string("Work"))), ("color", f(.string("#426c4c"))), ("symbol", f(.string("book"))),
                ("pos", f(.string(try M.keyFor("", "", sid)))), ("deleted", f(.bool(false))),
                ("createdAt", .number(100)), ("createdBy", .string("mac")),
              ])
            )
          ])
        ),
      ]))
    try state.noteLocalSpace(id: sid, blob: try library(count: count), edits: nil)
    m.reconcileSharedLibrary(state, deviceId: "phone", now: now)
    let space = try XCTUnwrap(m.spaces.first { $0.sharedId == sid })
    m.show(set: space.id)
    XCTAssertEqual(m.tabs.map(\.sharedTabId), (1...count).map { Optional(id(0x100 + $0)) })
    XCTAssertTrue(m.sharedSpaceEdits(deviceId: "phone", now: now).isEmpty, "a projected Space publishes nothing")
    return m
  }
  /// Another device's write over the phone's displayed baseline.
  func remote(_ m: TabsManager, _ rid: String, _ fields: [(String, JSONValue)], by: String = "mac") throws -> JSONValue {
    let baseline = try XCTUnwrap(m.sharedBaseline(sid))
    var record = baseline["tabs"]?[rid] ?? .object([])
    for (name, value) in fields { record[name] = M.field(value, now + 5000, by) }
    var change = baseline
    var map = change["tabs"] ?? .object([])
    map[rid] = record
    change["tabs"] = map
    return try XCTUnwrap(try M.mergeBlob(baseline, change))
  }
  func navEdits(_ m: TabsManager, _ rid: String) -> JSONValue? {
    m.sharedSpaceEdits(deviceId: "phone", now: now + 9000).first?.edits["tabs"]?[rid]?["nav"]
  }

  func testRemoteCloseOfABackgroundTabClosesItWithoutUndo() throws {
    let m = try showShared()
    let b = id(0x102)
    XCTAssertTrue(m.tabs[1].isQuiet)
    let rows = m.applyMergedSpaces([sid: try remote(m, b, [("deleted", .bool(true))], by: "macbook")], deviceId: "phone")
    XCTAssertEqual(m.tabs.map(\.sharedTabId), [id(0x101), id(0x103)])
    XCTAssertNil(m.lastClosed, "the person didn't close it, so no Undo")
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(rows.first?.id, b)
    XCTAssertEqual(rows.first?.fromId, "macbook")
    XCTAssertEqual(rows.first?.url, "https://example.test/2", "a quiet tab's row has its saved URL")
    XCTAssertEqual(rows.first?.title, "Tab 2")
    XCTAssertTrue(m.sharedSpaceEdits(deviceId: "phone", now: now + 9000).isEmpty, "no echo")
  }

  func testRemoteNavOfTheSelectedTabWaitsUntilAnotherTabIsSelected() throws {
    let m = try showShared()
    let a = id(0x101)
    XCTAssertEqual(m.activeTab?.sharedTabId, a)
    m.applyMergedSpaces([sid: try remote(m, a, [("nav", nav("https://example.test/remote", "Remote"))])], deviceId: "phone")
    XCTAssertEqual(m.activeTab?.currentURL.absoluteString, "https://example.test/1", "the person's page stays")
    XCTAssertNotNil(m.sharedAcceptedSet(sid)?["tabs"]?[a]?["nav"])
    XCTAssertNil(navEdits(m, a), "no navigation back is published")
    let first = m.tabs[0]
    m.setActive(m.tabs[1].id)
    XCTAssertEqual(first.currentURL.absoluteString, "https://example.test/remote")
    XCTAssertEqual(first.pageTitle, "Remote")
    XCTAssertNil(m.sharedAcceptedSet(sid))
    XCTAssertNil(navEdits(m, a), "applied, so nothing to publish")
  }

  func testAForegroundReturnDoesNotApplyAWaitingChangeButAColdStartDoes() throws {
    let m = try showShared()
    let a = id(0x101)
    m.applyMergedSpaces([sid: try remote(m, a, [("nav", nav("https://example.test/remote", "Remote"))])], deviceId: "phone")
    NotificationCenter.default.post(name: UIApplication.willEnterForegroundNotification, object: nil)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    XCTAssertTrue(m.applyAcceptedOnColdStart().isEmpty, "a return from the background is not a launch")
    XCTAssertEqual(m.activeTab?.currentURL.absoluteString, "https://example.test/1")
    m.flushSession()

    XCTAssertNotNil(m.sharedAcceptedSet(sid)?["tabs"]?[a], "the waiting change is saved")

    // The launch applies it while every tab is quiet, then loads the
    // selection at its new address: the old page never loads.
    let relaunched = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    XCTAssertTrue(relaunched.sharedAdapterEnabled, "sync and the Spaces switch are on")
    XCTAssertEqual(relaunched.activeTab?.sharedTabId, a)
    XCTAssertEqual(relaunched.activeTab?.currentURL.absoluteString, "https://example.test/remote")
    XCTAssertEqual(relaunched.wokenURLs.map(\.absoluteString), ["https://example.test/remote"])
    XCTAssertNil(relaunched.sharedAcceptedSet(sid))
    XCTAssertTrue(relaunched.applyAcceptedOnColdStart().isEmpty, "once per launch")
  }

  func testAColdStartCloseOfTheSelectedTabLoadsOnlyTheSurvivor() throws {
    let m = try showShared()
    let a = id(0x101)
    m.applyMergedSpaces([sid: try remote(m, a, [("deleted", .bool(true))])], deviceId: "phone")
    XCTAssertEqual(m.activeTab?.sharedTabId, a, "the person's page stays")
    m.flushSession()
    let relaunched = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    XCTAssertEqual(relaunched.tabs.map(\.sharedTabId), [id(0x102), id(0x103)])
    XCTAssertEqual(relaunched.wokenURLs.map(\.absoluteString), ["https://example.test/2"])
    XCTAssertEqual(relaunched.tabs.filter(\.hasWebView).count, 1)
  }

  func testAnUnrelatedLocalCloseDuringADeferralPublishesOnlyThatClose() throws {
    let m = try showShared()
    let a = id(0x101), c = id(0x103)
    m.applyMergedSpaces([sid: try remote(m, a, [("nav", nav("https://example.test/remote", "Remote"))])], deviceId: "phone")
    m.closeTab(m.tabs[2].id)
    let out = m.sharedSpaceEdits(deviceId: "phone", now: now + 9000)
    XCTAssertEqual(out.count, 1)
    XCTAssertEqual(M.keys(out.first?.edits), ["tabs"])
    XCTAssertEqual(M.keys(out.first?.edits["tabs"]), [c])
    XCTAssertEqual(M.keys(out.first?.edits["tabs"]?[c]), ["deleted"])
    XCTAssertNotNil(m.sharedAcceptedSet(sid)?["tabs"]?[a], "the deferral still waits")
  }

  func testAppliedChangesToABackgroundTabProduceNoEcho() throws {
    let m = try showShared()
    let a = id(0x101), b = id(0x102)
    // Pinning leads the tabs, so the pinning device moved it first too.
    let first = try XCTUnwrap(m.sharedBaseline(sid)?["tabs"]?[a]?["pos"]?["v"]?.string)
    let merged = try remote(
      m, b,
      [
        ("nav", nav("https://example.test/b2", "B2")), ("pinned", .bool(true)),
        ("pos", .string(try M.keyFor("", first, b))),
      ])
    m.applyMergedSpaces([sid: merged], deviceId: "phone")
    XCTAssertEqual(m.tabs.map(\.sharedTabId), [b, a, id(0x103)])
    let tab = try XCTUnwrap(m.tabs.first { $0.sharedTabId == b })
    XCTAssertEqual(tab.currentURL.absoluteString, "https://example.test/b2")
    XCTAssertTrue(tab.pinned)
    XCTAssertTrue(tab.isQuiet, "a quiet tab's record is rewritten, no page loads")
    XCTAssertTrue(m.sharedSpaceEdits(deviceId: "phone", now: now + 9000).isEmpty)
  }

  func testANewRemoteTabArrivesQuietAtItsPosition() throws {
    let m = try showShared(2)
    let a = id(0x101), b = id(0x102), fresh = id(0xabc)
    let baseline = try XCTUnwrap(m.sharedBaseline(sid))
    let pos = try M.keyFor(baseline["tabs"]![a]!["pos"]!["v"]!.string!, baseline["tabs"]![b]!["pos"]!["v"]!.string!, fresh)
    let selected = m.activeTabId
    m.applyMergedSpaces(
      [
        sid: try remote(
          m, fresh,
          [
            ("nav", nav("https://example.test/new", "New")), ("name", .null), ("pinned", .bool(false)),
            ("groupId", .null), ("pos", .string(pos)), ("deleted", .bool(false)),
          ])
      ], deviceId: "phone")
    XCTAssertEqual(m.tabs.map(\.sharedTabId), [a, fresh, b])
    XCTAssertFalse(m.tabs[1].hasWebView, "it arrives quiet")
    XCTAssertEqual(m.tabs[1].pageTitle, "New")
    XCTAssertEqual(m.activeTabId, selected)
    XCTAssertTrue(m.sharedSpaceEdits(deviceId: "phone", now: now + 9000).isEmpty)
  }

  func testALocalNewTabTakesARecordId() throws {
    let m = try showShared(1)
    m.createTab(url: URL(string: "https://example.test/mine")!, title: "Mine", quiet: true)
    let out = m.sharedSpaceEdits(deviceId: "phone", now: now + 9000)
    let tid = try XCTUnwrap(m.tabs.last?.sharedTabId)
    XCTAssertTrue(M.isId(tid))
    XCTAssertEqual(out.first?.edits["tabs"]?[tid]?["nav"]?["v"], nav("https://example.test/mine", "Mine"))
    XCTAssertNotNil(out.first?.blob["tabs"]?[tid], "the blob for noteLocalSpace carries it")
  }

  func testAnOldSessionWithoutSharedFieldsStillLoads() throws {
    try FileManager.default.createDirectory(at: sessionDir, withIntermediateDirectories: true)
    let file: JSONValue = .object([
      ("urls", .array([.string("https://example.test/old")])), ("activeIndex", .number(0)), ("version", .number(2)),
      (
        "state",
        .object([
          ("shown", .string("iphone")),
          (
            "iphone",
            .object([
              ("tabs", .array([.object([("url", .string("https://example.test/old")), ("title", .string("Old")), ("pinned", .bool(false))])])),
              ("groups", .array([])), ("activeIndex", .number(0)),
            ])
          ),
          ("spaces", .array([])), ("deleted", .array([])),
        ])
      ),
    ])
    try Data(file.jsStringify().utf8).write(to: sessionDir.appendingPathComponent("session.json"))
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    XCTAssertEqual(m.tabs.map { $0.currentURL.absoluteString }, ["https://example.test/old"])
    XCTAssertEqual(m.tabs.first?.pageTitle, "Old")
  }
}
