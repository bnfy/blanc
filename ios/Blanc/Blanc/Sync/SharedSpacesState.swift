import Foundation

/// The account-bound Shared Spaces state, `shared-spaces.json` in the sync
/// directory: a port of desktop's `src/main/shared-spaces.js`. It never
/// performs network I/O or changes the shown tabs; the sync pass observes
/// outcomes and the adapter owns display. `accepted` holds remote changes to
/// the protected (selected) tab that wait to apply (design §10).
@MainActor final class SharedSpacesState {
  private(set) var data: JSONValue
  private let file: URL
  private let now: () -> Int64
  private var indexRelay: (accountId: String, index: JSONValue?)?
  private typealias Model = SharedSpacesModel

  static let containers = [
    "index", "knownIndex", "blobs", "pending", "accepted", "recoveries", "recoveryDone", "sidecar",
    "cursors",
  ]
  static func empty() -> JSONValue {
    .object([
      ("accountId", .string("")), ("enabled", .bool(false)),
      ("index", .object([("v", .number(1)), ("spaces", .object([]))])), ("knownIndex", .object([])),
      ("blobs", .object([])), ("pending", .object([])), ("accepted", .object([])),
      ("recoveries", .object([])), ("recoveryDone", .object([])),
      ("sidecar", .object([("devices", .object([]))])), ("dormantIds", .array([])),
      ("draftIds", .array([])), ("requestLog", .array([])), ("nextClass", .string("I")),
      ("cursors", .object([])), ("windowLimit", .null), ("backoffUntil", .null),
    ])
  }

  init(directory: URL, now: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
    file = directory.appendingPathComponent("shared-spaces.json")
    self.now = now
    let stored = (try? Data(contentsOf: file)).flatMap { try? JSONValue(data: $0) }
    data = Model.isMap(stored) ? stored! : Self.empty()
  }

