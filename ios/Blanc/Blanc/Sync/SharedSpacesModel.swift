import CryptoKit
import Foundation

/// The M16 Shared Spaces wire protocol, a line-by-line port of desktop's
/// `src/main/shared-spaces-model.js` (docs/superpowers/specs/2026-10-25-shared-spaces-sync-design.md),
/// checked against vectors generated from it. Records stay `JSONValue` so a
/// field this version doesn't know relays untouched. Pure: no persistence,
/// networking or UI.
nonisolated enum SharedSpacesModel {
  struct Limits: Sendable {
    let spaces = 25
    let tabsPerSpace = 500
    let tombstoneMs: Int64 = 2_592_000_000
    let blobBytes = 520_192
  }
  static let limits = Limits()

  enum ModelError: Error, Equatable {
    case invalidPositionBounds, invalidRecordId, invalidBlob, invalidIndex, identityMismatch,
      invalidRemoteBlob, noValidSpace, invalidPublishedBlob, publishedIdentityMismatch
  }

  // MARK: - Primitives

  static let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz".utf8)
  private static let hexDigits = Array("0123456789abcdef".utf8)
  private static let nullableFields: Set<String> = ["name", "color", "groupId"]

  static func isId(_ value: String) -> Bool {
    let u = Array(value.utf8)
    return u.count == 32 && u.allSatisfy { hexDigits.contains($0) }
  }
  static func isId(_ value: JSONValue?) -> Bool {
    guard case .string(let s)? = value else { return false }
    return isId(s)
  }
  /// `/^[0-9a-z]*[1-9a-z]$/` over UTF-16 code units.
  static func isKey(_ units: some BidirectionalCollection<UInt16>) -> Bool {
    guard let last = units.last, last != 48 else { return false }
    return units.allSatisfy { (48...57).contains($0) || (97...122).contains($0) }
  }
  static func isKey(_ value: String) -> Bool { isKey(Array(value.utf16)) }

  static func isSafeInteger(_ n: Double) -> Bool {
    n.isFinite && n.rounded(.towardZero) == n && abs(n) <= 9_007_199_254_740_991
  }
  static func safeInteger(_ v: JSONValue?) -> Double? {
    guard let n = v?.number, isSafeInteger(n) else { return nil }
    return n
  }
  static func isMap(_ v: JSONValue?) -> Bool {
    if case .object? = v { return true }
    return false
  }
  static func isPresent(_ v: JSONValue?) -> Bool {
    guard let v else { return false }
    return v != .null
  }
  static func isTrue(_ v: JSONValue?) -> Bool { v == .bool(true) }
  static func deleted(_ record: JSONValue?) -> Bool { isTrue(record?["deleted"]?["v"]) }
  /// `canonical()` of a value that may be JavaScript's `undefined`.
  static func canon(_ v: JSONValue?) -> String { v?.canonical() ?? "null" }
  static func less(_ a: String, _ b: String) -> Bool { utf16Less(a, b) }
  /// JavaScript `===`: primitives by value, two objects never (separate references).
  static func strictEqual(_ a: JSONValue?, _ b: JSONValue?) -> Bool {
    switch (a, b) {
    case (nil, nil): return true
    case (.null?, .null?): return true
    case (.bool(let x)?, .bool(let y)?): return x == y
    case (.number(let x)?, .number(let y)?): return x == y
    default:
      if let x = a?.utf16Units, let y = b?.utf16Units { return x == y }
      return false
    }
  }
  static func keys(_ v: JSONValue?) -> [String] { (v?.pairs ?? []).map(\.0) }
  static func sortedObject(_ pairs: [(String, JSONValue)]) -> JSONValue {
    .object(pairs.sorted { less($0.0, $1.0) })
  }
  private static func sortedUnion(_ a: JSONValue?, _ b: JSONValue?) -> [String] {
    Array(Set(keys(a) + keys(b))).sorted(by: less)
  }

  // MARK: - Fields

  static func field(_ v: JSONValue, _ c: Int64, _ by: String) -> JSONValue {
    .object([("v", v), ("c", .number(Double(c))), ("by", .string(by))])
  }
  /// A fresh field holding `v` with `raw`'s clock and writer.
  static func field(_ v: JSONValue, from raw: JSONValue) -> JSONValue {
    .object([("v", v), ("c", raw["c"] ?? .null), ("by", raw["by"] ?? .null)])
  }
  static func isField(_ value: JSONValue?) -> Bool {
    guard let value, case .object(let p) = value, p.contains(where: { $0.0 == "v" }),
      let c = safeInteger(value["c"]), c >= 0,
      let by = value["by"]?.utf16Units, !by.isEmpty, by.count <= 128
    else { return false }
    return true
  }

  static func mergeField(_ a: JSONValue?, _ b: JSONValue?, name: String) -> JSONValue? {
    guard isField(a), let a else { return isField(b) ? b : nil }
    guard isField(b), let b else { return a }
    if name == "deleted", !strictEqual(a["v"], b["v"]) { return isTrue(a["v"]) ? a : b }
    let ac = a["c"]?.number ?? 0
    let bc = b["c"]?.number ?? 0
    if ac != bc { return ac > bc ? a : b }
    let aby = a["by"]?.utf16Units ?? []
    let bby = b["by"]?.utf16Units ?? []
    if aby != bby { return aby.lexicographicallyPrecedes(bby) ? a : b }
    // A cleared selection retains the rank of its original target. Only when
    // the entire write identity ties does the clear marker win over its live form.
    if name == "active", strictEqual(a["v"], b["v"]),
      isTrue(a["cleared"]) || isTrue(b["cleared"])
    {
      return isTrue(a["cleared"]) ? a : b
    }
    return !less(canon(b["v"]), canon(a["v"])) ? a : b
  }

  static func mergeRecord(_ a: JSONValue?, _ b: JSONValue?) -> JSONValue {
    .object(
      sortedUnion(a, b).compactMap { name in
        mergeField(a?[name], b?[name], name: name).map { (name, $0) }
      })
  }

  // MARK: - Positions

  /// A position key strictly between `a` and `b` ("" is open). Throws on keys
  /// that aren't positions or are out of order, as desktop does.
  static func mid(_ a: String, _ b: String) throws -> String {
    if (!a.isEmpty && !isKey(a)) || (!b.isEmpty && !isKey(b))
      || (!a.isEmpty && !b.isEmpty && !less(a, b))
    {
      throw ModelError.invalidPositionBounds
    }
    func digit(_ c: UInt8) -> Int { alphabet.firstIndex(of: c) ?? 0 }
    var ad = Array(a.utf8).map(digit)
    var bd = Array(b.utf8).map(digit)
    var out: [Int] = []
    var n = 0
    while true {
      let da = n < ad.count ? ad[n] : 0
      let db = bd.isEmpty || n >= bd.count ? 36 : bd[n]
      if da == db {
        out.append(da)
        n += 1
        continue
      }
      if db - da >= 2 {
        out.append((da + db) / 2)
        return String(decoding: out.map { alphabet[$0] }, as: UTF8.self)
      }
      out.append(da)
      ad = Array(ad.dropFirst(n + 1))
      bd = []
      n = 0
    }
  }
  static func tagOf(_ id: String) throws -> String {
    guard isId(id) else { throw ModelError.invalidRecordId }
    return String(
      decoding: id.utf8.map { h in alphabet[(hexDigits.firstIndex(of: h) ?? 0) + 1] },
      as: UTF8.self)
  }
  static func keyFor(_ a: String, _ b: String, _ id: String) throws -> String {
    try mid(a, b) + tagOf(id)
  }
  static func validKey(_ key: String, _ id: String) -> Bool {
    guard isId(id), let tag = try? tagOf(id) else { return false }
    let units = Array(key.utf16)
    return units.count > 32 && Array(units.suffix(32)) == Array(tag.utf16)
      && isKey(units.dropLast(32))
  }
  static func validKey(_ key: JSONValue?, _ id: String) -> Bool {
    guard case .string(let s)? = key else { return false }
    return validKey(s, id)
  }

  static func orderOf(_ records: JSONValue) -> [String] {
    keys(records).filter { isId($0) && !deleted(records[$0]) }.sorted { a, b in
      let ak = records[a]?["pos"]?["v"]
      let bk = records[b]?["pos"]?["v"]
      let av = validKey(ak, a)
      let bv = validKey(bk, b)
      if av != bv { return av }
      if av, let x = ak?.string, let y = bk?.string, x != y { return less(x, y) }
      return less(a, b)
    }
  }

  static func acknowledged(_ fetched: JSONValue?, _ pending: JSONValue?, name: String) -> Bool {
    isField(fetched) && canon(mergeField(fetched, pending, name: name)) == canon(fetched)
  }
  static func revisionOf(_ blob: JSONValue) -> String {
    let hex: String = SHA256.hash(data: Data(blob.canonical().utf8))
      .map { (byte: UInt8) -> String in String(format: "%02x", byte) }.joined()
    return String(hex.prefix(16))
  }
  /// Whether `JSON.stringify(encrypt(JSON.stringify(blob)))` is within the blob gate.
  static func blobFits(_ blob: JSONValue, encrypt: (String) throws -> SyncEnvelope) -> Bool {
    guard let e = try? encrypt(blob.jsStringify()) else { return false }
    let envelope: JSONValue = .object([
      ("v", .number(Double(e.v))), ("iv", .string(e.iv)), ("ct", .string(e.ct)),
      ("tag", .string(e.tag)),
    ])
    return envelope.jsStringify().utf8.count <= limits.blobBytes
  }
  static func liveTabCount(_ blob: JSONValue?) -> Int {
    (blob?["tabs"]?.pairs ?? []).filter { !deleted($0.1) }.count
  }

  // MARK: - Normalizers

  /// `v.slice(0, n)` for a string, else `null`.
  static func text(_ v: JSONValue?, _ n: Int) -> JSONValue {
    guard let units = v?.utf16Units else { return .null }
    return .stringFromUTF16(Array(units.prefix(n)))
  }
  private static func isJSSpace(_ unit: UInt32) -> Bool {
    switch unit {
    case 0x09...0x0d, 0x20, 0xa0, 0x1680, 0x2000...0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
      0x3000, 0xfeff:
      return true
    default: return false
    }
  }
  /// `String.prototype.trim` over UTF-16 code units.
  static func trimUnits(_ units: [UInt16]) -> [UInt16] {
    var start = 0
    var end = units.count
    while start < end && isJSSpace(UInt32(units[start])) { start += 1 }
    while end > start && isJSSpace(UInt32(units[end - 1])) { end -= 1 }
    return Array(units[start..<end])
  }
  /// Code points as JavaScript's `u` regexes and `Array.from` see them: a
  /// lone surrogate is a code point of its own.
  private static func codePoints(_ units: [UInt16]) -> [UInt32] {
    var out: [UInt32] = []
    var i = 0
    while i < units.count {
      let u = units[i]
      if (0xD800...0xDBFF).contains(u), i + 1 < units.count, (0xDC00...0xDFFF).contains(units[i + 1]) {
        out.append(0x10000 + ((UInt32(u) - 0xD800) << 10) + (UInt32(units[i + 1]) - 0xDC00))
        i += 2
      } else {
        out.append(UInt32(u))
        i += 1
      }
    }
    return out
  }
  private static func units(_ points: [UInt32]) -> [UInt16] {
    points.flatMap { p -> [UInt16] in
      p > 0xFFFF
        ? [UInt16(0xD800 + ((p - 0x10000) >> 10)), UInt16(0xDC00 + ((p - 0x10000) & 0x3FF))]
        : [UInt16(p)]
    }
  }
  /// A port of `normalizeTabName` (`src/main/tab-name.js`): whitespace and NEL
  /// to spaces, controls removed, runs of spaces folded, trimmed, at most 100
  /// code points; `null` for "use the page title".
  static func normalizeTabName(_ raw: JSONValue?) -> JSONValue {
    guard let raw = raw?.utf16Units else { return .null }
    var points: [UInt32] = []
    for p in codePoints(raw) {
      let q: UInt32 = isJSSpace(p) || p == 0x85 ? 0x20 : p
      if q <= 0x1F || (0x7F...0x9F).contains(q) { continue }
      if q == 0x20, points.last == 0x20 { continue }
      points.append(q)
    }
    let folded = trimUnits(units(points))
    if folded.isEmpty { return .null }
    let kept = trimUnits(units(Array(codePoints(folded).prefix(100))))
    return kept.isEmpty ? .null : .stringFromUTF16(kept)
  }
  /// `nav`: an http(s) address of at most 2,048 characters and its title.
  static func nav(_ v: JSONValue?) -> JSONValue? {
    guard let v, isMap(v), let url = v["url"]?.utf16Units, url.count <= 2048,
      SyncSends.httpURL(v["url"]) != nil
    else { return nil }
    let title = text(v["title"], 200)
    return .object([("url", v["url"]!), ("title", title == .null ? .string("") : title)])
  }
  static func normalizeHex(_ v: JSONValue?) -> String? {
    guard let s = v?.string else { return nil }
    let trimmed = SyncCrypto.trim(s).lowercased()
    let hex = trimmed.hasPrefix("#") ? trimmed : "#" + trimmed
    let u = Array(hex.utf8)
    guard u.count == 7, u.dropFirst().allSatisfy({ hexDigits.contains($0) }) else { return nil }
    return hex
  }
  static func isSymbol(_ v: JSONValue?) -> Bool {
    guard case .string(let s)? = v else { return false }
    return symbolIds.contains(s)
  }
  /// `SpaceIdentity.symbolIds`, readable off the main actor (a test keeps the two equal).
  static let symbolIds: Set<String> = [
    "briefcase", "house", "code", "flask", "book", "music", "camera", "plane", "heart", "star",
    "leaf", "coffee", "cap", "gamepad", "wallet", "sun",
  ]
  private static func boolean(_ v: JSONValue) -> JSONValue? {
    if case .bool = v { return v }
    return nil
  }
  private static func position(_ v: JSONValue) -> JSONValue? { v.utf16Units == nil ? nil : v }

  typealias Normalizer = (JSONValue) -> JSONValue?
  /// Each record kind's fields in desktop's schema order; `nil` is
  /// JavaScript's `undefined` (dropped), `.null` a kept `null`.
  static let schemas: [String: [(String, Normalizer)]] = [
    "tabs": [
      ("nav", { nav($0) }), ("name", { normalizeTabName($0) }), ("pinned", boolean),
      ("groupId", { $0 == .null || isId($0) ? $0 : nil }), ("pos", position),
      ("deleted", boolean),
    ],
    "groups": [
      ("name", { text($0, 60) }),
      ("color", { $0 == .null ? .null : normalizeHex($0).map(JSONValue.string) ?? .null }),
      ("collapsed", boolean), ("pos", position), ("deleted", boolean),
    ],
    "spaces": [
      (
        "name",
        { v in
          let t = trimUnits(text(v, 60).utf16Units ?? [])
          return t.isEmpty ? .string("Space") : .stringFromUTF16(t)
        }
      ),
      ("color", { .string(normalizeHex($0) ?? "#426c4c") }),
      ("symbol", { isSymbol($0) ? $0 : .string("briefcase") }), ("pos", position),
      ("deleted", boolean),
    ],
  ]

  // MARK: - Index metadata

  private static let revFields = ["rev", "revAt", "revBy"]
  private static func isRev(_ v: JSONValue?) -> Bool {
    guard case .string(let s)? = v else { return false }
    let u = Array(s.utf8)
    return u.count == 16 && u.allSatisfy { hexDigits.contains($0) }
  }
  /// `rev` travels with the clock and writer of the write that set it;
  /// `createdAt`/`createdBy` are immutable.
  static func copyIndexMeta(_ raw: JSONValue, into out: inout JSONValue) {
    if isRev(raw["rev"]) {
      out["rev"] = raw["rev"]
      if let at = safeInteger(raw["revAt"]), at >= 0 { out["revAt"] = raw["revAt"] }
      if let by = raw["revBy"]?.utf16Units, !by.isEmpty, by.count <= 128 { out["revBy"] = raw["revBy"] }
    }
    if let at = safeInteger(raw["createdAt"]), at >= 0 { out["createdAt"] = raw["createdAt"] }
    if let by = raw["createdBy"]?.utf16Units { out["createdBy"] = .stringFromUTF16(Array(by.prefix(128))) }
  }
  /// The later of two revision hints: higher `revAt`, then the smaller
  /// writer, then the smaller hash; an unclocked hint ranks below every clocked one.
  static func newerRev(_ a: JSONValue?, _ b: JSONValue?) -> JSONValue? {
    guard let a, a["rev"] != nil else { return b?["rev"] == nil ? nil : b }
    guard let b, b["rev"] != nil else { return a }
    func at(_ x: JSONValue) -> Double { safeInteger(x["revAt"]) ?? -1 }
    if at(a) != at(b) { return at(a) > at(b) ? a : b }
    let aby = a["revBy"]?.utf16Units ?? []
    let bby = b["revBy"]?.utf16Units ?? []
    if aby != bby { return aby.lexicographicallyPrecedes(bby) ? a : b }
    return !less(b["rev"]?.string ?? "", a["rev"]?.string ?? "") ? a : b
  }
  static func mergeIndexMeta(_ l: JSONValue?, _ r: JSONValue?, into out: JSONValue) -> JSONValue {
    var out = out
    for key in revFields { out[key] = nil }
    if let rev = newerRev(l, r) {
      for key in revFields { if let v = rev[key] { out[key] = v } }
    }
    for key in ["createdAt", "createdBy"] {
      let values = [l?[key], r?[key]].compactMap { $0 }
      out[key] = values.min { less($0.canonical(), $1.canonical()) }
    }
    return out
  }

  // MARK: - Sanitize

  static func sanitizeRecord(_ raw: JSONValue?, kind: String) -> JSONValue? {
    guard let raw, isMap(raw) else { return nil }
    var out: JSONValue = .object([])
    for (name, normalize) in schemas[kind] ?? [] {
      guard let f = raw[name], isField(f), let fv = f["v"], let v = normalize(fv) else { continue }
      if v != .null || nullableFields.contains(name) { out[name] = field(v, from: f) }
    }
    guard let d = out["deleted"] else { return nil }
    if d["v"] == .bool(false), (schemas[kind] ?? []).contains(where: { out[$0.0] == nil }) {
      return nil
    }
    if kind == "spaces" { copyIndexMeta(raw, into: &out) }
    return out
  }
  static func sanitizeMap(_ raw: JSONValue?, kind: String) -> JSONValue {
    guard isMap(raw), let raw else { return .object([]) }
    return .object(
      keys(raw).sorted(by: less).compactMap { id in
        guard isId(id), let r = sanitizeRecord(raw[id], kind: kind) else { return nil }
        return (id, r)
      })
  }
  private static func copyActive(_ raw: JSONValue?, into out: inout JSONValue) {
    guard let a = raw?["active"], isField(a), isId(a["v"]) else { return }
    var active = field(a["v"]!, from: a)
    if isTrue(a["cleared"]) { active["cleared"] = .bool(true) }
    out["active"] = active
  }
  static func isBlobShaped(_ raw: JSONValue?) -> Bool {
    guard let raw, isMap(raw), raw["v"] == .number(1), isId(raw["spaceId"]),
      isMap(raw["groups"]), isMap(raw["tabs"])
    else { return false }
    return true
  }
  /// Keeps the winning write, tie-breaker included, when its target is gone.
  static func clearInvalidActive(_ blob: JSONValue) -> JSONValue {
    guard var active = blob["active"] else { return blob }
    let target = active["v"]?.string.flatMap { blob["tabs"]?[$0] }
    if target == nil || deleted(target) {
      active["cleared"] = .bool(true)
      var out = blob
      out["active"] = active
      return out
    }
    return blob
  }
  static func activeTabId(_ blob: JSONValue?) -> String? {
    guard let active = blob?["active"], !isTrue(active["cleared"]), isId(active["v"]),
      let id = active["v"]?.string, blob?["tabs"]?[id]?["deleted"]?["v"] == .bool(false)
    else { return nil }
    return id
  }
  static func sanitizeBlob(_ raw: JSONValue?) -> JSONValue? {
    guard isBlobShaped(raw), let raw else { return nil }
    var out: JSONValue = .object([
      ("v", .number(1)), ("spaceId", raw["spaceId"]!),
      ("groups", sanitizeMap(raw["groups"], kind: "groups")),
      ("tabs", sanitizeMap(raw["tabs"], kind: "tabs")),
    ])
    copyActive(raw, into: &out)
    return clearInvalidActive(out)
  }
  static func sanitizeIndex(_ raw: JSONValue?) -> JSONValue? {
    guard let raw, isMap(raw), raw["v"] == .number(1), isMap(raw["spaces"]) else { return nil }
    return .object([("v", .number(1)), ("spaces", sanitizeMap(raw["spaces"], kind: "spaces"))])
  }

  // MARK: - Merge

  static func mergeBlob(_ a: JSONValue?, _ b: JSONValue?) throws -> JSONValue? {
    let left = sanitizeBlob(a)
    let right = sanitizeBlob(b)
    if (isPresent(a) && left == nil) || (isPresent(b) && right == nil) { throw ModelError.invalidBlob }
    guard let left else { return right }
    guard let right else { return left }
    guard left["spaceId"] == right["spaceId"] else { throw ModelError.identityMismatch }
    var out: JSONValue = .object([("v", .number(1)), ("spaceId", left["spaceId"]!)])
    for kind in ["groups", "tabs"] {
      out[kind] = .object(
        sortedUnion(left[kind], right[kind]).map { ($0, mergeRecord(left[kind]?[$0], right[kind]?[$0])) })
    }
    if let active = mergeField(left["active"], right["active"], name: "active") {
      out["active"] = active
    }
    return clearInvalidActive(out)
  }
  static func mergeIndex(_ a: JSONValue?, _ b: JSONValue?) throws -> JSONValue {
    let cleanLeft = sanitizeIndex(a)
    let cleanRight = sanitizeIndex(b)
    if (isPresent(a) && cleanLeft == nil) || (isPresent(b) && cleanRight == nil) {
      throw ModelError.invalidIndex
    }
    let left = cleanLeft?["spaces"] ?? .object([])
    let right = cleanRight?["spaces"] ?? .object([])
    return .object([
      ("v", .number(1)),
      (
        "spaces",
        .object(
          sortedUnion(left, right).map { id in
            let l = left[id] ?? .object([])
            let r = right[id] ?? .object([])
            return (id, mergeIndexMeta(l, r, into: mergeRecord(l, r)))
          })
      ),
    ])
  }

  // MARK: - Retention

  static func expiredRecord(_ record: JSONValue?, now: Int64) -> Bool {
    guard deleted(record), let c = record?["deleted"]?["c"]?.number else { return false }
    return Double(now) - c >= Double(limits.tombstoneMs)
  }
  static func expireTombstones(_ blob: JSONValue, now: Int64) -> JSONValue {
    var out = blob
    for kind in ["tabs", "groups", "spaces"] {
      guard let records = out[kind], isMap(records) else { continue }
      out[kind] = .object(records.pairs.filter { !expiredRecord($0.1, now: now) })
    }
    return clearInvalidActive(out)
  }
  static func effectiveGroup(_ blob: JSONValue, _ tab: JSONValue?) -> String? {
    guard let id = tab?["groupId"]?["v"]?.string, !id.isEmpty, let g = blob["groups"]?[id],
      !deleted(g)
    else { return nil }
    return id
  }

  // MARK: - Relay

  // Strict sanitization is the view this version can display and apply. An
  // upload built only from it would erase another device's content (a newer
  // client's field, a longer URL), so every upload is finished by relaying the
  // fetched blob's well-formed records and fields unchanged, merged by the
  // ordinary field rules. A relayed value is never applied to the shown set.
  static let relayFields = 32
  static func isFieldName(_ name: String) -> Bool {
    let u = Array(name.utf16)
    guard let first = u.first, (97...122).contains(first), u.count <= 32 else { return false }
    return u.dropFirst().allSatisfy {
      (97...122).contains($0) || (65...90).contains($0) || (48...57).contains($0)
    }
  }
  static func relayRecord(_ raw: JSONValue?, kind: String) -> JSONValue? {
    guard let raw, isMap(raw) else { return nil }
    var out: JSONValue = .object([])
    for name in keys(raw).sorted(by: less) {
      if out.pairs.count >= relayFields { break }
      if isFieldName(name), let f = raw[name], isField(f) { out[name] = field(f["v"]!, from: f) }
    }
    if kind == "spaces" { copyIndexMeta(raw, into: &out) }
    return out.pairs.isEmpty ? nil : out
  }
  static func relayMap(_ raw: JSONValue?, kind: String) -> JSONValue {
    guard let raw, isMap(raw) else { return .object([]) }
    return .object(
      keys(raw).sorted(by: less).compactMap { id in
        guard isId(id), let r = relayRecord(raw[id], kind: kind) else { return nil }
        return (id, r)
      })
  }
  static func relayBlob(_ raw: JSONValue?) -> JSONValue? {
    guard isBlobShaped(raw), let raw else { return nil }
    var out: JSONValue = .object([
      ("v", .number(1)), ("spaceId", raw["spaceId"]!),
      ("groups", relayMap(raw["groups"], kind: "groups")),
      ("tabs", relayMap(raw["tabs"], kind: "tabs")),
    ])
    copyActive(raw, into: &out)
    return out
  }
  static func relayIndex(_ raw: JSONValue?) -> JSONValue? {
    guard let raw, isMap(raw), raw["v"] == .number(1), isMap(raw["spaces"]) else { return nil }
    return .object([("v", .number(1)), ("spaces", relayMap(raw["spaces"], kind: "spaces"))])
  }
  /// One field of the upload against the same field as fetched: the same
  /// write (clock and writer equal) is the fetched original, not our copy.
  private static func relayField(_ ours: JSONValue?, _ theirs: JSONValue?, name: String) -> JSONValue? {
    if isField(ours), isField(theirs), ours?["c"]?.number == theirs?["c"]?.number,
      strictEqual(ours?["by"], theirs?["by"]), name != "active"
    {
      return theirs
    }
    return mergeField(ours, theirs, name: name)
  }
  private static func relayRecordInto(_ ours: JSONValue?, _ theirs: JSONValue, kind: String) -> JSONValue {
    let ours = ours ?? .object([])
    let out: JSONValue = .object(
      sortedUnion(ours, theirs).compactMap { name in
        relayField(ours[name], theirs[name], name: name).map { (name, $0) }
      })
    return kind == "spaces" ? mergeIndexMeta(ours, theirs, into: out) : out
  }
  /// `upload` (strict) finished with everything `relay` holds that it lacks.
  /// Expired tombstones are not relayed, nor any record in `retired`.
  static func relayInto(_ upload: JSONValue, _ relay: JSONValue?, now: Int64,
    retired: [String: [String]] = [:]) -> JSONValue
  {
    var out = upload
    guard let relay else { return out }
    for kind in ["groups", "tabs", "spaces"] {
      guard let theirsMap = relay[kind], isMap(theirsMap), var ours = out[kind], isMap(ours) else {
        continue
      }
      for (id, theirs) in theirsMap.pairs {
        if expiredRecord(theirs, now: now) || (retired[kind] ?? []).contains(id) { continue }
        ours[id] = relayRecordInto(ours[id], theirs, kind: kind)
      }
      out[kind] = sortedObject(ours.pairs)
    }
    if relay["active"] != nil || out["active"] != nil {
      if let active = mergeField(out["active"], relay["active"], name: "active") {
        out["active"] = active
      }
    }
    return out["tabs"] != nil ? clearInvalidActive(out) : out
  }
}

