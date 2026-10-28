import Foundation

/// M17c: shared Space records ↔ the phone's tab sets, as desktop's
/// `src/main/shared-spaces-adapter.js` (`diffWindow`, `planApply`) and
/// `shared-spaces-service.js` (`reconcile`) do for a window (design §10,
/// M16 §4.2–4.4). Pure: it works on `SavedSet`s and blobs; `TabsManager`
/// carries a result onto live tabs. Each set keeps a **displayed baseline**
/// (the records exactly as the set shows them) and an **accepted set**
/// (remote changes to the protected tab, waiting).
enum SharedSpacesAdapter {
  typealias Model = SharedSpacesModel

  static func emptyBlob(_ spaceId: String) -> JSONValue {
    .object([("v", .number(1)), ("spaceId", .string(spaceId)), ("groups", .object([])), ("tabs", .object([]))])
  }
  /// `raw` as a valid blob of `spaceId`, or an empty one.
  static func blob(_ raw: JSONValue?, _ spaceId: String) -> JSONValue {
    guard let clean = Model.sanitizeBlob(raw), clean["spaceId"] == .string(spaceId) else { return emptyBlob(spaceId) }
    return clean
  }
  private static func put(_ target: inout JSONValue, _ kind: String, _ id: String, _ name: String, _ value: JSONValue) {
    var map = target[kind] ?? .object([])
    var record = map[id] ?? .object([])
    record[name] = value
    map[id] = record
    target[kind] = map
  }
  private static func clock(_ field: JSONValue?) -> Int64 { field?["c"]?.intValue ?? -1 }
  static func isHTTP(_ url: String) -> Bool { SyncSends.httpURL(.string(url)) != nil }
  /// A record id: 32 lowercase hex characters.
  nonisolated static func freshId() -> String { UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() }
  private static func ranks(_ ids: [String]) -> [String: Int] {
    var out: [String: Int] = [:]
    for (n, id) in ids.enumerated() { out[id] = n }
    return out
  }

  // MARK: - Local change → record (desktop's diffWindow)

  struct LocalEdits {
    /// `{tabs, groups, active}` field writes; empty when nothing changed.
    var edits: JSONValue
    var baseline: JSONValue
    /// Each tab's record id, parallel to the set's tabs (nil: not shareable).
    var tabIds: [String?]
    /// Local group ids that had to take a record id.
    var groupIds: [String: String]
    /// The accepted set with what the person's own edits superseded removed.
    var accepted: JSONValue
  }

