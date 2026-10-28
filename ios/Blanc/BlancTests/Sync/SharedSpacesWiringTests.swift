import XCTest

@testable import Blanc

/// M17c Task 18 (wiring): the engine's Spaces state and the phone's tab sets
/// kept together — local edits reach the state, merges reach the tabs, closes
/// reach Recently closed, deletes reach the library, and another account turns
/// shared Spaces back into local copies.
@MainActor final class SharedSpacesWiringTests: XCTestCase {
  typealias M = SharedSpacesModel
  var sessionDir: URL!
  var settingsDir: URL!
  let sid = String(repeating: "0", count: 30) + "77"
  let now: Int64 = 1_800_000_000_000
  func id(_ n: Int) -> String { String((String(repeating: "0", count: 32) + String(n, radix: 16)).suffix(32)) }

  override func setUp() {
    super.setUp()
    let tmp = FileManager.default.temporaryDirectory
    sessionDir = tmp.appendingPathComponent("SharedWiring-\(UUID().uuidString)")
    settingsDir = tmp.appendingPathComponent("SharedWiring-\(UUID().uuidString)")
  }
  override func tearDown() {
    for dir in [sessionDir, settingsDir] { try? FileManager.default.removeItem(at: dir!) }
    super.tearDown()
  }

  func writeSync(enabled: Bool, account: String = "account") throws {
    try FileManager.default.createDirectory(at: settingsDir, withIntermediateDirectories: true)
    try Data(#"{"enabled":\#(enabled),"accountId":"\#(account)","deviceId":"phone","syncTabs":true}"#.utf8)
      .write(to: settingsDir.appendingPathComponent("sync.json"))
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
            ("nav", f(.object([("url", .string("https://example.test/\(n)")), ("title", .string("Tab \(n)"))]))),
            ("name", f(.null)), ("pinned", f(.bool(false))), ("groupId", f(.null)), ("pos", f(.string(left))),
            ("deleted", f(.bool(false))),
          ])
        ))
    }
    return .object([("v", .number(1)), ("spaceId", .string(sid)), ("groups", .object([])), ("tabs", .object(tabs))])
  }
  func indexEntry() throws -> JSONValue {
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
    ])
  }
  /// Sync and the Spaces switch on, the library holding "Work"; the engine
  /// reports the merge as a pass would, and the phone shows the Space.
  func sharedOn(_ count: Int = 2) throws -> TabsManager {
    try writeSync(enabled: true)
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    let state = m.syncEngine.sharedState
    XCTAssertTrue(state.setEnabled(true))
    try state.setIndex(try indexEntry())
    try state.noteLocalSpace(id: sid, blob: try library(count: count), edits: nil)
    m.sharedSyncChanged()
    XCTAssertTrue(m.sharedAdapterEnabled)
    let space = try XCTUnwrap(m.spaces.first { $0.sharedId == sid }, "the library Space joins the phone's")
    XCTAssertEqual(space.link, .active)
    m.show(set: space.id)
    return m
  }
  func closedItems(_ m: TabsManager) -> [JSONValue] {
    m.syncEngine.stateStore.load(.closed)?["devices"]?["phone"]?["items"]?.array ?? []
  }

  func testAdapterFollowsTheSwitches() throws {
    try writeSync(enabled: true)
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    XCTAssertFalse(m.sharedAdapterEnabled, "switch off, nothing linked")
    XCTAssertTrue(m.syncEngine.sharedState.setEnabled(true))
    m.sharedSyncChanged()
    XCTAssertTrue(m.sharedAdapterEnabled)
  }

  func testLocalChangesReachTheSpacesState() throws {
    let m = try sharedOn()
    m.publishSharedEdits()
    XCTAssertNil(m.syncEngine.sharedState.data["pending"]?[sid]?["tabs"], "showing the Space changes no tab")
    m.createTab(url: URL(string: "https://example.test/mine")!, title: "Mine")
    m.publishSharedEdits()
    XCTAssertTrue(m.syncEngine.sharedState.hasPendingEdits(sid))
    let tid = try XCTUnwrap(m.activeTab?.sharedTabId)
    XCTAssertNotNil(m.syncEngine.sharedState.data["pending"]?[sid]?["tabs"]?[tid]?["nav"])
  }

  func testSpaceIdentityEditsReachTheIndex() throws {
    let m = try sharedOn()
    let space = try XCTUnwrap(m.shownSpace)
    try m.updateSpace(space.id, name: "Studio", color: nil, symbol: nil)
    m.publishSharedEdits()
    XCTAssertEqual(m.syncEngine.sharedState.data["index"]?["spaces"]?[sid]?["name"]?["v"], .string("Studio"))
  }

  func testMergedBlobsReachTheShownTabs() throws {
    let m = try sharedOn(2)
    let state = m.syncEngine.sharedState
    var blob = try XCTUnwrap(state.blob(sid))
    var record = try XCTUnwrap(blob["tabs"]?[id(0x102)])
    record["deleted"] = f(.bool(true), now, "macbook")
    blob["tabs"]?[id(0x102)] = record
    try state.noteLocalSpace(id: sid, blob: blob, edits: nil)
    m.sharedSpacesMerged([sid])
    XCTAssertEqual(m.tabs.map(\.sharedTabId), [id(0x101)], "another device's close closes the tab here")
    XCTAssertNil(m.lastClosed, "no Undo for a close the person didn't make")
    let items = closedItems(m)
    XCTAssertEqual(items.first?["id"], .string(id(0x102)), "the page goes to Recently closed under its record id")
    XCTAssertEqual(items.first?["spaceId"], .string(sid))
  }

  func testLocalCloseIsRecordedWithTheSharedRecordId() throws {
    let m = try sharedOn(2)
    let closing = try XCTUnwrap(m.tabs.last)
    m.closeTab(closing.id)
    let items = closedItems(m)
    XCTAssertEqual(items.count, 1)
    XCTAssertEqual(items.first?["id"], .string(id(0x102)))
    XCTAssertEqual(items.first?["url"], .string("https://example.test/2"), "a quiet tab's saved address")
    XCTAssertEqual(items.first?["title"], .string("Tab 2"))
  }

  func testPrivateAndInternalClosesAreNotRecorded() throws {
    let m = try sharedOn(1)
    let privateTab = m.createTab(url: URL(string: "https://example.test/secret")!, isPrivate: true)
    m.closeTab(privateTab)
    let start = m.createTab()
    m.closeTab(start)
    XCTAssertTrue(closedItems(m).isEmpty)
  }

  func testSnapshotTabsCarryGroupsAndTheSharedSpace() throws {
    let m = try sharedOn(2)
    let groupId = try m.createGroup(named: "Reading", with: m.tabs[0].id)
    let tabs = m.snapshotTabs
    XCTAssertEqual(tabs.first?.groupId, groupId)
    XCTAssertEqual(tabs.map(\.sharedSpaceId), [sid, sid])
    let groups = m.syncEngine.sharedGroupsSource?() ?? []
    XCTAssertEqual(groups.map(\.name), ["Reading"])
    m.show(set: TabSets.iphoneId)
    XCTAssertEqual(m.snapshotTabs.compactMap(\.sharedSpaceId), [], "This iPhone's tabs sit in no Space")
  }

  func testDeletingASharedSpaceTombstonesItAndUndoKeepsALocalCopy() throws {
    let m = try sharedOn(2)
    let space = try XCTUnwrap(m.shownSpace)
    m.deleteSpace(space.id, now: now)
    XCTAssertTrue(m.lastDeletedSpaceWasShared)
    XCTAssertEqual(m.syncEngine.sharedState.deletedSpaceIds, [sid], "deleted everywhere at once")
    m.undoDeleteSpace()
    let copy = try XCTUnwrap(m.spaces.first { $0.id == space.id })
    XCTAssertNil(copy.sharedId, "a tombstone is final: Undo brings back a copy on this iPhone")
    XCTAssertEqual(m.tabCount(copy.id), 2)
    m.sharedSpacesMerged(["index"])
    XCTAssertNotNil(m.spaces.first { $0.id == space.id }, "the copy stays when the library is reconciled")
  }

  func testTurningTheSwitchOffLeavesDormantCopies() throws {
    let m = try sharedOn(2)
    XCTAssertTrue(m.syncEngine.sharedState.setEnabled(false))
    m.sharedSyncChanged()
    XCTAssertEqual(m.spaces.first?.link, .dormant)
    XCTAssertEqual(m.spaces.first?.sharedId, sid, "the link is kept for Rejoin")
    XCTAssertTrue(m.syncEngine.sharedState.isDormant(sid))
    XCTAssertTrue(m.sharedAdapterEnabled, "a dormant copy keeps its records")
  }

  func testSyncOffTurnsSharedSpacesIntoLocalCopies() throws {
    let m = try sharedOn(2)
    try m.syncEngine.stateStore.update { $0.enabled = false }
    m.sharedSyncChanged()
    XCTAssertNil(m.spaces.first?.sharedId)
    XCTAssertNil(m.spaces.first?.link)
    XCTAssertTrue(m.tabs.allSatisfy { $0.sharedTabId == nil })
    XCTAssertFalse(m.sharedAdapterEnabled)
    XCTAssertNil(m.sharedBaseline(sid))
  }
  // MARK: The switch (Task 18)

  /// Sync on, the switch off, and two local Spaces: "Reading" and an
  /// oversized "Archive".
  func localSpaces() throws -> TabsManager {
    try writeSync(enabled: true)
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    let reading = try m.createSpace(name: "Reading", color: "#426c4c", symbol: "book")
    let archive = try m.createSpace(name: "Archive", color: "#376694", symbol: "briefcase")
    m.show(set: archive)
    for n in 1...501 { m.createTab(url: URL(string: "https://example.test/a\(n)")!, title: "A\(n)", quiet: true) }
    m.show(set: reading)
    m.createTab(url: URL(string: "https://example.test/r1")!, title: "R1")
    m.show(set: TabSets.iphoneId)
    return m
  }

  func testTheSheetTicksSpacesThatFitAndGreysOversizedOnes() throws {
    let m = try localSpaces()
    let rows = m.sharingRows()
    XCTAssertEqual(rows.map(\.name), ["Reading", "Archive"])
    XCTAssertNil(rows[0].reason)
    XCTAssertEqual(rows[1].reason, .tabs, "over 500 tabs")
    XCTAssertFalse(rows.contains { $0.canRejoin || $0.shared })
  }

  func testTurningOnSharesTheChosenSpacesAsNewLibrarySpaces() throws {
    let m = try localSpaces()
    let reading = try XCTUnwrap(m.spaces.first { $0.name == "Reading" })
    XCTAssertNil(m.turnOnSharedSpaces([(id: reading.id, mode: .copy)]))
    let state = m.syncEngine.sharedState
    XCTAssertTrue(state.isEnabled)
    XCTAssertTrue(m.sharedAdapterEnabled)
    let shared = try XCTUnwrap(m.spaces.first { $0.name == "Reading" })
    let sid = try XCTUnwrap(shared.sharedId)
    XCTAssertTrue(M.isId(sid))
    XCTAssertNotEqual(sid, reading.id, "a fresh library id")
    XCTAssertEqual(shared.link, .active)
    let entry = try XCTUnwrap(state.data["index"]?["spaces"]?[sid])
    XCTAssertEqual(entry["name"]?["v"], .string("Reading"))
    XCTAssertEqual(entry["createdBy"], .string("phone"))
    XCTAssertEqual(M.liveTabCount(state.blob(sid)), 1, "its web page; the Start Page isn't shared")
    XCTAssertTrue(state.hasPendingEdits(sid), "every field is a write to upload")
    XCTAssertEqual(shared.set.tabs.compactMap(\.tabId).count, 1)
    XCTAssertNil(m.spaces.first { $0.name == "Archive" }?.sharedId, "Archive stays local")
  }

  func testTheLibraryCapRefusesA26thSpace() throws {
    let m = try localSpaces()
    let reading = try XCTUnwrap(m.spaces.first { $0.name == "Reading" })
    var spaces: [(String, JSONValue)] = []
    for n in 1...25 {
      spaces.append((id(0x900 + n), .object([("name", f(.string("S\(n)"))), ("color", f(.string("#426c4c"))),
        ("symbol", f(.string("book"))), ("pos", f(.string(try M.keyFor("", "", id(0x900 + n))))),
        ("deleted", f(.bool(false)))])))
    }
    try m.syncEngine.sharedState.setIndex(.object([("v", .number(1)), ("spaces", .object(spaces))]))
    XCTAssertEqual(m.turnOnSharedSpaces([(id: reading.id, mode: .copy)]), .limit)
    XCTAssertNil(m.spaces.first { $0.name == "Reading" }?.sharedId)
  }

  func testOffThenOnWithNoEditsLeavesTheLibraryUnchanged() throws {
    let m = try sharedOn(2)
    m.publishSharedEdits()
    let state = m.syncEngine.sharedState
    let before = (state.blob(sid) ?? .null).canonical()
    let pending = (state.data["pending"]?[sid] ?? .null).canonical()
    let index = (state.data["index"] ?? .null).canonical()
    m.turnOffSharedSpaces()
    XCTAssertFalse(state.isEnabled)
    XCTAssertEqual(m.spaces.first?.link, .dormant)
    let row = try XCTUnwrap(m.sharingRows().first)
    XCTAssertTrue(row.canRejoin, "the library still has it")
    XCTAssertNil(m.turnOnSharedSpaces([(id: row.id, mode: .rejoin)]))
    m.publishSharedEdits()
    XCTAssertTrue(state.isEnabled)
    XCTAssertEqual(m.spaces.first?.link, .active)
    XCTAssertEqual(m.spaces.first?.sharedId, sid, "the same library Space")
    XCTAssertFalse(state.isDormant(sid))
    XCTAssertEqual((state.blob(sid) ?? .null).canonical(), before)
    XCTAssertEqual((state.data["pending"]?[sid] ?? .null).canonical(), pending)
    XCTAssertEqual((state.data["index"] ?? .null).canonical(), index)
  }

  func testSaveThisIPhoneAsASpaceMovesItsTabs() throws {
    try writeSync(enabled: true)
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    m.createTab(url: URL(string: "https://example.test/one")!, title: "One")
    let count = m.tabs.count
    let id = try m.saveIPhoneAsSpace()
    XCTAssertEqual(m.shownSetId, id)
    XCTAssertEqual(m.tabs.count, count, "the same tabs, now the Space's")
    XCTAssertEqual(m.savedSet(TabSets.iphoneId)?.tabs.map(\.url), [TabsManager.newTabURL.absoluteString])
    XCTAssertEqual(m.sharingRows().first?.id, id)
  }
}