// MARK: - Pending writes and upload plans

/// One record an upload may hold back to fit the budget (desktop's admission unit).
nonisolated struct AdmissionUnit: Sendable {
  var kind: String
  var id: String
  var key: String
  var before: JSONValue?
  var after: JSONValue
  var required: Bool
  var clock: Double
  var dependencies: [String]
  var admissionRank: Int?
  var rank: Double { admissionRank.map(Double.init) ?? clock }
}

/// What one merge of a Space proposes (desktop's `pushPlan` result).
nonisolated struct PushPlan: Sendable {
  var mergedBlob: JSONValue
  /// `{blob, rev, ifVersion}` when the merged state differs from what the Worker holds.
  var upload: JSONValue?
  var pendingAfter: JSONValue
  var recover: Set<String>
  var unsynced: Set<String>
  /// Ids this pass expired, per kind (`tabs`, `groups`).
  var expiredRecords: [String: [String]]
  var indexEntry: JSONValue?
  var reason: String?
  var nextLastMergeAt: Int64
  /// Set by `SharedSpacesState.mergeSpace`: the pending writes the plan was
  /// built from and the account it belongs to, so a settlement can tell later
  /// writes apart and never lands in another account.
  var pendingBefore: JSONValue? = nil
  var accountId: String? = nil
}

