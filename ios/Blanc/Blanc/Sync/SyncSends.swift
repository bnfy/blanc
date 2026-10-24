import Foundation

/// A page another device sent to this one (M7b), as the palette and the
/// start page show it.
nonisolated struct InboxItem: Equatable, Sendable, Identifiable {
  let id: String
  let url: String
  let title: String
  let sentAt: Int64
  let fromId: String
  let fromName: String
}

/// Another device of this sync account a page can be sent to.
nonisolated struct SendTarget: Equatable, Sendable, Identifiable {
  let id: String
  let name: String
  let platform: String
  let updatedAt: Int64
}

/// Send to device rules, a port of desktop's `src/main/sends-model.js`
/// (docs/superpowers/specs/2026-10-24-ios-m7b-send-to-device-design.md §3),
/// checked against vectors generated from it. Entries and items stay
/// `JSONValue`, as in `TabSnapshots`, so unknown shapes compare the same way.
nonisolated enum SyncSends {
  static let dayMs: Double = 86_400_000
  static let maxItems = 20
  static let itemTtlMs = 7 * dayMs
  static let entryTtlMs = 30 * dayMs
  static let heartbeatMs = dayMs
  static let dismissTtlMs = 8 * dayMs
  static let budgetBytes = 64 * 1024
  static let platforms: Set<String> = ["darwin", "win32", "linux", "ios"]

  static func isId(_ v: JSONValue?) -> String? {
    guard let s = v?.string, !s.isEmpty, s.utf16.count <= 64 else { return nil }
    return s
  }
  private static func truncate(_ v: JSONValue?, _ n: Int) -> [UInt16] {
    Array((v?.utf16Units ?? []).prefix(n))
  }
  /// An http(s) address within the length limit, as desktop's `new URL()`
  /// check accepts it.
  static func httpURL(_ v: JSONValue?) -> String? {
    guard let s = v?.string, s.utf16.count <= 2048 else { return nil }
    let lower = s.lowercased()
    guard lower.hasPrefix("http://") || lower.hasPrefix("https://"),
      let url = URL(string: s), let host = url.host, !host.isEmpty
    else { return nil }
    return s
  }

  static func item(_ raw: JSONValue, now: Double) -> JSONValue? {
    guard let id = isId(raw["id"]), let to = isId(raw["to"]), let url = httpURL(raw["url"]),
      let sentAt = raw["sentAt"]?.number, sentAt.isFinite, sentAt > 0,
      now - sentAt < itemTtlMs
    else { return nil }
    return .object([
      ("id", .string(id)), ("to", .string(to)), ("url", .string(url)),
      ("title", raw["title"]?.utf16Units == nil ? .string("") : .stringFromUTF16(truncate(raw["title"], 200))),
      ("sentAt", .number(sentAt)),
    ])
  }

  private static func newestFirst(_ a: JSONValue, _ b: JSONValue) -> Bool {
    let at = a["sentAt"]?.number ?? 0
    let bt = b["sentAt"]?.number ?? 0
    if at != bt { return at > bt }
    return utf16Less(a["id"]?.string ?? "", b["id"]?.string ?? "")
  }

  static func items(_ raw: JSONValue?, now: Double) -> [JSONValue] {
    var seen = Set<String>()
    let sorted = (raw?.array ?? []).compactMap { item($0, now: now) }
      .enumerated().sorted { l, r in
        newestFirst(l.element, r.element)
          || (!newestFirst(r.element, l.element) && l.offset < r.offset)
      }.map(\.element)
    return Array(
      sorted.filter { seen.insert($0["id"]?.string ?? "").inserted }.prefix(maxItems))
  }

  static func entry(_ raw: JSONValue, now: Double) -> JSONValue? {
    guard let at = raw["updatedAt"]?.number, at.isFinite, at > 0 else { return nil }
    if raw["retracted"]?.isTruthy == true { return retraction(now: at) }
    let name = raw["name"]?.string ?? ""
    let platform = raw["platform"]?.string ?? ""
    return .object([
      ("name", name.isEmpty ? .string("unknown device") : .stringFromUTF16(truncate(raw["name"], 80))),
      ("platform", .string(platforms.contains(platform) ? platform : "")),
      ("updatedAt", .number(at)),
      ("items", .array(items(raw["items"], now: now))),
    ])
  }

  static func retraction(now: Double) -> JSONValue {
    .object([("retracted", .bool(true)), ("updatedAt", .number(now))])
  }

  /// This device's entry: the clock moves when forced (a send), when the name
  /// or platform changed, or once the daily presence heartbeat is due.
  static func ownEntry(previous: JSONValue?, name: String, platform: String, now: Double,
    force: Bool = false) -> (entry: JSONValue, changed: Bool)
  {
    let sanitized = previous.flatMap { entry($0, now: now) }
    let prev = sanitized?["retracted"]?.isTruthy == true ? nil : sanitized
    let shownName = Array(name.utf16.prefix(80))
    var next: JSONValue = .object([
      ("name", shownName.isEmpty ? .string("unknown device") : .stringFromUTF16(shownName)),
      ("platform", .string(platforms.contains(platform) ? platform : "")),
      ("updatedAt", .number(now)),
      ("items", .array(prev?["items"]?.array ?? [])),
    ])
    let due =
      force || prev == nil || prev?["name"] != next["name"] || prev?["platform"] != next["platform"]
      || now - (prev?["updatedAt"]?.number ?? 0) >= heartbeatMs
    if !due, let at = prev?["updatedAt"] { next["updatedAt"] = at }
    return (next, next.canonical() != (previous ?? .null).canonical())
  }

  enum AddError: Error, Equatable { case invalid, selfTarget }

  static func addItem(to previous: JSONValue?, url: String, title: String, to target: String,
    ownId: String, now: Double, makeId: () -> String) -> Result<(entry: JSONValue, item: JSONValue), AddError>
  {
    if target == ownId { return .failure(.selfTarget) }
    guard
      let item = item(
        .object([
          ("id", .string(makeId())), ("to", .string(target)), ("url", .string(url)),
          ("title", .string(title)), ("sentAt", .number(now)),
        ]), now: now)
    else { return .failure(.invalid) }
    let sanitized = previous.flatMap { entry($0, now: now) }
    let base =
      sanitized?["retracted"]?.isTruthy == true
      ? nil : sanitized
    var next = base ?? .object([("name", .string("unknown device")), ("platform", .string(""))])
    next["updatedAt"] = .number(now)
    next["items"] = .array(items(.array([item] + (base?["items"]?.array ?? [])), now: now))
    return .success((next, item))
  }

  /// Last writer wins per device with tab sync's tie rule; other devices'
  /// entries 30 days old or more are pruned, never this device's own.
  static func merge(local: JSONValue, remote: JSONValue, ownId: String, now: Double) -> JSONValue {
    var out: JSONValue = .object(local.pairs.compactMap { k, v in entry(v, now: now).map { (k, $0) } })
    for (id, raw) in remote.pairs {
      guard let r = entry(raw, now: now) else { continue }
      guard let l = out[id] else {
        out[id] = r
        continue
      }
      let rt = r["updatedAt"]?.number ?? 0
      let lt = l["updatedAt"]?.number ?? 0
      let remoteWins: Bool
      if rt != lt {
        remoteWins = rt > lt
      } else if id == ownId {
        remoteWins = false
      } else if (r["retracted"]?.isTruthy ?? false) != (l["retracted"]?.isTruthy ?? false) {
        remoteWins = r["retracted"]?.isTruthy == true
      } else {
        remoteWins = utf16Less(r.canonical(), l.canonical())
      }
      if remoteWins { out[id] = r }
    }
    return .object(
      out.pairs.filter { id, e in id == ownId || now - (e["updatedAt"]?.number ?? 0) < entryTtlMs })
  }

  /// Under budget by dropping the stalest other entries first, never our own.
  static func applyBudget(_ devices: JSONValue, ownId: String, maxBytes: Int = budgetBytes)
    -> JSONValue
  {
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
    return out
  }

  static func inboxRows(_ devices: JSONValue, ownId: String, dismissed: [String: Double], now: Double)
    -> [JSONValue]
  {
    var rows: [JSONValue] = []
    for (fromId, raw) in devices.pairs where fromId != ownId {
      guard let e = entry(raw, now: now), e["retracted"]?.isTruthy != true else { continue }
      for item in e["items"]?.array ?? [] {
        guard let id = item["id"]?.string, item["to"]?.string == ownId, dismissed[id] == nil
        else { continue }
        rows.append(
          .object([
            ("id", .string(id)), ("url", item["url"] ?? .null), ("title", item["title"] ?? .string("")),
            ("sentAt", item["sentAt"] ?? .null), ("fromId", .string(fromId)),
            ("fromName", e["name"] ?? .string("")),
          ]))
      }
    }
    return Array(
      rows.enumerated().sorted { l, r in
        newestFirst(l.element, r.element)
          || (!newestFirst(r.element, l.element) && l.offset < r.offset)
      }.map(\.element).prefix(maxItems))
  }

  static func inbox(_ devices: JSONValue, ownId: String, dismissed: [String: Double], now: Double)
    -> [InboxItem]
  {
    inboxRows(devices, ownId: ownId, dismissed: dismissed, now: now).compactMap { row in
      guard let id = row["id"]?.string, let url = row["url"]?.string,
        let sentAt = row["sentAt"]?.intValue, let fromId = row["fromId"]?.string
      else { return nil }
      return InboxItem(
        id: id, url: url, title: row["title"]?.string ?? "", sentAt: sentAt, fromId: fromId,
        fromName: row["fromName"]?.string ?? "")
    }
  }

  /// Other devices in the sends store (presence) or tab sync, newest first,
  /// named by the account's synced device names (`names[id]`).
  static func targetRows(sends: JSONValue, session: JSONValue, ownId: String,
    names: [String: String]) -> [JSONValue]
  {
    var order: [String] = []
    var found: [String: JSONValue] = [:]
    func consider(_ id: String, _ e: JSONValue) {
      guard id != ownId, e["retracted"]?.isTruthy != true, let at = e["updatedAt"]?.number,
        at.isFinite
      else { return }
      if let prev = found[id], (prev["updatedAt"]?.number ?? 0) >= at { return }
      if found[id] == nil { order.append(id) }
      let name = e["name"]?.string ?? ""
      found[id] = .object([
        ("id", .string(id)),
        ("name", name.isEmpty ? .string("unknown device") : .stringFromUTF16(truncate(e["name"], 80))),
        ("platform", .string(e["platform"]?.string ?? "")), ("updatedAt", .number(at)),
      ])
    }
    for (id, e) in session.pairs { consider(id, e) }
    for (id, e) in sends.pairs { consider(id, e) }
    let rows = order.compactMap { id -> JSONValue? in
      guard var row = found[id] else { return nil }
      if let chosen = names[id], !chosen.isEmpty {
        row["name"] = .stringFromUTF16(Array(chosen.utf16.prefix(80)))
      }
      return row
    }
    return rows.enumerated().sorted { l, r in
      let at = l.element["updatedAt"]?.number ?? 0
      let bt = r.element["updatedAt"]?.number ?? 0
      if at != bt { return at > bt }
      let la = l.element["id"]?.string ?? ""
      let ra = r.element["id"]?.string ?? ""
      if la != ra { return utf16Less(la, ra) }
      return l.offset < r.offset
    }.map(\.element)
  }

  static func targets(sends: JSONValue, session: JSONValue, ownId: String, names: [String: String])
    -> [SendTarget]
  {
    targetRows(sends: sends, session: session, ownId: ownId, names: names).compactMap { row in
      guard let id = row["id"]?.string, let at = row["updatedAt"]?.intValue else { return nil }
      return SendTarget(
        id: id, name: row["name"]?.string ?? "", platform: row["platform"]?.string ?? "",
        updatedAt: at)
    }
  }

  static func pruneDismissed(_ dismissed: [String: Double], now: Double) -> [String: Double] {
    dismissed.filter { id, at in
      !id.isEmpty && id.utf16.count <= 64 && at.isFinite && now - at < dismissTtlMs
    }
  }
}
