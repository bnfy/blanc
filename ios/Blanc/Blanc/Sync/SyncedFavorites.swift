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
