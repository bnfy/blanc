import WebKit

/// A focused page gets a shortcut before Blanc does (D7, the desktop's rule).
/// iPadOS hands key commands to the app first, so Blanc offers the key to the
/// page as a keydown: a page that cancels it, as a web app with its own ⌘F
/// does, keeps it. Anything else runs Blanc's command, including a page that
/// doesn't answer in time. A busy page that gets to the key after that never
/// sees it, so one press can't do both. ⌘F is the exception iPadOS makes: with
/// a page focused the system's Find takes it before any app command.
enum PageKeys {
    /// Milliseconds to wait: short enough that a shortcut on a busy page still
    /// feels immediate.
    static let answerWindow: Int64 = 80

    /// True when the focused page cancels the key. Goes into frames the page
    /// can reach, where editors such as Google Docs take their keys. `deadline`
    /// is when Blanc stops waiting, in the page's milliseconds since 1970.
    static func script(key: String, shift: Bool, option: Bool, deadline: Int64) -> String {
        let options = #"{key: \#(jsString(key)), metaKey: true, shiftKey: \#(shift), altKey: \#(option), bubbles: true, cancelable: true, composed: true}"#
        return """
        (() => {
          if (Date.now() > \(deadline) || !document.hasFocus()) return false;
          let target = document.activeElement || document.body;
          while (target && target.contentDocument && target.contentDocument.activeElement) {
            target = target.contentDocument.activeElement;
          }
          return !!target && !target.dispatchEvent(new KeyboardEvent('keydown', \(options)));
        })()
        """
    }

    private static func jsString(_ text: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [text])
        let array = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(array.dropFirst().dropLast())
    }

    /// Runs `command` unless the page keeps the key. Blanc's own pages have
    /// no shortcuts of their own, and a sleeping tab has no page to ask.
    @MainActor static func offer(_ key: String, shift: Bool, option: Bool, to tab: TabModel?, command: @escaping () -> Void) {
        guard let tab, tab.hasWebView, !tab.isQuiet, ["http", "https"].contains(tab.currentURL.scheme ?? "") else {
            command()
            return
        }
        var answered = false
        func answer(_ pageKeptIt: Bool) {
            guard !answered else { return }
            answered = true
            if !pageKeptIt { command() }
        }
        let deadline = Int64(Date().timeIntervalSince1970 * 1000) + answerWindow
        tab.webView.evaluateJavaScript(script(key: key, shift: shift, option: option, deadline: deadline), in: nil, in: .page) { result in
            answer((try? result.get()) as? Bool == true)
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(answerWindow))
            answer(false)
        }
    }
}