extension SharedSpacesModel {
  private static let pendingKinds = ["tabs", "groups"]

  /// Pending writes are namespaced by record kind, id and field; the index
  /// receipt is a separate caller-owned entry. Never mutates its input.
  static func sanitizePending(_ pending: JSONValue?) -> JSONValue {
    var out: JSONValue = .object([])
    copyActive(pending, into: &out)
    for kind in pendingKinds {
      for (id, record) in pending?[kind]?.pairs ?? [] {
        guard isId(id), isMap(record) else { continue }
        for (name, normalize) in schemas[kind] ?? [] {
          guard let raw = record[name], isField(raw), let rv = raw["v"], let v = normalize(rv),
            v != .null || nullableFields.contains(name)
          else { continue }
          if name == "pos", !validKey(v, id) { continue }
          var map = out[kind] ?? .object([])
          var rec = map[id] ?? .object([])
          rec[name] = field(v, from: raw)
          map[id] = rec
          out[kind] = map
        }
      }
    }
    if let index = pending?["index"], isId(index["id"]), isRev(index["rev"]) {
      var receipt: JSONValue = .object([("id", index["id"]!), ("rev", index["rev"]!)])
      if let at = safeInteger(index["at"]), at >= 0 { receipt["at"] = index["at"] }
      if let by = index["by"]?.utf16Units, !by.isEmpty, by.count <= 128 { receipt["by"] = index["by"] }
      out["index"] = receipt
    }
    return out
  }
  static func applyLocalEdits(_ pending: JSONValue?, _ edits: JSONValue?) -> JSONValue {
    var out = sanitizePending(pending)
    let clean = sanitizePending(edits)
    if let active = mergeField(out["active"], clean["active"], name: "active") { out["active"] = active }
    for kind in pendingKinds {
      for (id, record) in clean[kind]?.pairs ?? [] {
        var map = out[kind] ?? .object([])
        map[id] = mergeRecord(map[id], record)
        out[kind] = map
      }
    }
    return out
  }
  /// Clears every pending field a fetched value acknowledges.
  static func settlePending(_ pending: JSONValue?, _ fetched: JSONValue?) -> JSONValue {
    var out = sanitizePending(pending)
    if let active = out["active"], acknowledged(fetched?["active"], active, name: "active") {
      out["active"] = nil
    }
    for kind in pendingKinds {
      guard let map = out[kind] else { continue }
      let kept: [(String, JSONValue)] = map.pairs.compactMap { id, record in
        let fields = record.pairs.filter { name, value in
          !acknowledged(fetched?[kind]?[id]?[name], value, name: name)
        }
        return fields.isEmpty ? nil : (id, .object(fields))
      }
      out[kind] = kept.isEmpty ? nil : .object(kept)
    }
    return out
  }

