import XCTest

@testable import Blanc

/// M17c Task 17: shared Space records ↔ a tab set, pure (design §10, M16 §4.2–4.4).
@MainActor final class SharedSpacesAdapterTests: XCTestCase {
  typealias M = SharedSpacesModel
  typealias A = SharedSpacesAdapter
  let space = String(repeating: "0", count: 30) + "99"
  let now: Int64 = 1_800_000_000_000
  func id(_ n: Int) -> String { String((String(repeating: "0", count: 32) + String(n, radix: 16)).suffix(32)) }
  func counter(from start: Int = 0x500) -> () -> String {
    var n = start
    return { [unowned self] in n += 1; return self.id(n) }
  }
  func saved(_ n: Int, tabId: String? = nil, group: String? = nil, pinned: Bool = false) -> SavedTab {
    SavedTab(url: "https://example.test/\(n)", title: "Tab \(n)", pinned: pinned, groupId: group, tabId: tabId)
  }

  /// A set of `count` tabs already shared once: the set with ids and its baseline.
  func shared(_ count: Int, groups: [TabGroup] = [], grouping: [Int: String] = [:], active: Int = 0)
    -> (set: SavedSet, baseline: JSONValue)
  {
    let input = SavedSet(
      tabs: (1...count).map { saved($0, group: grouping[$0]) }, groups: groups, activeIndex: active)
    let first = A.localEdits(
      set: input, spaceId: space, baseline: nil, accepted: nil, deviceId: "phone", now: now - 1000,
      newId: counter())
    var set = input
    for (n, tid) in first.tabIds.enumerated() { set.tabs[n].tabId = tid }
    return (set, first.baseline)
  }
  /// Another device's write over `baseline`: `fields` replace those of record `rid`.
  func remote(_ baseline: JSONValue, kind: String = "tabs", _ rid: String, _ fields: [(String, JSONValue)],
    by: String = "mac", at: Int64? = nil) throws -> JSONValue
  {
    var record = baseline[kind]?[rid] ?? .object([])
    for (name, value) in fields { record[name] = M.field(value, at ?? now + 5000, by) }
    var change = baseline
    var map = change[kind] ?? .object([])
    map[rid] = record
    change[kind] = map
    return try M.mergeBlob(baseline, change)!
  }
  func nav(_ url: String, _ title: String) -> JSONValue {
    .object([("url", .string(url)), ("title", .string(title))])
  }
  func isEmpty(_ edits: JSONValue) -> Bool { edits.pairs.isEmpty }

  // MARK: Local change → record

  func testANewTabGetsAnIdEveryFieldAndAPositionBetweenItsNeighbours() throws {
    let (set, baseline) = shared(2)
    var next = set
    next.tabs.insert(saved(9), at: 1)
    let result = A.localEdits(
      set: next, spaceId: space, baseline: baseline, accepted: nil, deviceId: "phone", now: now,
      newId: counter(from: 0x900))
    let fresh = try XCTUnwrap(result.tabIds[1])
    XCTAssertTrue(M.isId(fresh))
    let record = try XCTUnwrap(result.edits["tabs"]?[fresh])
    XCTAssertEqual(Set(M.keys(record)), ["nav", "name", "pinned", "groupId", "pos", "deleted"])
    XCTAssertEqual(record["name"]?["v"], .null)
    XCTAssertEqual(record["nav"]?["c"], .number(Double(now)))
    XCTAssertEqual(record["nav"]?["by"], .string("phone"))
    XCTAssertEqual(
      M.orderOf(result.baseline["tabs"]!), [set.tabs[0].tabId!, fresh, set.tabs[1].tabId!],
      "pos sits between its neighbours")
    XCTAssertEqual(M.keys(result.edits["tabs"]), [fresh], "the neighbours keep their positions")
  }

