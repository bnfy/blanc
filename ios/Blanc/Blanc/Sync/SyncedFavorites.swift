import Foundation

nonisolated struct Favorite: Equatable, Sendable {
  let id: String
  let url: String
  let title: String
  let favicon: String?
  let folder: String?
  let addedAt: Double
  let updatedAt: Double
  init(
    id: String, url: String, title: String, favicon: String?, folder: String?, addedAt: Double = 0,
    updatedAt: Double = 0
  ) {
    self.id = id
    self.url = url
    self.title = title
    self.favicon = favicon
    self.folder = folder
    self.addedAt = addedAt
    self.updatedAt = updatedAt
  }
}
nonisolated enum SyncedFavorites {
  static func merge(
    local: JSONValue, remote: JSONValue, now: Double = Date().timeIntervalSince1970 * 1000
  ) -> JSONValue {
    var items: [String: JSONValue] = [:]
    var order: [String] = []
    func clock(_ i: JSONValue) -> Double { i["updatedAt"]?.number ?? i["addedAt"]?.number ?? 0 }
    for item in local["items"]?.array ?? [] {
      if let url = item["url"]?.string {
        if items[url] == nil { order.append(url) }
        items[url] = item
      }
    }
    for raw in remote["items"]?.array ?? [] {
      guard let url = raw["url"]?.string else { continue }
      let added = raw["addedAt"]?.number ?? 0
      let updated = raw["updatedAt"]?.number ?? added
      let folder = raw["folder"]?.string.map(SyncCrypto.trim)
      let title = raw["title"]?.string ?? ""
      let item: JSONValue = .object([
        ("id", .string(raw["id"]?.string ?? url)), ("url", .string(url)),
        ("title", .string(title.isEmpty ? url : title)),
        ("favicon", SyncedIcons.valid(raw["favicon"]?.string).map(JSONValue.string) ?? .null),
        ("addedAt", .number(added)), ("updatedAt", .number(updated)),
        (
          "folder",
          folder.flatMap { !$0.isEmpty && $0.utf16.count <= 100 ? .string($0) : nil } ?? .null
        ),
      ])
      if items[url] == nil {
        order.append(url)
        items[url] = item
      } else if updated > clock(items[url] ?? .null) {
        items[url] = item
      }
    }
    var tomb: [String: JSONValue] = [:]
    var tombOrder: [String] = []
    for t in (local["tombstones"]?.array ?? []) + (remote["tombstones"]?.array ?? []) {
      guard let url = t["url"]?.string, let at = t["deletedAt"]?.number, at.isFinite else {
        continue
      }
      if tomb[url] == nil {
        tombOrder.append(url)
        tomb[url] = t
      } else if at > (tomb[url]?["deletedAt"]?.number ?? 0) {
        tomb[url] = t
      }
    }
    for (url, t) in tomb {
      if let item = items[url], clock(item) <= (t["deletedAt"]?.number ?? 0) { items[url] = nil }
    }
    var result = order.compactMap { items[$0] }.enumerated().sorted { a, b in
      let ac = a.element["addedAt"]?.number ?? 0
      let bc = b.element["addedAt"]?.number ?? 0
      return ac == bc ? a.offset < b.offset : ac < bc
    }.map(\.element)
    // Desktop chooses the spelling on the oldest item, breaking equal ages by id.
    var folderNames: [String: JSONValue] = [:]
    for item in result {
      if let folder = item["folder"]?.string {
        let key = folder.lowercased()
        let old = folderNames[key]
        let at = item["addedAt"]?.number ?? 0
        let oldAt = old?["addedAt"]?.number ?? 0
        if old == nil || at < oldAt
          || (at == oldAt && utf16Less(item["id"]?.string ?? "", old?["id"]?.string ?? ""))
        {
          folderNames[key] = item
        }
      }
    }
    for i in result.indices {
      if let folder = result[i]["folder"]?.string {
        result[i]["folder"] = folderNames[folder.lowercased()]?["folder"]
      }
    }
    let retained = tombOrder.compactMap { url -> JSONValue? in
      guard let t = tomb[url], let deleted = t["deletedAt"]?.number,
        deleted >= now - 90 * 24 * 60 * 60 * 1000
      else { return nil }
      if let item = items[url], clock(item) > (t["deletedAt"]?.number ?? 0) { return nil }
      return t
    }
    return .object([("items", .array(result)), ("tombstones", .array(retained))])
  }
  // Local edits, matching bookmarks.js and bookmark-data.js: each returns the
  // store unchanged when nothing changes, and stamps updatedAt on what it touches.
  static func isFavorite(_ store: JSONValue, url: String) -> Bool {
    (store["items"]?.array ?? []).contains { $0["url"]?.string == url }
  }
  static func toggle(
    _ store: JSONValue, url: String, title: String, favicon: String?, now: Double,
    makeId: () -> String
  ) -> (store: JSONValue, favorited: Bool) {
    var next = store
    let items = store["items"]?.array ?? []
    var tombstones = store["tombstones"]?.array ?? []
    if isFavorite(store, url: url) {
      next["items"] = .array(items.filter { $0["url"]?.string != url })
      tombstones.append(.object([("url", .string(url)), ("deletedAt", .number(now))]))
      next["tombstones"] = .array(tombstones)
      return (next, false)
    }
    let item: JSONValue = .object([
      ("id", .string(makeId())), ("url", .string(url)),
      ("title", .string(title.isEmpty ? url : title)),
      ("favicon", SyncedIcons.valid(favicon).map(JSONValue.string) ?? .null),
      ("addedAt", .number(now)), ("updatedAt", .number(now)), ("folder", .null),
    ])
    next["items"] = .array(items + [item])
    next["tombstones"] = .array(tombstones.filter { $0["url"]?.string != url })
    return (next, true)
  }
  static func remove(_ store: JSONValue, id: String, now: Double) -> JSONValue {
    let items = store["items"]?.array ?? []
    guard let item = items.first(where: { $0["id"]?.string == id }),
      let url = item["url"]?.string
    else { return store }
    var next = store
    next["items"] = .array(items.filter { $0["id"]?.string != id })
    next["tombstones"] = .array(
      (store["tombstones"]?.array ?? [])
        + [.object([("url", .string(url)), ("deletedAt", .number(now))])])
    return next
  }
  static func setFolder(_ store: JSONValue, id: String, folder: String?, now: Double) -> JSONValue
  {
    var items = store["items"]?.array ?? []
    guard let index = items.firstIndex(where: { $0["id"]?.string == id }) else { return store }
    var target: String?
    if let folder {
      // An invalid name is refused, never treated as ungrouping.
      guard let valid = validFolder(folder) else { return store }
      target = canonicalFolders(items)[folderKey(valid)] ?? valid
    }
    guard items[index]["folder"]?.string != target else { return store }
    items[index]["folder"] = target.map(JSONValue.string) ?? .null
    items[index]["updatedAt"] = .number(now)
    var next = store
    next["items"] = .array(items)
    return next
  }
  static func renameFolder(_ store: JSONValue, from: String, to: String, now: Double) -> JSONValue {
    guard let valid = validFolder(to) else { return store }
    let items = store["items"]?.array ?? []
    let oldKey = folderKey(from)
    // A case-only rename takes the new spelling; otherwise join an existing folder.
    let target =
      folderKey(to) == oldKey ? valid : (canonicalFolders(items)[folderKey(valid)] ?? valid)
    return restamp(store, now: now) { folder in
      folderKey(folder) == oldKey && folder != target ? .string(target) : nil
    }
  }
  static func removeFolder(_ store: JSONValue, name: String, now: Double) -> JSONValue {
    let key = folderKey(name)
    return restamp(store, now: now) { folderKey($0) == key ? .null : nil }
  }
  private static func restamp(
    _ store: JSONValue, now: Double, _ change: (String) -> JSONValue?
  ) -> JSONValue {
    var changed = false
    let items = (store["items"]?.array ?? []).map { item -> JSONValue in
      guard let folder = item["folder"]?.string, let value = change(folder) else { return item }
      changed = true
      var next = item
      next["folder"] = value
      next["updatedAt"] = .number(now)
      return next
    }
    guard changed else { return store }
    var next = store
    next["items"] = .array(items)
    return next
  }
  private static func validFolder(_ name: String) -> String? {
    let trimmed = SyncCrypto.trim(name)
    return (1...100).contains(trimmed.utf16.count) ? trimmed : nil
  }
  private static func folderKey(_ name: String) -> String {
    SyncCrypto.lowercaseLikeJavaScript(SyncCrypto.trim(name))
  }
  /// Each folder's spelling, taken from its oldest item (ties: the smaller id).
  private static func canonicalFolders(_ items: [JSONValue]) -> [String: String] {
    var best: [String: (folder: String, addedAt: Double, id: String)] = [:]
    for item in items {
      guard let folder = item["folder"]?.string else { continue }
      let key = folderKey(folder)
      let addedAt = item["addedAt"]?.number ?? 0
      let id = item["id"]?.string ?? ""
      if let cur = best[key],
        !(addedAt < cur.addedAt || (addedAt == cur.addedAt && utf16Less(id, cur.id)))
      {
        continue
      }
      best[key] = (folder, addedAt, id)
    }
    return best.mapValues(\.folder)
  }
  static func list(_ store: JSONValue) -> [Favorite] {
    (store["items"]?.array ?? []).compactMap { i in
      guard let id = i["id"]?.string, let url = i["url"]?.string else { return nil }
      return Favorite(
        id: id, url: url, title: i["title"]?.string ?? url,
        favicon: SyncedIcons.valid(i["favicon"]?.string), folder: i["folder"]?.string,
        addedAt: i["addedAt"]?.number ?? 0,
        updatedAt: i["updatedAt"]?.number ?? i["addedAt"]?.number ?? 0)
    }
  }
}