  /// M16 §3.9: after more than 30 days without a merge, local records the
  /// Worker no longer has are recovered rather than republished.
  static func recoveryDecision(localBlob: JSONValue?, fetchedBlob: JSONValue?, lastMergeAt: Int64?,
    now: Int64) -> (keep: Set<String>, recover: Set<String>)
  {
    var keep = Set<String>()
    var recover = Set<String>()
    let hasRemote = keys(fetchedBlob?["tabs"]).count + keys(fetchedBlob?["groups"]).count > 0
    let stale = lastMergeAt.map { Double(now) - Double($0) > Double(limits.tombstoneMs) } ?? hasRemote
    for kind in pendingKinds {
      for (id, record) in localBlob?[kind]?.pairs ?? [] {
        if expiredRecord(record, now: now) { continue }
        if stale && fetchedBlob?[kind]?[id] == nil { recover.insert(id) } else { keep.insert(id) }
      }
    }
    return (keep, recover)
  }
  private static func withoutRecords(_ blob: JSONValue, _ ids: Set<String>) -> JSONValue {
    var out = blob
    for kind in pendingKinds {
      guard let map = out[kind], isMap(map) else { continue }
      out[kind] = .object(map.pairs.filter { !ids.contains($0.0) })
    }
    return out
  }
  private static func replayPending(_ blob: JSONValue, _ pending: JSONValue) -> JSONValue {
    var out = blob
    if let active = mergeField(out["active"], pending["active"], name: "active") { out["active"] = active }
    for kind in pendingKinds {
      var map = out[kind] ?? .object([])
      for (id, record) in pending[kind]?.pairs ?? [] { map[id] = mergeRecord(map[id], record) }
      out[kind] = map
    }
    return out
  }
  /// Historical values fill only missing fetched fields, and only when the
  /// candidate supersedes them; fetched fields stay authoritative in the base.
  static func admissionUnits(_ candidate: JSONValue, fetched: JSONValue, deviceId: String,
    lastPublishable: JSONValue?) -> [AdmissionUnit]
  {
    var units: [AdmissionUnit] = []
    for kind in ["groups", "tabs"] {
      for (id, after) in candidate[kind]?.pairs ?? [] {
        let fetchedRecord = fetched[kind]?[id]
        var before = fetchedRecord ?? .object([])
        for (name, value) in lastPublishable?[kind]?[id]?.pairs ?? [] {
          if before[name] == nil, acknowledged(after[name], value, name: name) { before[name] = value }
        }
        for (name, value) in after.pairs where !strictEqual(value["by"], .string(deviceId)) {
          before[name] = value
        }
        let mine: (JSONValue) -> Bool = { strictEqual($0["by"], .string(deviceId)) }
        let sameAsBase = before.canonical() == after.canonical()
        let hasLocalContribution = after.pairs.contains { name, value in
          mine(value) && value.canonical() != canon(fetchedRecord?[name])
        }
        if sameAsBase && !hasLocalContribution { continue }
        let base: JSONValue? = before.pairs.isEmpty ? nil : before
        let required = sameAsBase || (base != nil && sanitizeRecord(base, kind: kind) == nil)
        let clocks: [Double] = after.pairs.compactMap { name, value in
          isField(value) && mine(value) && value.canonical() != canon(before[name])
            ? value["c"]?.number : nil
        }
        units.append(
          AdmissionUnit(
            kind: kind, id: id, key: kind + ":" + id, before: base, after: after, required: required,
            clock: max(0, clocks.max() ?? 0), dependencies: [], admissionRank: nil))
      }
    }
    let newGroups = Set(units.filter { $0.kind == "groups" && $0.before == nil }.map(\.id))
    for n in units.indices where units[n].kind == "tabs" {
      if let g = units[n].after["groupId"]?["v"]?.string, newGroups.contains(g) {
        units[n].dependencies.append("groups:" + g)
      }
    }
    return units
  }