  func testNavigationPinGroupMoveAndCloseBecomeTheirFields() throws {
    let group = TabGroup(id: id(0x77), name: "Reading")
    let (set, baseline) = shared(3, groups: [group], grouping: [3: group.id])
    var next = set
    next.tabs[0].url = "https://example.test/moved-on"
    next.tabs[0].title = "Moved on"
    next.tabs[1].pinned = true
    next.tabs.remove(at: 2)
    let result = A.localEdits(
      set: next, spaceId: space, baseline: baseline, accepted: nil, deviceId: "phone", now: now)
    let a = set.tabs[0].tabId!, b = set.tabs[1].tabId!, c = set.tabs[2].tabId!
    XCTAssertEqual(M.keys(result.edits["tabs"]?[a]), ["nav"])
    XCTAssertEqual(result.edits["tabs"]?[a]?["nav"]?["v"], nav("https://example.test/moved-on", "Moved on"))
    XCTAssertEqual(M.keys(result.edits["tabs"]?[b]), ["pinned"])
    XCTAssertEqual(result.edits["tabs"]?[c]?["deleted"]?["v"], .bool(true))
    XCTAssertEqual(result.edits["groups"]?[group.id]?["deleted"]?["v"], .bool(true), "its only tab left")
    let again = A.localEdits(
      set: next, spaceId: space, baseline: result.baseline, accepted: nil, deviceId: "phone", now: now + 1)
    XCTAssertTrue(isEmpty(again.edits), "a diff against the advanced baseline is empty")
  }

  func testACustomNameIsKeptAndNeverCleared() throws {
    let (set, baseline) = shared(1)
    let a = set.tabs[0].tabId!
    let named = try remote(baseline, a, [("name", .string("My notes"))])
    let applied = A.apply(
      merged: named, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: nil, now: now)
    XCTAssertEqual(applied.baseline["tabs"]?[a]?["name"]?["v"], .string("My notes"))
    var next = applied.set
    next.tabs[0].url = "https://example.test/other"
    let result = A.localEdits(
      set: next, spaceId: space, baseline: applied.baseline, accepted: nil, deviceId: "phone", now: now + 9000)
    XCTAssertEqual(M.keys(result.edits["tabs"]?[a]), ["nav"], "the name is never written")
    XCTAssertEqual(result.baseline["tabs"]?[a]?["name"]?["v"], .string("My notes"))
    XCTAssertEqual(result.baseline["tabs"]?[a]?["name"]?["by"], .string("mac"))
  }

  func testAGroupWithAnInvalidIdIsGivenARecordId() throws {
    let (set, baseline) = shared(1)
    var next = set
    next.groups = [TabGroup(id: "seed-group", name: "Seeded")]
    next.tabs[0].groupId = "seed-group"
    let result = A.localEdits(
      set: next, spaceId: space, baseline: baseline, accepted: nil, deviceId: "phone", now: now,
      newId: counter(from: 0x700))
    let bound = try XCTUnwrap(result.groupIds["seed-group"])
    XCTAssertTrue(M.isId(bound))
    XCTAssertEqual(result.edits["groups"]?[bound]?["name"]?["v"], .string("Seeded"))
    XCTAssertEqual(result.edits["tabs"]?[set.tabs[0].tabId!]?["groupId"]?["v"], .string(bound))
  }

  // MARK: Record → set

