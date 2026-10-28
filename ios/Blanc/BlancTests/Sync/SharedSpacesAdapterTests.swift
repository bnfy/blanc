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
}