  /// Fits the candidate within M16 §5's limits by holding back the newest
  /// local changes, never a required one; limits apply to `finish(candidate)`,
  /// what is actually PUT.
  static func admit(candidate: JSONValue, changes: [AdmissionUnit],
    encrypt: (String) throws -> SyncEnvelope, finish: (JSONValue) -> JSONValue = { $0 })
    -> (blob: JSONValue?, unsynced: Set<String>, reason: String?)
  {
    var out = clearInvalidActive(candidate)
    var held = Set<String>()
    var unsynced = Set<String>()
    func fitsBlob(_ blob: JSONValue) -> Bool {
      liveTabCount(blob) <= limits.tabsPerSpace && blobFits(blob, encrypt: encrypt)
    }
    func fits() -> Bool { fitsBlob(finish(out)) }
    func complete() -> Bool {
      if canon(sanitizeBlob(out)) != out.canonical() { return false }
      return changes.allSatisfy { unit in
        guard let record = out[unit.kind]?[unit.id], !deleted(record) else { return true }
        if canon(record["pos"]) != canon(unit.before?["pos"]), !validKey(record["pos"]?["v"], unit.id) {
          return false
        }
        let group = record["groupId"]?["v"]?.string ?? ""
        return unit.kind != "tabs" || group.isEmpty || out["groups"]?[group] != nil
          || unit.before?["groupId"]?["v"]?.string == group
      }
    }
    // "Closed tabs free their room after 30 days" is true only when their
    // expiry alone would let this change fit.
    func withoutTombstones(_ blob: JSONValue) -> JSONValue {
      var t = blob
      for kind in pendingKinds {
        t[kind] = .object((t[kind]?.pairs ?? []).filter { !deleted($0.1) })
      }
      return clearInvalidActive(t)
    }
    let finished = finish(out)
    let hasTombstones = pendingKinds.contains { kind in
      (finished[kind]?.pairs ?? []).contains { deleted($0.1) }
    }
    let initialReason =
      liveTabCount(finished) > limits.tabsPerSpace
      ? "tabs" : hasTombstones && fitsBlob(withoutTombstones(finished)) ? "tombstones" : "full"
    if fits() && complete() { return (finish(out), unsynced, nil) }
    var byKey: [String: AdmissionUnit] = [:]
    var keyOrder: [String] = []
    for unit in changes {
      if byKey[unit.key] == nil { keyOrder.append(unit.key) }
      byKey[unit.key] = unit
    }
    func hold(_ unit: AdmissionUnit) -> Bool {
      if held.contains(unit.key) || unit.required { return false }
      // A required dependent prevents withholding its dependency as well.
      let dependents = changes.filter { $0.dependencies.contains(unit.key) && !held.contains($0.key) }
      if dependents.contains(where: \.required) { return false }
      for dependent in dependents where !hold(dependent) { return false }
      var map = out[unit.kind] ?? .object([])
      map[unit.id] = unit.before
      out[unit.kind] = map
      out = clearInvalidActive(out)
      held.insert(unit.key)
      unsynced.insert(unit.id)
      return true
    }
    let ordered = keyOrder.compactMap { byKey[$0] }.sorted { a, b in
      a.rank != b.rank ? a.rank > b.rank : less(a.key, b.key)
    }
    for unit in ordered {
      _ = hold(unit)
      if fits() && complete() { return (finish(out), unsynced, initialReason) }
    }
    for unit in changes { unsynced.insert(unit.id) }
    return (
      nil, unsynced,
      changes.contains(where: \.required) ? "required-state-over-budget" : "remote-over-budget"
    )
  }

