import Foundation

#if DEBUG
/// UI tests only (`-BlancUITestFavorites`, never in release builds): start from
/// a known local state. Sync off and no Favorites, with one tab on example.com,
/// so the heart starts empty and nothing reaches the network.
enum UITestSeed {
  static var favorites: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestFavorites") }
  static let pageURL = URL(string: "https://example.com/")!

  static func seedFavorites(into directory: URL) {
    let state = #"{"enabled":false,"deviceId":"phone-test","syncTabs":false}"#
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? Data(state.utf8).write(to: directory.appendingPathComponent("sync.json"))
    try? FileManager.default.removeItem(at: directory.appendingPathComponent("sync-favorites.json"))
  }
}
#endif