  func testRemoteCloseOfABackgroundTabClosesItLabelledWithTheWriter() throws {
    let (set, baseline) = shared(3, active: 0)
    let b = set.tabs[1].tabId!
    let merged = try remote(baseline, b, [("deleted", .bool(true))], by: "macbook")
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil,
      protectedTabId: set.tabs[0].tabId, now: now + 6000)
    XCTAssertEqual(applied.set.tabs.map(\.tabId), [set.tabs[0].tabId, set.tabs[2].tabId])
    XCTAssertEqual(applied.closed.count, 1)
    XCTAssertEqual(applied.closed.first?.id, b, "the row's id is the shared record's")
    XCTAssertEqual(applied.closed.first?.fromId, "macbook")
    XCTAssertEqual(applied.closed.first?.spaceId, space)
    XCTAssertEqual(applied.closed.first?.url, "https://example.test/2", "the saved URL, never about:blank")
    XCTAssertEqual(applied.closed.first?.title, "Tab 2")
  }

  func testRemoteNavOfTheProtectedTabWaitsAndProducesNoEdit() throws {
    let (set, baseline) = shared(2, active: 0)
    let a = set.tabs[0].tabId!
    let merged = try remote(baseline, a, [("nav", nav("https://example.test/remote", "Remote"))])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: a, now: now)
    XCTAssertEqual(applied.set.tabs[0].url, "https://example.test/1", "the person's page stays")
    XCTAssertEqual(applied.accepted["tabs"]?[a]?["nav"]?["v"], nav("https://example.test/remote", "Remote"))
    XCTAssertEqual(applied.baseline["tabs"]?[a]?["nav"]?["v"], nav("https://example.test/1", "Tab 1"))
    let edits = A.localEdits(
      set: applied.set, spaceId: space, baseline: applied.baseline, accepted: applied.accepted,
      deviceId: "phone", now: now + 7000)
    XCTAssertTrue(isEmpty(edits.edits), "no navigation back is published")
    // Once it is no longer protected, the deferred change applies.
    let later = A.apply(
      merged: nil, to: applied.set, spaceId: space, baseline: applied.baseline, accepted: applied.accepted,
      protectedTabId: set.tabs[1].tabId, now: now + 8000)
    XCTAssertEqual(later.set.tabs[0].url, "https://example.test/remote")
    XCTAssertEqual(later.navigated, [a])
    XCTAssertTrue(later.accepted.pairs.isEmpty)
  }

  func testARemoteCloseOfTheProtectedTabWaitsAndIsNotResurrected() throws {
    let (set, baseline) = shared(2, active: 0)
    let a = set.tabs[0].tabId!
    let merged = try remote(baseline, a, [("deleted", .bool(true))])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: a, now: now)
    XCTAssertEqual(applied.set.tabs.count, 2)
    XCTAssertTrue(applied.closed.isEmpty)
    let edits = A.localEdits(
      set: applied.set, spaceId: space, baseline: applied.baseline, accepted: applied.accepted,
      deviceId: "phone", now: now + 7000)
    XCTAssertTrue(isEmpty(edits.edits), "the still-open tab is not published as a new record")
  }

  func testAnUnrelatedLocalCloseDuringADeferralPublishesOnlyThatClose() throws {
    let (set, baseline) = shared(3, active: 0)
    let a = set.tabs[0].tabId!, c = set.tabs[2].tabId!
    let merged = try remote(baseline, a, [("nav", nav("https://example.test/remote", "Remote"))])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: a, now: now)
    var next = applied.set
    next.tabs.remove(at: 2)
    let edits = A.localEdits(
      set: next, spaceId: space, baseline: applied.baseline, accepted: applied.accepted, deviceId: "phone",
      now: now + 7000)
    XCTAssertEqual(M.keys(edits.edits), ["tabs"])
    XCTAssertEqual(M.keys(edits.edits["tabs"]), [c])
    XCTAssertEqual(M.keys(edits.edits["tabs"]?[c]), ["deleted"])
    XCTAssertNotNil(edits.accepted["tabs"]?[a]?["nav"], "the deferral is kept")
  }

  func testClosingTheDeferredTabYourselfDropsTheDeferral() throws {
    let (set, baseline) = shared(2, active: 0)
    let a = set.tabs[0].tabId!
    let merged = try remote(baseline, a, [("nav", nav("https://example.test/remote", "Remote"))])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: a, now: now)
    var next = applied.set
    next.tabs.remove(at: 0)
    next.activeIndex = 0
    let edits = A.localEdits(
      set: next, spaceId: space, baseline: applied.baseline, accepted: applied.accepted, deviceId: "phone",
      now: now + 7000)
    let close = try XCTUnwrap(edits.edits["tabs"]?[a]?["deleted"])
    XCTAssertGreaterThan(close["c"]?.number ?? 0, Double(now + 5000), "the person's close is newer")
    XCTAssertTrue(edits.accepted.pairs.isEmpty)
  }

  func testAppliedChangesProduceNoEcho() throws {
    let group = TabGroup(id: id(0x77), name: "Reading")
    let (set, baseline) = shared(3, groups: [group], grouping: [2: group.id, 3: group.id], active: 0)
    let b = set.tabs[1].tabId!, c = set.tabs[2].tabId!
    var merged = try remote(baseline, b, [("nav", nav("https://example.test/b2", "B2")), ("pinned", .bool(true))])
    merged = try remote(merged, c, [("groupId", .null)])
    merged = try remote(merged, kind: "groups", group.id, [("name", .string("Later")), ("collapsed", .bool(true))])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil,
      protectedTabId: set.tabs[0].tabId, now: now)
    XCTAssertEqual(applied.set.tabs[1].url, "https://example.test/b2")
    XCTAssertTrue(applied.set.tabs[1].pinned)
    XCTAssertNil(applied.set.tabs.first { $0.tabId == c }?.groupId)
    XCTAssertEqual(applied.set.groups.first?.name, "Later")
    XCTAssertEqual(applied.set.groups.first?.collapsed, true)
    let edits = A.localEdits(
      set: applied.set, spaceId: space, baseline: applied.baseline, accepted: applied.accepted,
      deviceId: "phone", now: now + 9000)
    XCTAssertTrue(isEmpty(edits.edits), "applied: \(edits.edits.jsStringify())")
  }

  func testANewRemoteTabArrivesAtItsPosition() throws {
    let (set, baseline) = shared(2, active: 0)
    let a = set.tabs[0].tabId!, b = set.tabs[1].tabId!
    let fresh = id(0xabc)
    let left = baseline["tabs"]![a]!["pos"]!["v"]!.string!
    let right = baseline["tabs"]![b]!["pos"]!["v"]!.string!
    let merged = try remote(
      baseline, fresh,
      [
        ("nav", nav("https://example.test/new", "New")), ("name", .null), ("pinned", .bool(false)),
        ("groupId", .null), ("pos", .string(try M.keyFor(left, right, fresh))), ("deleted", .bool(false)),
      ])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: a, now: now)
    XCTAssertEqual(applied.set.tabs.map(\.tabId), [a, fresh, b])
    XCTAssertEqual(applied.sources, [0, nil, 1])
    XCTAssertEqual(applied.set.activeIndex, 0, "the selection stays on the person's tab")
    XCTAssertTrue(isEmpty(A.localEdits(
      set: applied.set, spaceId: space, baseline: applied.baseline, accepted: nil, deviceId: "phone",
      now: now + 9000
    ).edits))
  }

  func testAGroupTombstoneUngroupsItsMembers() throws {
    let group = TabGroup(id: id(0x77), name: "Reading")
    let (set, baseline) = shared(2, groups: [group], grouping: [1: group.id, 2: group.id])
    let merged = try remote(baseline, kind: "groups", group.id, [("deleted", .bool(true))])
    let applied = A.apply(
      merged: merged, to: set, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: nil, now: now)
    XCTAssertTrue(applied.set.groups.isEmpty)
    XCTAssertEqual(applied.set.tabs.map(\.groupId), [nil, nil])
    XCTAssertEqual(applied.set.tabs.count, 2, "its tabs stay open")
    XCTAssertTrue(isEmpty(A.localEdits(
      set: applied.set, spaceId: space, baseline: applied.baseline, accepted: nil, deviceId: "phone",
      now: now + 9000
    ).edits))
  }

  func testATabThatIsNotSharedKeepsItsPlace() throws {
    let (set, baseline) = shared(2)
    var withLocal = set
    withLocal.tabs.insert(SavedTab(url: "blanc://newtab/", title: ""), at: 1)
    let merged = try remote(baseline, set.tabs[1].tabId!, [("nav", nav("https://example.test/x", "X"))])
    let applied = A.apply(
      merged: merged, to: withLocal, spaceId: space, baseline: baseline, accepted: nil, protectedTabId: nil,
      now: now)
    XCTAssertEqual(applied.set.tabs.map(\.url), ["https://example.test/1", "blanc://newtab/", "https://example.test/x"])
  }

  // MARK: The library

  func indexEntry(_ name: String, pos: String, deleted: Bool = false, at: Int64 = 100) -> JSONValue {
    .object([
      ("name", M.field(.string(name), at, "mac")), ("color", M.field(.string("#426c4c"), at, "mac")),
      ("symbol", M.field(.string("book"), at, "mac")), ("pos", M.field(.string(pos), at, "mac")),
      ("deleted", M.field(.bool(deleted), at, "mac")), ("createdAt", .number(Double(at))),
      ("createdBy", .string("mac")),
    ])
  }
  func library(_ entries: [(String, JSONValue)]) -> JSONValue {
    .object([("v", .number(1)), ("spaces", .object(entries))])
  }
  func spaceBlob(_ sid: String, _ count: Int, from: Int = 1) throws -> JSONValue {
    var tabs: [(String, JSONValue)] = []
    var left = ""
    for n in from..<(from + count) {
      let tid = id(0x1000 + n)
      left = try M.keyFor(left, "", tid)
      let f: (JSONValue) -> JSONValue = { (v: JSONValue) -> JSONValue in M.field(v, 100, "mac") }
      tabs.append(
        (
          tid,
          .object([
            ("nav", f(nav("https://example.test/\(n)", "Tab \(n)"))), ("name", f(.null)), ("pinned", f(.bool(false))),
            ("groupId", f(.null)), ("pos", f(.string(left))), ("deleted", f(.bool(false))),
          ])
        ))
    }
    return .object([("v", .number(1)), ("spaceId", .string(sid)), ("groups", .object([])), ("tabs", .object(tabs))])
  }
  func reconcile(
    _ spaces: [SpaceRecord], shown: String = "iphone", index: JSONValue, blobs: [String: JSONValue],
    dormant: Set<String> = [], drafts: Set<String> = [], recoveries: JSONValue? = nil, done: JSONValue? = nil,
    baselines: [String: JSONValue] = [:]
  ) -> A.Library {
    A.reconcileLibrary(
      spaces: spaces, shownSetId: shown, index: index, blobs: blobs, dormant: dormant, drafts: drafts,
      recoveries: recoveries, recoveryDone: done, baselines: baselines, newId: counter(from: 0x3000),
      recoveryName: { (name: String) -> String in "\(name) · kept on this iPhone" })
  }

  func testReconcileAddsLiveLibrarySpacesInTheIndexOrder() throws {
    let work = id(0xa1), home = id(0xa2), sleepy = id(0xa3), draft = id(0xa4), empty = id(0xa5)
    let k1 = try M.keyFor("", "", home), k2 = try M.keyFor(k1, "", work)
    let k3 = try M.keyFor(k2, "", sleepy), k4 = try M.keyFor(k3, "", draft), k5 = try M.keyFor(k4, "", empty)
    let index = library([
      (work, indexEntry("Work", pos: k2)), (home, indexEntry("Home", pos: k1)),
      (sleepy, indexEntry("Sleepy", pos: k3)), (draft, indexEntry("Draft", pos: k4)),
      (empty, indexEntry("No blob", pos: k5)),
    ])
    let local = SpaceRecord(id: "local", name: "Mine", color: "#426c4c", symbol: "book")
    let blobs: [String: JSONValue] = [
      work: try spaceBlob(work, 2), home: try spaceBlob(home, 1), sleepy: try spaceBlob(sleepy, 1),
      draft: try spaceBlob(draft, 1),
    ]
    let result = reconcile([local], index: index, blobs: blobs, dormant: [sleepy], drafts: [draft])
    XCTAssertEqual(result.spaces.map(\.name), ["Mine", "Home", "Work"])
    let added = try XCTUnwrap(result.spaces.first { $0.sharedId == work })
    XCTAssertEqual(added.link, .active)
    XCTAssertEqual(added.set.tabs.map(\.url), ["https://example.test/1", "https://example.test/2"])
    XCTAssertEqual(added.set.tabs.map(\.tabId), [id(0x1001), id(0x1002)])
    XCTAssertNotNil(result.baselines[work])
    // Projected straight from the record, the new Space publishes nothing back.
    let edits = A.localEdits(
      set: added.set, spaceId: work, baseline: result.baselines[work], accepted: nil, deviceId: "phone", now: now)
    XCTAssertNil(edits.edits["tabs"])
    XCTAssertNil(edits.edits["groups"])
  }

  func testADeletedLibrarySpaceIsRemovedUnlessShown() throws {
    let gone = id(0xb1), shownGone = id(0xb2)
    let index = library([
      (gone, indexEntry("Gone", pos: try M.keyFor("", "", gone), deleted: true)),
      (shownGone, indexEntry("Shown", pos: try M.keyFor("", "", shownGone), deleted: true)),
    ])
    let a = SpaceRecord(id: "a", name: "Gone", color: "#426c4c", symbol: "book", sharedId: gone, link: .active)
    let b = SpaceRecord(id: "b", name: "Shown", color: "#426c4c", symbol: "book", sharedId: shownGone, link: .active)
    let result = reconcile([a, b], shown: "b", index: index, blobs: [:], baselines: [gone: A.emptyBlob(gone)])
    XCTAssertEqual(result.spaces.map(\.id), ["b"])
    XCTAssertEqual(result.spaces.first?.link, .dormant, "the shown one stays as a copy")
    XCTAssertEqual(result.dormant, [shownGone])
    XCTAssertNil(result.baselines[gone])
  }

  func testRecoveryMakesOneKeptSpaceAndIsIdempotent() throws {
    let sid = id(0xc1)
    let index = library([(sid, indexEntry("Work", pos: try M.keyFor("", "", sid)))])
    let blob = try spaceBlob(sid, 3)
    let lost = try spaceBlob(sid, 2, from: 7)
    let recoveries: JSONValue = .object([(sid, .object([("tabs", lost["tabs"]!), ("groups", .object([]))]))])
    var work = SpaceRecord(
      id: "w", name: "Work", color: "#426c4c", symbol: "book", set: A.project(blob), sharedId: sid, link: .active)
    work.set.tabs += A.project(lost).tabs
    let first = reconcile([work], index: index, blobs: [sid: blob], recoveries: recoveries, baselines: [sid: blob])
    let kept = try XCTUnwrap(first.spaces.first { $0.recoveredFrom == sid })
    XCTAssertEqual(kept.name, "Work · kept on this iPhone")
    XCTAssertEqual(kept.set.tabs.map(\.url), ["https://example.test/7", "https://example.test/8"])
    XCTAssertEqual(first.spaces.first { $0.sharedId == sid }?.set.tabs.count, 3, "they left the shared Space")
    XCTAssertEqual(Set(first.recoveryDone[sid] ?? []), [id(0x1007), id(0x1008)])
    // Again, after a crash before recoveryDone was saved: no tab twice.
    let again = reconcile(
      first.spaces, index: index, blobs: [sid: blob], recoveries: recoveries, baselines: first.baselines)
    XCTAssertEqual(again.spaces.filter { $0.recoveredFrom == sid }.count, 1)
    XCTAssertEqual(again.spaces.first { $0.recoveredFrom == sid }?.set.tabs.count, 2)
    // With recoveryDone saved, a recovery Space the person deleted isn't made again.
    let done: JSONValue = .object([(sid, .array((first.recoveryDone[sid] ?? []).map(JSONValue.string)))])
    let later = reconcile(
      first.spaces.filter { $0.recoveredFrom == nil }, index: index, blobs: [sid: blob], recoveries: recoveries,
      done: done, baselines: first.baselines)
    XCTAssertFalse(later.spaces.contains { $0.recoveredFrom == sid })
  }

  func testIdentityEditsGoToTheIndexEntry() throws {
    let a = id(0xd1), b = id(0xd2)
    let ka = try M.keyFor("", "", a), kb = try M.keyFor(ka, "", b)
    let index = library([(a, indexEntry("Work", pos: ka)), (b, indexEntry("Home", pos: kb))])
    var spaces = [
      SpaceRecord(id: "1", name: "Work", color: "#426c4c", symbol: "book", sharedId: a, link: .active),
      SpaceRecord(id: "2", name: "Home", color: "#426c4c", symbol: "book", sharedId: b, link: .active),
    ]
    XCTAssertNil(A.indexEdits(spaces: spaces, index: index, deviceId: "phone", now: now))
    spaces[0].name = "Office"
    spaces.swapAt(0, 1)
    let payload = try XCTUnwrap(A.indexEdits(spaces: spaces, index: index, deviceId: "phone", now: now))
    XCTAssertEqual(payload["spaces"]?[a]?["name"]?["v"], .string("Office"))
    let merged = try M.mergeIndex(index, payload)
    XCTAssertEqual(M.orderOf(merged["spaces"]!), [b, a])
    XCTAssertNil(A.indexEdits(spaces: spaces, index: merged, deviceId: "phone", now: now + 1))
  }
}
