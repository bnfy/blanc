import WebKit

/// A focused page gets a shortcut before Blanc does (D7, the desktop's rule).
/// iPadOS hands key commands to the app first, so Blanc offers the key to the
/// page as a keydown: a page that cancels it, as a web app with its own ⌘F
/// does, keeps it. Anything else runs Blanc's command, including a page that
/// doesn't answer in time. ⌘F is the exception iPadOS makes: with a page
/// focused the system's Find takes it before any app command.
enum PageKeys {
    static let answerTimeout: Duration = .milliseconds(150)

    /// True when the focused page cancels the key. Goes into frames the page
    /// can reach, where editors such as Google Docs take their keys.
    static func script(key: String, shift: Bool, option: Bool) -> String {
        let options = #"{key: \#(jsString(key)), metaKey: true, shiftKey: \#(shift), altKey: \#(option), bubbles: true, cancelable: true, composed: true}"#
        return """
        (() => {
          if (!document.hasFocus()) return false;
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
        tab.webView.evaluateJavaScript(script(key: key, shift: shift, option: option), in: nil, in: .page) { result in
            answer((try? result.get()) as? Bool == true)
        }
        Task { @MainActor in
            try? await Task.sleep(for: answerTimeout)
            answer(false)
        }
    }
}
