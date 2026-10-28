import CryptoKit
import Foundation

/// Turning "Keep Spaces and groups in sync on this iPhone" on: which of the
/// phone's Spaces can join the library and how (desktop's `planSharing` in
/// `src/main/shared-spaces-sharing.js`, M16 §4.6). Pure: `TabsManager` applies
/// a plan to its Spaces and the Spaces state.
enum SharedSpacesSharing {
  typealias Model = SharedSpacesModel

  enum Mode: String, Equatable { case rejoin, copy }
  enum Reason: String, Equatable { case tabs, full }
  enum PlanError: Error, Equatable { case limit, notFound, deleted, tooLarge }

  /// One Space the switch-on sheet lists.
  struct Row: Identifiable, Equatable {
    let id: String
    let name: String
    let color: String
    let symbol: String
    let tabCount: Int
    /// A dormant copy whose library Space is still live: Rejoin is offered.
    let canRejoin: Bool
    /// Why it can't be shared as a copy (too many tabs, or too large).
    let reason: Reason?
    /// Already in the library and syncing.
    let shared: Bool
  }

  /// One Space as it joins the library.
  struct Item {
    let spaceId: String
    let sharedId: String
    let mode: Mode
    /// The new library blob and its field writes (copies only).
    var blob: JSONValue?
    var edits: JSONValue?
    /// Record ids parallel to the Space's tabs, and local group id → record id.
    var tabIds: [String?] = []
    var groupIds: [String: String] = [:]
    var indexEntry: JSONValue?
  }

  /// Live (not deleted) Spaces in a merged index.
  static func liveCount(_ index: JSONValue?) -> Int {
    (Model.sanitizeIndex(index)?["spaces"]?.pairs ?? []).filter { !Model.deleted($0.1) }.count
  }
  static func isLive(_ index: JSONValue?, _ sharedId: String?) -> Bool {
    guard let sharedId, let record = Model.sanitizeIndex(index)?["spaces"]?[sharedId] else { return false }
    return !Model.deleted(record)
  }

  /// The sheet's rows: every Space but recovery copies, in the phone's order.
  static func rows(spaces: [SpaceRecord], index: JSONValue?, deviceId: String, now: Int64) -> [Row] {
    spaces.filter { $0.recoveredFrom == nil }.map { (space: SpaceRecord) -> Row in
      let shared = space.sharedId != nil && space.link == .active
      let rejoin = space.link == .dormant && isLive(index, space.sharedId)
      var reason: Reason?
      if !shared && !rejoin {
        let made = copyBlob(space, sharedId: Model.isId(space.id) ? space.id : SharedSpacesAdapter.freshId(),
                            deviceId: deviceId, now: now)
        reason = fitReason(made.baseline)
      }
      return Row(
        id: space.id, name: space.name, color: space.color, symbol: space.symbol,
        tabCount: space.set.tabs.count, canRejoin: rejoin, reason: reason, shared: shared)
    }
  }

  /// Too many tabs, or an encrypted blob over the Worker's gate (M16 §5).
  static func fitReason(_ blob: JSONValue) -> Reason? {
    if Model.liveTabCount(blob) > Model.limits.tabsPerSpace { return .tabs }
    let key = SymmetricKey(size: .bits256)
    let fits = Model.blobFits(blob, encrypt: { (text: String) throws -> SyncEnvelope in
      try SyncCrypto.seal(Data(text.utf8), key: key)
    })
    return fits ? nil : .full
  }

  /// A Space as a new library Space: fresh record ids for every tab and
  /// group, every field clocked `now` (the one moment a whole Space is stamped).
  static func copyBlob(_ space: SpaceRecord, sharedId: String, deviceId: String, now: Int64,
    newId: () -> String = SharedSpacesAdapter.freshId) -> SharedSpacesAdapter.LocalEdits
  {
    var set = space.set
    var placeholders: [String: String] = [:]
    for (n, group) in set.groups.enumerated() {
      let local = "local-group-\(n)"
      placeholders[group.id] = local
      set.groups[n].id = local
    }
    for n in set.tabs.indices {
      set.tabs[n].tabId = nil
      set.tabs[n].groupId = set.tabs[n].groupId.flatMap { placeholders[$0] }
    }
    var result = SharedSpacesAdapter.localEdits(
      set: set, spaceId: sharedId, baseline: nil, accepted: nil, deviceId: deviceId, now: now, newId: newId)
    var bindings: [String: String] = [:]
    for (original, local) in placeholders { if let bound = result.groupIds[local] { bindings[original] = bound } }
    result.groupIds = bindings
    return result
  }

  /// The items for `choices` (local Space id → mode), or why not.
  static func plan(
    spaces: [SpaceRecord], choices: [(id: String, mode: Mode)], index: JSONValue?, deviceId: String, now: Int64,
    newId: () -> String = SharedSpacesAdapter.freshId
  ) -> Result<[Item], PlanError> {
    let copies = choices.filter { $0.mode == .copy }.count
    if copies > 0, liveCount(index) + copies > Model.limits.spaces { return .failure(.limit) }
    let library = Model.sanitizeIndex(index)?["spaces"] ?? .object([])
    var left =
      Model.orderOf(library).compactMap { (id: String) -> String? in
        guard let record = library[id], !Model.deleted(record) else { return nil }
        return record["pos"]?["v"]?.string
      }.last ?? ""
    var items: [Item] = []
    var seen = Set<String>()
    for choice in choices {
      guard let space = spaces.first(where: { $0.id == choice.id }), seen.insert(choice.id).inserted else {
        return .failure(.notFound)
      }
      if choice.mode == .rejoin {
        guard let sid = space.sharedId, isLive(index, sid) else { return .failure(.deleted) }
        items.append(Item(spaceId: space.id, sharedId: sid, mode: .rejoin))
        continue
      }
      var sharedId = newId()
      while !Model.isId(sharedId) || library[sharedId] != nil { sharedId = SharedSpacesAdapter.freshId() }
      let made = copyBlob(space, sharedId: sharedId, deviceId: deviceId, now: now, newId: newId)
      if fitReason(made.baseline) != nil { return .failure(.tooLarge) }
      let pos = (try? Model.keyFor(left, "", sharedId)) ?? ""
      left = pos
      func field(_ v: JSONValue) -> JSONValue { Model.field(v, now, deviceId) }
      let entry: JSONValue = .object([
        ("name", field(.string(space.name))), ("color", field(.string(space.color))),
        ("symbol", field(.string(space.symbol))), ("pos", field(.string(pos))), ("deleted", field(.bool(false))),
        ("createdAt", .number(Double(now))), ("createdBy", .string(deviceId)),
      ])
      items.append(
        Item(
          spaceId: space.id, sharedId: sharedId, mode: .copy, blob: made.baseline, edits: made.edits,
          tabIds: made.tabIds, groupIds: made.groupIds, indexEntry: entry))
    }
    return .success(items)
  }
}
