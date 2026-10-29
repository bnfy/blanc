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

  func testSpaceIdentityEditsReachTheIndexAsTheyAreMade() throws {
    let m = try sharedOn()
    let space = try XCTUnwrap(m.shownSpace)
    try m.updateSpace(space.id, name: "Studio", color: nil, symbol: nil)
    let record = try XCTUnwrap(m.syncEngine.sharedState.data["index"]?["spaces"]?[sid])
    XCTAssertEqual(record["name"]?["v"], .string("Studio"))
    XCTAssertEqual(record["name"]?["by"], .string("phone"))
    XCTAssertEqual(record["color"], f(.string("#426c4c")), "only the field changed here is written")
  }

  /// Another shared Space, "Home", after "Work" in the library and on the phone.
  func addHome(_ m: TabsManager) throws -> String {
    let state = m.syncEngine.sharedState
    let home = id(0x88), tab = id(0x201)
    let after = try XCTUnwrap(state.data["index"]?["spaces"]?[sid]?["pos"]?["v"]?.string)
    try state.setIndex(.object([("v", .number(1)), ("spaces", .object([(home, .object([
      ("name", f(.string("Home"))), ("color", f(.string("#376694"))), ("symbol", f(.string("book"))),
      ("pos", f(.string(try M.keyFor(after, "", home)))), ("deleted", f(.bool(false))),
      ("createdAt", .number(100)), ("createdBy", .string("mac")),
    ]))]))]))
    try state.noteLocalSpace(id: home, blob: .object([
      ("v", .number(1)), ("spaceId", .string(home)), ("groups", .object([])),
      ("tabs", .object([(tab, .object([
        ("nav", f(.object([("url", .string("https://example.test/home")), ("title", .string("Home"))]))),
        ("name", f(.null)), ("pinned", f(.bool(false))), ("groupId", f(.null)),
        ("pos", f(.string(try M.keyFor("", "", tab)))), ("deleted", f(.bool(false))),
      ]))])),
    ]), edits: nil)
    m.reconcileSharedLibrary(state, deviceId: "phone", now: now)
    XCTAssertEqual(m.spaces.compactMap(\.sharedId), [sid, home])
    return home
  }

  func testMovingASharedSpaceReachesTheIndexOrder() throws {
    let m = try sharedOn()
    let home = try addHome(m)
    let homeId = try XCTUnwrap(m.spaces.first { $0.sharedId == home }?.id)
    m.moveSpace(homeId, by: -1)
    XCTAssertEqual(M.orderOf(try XCTUnwrap(m.syncEngine.sharedState.data["index"]?["spaces"])), [home, sid])
  }

  /// The two-device check (2026-10-29): a rename made on the Mac reached the
  /// phone, which compared its own copy with the merged index and wrote its
  /// old name back with a newer clock, undoing the rename everywhere.
  func testAnotherDevicesRenameIsAppliedAndNotWrittenBack() throws {
    let m = try sharedOn()
    let state = m.syncEngine.sharedState
    var renamed = try XCTUnwrap(state.data["index"]?["spaces"]?[sid])
    renamed["name"] = f(.string("Douglas"), 200, "mac")
    XCTAssertTrue(try state.mergeIndex(.object([("v", .number(1)), ("spaces", .object([(sid, renamed)]))])))
    m.reconcileSharedLibrary(state, deviceId: "phone", now: now)
    m.publishSharedEdits()
    XCTAssertEqual(m.spaces.first { $0.sharedId == sid }?.name, "Douglas")
    XCTAssertEqual(state.data["index"]?["spaces"]?[sid]?["name"], f(.string("Douglas"), 200, "mac"), "the Mac's rename stands")
  }

  func testAnotherDevicesReorderIsAppliedAndNotWrittenBack() throws {
    let m = try sharedOn()
    let state = m.syncEngine.sharedState
    let home = try addHome(m)
    let first = try XCTUnwrap(state.data["index"]?["spaces"]?[sid]?["pos"]?["v"]?.string)
    var moved = try XCTUnwrap(state.data["index"]?["spaces"]?[home])
    moved["pos"] = f(.string(try M.keyFor("", first, home)), 200, "mac")
    XCTAssertTrue(try state.mergeIndex(.object([("v", .number(1)), ("spaces", .object([(home, moved)]))])))
    m.reconcileSharedLibrary(state, deviceId: "phone", now: now)
    m.publishSharedEdits()
    XCTAssertEqual(m.spaces.compactMap(\.sharedId), [home, sid])
    XCTAssertEqual(M.orderOf(try XCTUnwrap(state.data["index"]?["spaces"])), [home, sid], "the Mac's order stands")
    XCTAssertEqual(state.data["index"]?["spaces"]?[home]?["pos"], moved["pos"])
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
  /// A build that didn't save `sharedAccount` (iPhone builds before M17c's
  /// wiring) ran in between: its session.json has the links but no account.
  /// The same account is still signed in, so the links stay and the library
  /// adds no second copy of the Space.
  func testALinkSavedWithoutItsAccountStaysLinkedForTheSameAccount() throws {
    let m = try sharedOn(2)
    m.flushSession()
    let file = sessionDir.appendingPathComponent("session.json")
    var saved = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    var state = try XCTUnwrap(saved["state"] as? [String: Any])
    XCTAssertNotNil(state.removeValue(forKey: "sharedAccount"))
    saved["state"] = state
    try JSONSerialization.data(withJSONObject: saved).write(to: file)

    let reopened = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    XCTAssertEqual(reopened.spaces.map(\.name), ["Work"], "no second Work")
    XCTAssertEqual(reopened.spaces.first?.sharedId, sid)
    XCTAssertEqual(reopened.spaces.first?.link, .active)
    XCTAssertTrue(reopened.tabs.allSatisfy { $0.sharedTabId != nil }, "the tabs keep their records")
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
  // MARK: Bring a Space (Task 19)

  func testBringASpaceMakesAnUnlinkedLocalCopyAndShowsIt() throws {
    try writeSync(enabled: true)
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    let state = m.syncEngine.sharedState
    try state.mergeIndex(try indexEntry())
    let remote = try XCTUnwrap(m.remoteSpaces.first, "the library's Space, switch off")
    XCTAssertEqual(remote.name, "Work")
    XCTAssertEqual(remote.deviceId, "mac")
    var blob = try library(count: 3)
    blob["active"] = f(.string(id(0x102)))
    let before = state.data.canonical()
    let spaceId = try m.bringSpace(remote, blob: blob)
    XCTAssertEqual(state.data.canonical(), before, "the review copy is never written to the Spaces state")
    XCTAssertEqual(m.shownSetId, spaceId)
    let space = try XCTUnwrap(m.shownSpace)
    XCTAssertNil(space.sharedId)
    XCTAssertNil(space.link)
    XCTAssertEqual(m.tabs.map { $0.currentURL.absoluteString }, (1...3).map { "https://example.test/\($0)" })
    XCTAssertTrue(m.tabs.allSatisfy { $0.sharedTabId == nil })
    XCTAssertEqual(m.tabs.filter(\.hasWebView).count, 1, "only the saved selection loads")
    XCTAssertTrue(m.tabs[1].hasWebView)
    XCTAssertEqual(try m.bringSpace(remote, blob: blob) != spaceId, true)
    XCTAssertEqual(m.spaces.map(\.name), ["Work", "Work 2"], "a second copy takes a free name")
  }

  func testBringIsRefusedAt25Spaces() throws {
    try writeSync(enabled: true)
    let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
    for n in 1...25 { try m.createSpace(name: "S\(n)", color: "#426c4c", symbol: "book") }
    let remote = TabsManager.RemoteSpace(id: sid, name: "Work", color: "#426c4c", symbol: "book", deviceId: "mac", deviceName: "Mac")
    XCTAssertFalse(m.canAddSpace)
    XCTAssertThrowsError(try m.bringSpace(remote, blob: try library(count: 1)))
  }

  func testRemoteSpacesAreHiddenWithTheSwitchOn() throws {
    let m = try sharedOn(1)
    XCTAssertTrue(m.remoteSpaces.isEmpty, "with the switch on the library is the phone's own")
  }

  // MARK: Recently closed (Task 20)

  func testAPageClosedHereAndListedByAnotherDeviceShowsOnce() throws {
    let m = try sharedOn(2)
    let closing = try XCTUnwrap(m.tabs.last)
    m.closeTab(closing.id)
    let id = id(0x102)
    let other = ClosedRow(id: id, url: "https://example.test/2", title: "Tab 2", closedAt: Int64(Date().timeIntervalSince1970 * 1000),
                          spaceId: sid, fromId: "mac", fromName: "Mac")
    m.recentlyClosed.add(other)
    XCTAssertEqual(m.closedBand.filter { $0.id == id }.count, 1)
  }

  func testARemoteCloseIsLabelledWithTheClosingDevice() throws {
    let m = try sharedOn(2)
    let state = m.syncEngine.sharedState
    var blob = try XCTUnwrap(state.blob(sid))
    var record = try XCTUnwrap(blob["tabs"]?[id(0x102)])
    record["deleted"] = f(.bool(true), now, "macbook")
    blob["tabs"]?[id(0x102)] = record
    try state.noteLocalSpace(id: sid, blob: blob, edits: nil)
    m.sharedSpacesMerged([sid])
    let row = try XCTUnwrap(m.closedBand.first)
    XCTAssertEqual(row.id, id(0x102))
    XCTAssertEqual(m.closedDeviceName(row), "macbook")
  }
}