  static func pushPlan(fetchedBlob: JSONValue?, fetchedVersion: String?, localBlob: JSONValue?,
    pending: JSONValue?, lastMergeAt: Int64?, now: Int64, deviceId: String,
    encrypt: (String) throws -> SyncEnvelope, lastPublishable: JSONValue?,
    admissionOrder: [String] = []) throws -> PushPlan
  {
    let local = sanitizeBlob(localBlob)
    let remote = sanitizeBlob(fetchedBlob)
    let relay = relayBlob(fetchedBlob)
    // Only an actual missing blob may start an empty remote. An unreadable
    // response must not be overwritten with a locally understood older schema.
    if (isPresent(fetchedBlob) && remote == nil) || (!isPresent(fetchedBlob) && fetchedVersion != nil) {
      throw ModelError.invalidRemoteBlob
    }
    guard let spaceId = (local ?? remote)?["spaceId"] else { throw ModelError.noValidSpace }
    if let local, let remote, local["spaceId"] != remote["spaceId"] { throw ModelError.identityMismatch }
    let empty: JSONValue = .object([
      ("v", .number(1)), ("spaceId", spaceId), ("tabs", .object([])), ("groups", .object([])),
    ])
    let fetched = remote ?? empty
    let published = sanitizeBlob(lastPublishable)
    if isPresent(lastPublishable) && published == nil { throw ModelError.invalidPublishedBlob }
    if let published, published["spaceId"] != fetched["spaceId"] {
      throw ModelError.publishedIdentityMismatch
    }
    // What the Worker holds, including records this version can't display:
    // presence and acknowledgement are judged against it, never the strict view.
    let held = relay ?? empty
    let recover = recoveryDecision(
      localBlob: local ?? empty, fetchedBlob: relay, lastMergeAt: lastMergeAt, now: now
    ).recover
    let retained = withoutRecords(local ?? empty, recover)
    var eligiblePending = withoutRecords(sanitizePending(pending), recover)
    if !strictEqual(eligiblePending["index"]?["id"], fetched["spaceId"]) { eligiblePending["index"] = nil }
    guard let baseMerged = try mergeBlob(fetched, retained) else { throw ModelError.noValidSpace }
    var retainedOwn: JSONValue = .object([])
    if let active = retained["active"], strictEqual(active["by"], .string(deviceId)),
      !acknowledged(held["active"], active, name: "active")
    {
      retainedOwn["active"] = active
    }
    for kind in pendingKinds {
      for (id, record) in retained[kind]?.pairs ?? [] {
        for (name, value) in record.pairs
        where strictEqual(value["by"], .string(deviceId))
          && !acknowledged(held[kind]?[id]?[name], value, name: name)
        {
          var map = retainedOwn[kind] ?? .object([])
          var rec = map[id] ?? .object([])
          rec[name] = value
          map[id] = rec
          retainedOwn[kind] = map
        }
      }
    }
    var pendingAfter = settlePending(applyLocalEdits(eligiblePending, retainedOwn), held)
    let replayed = replayPending(baseMerged, pendingAfter)
    var expiredRecords: [String: [String]] = ["tabs": [], "groups": []]
    // Expiry is a retention decision for persisted state too: remove every
    // field of retired records from pending so a later pass cannot recreate
    // the tombstone or wait forever for its receipt.
    for kind in pendingKinds {
      for (id, record) in replayed[kind]?.pairs ?? [] where expiredRecord(record, now: now) {
        expiredRecords[kind, default: []].append(id)
        if var map = pendingAfter[kind] {
          map[id] = nil
          pendingAfter[kind] = map
        }
      }
      if let map = pendingAfter[kind], map.pairs.isEmpty { pendingAfter[kind] = nil }
    }
    let mergedBlob = expireTombstones(replayed, now: now)
    if pendingAfter["active"] != nil {
      let checked = clearInvalidActive(
        .object([("tabs", mergedBlob["tabs"] ?? .object([])), ("active", pendingAfter["active"]!)]))
      pendingAfter["active"] = checked["active"]
    }
    var changes = admissionUnits(
      mergedBlob, fetched: fetched, deviceId: deviceId,
      lastPublishable: published.map { expireTombstones($0, now: now) })
    if !admissionOrder.isEmpty {
      var ranks: [String: Int] = [:]
      for (n, key) in admissionOrder.enumerated() { ranks[key] = n }  // a repeat keeps its last place, like a JS Map
      var next = ranks.count
      let byClock = changes.indices.sorted { a, b in
        changes[a].clock != changes[b].clock
          ? changes[a].clock < changes[b].clock : less(changes[a].key, changes[b].key)
      }
      for n in byClock {
        if let rank = ranks[changes[n].key] {
          changes[n].admissionRank = rank
        } else {
          changes[n].admissionRank = next
          next += 1
        }
      }
    }
    let retired = expiredRecords
    let admission = admit(
      candidate: mergedBlob, changes: changes, encrypt: encrypt,
      finish: { (blob: JSONValue) -> JSONValue in relayInto(blob, relay, now: now, retired: retired) })
    var upload: JSONValue?
    if let blob = admission.blob, blob.canonical() != (relay ?? fetched).canonical() {
      upload = .object([
        ("blob", blob), ("rev", .string(revisionOf(blob))),
        ("ifVersion", fetchedVersion.map(JSONValue.string) ?? .null),
      ])
    }
    // Proposal only: the caller may publish this revision after the blob PUT
    // succeeds. It is of what the Worker holds afterwards, relayed content included.
    var indexEntry: JSONValue?
    if let upload {
      indexEntry = .object([
        ("id", upload["blob"]!["spaceId"]!), ("rev", upload["rev"]!), ("at", .number(Double(now))),
        ("by", .string(deviceId)),
      ])
    } else if admission.reason == nil, pendingAfter["index"] != nil {
      indexEntry = .object([
        ("id", fetched["spaceId"]!), ("rev", .string(revisionOf(relay ?? fetched))),
        ("at", .number(Double(now))), ("by", .string(deviceId)),
      ])
    }
    return PushPlan(
      mergedBlob: mergedBlob, upload: upload, pendingAfter: pendingAfter, recover: recover,
      unsynced: admission.unsynced, expiredRecords: expiredRecords, indexEntry: indexEntry,
      reason: admission.reason, nextLastMergeAt: now)
  }

