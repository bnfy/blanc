import Foundation

#if DEBUG
/// UI tests only (`-BlancUITestSends`, never in release builds): start from a
/// known Send to device state, the same local cache a sync pull leaves. One
/// other device ("MacBook Pro") with two pages sent to this phone, and no key,
/// so nothing reaches the network and a send fails fast.
enum UITestSeed {
  static var sends: Bool { ProcessInfo.processInfo.arguments.contains("-BlancUITestSends") }
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
}
#endif
