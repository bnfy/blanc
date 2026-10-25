import Foundation

/// Read the very same generated catalog used by the bundled pages.
enum SyncCopy {
  private static var messages: [String: String] {
    let locale = BlancPageResolver.resolvedLocale(preferred: Locale.preferredLanguages)
    guard
      let url = Bundle.main.url(
        forResource: "strings.\(locale)", withExtension: "js", subdirectory: "pages"),
      let source = try? String(contentsOf: url, encoding: .utf8),
      let start = source.range(of: "{\"locale\":"),
      // The file ends `…"fallback":{}});`: the object closes on the `}` before
      // `);`, so cut at `);`, not `});`, or the last brace is lost.
      let end = source.range(of: ");", options: .backwards),
      let data = source[start.lowerBound..<end.lowerBound].data(using: .utf8),
      let catalog = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let result = catalog["messages"] as? [String: String]
    else { return [:] }
    return result
  }
  static func text(_ key: String) -> String { messages[key] ?? key }
  /// A catalog message with its `{name}` placeholders filled (the simple
  /// arguments the sends.* strings use).
  static func text(_ key: String, _ params: [String: String]) -> String {
    params.reduce(text(key)) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
  }
  /// What the sender is told after a send (M7b §6): "Sent", never "delivered".
  static func sendResult(_ result: SyncEngine.SendResult, device: String) -> String {
    switch result {
    case .sent: text("sends.sent", ["device": device])
    case .unavailable: text("sends.unavailable")
    case .failed, .invalid: text("sends.failed")
    }
  }
  static func error(_ code: String) -> String {
    let keys = [
      "bad-passphrase": "sync.error.badPassphrase", "pair-not-found": "sync.error.pairNotFound",
      "pair-unavailable": "sync.error.pairUnavailable", "pair-invalid": "sync.error.pairInvalid",
      "rate-limited": "sync.error.rateLimited", "offline": "sync.error.offline",
      "server": "sync.error.server", "server-error": "sync.error.serverError",
      "sync-on": "sync.error.syncOn", "sync-off": "sync.error.off",
      "credentials-save-failed": "sync.error.credentialsSave",
      "create-on-computer": "settings.sync.createOnComputer",
      "wipe-unsupported": "settings.sync.createOnComputer",
      "account-gone": "sync.error.accountGone",
    ]
    return text(keys[code] ?? "sync.error.server")
  }
}
