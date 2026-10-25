import Foundation

#if DEBUG
/// UI tests only (never in release builds): start from a known local state.
/// `-BlancUITestSends`: the same local cache a sync pull leaves, with one other
/// device ("MacBook Pro") that sent two pages to this phone, and no key, so
/// nothing reaches the network and a send fails fast.
/// `-BlancUITestFavorites`: sync off and no Favorites, so the heart starts empty.
/// Both start with one tab on example.com.
enum UITestSeed {
  static var sends: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSends") }
  static var favorites: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestFavorites") }
  static let pageURL = URL(string: "https://example.com/")!

  static func seedSends(into directory: URL) {
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    let state = #"{"enabled":true,"handle":"UI test","accountId":"\#(String(repeating: "c", count: 64))","deviceId":"phone-test","syncTabs":false}"#
    let sends = """
      {"devices":{"mac":{"name":"MacBook Pro","platform":"darwin","updatedAt":\(now),"items":[\
      {"id":"s1","to":"phone-test","url":"https://example.org/one","title":"Sent page one","sentAt":\(now - 240_000)},\
      {"id":"s2","to":"phone-test","url":"https://example.org/two","title":"Sent page two","sentAt":\(now - 10_800_000)}]}},\
      "dismissed":{}}
      """
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
    try? Data(sends.utf8).write(to: directory.appendingPathComponent("sync-sends.json"))
  }

  static func seedFavorites(into directory: URL) {
    let state = #"{"enabled":false,"deviceId":"phone-test","syncTabs":false}"#
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
    try? FileManager.default.removeItem(at: directory.appendingPathComponent("sync-favorites.json"))
  }
}
#endif
