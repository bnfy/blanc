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
    let valid = Array(
      tabs.compactMap { tab(.object([("url", .string($0.url)), ("title", .string($0.title))])) }
        .prefix(500))
    var next: JSONValue = .object([
      ("name", .string("iPhone")), ("platform", .string("ios")),
      ("updatedAt", .number(Double(now))), ("tabs", .array(valid)), ("groups", .array([])),
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
    return next
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
