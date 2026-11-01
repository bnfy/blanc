import Foundation

/// The `shared` store (M16 §8, desktop's sidecar in `src/main/shared-spaces.js`):
/// each device says which of its F27 snapshot's tabs sit in which shared Space,
/// bound to that snapshot's `updatedAt`, so a receiver showing the Space can
/// hide those tabs from Other devices and list each page once.
nonisolated enum SharedSidecar {
  static let maxBytes = 65_536

  private static func bytes(_ v: JSONValue) -> Int { v.canonical().utf8.count }

  /// One device's binding as desktop keeps it, or nil when it can't be trusted.
  static func entry(_ raw: JSONValue?, now: Int64) -> JSONValue? {
    guard let raw, let at = SharedSpacesModel.safeInteger(raw["forUpdatedAt"]), at > 0,
      Double(now) - at < Double(SharedSpacesModel.limits.tombstoneMs), case .array(let rows)? = raw["tabs"]
    else { return nil }
    let tabs: [JSONValue] = rows.compactMap { (t: JSONValue) -> JSONValue? in
      guard let i = t["i"]?.number, i.isFinite, i.rounded(.towardZero) == i, i >= 0,
        SharedSpacesModel.isId(t["spaceId"])
      else { return nil }
      return .object([("i", .number(i)), ("spaceId", t["spaceId"]!)])
    }
    let out: JSONValue = .object([("forUpdatedAt", raw["forUpdatedAt"]!), ("tabs", .array(tabs))])
    return bytes(out) <= maxBytes ? out : nil
  }
  static func sanitize(_ payload: JSONValue?, now: Int64) -> JSONValue {
    .object([
      (
        "devices",
        .object(
          SyncedClosed.jsOrder(payload?["devices"]?.pairs ?? []).compactMap { id, raw in
            entry(raw, now: now).map { (id, $0) }
          })
      )
    ])
  }
  /// This device's entry for the snapshot it publishes in the same pass.
  static func ownEntry(forUpdatedAt: Int64, bindings: [(i: Int, spaceId: String)], now: Int64) -> JSONValue? {
    entry(
      .object([
        ("forUpdatedAt", .number(Double(forUpdatedAt))),
        (
          "tabs",
          .array(bindings.map { .object([("i", .number(Double($0.i))), ("spaceId", .string($0.spaceId))]) })
        ),
      ]), now: now)
  }
  /// The newer binding per device (`forUpdatedAt`, then the smaller canonical
  /// form); nil when `remote` is oversized and can't be trusted at all.
  static func merge(local: JSONValue?, remote: JSONValue, now: Int64) -> JSONValue? {
    if bytes(remote) > maxBytes { return nil }
    var devices = sanitize(local, now: now)["devices"] ?? .object([])
    for (id, entry) in sanitize(remote, now: now)["devices"]?.pairs ?? [] {
      let at = entry["forUpdatedAt"]?.number ?? 0
      if let prev = devices[id] {
        let pt = prev["forUpdatedAt"]?.number ?? 0
        guard at > pt || (at == pt && utf16Less(entry.canonical(), prev.canonical())) else { continue }
      }
      devices[id] = entry
    }
    return .object([("devices", devices)])
  }
  /// What to PUT: every peer's binding is mandatory; ours goes first if the
  /// store would overflow, and nil holds publication rather than trim a peer.
  static func export(_ state: JSONValue?, ownId: String, now: Int64) -> JSONValue? {
    var payload = sanitize(state, now: now)
    if bytes(payload) > maxBytes { payload["devices"]?[ownId] = nil }
    return bytes(payload) <= maxBytes ? payload : nil
  }
  /// The receiver's rule (`hideOccurrences`): a device's tabs bound to a
  /// shared Space this phone shows, when the binding is for exactly the
  /// snapshot held (`forUpdatedAt == updatedAt`). `devices` is the merged sidecar.
  static func hiddenIndices(devices: JSONValue, sessionEntries: JSONValue, visibleSpaceIds: Set<String>)
    -> [String: Set<Int>]
  {
    var out: [String: Set<Int>] = [:]
    for (id, session) in sessionEntries.pairs {
      guard let binding = devices[id], let at = binding["forUpdatedAt"]?.number,
        at == session["updatedAt"]?.number
      else { continue }
      let count = session["tabs"]?.array.count ?? 0
      let hidden = Set(
        (binding["tabs"]?.array ?? []).compactMap { (row: JSONValue) -> Int? in
          guard let space = row["spaceId"]?.string, visibleSpaceIds.contains(space),
            let i = row["i"]?.number, i >= 0, i < Double(count)
          else { return nil }
          return Int(i)
        })
      if !hidden.isEmpty { out[id] = hidden }
    }
    return out
  }
}