  /// Called only after observing the real PUT result. Index receipts come
  /// from successful blob writes, never from planning.
  static func settleUpload(_ plan: PushPlan, _ originalPending: JSONValue?, blobStored: Bool,
    indexStored: Bool) -> (pending: JSONValue, indexEntry: JSONValue?)
  {
    if plan.upload != nil && !blobStored {
      // Retention doesn't depend on an upload acknowledgement: apply only the
      // plan's expiry and recovery to the caller's pending snapshot.
      var pending = originalPending ?? .object([])
      for kind in pendingKinds {
        let gone = Set((plan.expiredRecords[kind] ?? []) + plan.recover)
        guard let map = pending[kind] else { continue }
        let kept = map.pairs.filter { !gone.contains($0.0) }
        pending[kind] = kept.isEmpty ? nil : .object(kept)
      }
      let goneTabs = Set((plan.expiredRecords["tabs"] ?? []) + plan.recover)
      if var active = pending["active"], let v = active["v"]?.string, goneTabs.contains(v) {
        active["cleared"] = .bool(true)
        pending["active"] = active
      }
      return (pending, nil)
    }
    var pending = plan.pendingAfter
    if let entry = plan.indexEntry {
      pending["index"] = indexStored ? nil : entry
    }
    return (pending, plan.indexEntry)
  }
}