  /// Diffs `set` against its displayed baseline into field writes clocked
  /// `now` by `deviceId`. A tab's custom `name` (F46) is never written once
  /// its record has one: the phone can't edit it, so it round-trips.
  static func localEdits(
    set: SavedSet, spaceId: String, baseline: JSONValue?, accepted: JSONValue?, deviceId: String, now: Int64,
    newId: () -> String = SharedSpacesAdapter.freshId
  ) -> LocalEdits {
    let base = blob(baseline, spaceId)
    var next = base
    var edits: JSONValue = .object([])
    var used = Set(Model.keys(base["tabs"]) + Model.keys(base["groups"]))
    func fresh() -> String {
      var id = newId()
      while !Model.isId(id) || used.contains(id) { id = freshId() }
      used.insert(id)
      return id
    }
    func write(_ kind: String, _ id: String, _ name: String, _ value: JSONValue) {
      let c = max(now, clock(next[kind]?[id]?[name]) + 1, clock(accepted?[kind]?[id]?[name]) + 1)
      let f = Model.field(value, c, deviceId)
      put(&edits, kind, id, name, f)
      put(&next, kind, id, name, f)
    }
    func values(_ kind: String, _ id: String, _ fields: [(String, JSONValue)]) {
      for (name, value) in fields {
        let prev = next[kind]?[id]?[name]
        let before: JSONValue? =
          name == "groupId" && prev != nil
          ? (Model.effectiveGroup(next, next[kind]?[id]).map(JSONValue.string) ?? .null) : prev?["v"]
        if prev == nil || Model.canon(before) != value.canonical() { write(kind, id, name, value) }
      }
    }
    func positions(_ kind: String, _ order: [String]) {
      var left = ""
      for (n, id) in order.enumerated() {
        let current = next[kind]?[id]?["pos"]?["v"]?.string
        let right =
          order[(n + 1)...].lazy.compactMap { rid -> String? in
            guard let key = next[kind]?[rid]?["pos"]?["v"]?.string, Model.validKey(key, rid), Model.less(left, key)
            else { return nil }
            return key
          }.first ?? ""
        let key: String
        if let current, Model.validKey(current, id), Model.less(left, current), right.isEmpty || Model.less(current, right) {
          key = current
        } else {
          key = (try? Model.keyFor(left, right, id)) ?? current ?? ""
        }
        if key != current { write(kind, id, "pos", .string(key)) }
        left = key
      }
    }

    // Groups: only those holding a tab exist (desktop's syncTabLayout).
    let held = Set(set.tabs.compactMap(\.groupId))
    var bindings: [String: String] = [:]
    var groupOrder: [String] = []
    for group in set.groups where held.contains(group.id) && bindings[group.id] == nil {
      var id = group.id
      if !Model.isId(id) || used.contains(id) && base["groups"]?[id] == nil || Model.deleted(base["groups"]?[id]) {
        id = fresh()
      } else {
        used.insert(id)
      }
      bindings[group.id] = id
      groupOrder.append(id)
      let color = group.color.flatMap { Model.normalizeHex(.string($0)) }.map(JSONValue.string) ?? .null
      values(
        "groups", id,
        [
          ("name", Model.text(.string(group.name), 60)), ("color", color), ("collapsed", .bool(group.collapsed)),
          ("deleted", .bool(false)),
        ])
    }
    for (id, record) in base["groups"]?.pairs ?? [] where !groupOrder.contains(id) && !Model.deleted(record) {
      write("groups", id, "deleted", .bool(true))
    }
    positions("groups", groupOrder)

    var tabIds = [String?](repeating: nil, count: set.tabs.count)
    var tabOrder: [String] = []
    var seen = Set<String>()
    for (n, tab) in set.tabs.enumerated() {
      guard let nav = Model.nav(.object([("url", .string(tab.url)), ("title", .string(tab.title))])) else {
        // A bound tab showing a page that can't be shared (a Start Page, say)
        // keeps its last published record; browsing locally closes nothing.
        if let id = tab.tabId, Model.isId(id), !Model.deleted(base["tabs"]?[id]), seen.insert(id).inserted {
          tabIds[n] = id
          tabOrder.append(id)
        }
        continue
      }
      var id = tab.tabId ?? ""
      if !Model.isId(id) || seen.contains(id) || Model.deleted(base["tabs"]?[id]) { id = fresh() } else { used.insert(id) }
      seen.insert(id)
      tabIds[n] = id
      tabOrder.append(id)
      var fields: [(String, JSONValue)] = [("nav", nav)]
      if next["tabs"]?[id]?["name"] == nil { fields.append(("name", .null)) }
      let group = tab.groupId.flatMap { bindings[$0] }
      fields += [
        ("pinned", .bool(tab.pinned)), ("groupId", group.map(JSONValue.string) ?? .null), ("deleted", .bool(false)),
      ]
      values("tabs", id, fields)
    }
    for (id, record) in base["tabs"]?.pairs ?? [] where !seen.contains(id) && !Model.deleted(record) {
      write("tabs", id, "deleted", .bool(true))
    }
    positions("tabs", tabOrder)

    if tabIds.indices.contains(set.activeIndex), let active = tabIds[set.activeIndex] {
      let previous = base["active"]
      if previous?["v"]?.string != active || Model.isTrue(previous?["cleared"]) {
        let f = Model.field(.string(active), max(now, clock(previous) + 1), deviceId)
        next["active"] = f
        edits["active"] = f
      }
    }
    let clean = Model.sanitizeBlob(next) ?? next
    return LocalEdits(
      edits: edits, baseline: clean, tabIds: tabIds,
      groupIds: bindings.filter { $0.key != $0.value }, accepted: settle(accepted, against: clean))
  }

  /// Drops deferred changes the displayed baseline already has or beats (the
  /// person navigated or closed the tab themselves), and those of gone tabs.
  static func settle(_ accepted: JSONValue?, against baseline: JSONValue) -> JSONValue {
    var out: [(String, JSONValue)] = []
    for (id, record) in accepted?["tabs"]?.pairs ?? [] {
      guard let shown = baseline["tabs"]?[id], !Model.deleted(shown) else { continue }
      let kept = record.pairs.filter { name, value in !Model.acknowledged(shown[name], value, name: name) }
      if !kept.isEmpty { out.append((id, .object(kept))) }
    }
    return out.isEmpty ? .object([]) : .object([("tabs", .object(out))])
  }

  // MARK: - Record → set (desktop's planApply and its rows)

