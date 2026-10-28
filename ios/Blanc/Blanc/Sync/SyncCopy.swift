import Foundation

/// Read the very same generated catalog used by the bundled pages.
enum SyncCopy {
  private static let messages: [String: String] = {
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
  }()
  static func text(_ key: String) -> String { messages[key] ?? key }
  /// A catalog message with its `{name}` placeholders filled (the simple
  /// arguments the sends.* strings use).
  static func text(_ key: String, _ params: [String: String]) -> String {
    params.reduce(text(key)) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
  }
  /// A catalog message with one `{count, plural, one {…} other {…}}` part,
  /// `#` inside it replaced by the count, then `{name}` placeholders filled.
  static func plural(_ key: String, count: Int, _ params: [String: String] = [:]) -> String {
    format(text(key), count: count, locale: BlancPageResolver.resolvedLocale(preferred: Locale.preferredLanguages), params)
  }
  static func format(_ message: String, count: Int, locale: String, _ params: [String: String] = [:]) -> String {
    var out = message
    if let start = out.range(of: "{count, plural,") {
      var depth = 0, end = start.lowerBound
      for index in out[start.lowerBound...].indices {
        if out[index] == "{" { depth += 1 } else if out[index] == "}" { depth -= 1; if depth == 0 { end = index; break } }
      }
      let body = String(out[start.upperBound..<end])
      // French and Brazilian Portuguese use "one" for 0 and 1; the others for 1.
      let wantsOne = count == 1 || (count == 0 && (locale.hasPrefix("fr") || locale == "pt-BR"))
      let chosen = branch(body, wantsOne ? "one" : "other") ?? branch(body, "other") ?? ""
      out.replaceSubrange(start.lowerBound...end, with: chosen.replacingOccurrences(of: "#", with: String(count)))
    }
    return params.reduce(out) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
  }
  private static func branch(_ body: String, _ name: String) -> String? {
    guard let marker = body.range(of: name + " {") else { return nil }
    var depth = 1, index = marker.upperBound
    while index < body.endIndex {
      if body[index] == "{" { depth += 1 } else if body[index] == "}" { depth -= 1; if depth == 0 { break } }
      index = body.index(after: index)
    }
    return String(body[marker.upperBound..<index])
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
