import Foundation

/// A Recently closed row from another device (or this one), as the palette shows it.
nonisolated struct ClosedRow: Identifiable, Equatable, Sendable {
  let id: String
  let url: String
  let title: String
  let closedAt: Int64
  let spaceId: String?
  let fromId: String?
  let fromName: String?
}

/// M16 §7 Recently closed, a port of desktop's `src/main/synced-closed-model.js`:
/// one writer per device, with Send to device's entry merge convention. A row
/// holds no page state. Entries and items stay `JSONValue`, as in `SyncSends`.
nonisolated enum SyncedClosed {
  static let dayMs: Double = 86_400_000
  static let maxItems = 25
  static let itemTTL: Double = 86_400_000
  static let entryTTL: Double = 2_592_000_000
  static let heartbeatMs: Double = 86_400_000
  static let budgetBytes = 65_536
  static let platforms: Set<String> = ["darwin", "win32", "linux", "ios"]

  static func validId(_ v: JSONValue?) -> String? {
    guard let units = v?.utf16Units, !units.isEmpty, units.count <= 64 else { return nil }
    return v?.string
  }
  /// JavaScript's own-property order: array-index keys ascending, then insertion order.
  static func jsOrder(_ pairs: [(String, JSONValue)]) -> [(String, JSONValue)] {
    func index(_ s: String) -> UInt32? {
      guard let n = UInt32(s), n < UInt32.max, String(n) == s else { return nil }
      return n
    }
    let indexed = pairs.filter { index($0.0) != nil }.sorted { index($0.0)! < index($1.0)! }
    return indexed + pairs.filter { index($0.0) == nil }
  }

  static func sanitizeItem(_ raw: JSONValue?, now: Double) -> JSONValue? {
    guard let raw, raw["private"] != .bool(true), let id = raw["id"], validId(id) != nil,
      let url = raw["url"]?.utf16Units, url.count <= 2048,
      let closedAt = raw["closedAt"]?.number, closedAt.isFinite, closedAt > 0,
      now - closedAt < itemTTL, SyncSends.httpURL(raw["url"]) != nil
    else { return nil }
    let spaceId = raw["spaceId"]
    return .object([
      ("id", id), ("url", raw["url"]!),
      ("title", raw["title"]?.utf16Units.map { .stringFromUTF16(Array($0.prefix(200))) } ?? .string("")),
      ("closedAt", .number(closedAt)),
      ("spaceId", SharedSpacesModel.isId(spaceId) ? spaceId! : .null),
    ])
  }
  private static func newestFirst(_ a: JSONValue, _ b: JSONValue) -> Bool? {
    let at = a["closedAt"]?.number ?? 0
    let bt = b["closedAt"]?.number ?? 0
    if at != bt { return at > bt }
    let ai = a["id"]?.utf16Units ?? []
    let bi = b["id"]?.utf16Units ?? []
    if ai != bi { return ai.lexicographicallyPrecedes(bi) }
    return nil
  }
  /// JavaScript's stable sort by `newestFirst`.
  private static func stableSorted(_ rows: [JSONValue]) -> [JSONValue] {
    rows.enumerated().sorted { l, r in newestFirst(l.element, r.element) ?? (l.offset < r.offset) }
      .map(\.element)
  }
  static func normalizeItems(_ items: JSONValue?, now: Double) -> [JSONValue] {
    var seen = Set<[UInt16]>()
    let clean = stableSorted((items?.array ?? []).compactMap { sanitizeItem($0, now: now) })
    return Array(clean.filter { seen.insert($0["id"]?.utf16Units ?? []).inserted }.prefix(maxItems))
  }
  static func sanitizeEntry(_ raw: JSONValue?, now: Double) -> JSONValue? {
    guard let raw, let at = raw["updatedAt"]?.number, at.isFinite, at > 0 else { return nil }
    if raw["retracted"]?.isTruthy == true {
      return .object([("retracted", .bool(true)), ("updatedAt", .number(at))])
    }
    let platform = raw["platform"]?.string ?? ""
    let name = raw["name"]?.utf16Units ?? []
    return .object([
      ("name", name.isEmpty ? .string("unknown device") : .stringFromUTF16(Array(name.prefix(80)))),
      ("platform", .string(platforms.contains(platform) && raw["platform"]?.string != nil ? platform : "")),
      ("updatedAt", .number(at)), ("items", .array(normalizeItems(raw["items"], now: now))),
    ])
  }
  /// This device's entry: the clock moves when forced, when the name or
  /// platform changed, or once the daily heartbeat is due.
  static func ownEntry(previous: JSONValue?, name: String, platform: String, now: Double,
    force: Bool = false) -> (entry: JSONValue, changed: Bool)
  {
    let clean = sanitizeEntry(previous, now: now)
    let prev = clean?["retracted"]?.isTruthy == true ? nil : clean
    let shown = Array(name.utf16.prefix(80))
    var entry: JSONValue = .object([
      ("name", shown.isEmpty ? .string("unknown device") : .stringFromUTF16(shown)),
      ("platform", .string(platforms.contains(platform) ? platform : "")),
      ("updatedAt", .number(now)), ("items", prev?["items"] ?? .array([])),
    ])
    if let prev, !force, prev["name"]?.canonical() == entry["name"]?.canonical(),
      prev["platform"]?.canonical() == entry["platform"]?.canonical(),
      let at = prev["updatedAt"]?.number, now - at < heartbeatMs
    {
      entry["updatedAt"] = .number(at)
    }
    return (entry, entry.canonical() != (previous ?? .null).canonical())
  }
  /// Desktop's `addOwnItem`: a valid item goes first in a forced own entry;
  /// nil when the item is refused (the entry stays as it was).
  static func addItem(to previous: JSONValue?, item raw: JSONValue, name: String, platform: String,
    now: Double) -> JSONValue?
  {
    guard let item = sanitizeItem(raw, now: now) else { return nil }
    var entry = ownEntry(previous: previous, name: name, platform: platform, now: now, force: true).entry
    entry["items"] = .array(normalizeItems(.array([item] + (entry["items"]?.array ?? [])), now: now))
    return entry
  }
  /// Tab sync's last-writer-wins rule per device (`winner` in tabsync-model.js).
  static func winner(_ local: JSONValue, _ remote: JSONValue, isOwn: Bool) -> JSONValue {
    let lt = local["updatedAt"]?.number ?? 0
    let rt = remote["updatedAt"]?.number ?? 0
    if lt != rt { return rt > lt ? remote : local }
    if isOwn { return local }
    let lr = local["retracted"]?.isTruthy ?? false
    let rr = remote["retracted"]?.isTruthy ?? false
    if lr != rr { return rr ? remote : local }
    return utf16Less(remote.canonical(), local.canonical()) ? remote : local
  }
  static func mergeDevices(local: JSONValue?, remote: JSONValue?, ownId: String, now: Double) -> JSONValue {
    var out: JSONValue = .object([])
    for source in [local, remote] {
      for (id, raw) in jsOrder(source?.pairs ?? []) {
        guard let entry = sanitizeEntry(raw, now: now) else { continue }
        out[id] = out[id].map { winner($0, entry, isOwn: id == ownId) } ?? entry
      }
    }
    return .object(
      out.pairs.filter { id, e in id == ownId || now - (e["updatedAt"]?.number ?? 0) < entryTTL })
  }
  /// Under budget by dropping the stalest other devices first, then this
  /// device's oldest rows; a URL is never truncated into another page.
  static func applyBudget(_ devices: JSONValue, ownId: String, maxBytes: Int = budgetBytes) -> JSONValue {
    var out = devices
    func over() -> Bool { out.canonical().utf8.count > maxBytes }
    let others = devices.pairs.filter { $0.0 != ownId }.sorted { a, b in
      let at = a.1["updatedAt"]?.number ?? 0
      let bt = b.1["updatedAt"]?.number ?? 0
      return at != bt ? at < bt : utf16Less(a.0, b.0)
    }
    for (id, _) in others {
      if !over() { break }
      out[id] = nil
    }
    while over(), var own = out[ownId], var items = own["items"]?.array, !items.isEmpty {
      items.removeLast()
      own["items"] = .array(items)
      out[ownId] = own
    }
    if over() { out[ownId] = nil }
    return out
  }
  /// Other devices' rows not dismissed here, newest first.
  static func inboxRows(_ devices: JSONValue, ownId: String, dismissed: JSONValue, now: Double)
    -> [JSONValue]
  {
    var rows: [JSONValue] = []
    for (fromId, raw) in jsOrder(devices.pairs) where fromId != ownId {
      guard let entry = sanitizeEntry(raw, now: now), entry["retracted"]?.isTruthy != true else {
        continue
      }
      for item in entry["items"]?.array ?? [] {
        guard let id = item["id"]?.string, dismissed[id] == nil else { continue }
        var row = item
        row["fromId"] = .string(fromId)
        row["fromName"] = entry["name"]
        rows.append(row)
      }
    }
    return stableSorted(rows)
  }
  static func inbox(_ devices: JSONValue, ownId: String, dismissed: JSONValue, now: Double) -> [ClosedRow] {
    inboxRows(devices, ownId: ownId, dismissed: dismissed, now: now).compactMap(row)
  }
  static func row(_ v: JSONValue) -> ClosedRow? {
    guard let id = v["id"]?.string, let url = v["url"]?.string, let at = v["closedAt"]?.intValue else {
      return nil
    }
    return ClosedRow(
      id: id, url: url, title: v["title"]?.string ?? "", closedAt: at, spaceId: v["spaceId"]?.string,
      fromId: v["fromId"]?.string, fromName: v["fromName"]?.string)
  }
  static func pruneDismissed(_ dismissed: JSONValue, now: Double) -> JSONValue {
    .object(
      jsOrder(dismissed.pairs).filter { id, at in
        guard validId(.string(id)) != nil, let t = at.number, t.isFinite else { return false }
        return now - t < 2 * dayMs
      })
  }
}
