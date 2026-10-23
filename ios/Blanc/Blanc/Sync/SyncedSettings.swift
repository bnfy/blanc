import Foundation

nonisolated struct SyncedSettings: Equatable, Sendable {
  static let maxClock: Int64 = 32_503_680_000_000
  var values: JSONValue
  var meta: [String: Int64]
  var tieBreakers: [String: String]
  private var metaOrder: [String]
  private var tieOrder: [String]
  init(payload: JSONValue) {
    values = payload["values"] ?? .object([])
    meta = [:]
    tieBreakers = [:]
    metaOrder = []
    tieOrder = []
    for (k, v) in payload["meta"]?.pairs ?? [] {
      if let n = v.number, n.rounded() == n, n > 0, n < Double(Self.maxClock) {
        meta[k] = Int64(n)
        metaOrder.append(k)
      }
    }
    for (k, v) in payload["tieBreakers"]?.pairs ?? [] {
      if let s = v.string, !s.isEmpty, s.utf16.count <= 128 {
        tieBreakers[k] = s
        tieOrder.append(k)
      }
    }
  }
  func payload() -> JSONValue {
    .object([
      ("values", values),
      (
        "meta",
        .object(
          ordered(metaOrder, Array(meta.keys)).compactMap { k in
            meta[k].map { (k, .number(Double($0))) }
          })
      ),
      (
        "tieBreakers",
        .object(
          ordered(tieOrder, Array(tieBreakers.keys)).compactMap { k in
            tieBreakers[k].flatMap { $0.isEmpty ? nil : (k, .string($0)) }
          })
      ),
    ])
  }
  private func ordered(_ order: [String], _ keys: [String]) -> [String] {
    order + keys.filter { !order.contains($0) }.sorted(by: utf16Less)
  }
  mutating func merge(remote: Self) {
    for (key, value) in remote.values.pairs {
      if key == "deviceNames" {
        let names = Self.mergeNames(values[key] ?? .object([]), value)
        if !names.pairs.isEmpty { values[key] = names }
        if let clock = remote.meta[key], clock > (meta[key] ?? 0) { setMeta(key, clock) }
        continue
      }
      guard let rt = remote.meta[key] else {
        // Desktop exports untouched defaults without clocks. Carry them through
        // when no local value exists; they must not erase a clocked local edit.
        if values[key] == nil { values[key] = value }
        continue
      }
      let lt = meta[key] ?? 0
      let rTie = remote.tieBreakers[key] ?? ""
      let lTie = tieBreakers[key] ?? ""
      let wins =
        rt > lt
        || (rt == lt
          && (rTie != lTie
            ? utf16Less(rTie, lTie)
            : utf16Less(value.jsStringify(), (values[key] ?? .null).jsStringify())))
      if wins {
        values[key] = value
        setMeta(key, rt)
        setTie(key, rTie)
      }
    }
  }
  private mutating func setMeta(_ key: String, _ n: Int64) {
    if meta[key] == nil { metaOrder.append(key) }
    meta[key] = n
  }
  private mutating func setTie(_ key: String, _ s: String) {
    if tieBreakers[key] == nil && !s.isEmpty { tieOrder.append(key) }
    if s.isEmpty {
      tieBreakers.removeValue(forKey: key)
      tieOrder.removeAll { $0 == key }
    } else {
      tieBreakers[key] = s
    }
  }
  mutating func stampLocal(key: String, value: JSONValue, now: Int64, tie: String) {
    guard now > 0, now < Self.maxClock, (meta[key] ?? 0) < Self.maxClock - 1 else { return }
    values[key] = value
    setMeta(key, max(now, (meta[key] ?? 0) + 1))
    setTie(key, tie)
  }
  mutating func setDeviceName(id: String, name: String, now: Int64, tie: String) {
    guard Self.validID(id), now > 0, now < Self.maxClock else { return }
    var names = values["deviceNames"] ?? .object([])
    let at = max(now, (names[id]?["at"]?.intValue ?? 0) + 1)
    guard at < Self.maxClock else { return }
    names[id] = .object([
      (
        "name",
        .string(TabSnapshots.truncate(SyncCrypto.trim(name), 80))
      ), ("at", .number(Double(at))), ("tie", .string(tie)),
    ])
    names = Self.mergeNames(names, .object([]))
    stampLocal(key: "deviceNames", value: names, now: now, tie: tie)
  }
  func equalsForSync(_ other: Self) -> Bool { payload().canonical() == other.payload().canonical() }
  static func validID(_ id: String) -> Bool {
    id.range(of: "^[A-Za-z0-9-]{1,64}$", options: .regularExpression) != nil
  }
  static func mergeNames(_ local: JSONValue, _ remote: JSONValue) -> JSONValue {
    func clean(_ value: JSONValue) -> [(String, JSONValue)] {
      value.pairs.compactMap { k, v in
        guard validID(k), let name = v["name"]?.string, let at = v["at"]?.number,
          at.rounded() == at, at > 0, at < Double(maxClock)
        else { return nil }
        let tie = v["tie"]?.string ?? ""
        return (
          k,
          .object([
            (
              "name",
              .string(
                TabSnapshots.truncate(SyncCrypto.trim(name), 80))
            ), ("at", .number(at)), ("tie", .string(tie.utf16.count <= 128 ? tie : "")),
          ])
        )
      }
    }
    var map = Dictionary(clean(local), uniquingKeysWith: { _, b in b })
    for (k, v) in clean(remote) {
      if let old = map[k] {
        let at = (v["at"]?.number ?? 0)
        let oldAt = (old["at"]?.number ?? 0)
        let tie = (v["tie"]?.string ?? "")
        let oldTie = (old["tie"]?.string ?? "")
        if at > oldAt
          || (at == oldAt
            && (tie != oldTie
              ? utf16Less(tie, oldTie)
              : utf16Less((v["name"]?.string ?? ""), (old["name"]?.string ?? ""))))
        {
          map[k] = v
        }
      } else {
        map[k] = v
      }
    }
    let keep = map.sorted { a, b in
      (a.value["at"]?.number ?? 0) == (b.value["at"]?.number ?? 0)
        ? utf16Less(a.key, b.key) : (a.value["at"]?.number ?? 0) > (b.value["at"]?.number ?? 0)
    }.prefix(64)
    return .object(keep.sorted { utf16Less($0.key, $1.key) }.map { ($0.key, $0.value) })
  }
}