  struct Applied {
    var set: SavedSet
    /// For each tab of `set`, its index in the input set; nil for a new one.
    var sources: [Int?]
    var baseline: JSONValue
    /// Only the deferrals of this pass (earlier ones are folded in first).
    var accepted: JSONValue
    /// Tabs closed by another device's tombstone, for Recently closed.
    var closed: [ClosedRow]
    /// Tabs whose address changed: a live one navigates, a quiet one doesn't.
    var navigated: Set<String>
    var changed: Bool
  }

  /// The baseline with the accepted fields applied to their records.
  static func effective(_ baseline: JSONValue, _ accepted: JSONValue?) -> JSONValue {
    var out = baseline
    for (id, fields) in accepted?["tabs"]?.pairs ?? [] {
      guard var record = baseline["tabs"]?[id] else { continue }
      for (name, value) in fields.pairs { record[name] = value }
      var map = out["tabs"] ?? .object([])
      map[id] = record
      out["tabs"] = map
    }
    return out
  }

  /// Applies `merged` (and every earlier deferral) to `set` in one pass. New
  /// records become tabs at their positions; a tombstone closes its tab
  /// without Undo and yields a `ClosedRow` labelled with `deleted.by`; a
  /// `nav` or tombstone of `protectedTabId` waits in `accepted`, its baseline
  /// unchanged, so the next `localEdits` publishes nothing for it.
  static func apply(
    merged: JSONValue?, to set: SavedSet, spaceId: String, baseline: JSONValue?, accepted: JSONValue?,
    protectedTabId: String?, now: Int64
  ) -> Applied {
    let base = blob(baseline, spaceId)
    var target = Model.sanitizeBlob(merged).flatMap { $0["spaceId"] == .string(spaceId) ? $0 : nil } ?? base
    target = (try? Model.mergeBlob(target, effective(base, accepted))) ?? target
    var next = base
    var deferred: JSONValue = .object([])
    var rows: [(tab: SavedTab, source: Int?)] = set.tabs.enumerated().map { ($0.element, $0.offset) }
    var groups = set.groups
    var closed: [ClosedRow] = []
    var navigated = Set<String>()
    var changed = false
    func row(_ id: String) -> Int? { rows.firstIndex { $0.tab.tabId == id } }

    func create(_ kind: String, _ id: String, _ record: JSONValue) {
      if kind == "groups" {
        guard !groups.contains(where: { $0.id == id }) else { return }
        groups.append(
          TabGroup(
            id: id, name: record["name"]?["v"]?.string ?? "", color: record["color"]?["v"]?.string,
            collapsed: record["collapsed"]?["v"]?.bool ?? false))
        return
      }
      guard let nav = record["nav"]?["v"], let url = nav["url"]?.string else { return }
      let title = nav["title"]?.string ?? ""
      let pinned = record["pinned"]?["v"]?.bool ?? false
      let group = record["groupId"]?["v"]?.string
      if let i = row(id) {
        rows[i].tab.pinned = pinned
        rows[i].tab.groupId = group
        if id != protectedTabId, rows[i].tab.url != url || rows[i].tab.title != title {
          rows[i].tab.url = url
          rows[i].tab.title = title
          navigated.insert(id)
        }
      } else {
        rows.append((SavedTab(url: url, title: title, pinned: pinned, groupId: group, tabId: id), nil))
      }
    }
    func applyField(_ kind: String, _ id: String, _ name: String, _ winner: JSONValue) {
      let value = winner["v"]
      if kind == "groups" {
        if name == "deleted", Model.isTrue(value) {
          groups.removeAll { $0.id == id }
          for i in rows.indices where rows[i].tab.groupId == id { rows[i].tab.groupId = nil }
        } else if let g = groups.firstIndex(where: { $0.id == id }) {
          switch name {
          case "name": groups[g].name = value?.string ?? groups[g].name
          case "color": groups[g].color = value?.string
          case "collapsed": groups[g].collapsed = value?.bool ?? false
          default: break
          }
        }
        return
      }
      guard let i = row(id) else { return }
      switch name {
      case "deleted" where Model.isTrue(value):
        let tab = rows.remove(at: i).tab
        if isHTTP(tab.url) {
          closed.append(
            ClosedRow(
              id: id, url: tab.url, title: tab.title, closedAt: now, spaceId: spaceId,
              fromId: winner["by"]?.string, fromName: nil))
        }
      case "nav":
        if let url = value?["url"]?.string {
          rows[i].tab.url = url
          rows[i].tab.title = value?["title"]?.string ?? ""
          navigated.insert(id)
        }
      case "pinned": rows[i].tab.pinned = value?.bool ?? false
      case "groupId": rows[i].tab.groupId = value?.string
      default: break  // name (F46) and pos: the baseline keeps them; order is below
      }
    }

    for kind in ["groups", "tabs"] {
      for (id, incoming) in target[kind]?.pairs ?? [] {
        guard let previous = base[kind]?[id] else {
          var map = next[kind] ?? .object([])
          map[id] = incoming
          next[kind] = map
          changed = true
          if !Model.deleted(incoming) { create(kind, id, incoming) }
          continue
        }
        for (name, value) in incoming.pairs {
          let prev = previous[name]
          guard let winner = Model.mergeField(prev, value, name: name), Model.canon(prev) != winner.canonical()
          else { continue }
          let differs = Model.canon(prev?["v"]) != Model.canon(winner["v"])
          let closing = name == "deleted" && Model.isTrue(winner["v"])
          if differs, kind == "tabs", id == protectedTabId, name == "nav" || closing {
            put(&deferred, kind, id, name, winner)
            continue
          }
          put(&next, kind, id, name, winner)
          changed = true
          if differs, !Model.deleted(previous) { applyField(kind, id, name, winner) }
        }
      }
    }
    let clean = Model.sanitizeBlob(next) ?? next
    guard changed else {
      return Applied(
        set: set, sources: set.tabs.indices.map { Optional($0) }, baseline: clean, accepted: deferred, closed: [],
        navigated: [], changed: false)
    }

    // Order: shared tabs by position; tabs that aren't records keep their place.
    let rank = ranks(Model.orderOf(clean["tabs"] ?? .object([])))
    func ranked(_ r: (tab: SavedTab, source: Int?)) -> Int? { r.tab.tabId.flatMap { rank[$0] } }
    var ordered = rows.filter { ranked($0) != nil }.sorted { ranked($0)! < ranked($1)! }
    for (index, r) in rows.enumerated() where ranked(r) == nil { ordered.insert(r, at: min(index, ordered.count)) }
    let groupRank = ranks(Model.orderOf(clean["groups"] ?? .object([])))
    var orderedGroups = groups.filter { groupRank[$0.id] != nil }.sorted { groupRank[$0.id]! < groupRank[$1.id]! }
    for (index, g) in groups.enumerated() where groupRank[g.id] == nil {
      orderedGroups.insert(g, at: min(index, orderedGroups.count))
    }
    let known = Set(orderedGroups.map(\.id))
    for i in ordered.indices where ordered[i].tab.groupId.map({ !known.contains($0) }) ?? false {
      ordered[i].tab.groupId = nil
    }
    let selected = ordered.firstIndex { $0.source == set.activeIndex }
    var out = SavedSet(tabs: ordered.map(\.tab), groups: orderedGroups, activeIndex: 0)
    out.activeIndex = selected ?? max(0, min(set.activeIndex, out.tabs.count - 1))
    return Applied(
      set: out, sources: ordered.map(\.source), baseline: clean, accepted: deferred, closed: closed,
      navigated: navigated, changed: true)
  }

