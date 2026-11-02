import Foundation

nonisolated struct RemoteTab: Equatable, Sendable {
  let url: String
  let title: String
  let groupId: String?
  let pinned: Bool
}
nonisolated struct RemoteDevice: Equatable, Sendable, Identifiable {
  let id: String
  let name: String
  let platform: String
  let updatedAt: Int64
  let tabs: [RemoteTab]
}
/// One open tab as F27 publishes it: `title` is what the tab is labelled with
/// here; `sharedSpaceId` is the shared Space it sits in, if any (never published
/// in the snapshot itself, only in the `shared` sidecar). Private tabs are left
/// out by the caller.
nonisolated struct SnapshotTab: Equatable, Sendable {
  var url: String
  var title: String
  var groupId: String? = nil
  var pinned = false
  var sharedSpaceId: String? = nil
}
nonisolated enum TabSnapshots {
  static let pruneMs: Int64 = 2_592_000_000, heartbeatMs: Int64 = 86_400_000
  static let budgetBytes = 327_680
  static func truncate(_ s: String, _ n: Int) -> String {
    String(decoding: Array(s.utf16.prefix(n)), as: UTF16.self)
  }
  static func tab(_ raw: JSONValue) -> JSONValue? {
    guard let url = raw["url"]?.string, url.hasPrefix("https://") || url.hasPrefix("http://"),
      url.utf16.count <= 2048
    else { return nil }
    return .object([
      ("url", .string(url)),
      ("title", .stringFromUTF16(Array((raw["title"]?.utf16Units ?? []).prefix(200)))),
      ("groupId", raw["groupId"]?.string.map(JSONValue.string) ?? .null),
      ("pinned", .bool(raw["pinned"]?.isTruthy ?? false)),
    ])
  }
  static func entry(_ raw: JSONValue) -> JSONValue? {
    guard let at = raw["updatedAt"]?.number, at.isFinite else { return nil }
    if raw["retracted"]?.isTruthy == true {
      return .object([("retracted", .bool(true)), ("updatedAt", .number(at))])
    }
    let name = raw["name"]?.string ?? ""
    return .object([
      ("name", .stringFromUTF16(Array((name.isEmpty ? "unknown device" : name).utf16.prefix(80)))),
      ("platform", .string(raw["platform"]?.string ?? "")), ("updatedAt", .number(at)),
      ("tabs", .array(Array((raw["tabs"]?.array ?? []).compactMap(tab).prefix(500)))),
      (
        "groups",
        .array(
          (raw["groups"]?.array ?? []).compactMap { g in
            guard let id = g["id"]?.string, let name = g["name"]?.string else { return nil }
            return .object([
              ("id", .string(id)), ("name", .stringFromUTF16(Array(name.utf16.prefix(80)))),
            ])
          })
      ),
    ])
  }
  static func merge(local: JSONValue, remote: JSONValue, ownId: String, now: Int64) -> JSONValue {
    var result: JSONValue = .object(local.pairs.compactMap { k, v in entry(v).map { (k, $0) } })
    for (id, raw) in remote.pairs {
      guard let r = entry(raw) else { continue }
      if let l = result[id] {
        let rt = r["updatedAt"]?.number ?? 0
        let lt = l["updatedAt"]?.number ?? 0
        if rt > lt
          || (rt == lt && id != ownId
            && (r["retracted"]?.isTruthy != l["retracted"]?.isTruthy
              ? r["retracted"]?.isTruthy == true : utf16Less(r.canonical(), l.canonical())))
        {
          result[id] = r
        }
      } else {
        result[id] = r
      }
    }
    return .object(
      result.pairs.filter { Double(now) - ($0.1["updatedAt"]?.number ?? 0) <= Double(pruneMs) })
  }
  static func ownEntry(tabs: [(url: String, title: String)], previous: JSONValue?, now: Int64)
    -> JSONValue
  {
    ownEntry(
      tabs: tabs.map { SnapshotTab(url: $0.url, title: $0.title) }, groups: [], previous: previous,
      now: now)
  }
  private static func snapshotTab(_ t: SnapshotTab) -> JSONValue? {
    tab(
      .object([
        ("url", .string(t.url)), ("title", .string(t.title)),
        ("groupId", t.groupId.map(JSONValue.string) ?? .null), ("pinned", .bool(t.pinned)),
      ]))
  }
  /// The tabs F27 can publish, in order (http(s), at most 500).
  static func publishable(_ tabs: [SnapshotTab]) -> [SnapshotTab] {
    Array(tabs.filter { snapshotTab($0) != nil }.prefix(500))
  }
  /// Desktop's membership fingerprint (`src/main/tabsync.js`): which shared
  /// Space each publishable tab sits in.
  static func membership(_ tabs: [SnapshotTab]) -> String {
    JSONValue.array(publishable(tabs).map { $0.sharedSpaceId.map(JSONValue.string) ?? .null }).canonical()
  }
  /// This phone's F27 entry. The clock holds while the content is unchanged
  /// and the heartbeat isn't due; when `membership` differs from
  /// `previousMembership` it moves past the previous entry's, so an older
  /// sidecar binding can't tie and win.
  static func ownEntry(tabs: [SnapshotTab], groups: [(id: String, name: String)], previous: JSONValue?,
    now: Int64, membership: String? = nil, previousMembership: String? = nil) -> JSONValue
  {
    let valid = Array(tabs.compactMap(snapshotTab).prefix(500))
    let referenced = Set(valid.compactMap { $0["groupId"]?.string })
    let shown = groups.filter { referenced.contains($0.id) }
    func groupList(_ limit: Int) -> JSONValue {
      .array(
        shown.map { (g: (id: String, name: String)) -> JSONValue in
          .object([("id", .string(g.id)), ("name", .stringFromUTF16(Array(g.name.utf16.prefix(limit))))])
        })
    }
    // Desktop compares the stored (sanitized) entry with the fresh snapshot,
    // whose group names are not yet cut to 80; the published entry is sanitized.
    var next: JSONValue = .object([
      ("name", .string("iPhone")), ("platform", .string("ios")),
      ("updatedAt", .number(Double(now))), ("tabs", .array(valid)), ("groups", groupList(.max)),
    ])
    if let previous, previous["retracted"]?.isTruthy != true,
      let at = previous["updatedAt"]?.number,
      Double(now) - at < Double(heartbeatMs)
    {
      var a = previous
      var b = next
      a["updatedAt"] = nil
      b["updatedAt"] = nil
      if a.canonical() == b.canonical() { next["updatedAt"] = .number(at) }
    }
    next["groups"] = groupList(80)
    if let membership, let previousMembership, membership != previousMembership {
      next["updatedAt"] = .number(max(Double(now), (previous?["updatedAt"]?.number ?? 0) + 1))
    }
    return next
  }
  /// The sidecar rows for `entry`: `i` indexes the same filtered list the
  /// entry was built from, bound only where the entry's tab is canonically
  /// the tab it describes.
  static func bindings(tabs: [SnapshotTab], entry: JSONValue) -> [(i: Int, spaceId: String)] {
    let candidates = publishable(tabs)
    let published = entry["tabs"]?.array ?? []
    return published.indices.compactMap { i in
      guard i < candidates.count, let space = candidates[i].sharedSpaceId,
        snapshotTab(candidates[i])?.canonical() == published[i].canonical()
      else { return nil }
      return (i, space)
    }
  }
  static func retraction(now: Int64) -> JSONValue {
    .object([("retracted", .bool(true)), ("updatedAt", .number(Double(now)))])
  }
  static func trimmedForUpload(_ devices: JSONValue, ownId: String) -> JSONValue {
    var out = devices
    func over(_ v: JSONValue) -> Bool { v.canonical().utf8.count > budgetBytes }
    if var own = out[ownId], own["retracted"]?.isTruthy != true {
      var tabs = own["tabs"]?.array ?? []
      while !tabs.isEmpty && over(out) {
        tabs.removeLast(max(1, Int(ceil(Double(tabs.count) / 4))))
        own["tabs"] = .array(tabs)
        own["groups"] = .array(
          (own["groups"]?.array ?? []).filter { group in
            tabs.contains { $0["groupId"]?.string == group["id"]?.string }
          })
        out[ownId] = own
      }
    }
    for (id, _) in out.pairs.filter({ $0.0 != ownId }).sorted(by: {
      ($0.1["updatedAt"]?.number ?? 0) < ($1.1["updatedAt"]?.number ?? 0)
    }) {
      if !over(out) { break }
      out[id] = nil
    }
    return out
  }
  static func devices(_ devices: JSONValue, excluding ownId: String, names: [String: String])
    -> [RemoteDevice]
  {
    devices.pairs.compactMap { id, raw in
      guard id != ownId, let e = entry(raw), e["retracted"]?.isTruthy != true,
        let at = e["updatedAt"]?.intValue
      else { return nil }
      let tabs = (e["tabs"]?.array ?? []).map {
        RemoteTab(
          url: $0["url"]?.string ?? "", title: $0["title"]?.string ?? "",
          groupId: $0["groupId"]?.string,
          pinned: $0["pinned"]?.bool ?? false)
      }
      guard !tabs.isEmpty else { return nil }
      return RemoteDevice(
        id: id,
        name: (names[id]?.isEmpty == false
          ? (names[id] ?? "") : (e["name"]?.string ?? "unknown device")),
        platform: e["platform"]?.string ?? "", updatedAt: at, tabs: tabs)
    }.sorted { $0.updatedAt > $1.updatedAt }
  }
}