  private func persist() throws {
    try FileManager.default.createDirectory(
      at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data(data.jsStringify().utf8).write(
      to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
  }
  private func save() { try? persist() }
  private func map(_ key: String) -> JSONValue { data[key] ?? .object([]) }
  private func setIn(_ key: String, _ id: String, _ value: JSONValue?) {
    var m = map(key)
    m[id] = value
    data[key] = m
  }

  var accountId: String { data["accountId"]?.string ?? "" }
  var isEnabled: Bool { data["enabled"] == .bool(true) }

  /// Binds the state to `accountId`: another account starts clean (only the
  /// request log survives, since the budget is per device), and invalid
  /// containers in a readable file are repaired while other records are kept.
  func rebind(accountId: String) {
    var changed = false
    if data["accountId"]?.string != accountId {
      var fresh = Self.empty()
      fresh["accountId"] = .string(accountId)
      if case .array? = data["requestLog"] { fresh["requestLog"] = data["requestLog"] }
      data = fresh
      changed = true
    }
    let defaults = Self.empty()
    for name in Self.containers where !Model.isMap(data[name]) {
      data[name] = defaults[name]
      changed = true
    }
    if var index = data["index"] {
      if !Model.isMap(index["spaces"]) {
        index["spaces"] = .object([])
        data["index"] = index
        changed = true
      }
      if index["v"] == .number(1), let clean = Model.sanitizeIndex(index), clean.canonical() != index.canonical() {
        data["index"] = clean
        changed = true
      }
    }
    if var sidecar = data["sidecar"], !Model.isMap(sidecar["devices"]) {
      sidecar["devices"] = .object([])
      data["sidecar"] = sidecar
      changed = true
    }
    for key in ["dormantIds", "draftIds", "requestLog"] {
      if case .array? = data[key] { continue }
      data[key] = .array([])
      changed = true
    }
    if changed { save() }
  }
  /// Sync turned off or the account switched: forget everything but the request log.
  func clear() { rebind(accountId: "") }

  @discardableResult func setEnabled(_ on: Bool) -> Bool {
    let before = data["enabled"]
    data["enabled"] = .bool(on)
    do {
      try persist()
      return true
    } catch {
      data["enabled"] = before
      return false
    }
  }
  func setDormant(_ ids: [String]) {
    var seen = Set<String>()
    data["dormantIds"] = .array(ids.filter { Model.isId($0) && seen.insert($0).inserted }.map(JSONValue.string))
    save()
  }
  func isDormant(_ id: String) -> Bool { (data["dormantIds"]?.array ?? []).contains(.string(id)) }
  func isDraft(_ id: String) -> Bool { (data["draftIds"]?.array ?? []).contains(.string(id)) }

  /// A local change to Space `id`: its full local blob and the field writes
  /// it made. A record already moved to recovery stays there.
  func noteLocalSpace(id: String, blob: JSONValue, edits: JSONValue?) throws {
    guard var clean = Model.sanitizeBlob(blob), clean["spaceId"] == .string(id) else {
      throw SharedSpacesModel.ModelError.invalidBlob
    }
    var eligible = edits ?? .object([])
    let prev = data["blobs"]?[id]
    var retryOrder = (prev?["retryOrder"]?.array ?? []).compactMap(\.string)
    if var recovery = data["recoveries"]?[id] {
      for kind in ["groups", "tabs"] {
        var recovered = recovery[kind] ?? .object([])
        for rid in Model.keys(recovered) {
          let incoming = Model.mergeRecord(clean[kind]?[rid], eligible[kind]?[rid])
          recovered[rid] = Model.mergeRecord(recovered[rid], incoming)
          clean[kind]?[rid] = nil
          eligible[kind]?[rid] = nil
        }
        recovery[kind] = recovered
      }
      setIn("recoveries", id, recovery)
    }
    for kind in ["groups", "tabs"] {
      for rid in Model.keys(eligible[kind]) where !retryOrder.contains(kind + ":" + rid) {
        retryOrder.append(kind + ":" + rid)
      }
    }
    var entry = prev ?? .object([])
    entry["blob"] = try prev?["blob"].flatMap { try Model.mergeBlob($0, clean) } ?? clean
    entry["mergedAt"] = prev?["mergedAt"] ?? .number(Double(now()))
    entry["retryOrder"] = .array(retryOrder.map(JSONValue.string))
    setIn("blobs", id, entry)
    setIn("pending", id, Model.applyLocalEdits(data["pending"]?[id], eligible))
    save()
  }

  /// Recovered tab ids a recovery Space now holds, so a recovery Space the
  /// person deleted isn't made again from the same records (desktop's
  /// `recoveryDone`).
  func markRecoveryDone(_ id: String, tabIds: [String]) {
    var ids = (data["recoveryDone"]?[id]?.array ?? []).compactMap(\.string)
    for tabId in tabIds where !ids.contains(tabId) { ids.append(tabId) }
    setIn("recoveryDone", id, .array(ids.map(JSONValue.string)))
    save()
  }

  func setIndex(_ index: JSONValue) throws {
    data["index"] = try Model.mergeIndex(data["index"], index)
    save()
  }
  /// The fetched index; returns whether it changed what this phone holds.
  @discardableResult func mergeIndex(_ index: JSONValue) throws -> Bool {
    indexRelay = (accountId, Model.relayIndex(index))
    let before = (data["index"] ?? .null).canonical()
    data["index"] = try Model.mergeIndex(data["index"], index)
    for id in Model.keys(index["spaces"]) { setIn("knownIndex", id, .bool(true)) }
    save()
    return before != data["index"]!.canonical()
  }
  /// The index to PUT: only Spaces the Worker has named or this phone has
  /// published, with fresh revision hints, relaying the fetched index once.
  func exportIndex(deviceId: String, now: Int64) throws -> JSONValue {
    guard var index = Model.sanitizeIndex(data["index"]) else { throw SharedSpacesModel.ModelError.invalidIndex }
    var spaces = index["spaces"] ?? .object([])
    for id in Model.keys(spaces) {
      if data["knownIndex"]?[id] == nil && data["blobs"]?[id]?["lastPublishable"] == nil {
        spaces[id] = nil
        continue
      }
      guard let receipt = data["pending"]?[id]?["index"], var entry = spaces[id],
        receipt["rev"]?.canonical() != entry["rev"]?.canonical()
      else { continue }
      // A newer hint must outrank every hint already published, even one
      // from a device whose clock runs ahead.
      entry["rev"] = receipt["rev"]
      let previous = Model.safeInteger(entry["revAt"]) ?? -1
      entry["revAt"] = .number(max(receipt["at"]?.number ?? 0, previous + 1))
      entry["revBy"] = receipt["by"] ?? .string(deviceId)
      spaces[id] = entry
    }
    index["spaces"] = spaces
    let relay = indexRelay?.accountId == accountId ? indexRelay?.index : nil
    indexRelay = nil
    return Model.expireTombstones(Model.relayInto(index, relay, now: now), now: now)
  }
  /// After the index PUT succeeded for `accountId`.
  func settleIndex(_ payload: JSONValue, accountId: String) {
    guard self.accountId == accountId else { return }
    for (id, entry) in payload["spaces"]?.pairs ?? [] {
      setIn("knownIndex", id, .bool(true))
      if var local = data["index"]?["spaces"]?[id] {
        for key in ["rev", "revAt", "revBy"] { local[key] = entry[key] }
        var index = data["index"]!
        index["spaces"]?[id] = local
        data["index"] = index
      }
      if let rev = data["pending"]?[id]?["index"]?["rev"], rev.canonical() == entry["rev"]?.canonical() {
        var pending = data["pending"]![id]!
        pending["index"] = nil
        setIn("pending", id, pending)
      }
    }
    save()
  }

  /// Merges the fetched Space blob (`remote`, nil when the Worker has none)
  /// and plans the upload. Pending writes survive a failed or absent PUT;
  /// records a stale replica can't publish move to `recoveries`.
  func mergeSpace(id: String, remote: JSONValue?, version: String?, deviceId: String, now: Int64,
    encrypt: (String) throws -> SyncEnvelope) throws -> PushPlan
  {
    let entry = data["blobs"]?[id]
    let retryOrder = (entry?["retryOrder"]?.array ?? []).compactMap(\.string)
    let local =
      entry?["blob"] ?? remote
      ?? .object([("v", .number(1)), ("spaceId", .string(id)), ("tabs", .object([])), ("groups", .object([]))])
    let before = data["pending"]?[id] ?? .object([])
    var plan = try Model.pushPlan(
      fetchedBlob: remote, fetchedVersion: version, localBlob: local, pending: before,
      lastMergeAt: entry?["mergedAt"]?.intValue, now: now, deviceId: deviceId, encrypt: encrypt,
      lastPublishable: entry?["lastPublishable"], admissionOrder: retryOrder)
    if !plan.recover.isEmpty {
      var recovery = data["recoveries"]?[id] ?? .object([("tabs", .object([])), ("groups", .object([]))])
      for kind in ["tabs", "groups"] {
        var recovered = recovery[kind] ?? .object([])
        for rid in plan.recover.sorted() where local[kind]?[rid] != nil {
          recovered[rid] = Model.mergeRecord(
            recovered[rid], Model.mergeRecord(local[kind]?[rid], before[kind]?[rid]))
        }
        recovery[kind] = recovered
      }
      setIn("recoveries", id, recovery)
    }
    func rank(_ rid: String) -> Int {
      retryOrder.firstIndex { $0 == "tabs:" + rid || $0 == "groups:" + rid } ?? .max
    }
    var next = entry ?? .object([])
    next["retryOrder"] = .array(retryOrder.map(JSONValue.string))
    next["blob"] = plan.mergedBlob
    next["rev"] = remote.map { .string(Model.revisionOf($0)) } ?? .null
    next["mergedAt"] = .number(Double(plan.nextLastMergeAt))
    if let remote, Model.liveTabCount(remote) <= Model.limits.tabsPerSpace,
      Model.blobFits(remote, encrypt: encrypt)
    {
      next["lastPublishable"] = remote
    }
    next["unsynced"] = .array(
      plan.unsynced.sorted { a, b in rank(a) != rank(b) ? rank(a) < rank(b) : utf16Less(a, b) }
        .map(JSONValue.string))
    next["reason"] = plan.reason.map(JSONValue.string) ?? .null
    setIn("blobs", id, next)
    // A failed or absent PUT can't acknowledge unrelated writes; retention
    // cleanup is independent and survives a failure and a restart too.
    setIn(
      "pending", id,
      plan.upload != nil
        ? Model.settleUpload(plan, before, blobStored: false, indexStored: false).pending : plan.pendingAfter)
    save()
    plan.pendingBefore = before
    plan.accountId = accountId
    return plan
  }

  /// After the PUT for `plan`; writes made while it was in flight survive
  /// either outcome. False when the plan belongs to another account.
  @discardableResult func settleSpace(id: String, plan: PushPlan, blobStored: Bool, indexStored: Bool) -> Bool {
    guard plan.accountId == accountId, data["blobs"]?[id] != nil else { return false }
    let current = data["pending"]?[id] ?? .object([])
    let pendingBefore = plan.pendingBefore ?? .object([])
    var delta: JSONValue = .object([])
    if let active = current["active"], active.canonical() != (pendingBefore["active"] ?? .null).canonical() {
      delta["active"] = active
    }
    let retired: [String: Set<String>] = [
      "tabs": Set(plan.expiredRecords["tabs"] ?? []).union(plan.recover),
      "groups": Set(plan.expiredRecords["groups"] ?? []).union(plan.recover),
    ]
    for kind in ["tabs", "groups"] {
      for (rid, record) in current[kind]?.pairs ?? [] {
        for (name, value) in record.pairs {
          if (plan.expiredRecords[kind] ?? []).contains(rid) || plan.recover.contains(rid) { continue }
          if value.canonical() == (pendingBefore[kind]?[rid]?[name] ?? .null).canonical() { continue }
          var m = delta[kind] ?? .object([])
          var r = m[rid] ?? .object([])
          r[name] = value
          m[rid] = r
          delta[kind] = m
        }
      }
    }
    let result = Model.settleUpload(plan, current, blobStored: blobStored, indexStored: indexStored)
    var pending = Model.applyLocalEdits(result.pending, delta)
    var entry = data["blobs"]![id]!
    var blob = entry["blob"] ?? .object([])
    for kind in ["tabs", "groups"] {
      for rid in plan.recover.sorted() {
        let record = Model.mergeRecord(blob[kind]?[rid], current[kind]?[rid])
        guard !record.pairs.isEmpty else { continue }
        var recovery = data["recoveries"]?[id] ?? .object([("tabs", .object([])), ("groups", .object([]))])
        var recovered = recovery[kind] ?? .object([])
        recovered[rid] = Model.mergeRecord(recovered[rid], record)
        recovery[kind] = recovered
        setIn("recoveries", id, recovery)
      }
      for rid in retired[kind] ?? [] {
        blob[kind]?[rid] = nil
        pending[kind]?[rid] = nil
      }
      if let m = pending[kind], m.pairs.isEmpty { pending[kind] = nil }
    }
    blob = Model.sanitizeBlob(blob) ?? blob
    entry["blob"] = blob
    if let active = pending["active"] {
      var probe = blob
      probe["active"] = active
      pending["active"] = Model.sanitizeBlob(probe)?["active"]
    }
    let unsynced = (entry["unsynced"]?.array ?? []).compactMap(\.string)
    entry["retryOrder"] = .array(
      (entry["retryOrder"]?.array ?? []).filter { key in
        let parts = (key.string ?? "").split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return false }
        return pending[parts[0]]?[parts[1]] != nil || unsynced.contains(parts[1])
      })
    // Keep the published time for status and the uploaded revision, so the
    // next index hint doesn't refetch this phone's own write.
    if blobStored, let upload = plan.upload {
      entry["lastPublishable"] = upload["blob"]
      entry["lastPublishedAt"] = .number(Double(now()))
      entry["rev"] = upload["rev"]
    }
    setIn("blobs", id, entry)
    setIn("pending", id, pending)
    save()
    return true
  }

  /// The scheduler's persisted window and cursors.
  func setRequestState(_ s: SyncScheduler.Snapshot) {
    data["requestLog"] = .array(s.log.map { .number(Double($0)) })
    data["nextClass"] = .string(s.nextClass)
    data["cursors"] = .object(s.cursors.sorted { utf16Less($0.key, $1.key) }.map { ($0.key, .string($0.value)) })
    data["windowLimit"] = .number(Double(s.windowLimit))
    data["backoffUntil"] = s.backoffUntil.map { .number(Double($0)) } ?? .null
    save()
  }

  // MARK: - What the sync pass reads (M17c, desktop's `spaceIds` and the sidecar)

  /// Live library Spaces this phone syncs: named by the index or held as a
  /// blob, not deleted, dormant or a draft, in id order (`spaceIds`).
  var spaceIds: [String] {
    let index = Model.sanitizeIndex(data["index"])?["spaces"] ?? .object([])
    let ids = Set(Model.keys(index)).union(Model.keys(data["blobs"]))
    return ids.filter { id in
      index[id]?["deleted"]?["v"] != .bool(true) && !isDormant(id) && !isDraft(id)
    }.sorted(by: utf16Less)
  }
  /// Spaces whose index record is a tombstone (`deletedSpaceIds`).
  var deletedSpaceIds: [String] {
    (data["index"]?["spaces"]?.pairs ?? []).filter { $0.1["deleted"]?["v"] == .bool(true) }.map(\.0)
  }
  /// Whether Space `id` holds field writes not yet seen stored (the index receipt aside).
  func hasPendingEdits(_ id: String) -> Bool {
    (data["pending"]?[id]?.pairs ?? []).contains { $0.0 != "index" }
  }
  /// Whether the index names a revision other than the blob last merged here.
  func revisionDiffers(_ id: String) -> Bool {
    (data["index"]?["spaces"]?[id]?["rev"] ?? .null).canonical()
      != (data["blobs"]?[id]?["rev"] ?? .null).canonical()
  }
  /// The merged blob held for `id`, as the adapter reads it.
  func blob(_ id: String) -> JSONValue? { data["blobs"]?[id]?["blob"] }
  /// A Space push failed (or recovered): desktop's `failedAt` for the status line.
  func noteSpaceOutcome(id: String, failed: Bool) {
    guard var entry = data["blobs"]?[id] else { return }
    entry["failedAt"] = failed ? .number(Double(now())) : nil
    setIn("blobs", id, entry)
    save()
  }
  /// Merges a fetched `shared` store; false when it is oversized and can't be trusted.
  @discardableResult func mergeSidecar(_ remote: JSONValue) -> Bool {
    guard let merged = SharedSidecar.merge(local: data["sidecar"], remote: remote, now: now()) else {
      return false
    }
    data["sidecar"] = merged
    save()
    return true
  }
  /// This phone's binding for the F27 snapshot it published in the same pass.
  func setOwnSidecar(_ entry: JSONValue, deviceId: String) {
    guard let clean = SharedSidecar.entry(entry, now: now()),
      clean.canonical() != (data["sidecar"]?["devices"]?[deviceId] ?? .null).canonical()
    else { return }
    var sidecar = data["sidecar"] ?? .object([("devices", .object([]))])
    var devices = sidecar["devices"] ?? .object([])
    devices[deviceId] = clean
    sidecar["devices"] = devices
    data["sidecar"] = sidecar
    save()
  }
  /// The `shared` payload to PUT, or nil to hold publication (`exportSidecar`).
  func exportSidecar(deviceId: String) -> JSONValue? {
    SharedSidecar.export(data["sidecar"], ownId: deviceId, now: now())
  }
}