  /// The tab set a Space record shows: live tabs in position order, its
  /// groups, and the saved selection (or the first tab).
  static func project(_ raw: JSONValue?) -> SavedSet {
    guard let clean = Model.sanitizeBlob(raw) else { return SavedSet() }
    let ids = Model.orderOf(clean["tabs"] ?? .object([]))
    let tabs: [SavedTab] = ids.compactMap { id in
      guard let record = clean["tabs"]?[id], let url = record["nav"]?["v"]?["url"]?.string else { return nil }
      return SavedTab(
        url: url, title: record["nav"]?["v"]?["title"]?.string ?? "", pinned: record["pinned"]?["v"]?.bool ?? false,
        groupId: Model.effectiveGroup(clean, record), tabId: id)
    }
    let groups: [TabGroup] = Model.orderOf(clean["groups"] ?? .object([])).compactMap { id in
      guard let record = clean["groups"]?[id] else { return nil }
      return TabGroup(
        id: id, name: record["name"]?["v"]?.string ?? "", color: record["color"]?["v"]?.string,
        collapsed: record["collapsed"]?["v"]?.bool ?? false)
    }
    let active = Model.activeTabId(clean).flatMap { id in tabs.firstIndex { $0.tabId == id } } ?? 0
    return SavedSet(tabs: tabs, groups: groups, activeIndex: active)
  }
}