nonisolated enum SyncedIcons {
  static func valid(_ s: String?) -> String? {
    guard let s, s.utf16.count <= 8192, s.lowercased().hasPrefix("data:image/png;base64,") else {
      return nil
    }
    let b64 = String(s.dropFirst(22))
    guard let data = Data(base64Encoded: b64), data.base64EncodedString() == b64 else { return nil }
    let b = Array(data)
    guard b.count >= 24, Array(b[0..<8]) == [137, 80, 78, 71, 13, 10, 26, 10],
      String(bytes: b[12..<16], encoding: .ascii) == "IHDR"
    else { return nil }
    func uint(_ at: Int) -> UInt32 { b[at..<at + 4].reduce(0) { ($0 << 8) | UInt32($1) } }
    guard uint(16) == uint(20), [16, 32].contains(uint(16)) else { return nil }
    return s
  }
  static func merge(local: JSONValue, remote: JSONValue, now: Int64) -> JSONValue {
    func sanitize(_ raw: JSONValue) -> JSONValue? {
      guard let at = raw["updatedAt"]?.number, at.isFinite else { return nil }
      if raw["retracted"]?.isTruthy == true {
        return .object([("retracted", .bool(true)), ("updatedAt", .number(at))])
      }
      var seen = Set<String>()
      let icons = Array(
        (raw["icons"]?.array ?? []).compactMap { i -> JSONValue? in
          guard let url = i["url"]?.string, url.hasPrefix("https://") || url.hasPrefix("http://"),
            url.utf16.count <= 2048, !seen.contains(url), let data = valid(i["data"]?.string)
          else { return nil }
          seen.insert(url)
          return .object([("url", .string(url)), ("data", .string(data))])
        }.prefix(500))
      return .object([("updatedAt", .number(at)), ("icons", .array(icons))])
    }
    var out: JSONValue = .object([])
    for (id, raw) in local.pairs + remote.pairs {
      guard let r = sanitize(raw),
        Double(now) - (r["updatedAt"]?.number ?? 0) <= Double(TabSnapshots.pruneMs)
      else { continue }
      if let l = out[id] {
        let rt = r["updatedAt"]?.number ?? 0
        let lt = l["updatedAt"]?.number ?? 0
        if rt > lt
          || (rt == lt
            && (r["retracted"]?.isTruthy != l["retracted"]?.isTruthy
              ? r["retracted"]?.isTruthy == true : utf16Less(r.canonical(), l.canonical())))
        {
          out[id] = r
        }
      } else {
        out[id] = r
      }
    }
    return out
  }
  static func icon(for url: String, in icons: JSONValue) -> String? {
    for (_, e) in icons.pairs.sorted(by: {
      ($0.1["updatedAt"]?.number ?? 0) > ($1.1["updatedAt"]?.number ?? 0)
    }) {
      for icon in e["icons"]?.array ?? [] where icon["url"]?.string == url {
        if let v = valid(icon["data"]?.string) { return v }
      }
    }
    return nil
  }
}
