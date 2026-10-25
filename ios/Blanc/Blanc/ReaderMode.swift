import Foundation
import Observation
import SwiftUI
import WebKit
import UIKit

enum ReaderCopy {
    static func text(_ key: String) -> String {
        let locale = BlancPageResolver.resolvedLocale(preferred: Locale.preferredLanguages)
        return catalogs[locale]?[key] ?? catalogs["en"]?[key] ?? key
    }
    private static let catalogs: [String: [String: String]] = {
        guard let url = Bundle.main.url(forResource: "reader-copy.generated", withExtension: "json", subdirectory: "pages"),
              let data = try? Data(contentsOf: url),
              let result = try? JSONDecoder().decode([String: [String: String]].self, from: data) else { return [:] }
        return result
    }()
}

struct ReaderAppearance: Codable, Equatable {
    var theme = "system"
    var font = "serif"
    var size = 20
    var width = "comfortable"

    init(_ value: [String: Any] = [:]) {
        if let v = value["theme"] as? String, ["system", "light", "dark", "sepia"].contains(v) { theme = v }
        if let v = value["font"] as? String, ["serif", "sans", "inter", "mono"].contains(v) { font = v }
        if let v = value["size"] as? NSNumber, CFGetTypeID(v) != CFBooleanGetTypeID(),
           v.doubleValue == Double(v.intValue), (16...28).contains(v.intValue), v.intValue % 2 == 0 { size = v.intValue }
        if let v = value["width"] as? String, ["narrow", "comfortable", "wide"].contains(v) { width = v }
    }
    var payload: [String: Any] { ["theme": theme, "font": font, "size": size, "width": width] }
}

final class ReaderPreferences {
    private let file: URL
    private var normal = ReaderAppearance()
    private var privateValue: ReaderAppearance?
    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        file = root.appendingPathComponent("reader-appearance.json")
        if let data = try? Data(contentsOf: file),
           let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { normal = ReaderAppearance(value) }
    }
    func value(isPrivate: Bool) -> ReaderAppearance { isPrivate ? privateValue ?? normal : normal }
    func set(_ value: ReaderAppearance, isPrivate: Bool) {
        if isPrivate { privateValue = value; return }
        normal = value
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(value) { try? data.write(to: file, options: .atomic) }
    }
    func clearPrivate() { privateValue = nil }
}

@MainActor
final class ReaderController: NSObject, WKURLSchemeHandler, WKScriptMessageHandlerWithReply, WKNavigationDelegate, UIGestureRecognizerDelegate {
    private(set) var webView: WKWebView!
    private let token = UUID().uuidString.lowercased()
    private var article: [String: Any]
    private var images: [String: Data] = [:]
    private let sourceURL: URL
    private var appearance: ReaderAppearance
    private let saveAppearance: (ReaderAppearance) -> Void
    private let onExit: () -> Void
    private let openLink: (URL, String) -> Void
    private var closed = false
    private let backSwipe = UIScreenEdgePanGestureRecognizer()

    init(article: [String: Any], sourceURL: URL, appearance: ReaderAppearance,
         saveAppearance: @escaping (ReaderAppearance) -> Void,
         onExit: @escaping () -> Void, openLink: @escaping (URL, String) -> Void) {
        var content = article
        let rawImages = content.removeValue(forKey: "imageData") as? [String: String] ?? [:]
        self.article = content
        self.sourceURL = sourceURL
        self.appearance = appearance
        self.saveAppearance = saveAppearance
        self.onExit = onExit
        self.openLink = openLink
        super.init()
        var total = 0
        for (key, value) in rawImages.prefix(30) {
            guard key.range(of: "^(0|[1-9][0-9]?)$", options: .regularExpression) != nil,
                  value.hasPrefix("data:image/png;base64,"), value.count <= 5_000_000,
                  let bytes = Data(base64Encoded: String(value.dropFirst(22))),
                  let image = UIImage(data: bytes), image.size.width * image.size.height <= 4_000_000,
                  let png = image.pngData(), png.count <= 5_000_000, total + png.count <= 20_000_000 else { continue }
            images[key] = png
            total += png.count
        }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(self, forURLScheme: "blanc-reader")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "reader")
        config.userContentController.addUserScript(WKUserScript(source: """
        if (location.protocol === 'blanc-reader:' && location.host === '\(token)') {
          const call = (action, value) => window.webkit.messageHandlers.reader.postMessage({action, value});
          window.readerAPI = Object.freeze({ initialize: () => call('initialize'), exit: () => call('exit'),
            appearance: value => call('appearance', value), openLink: (url, disposition) => call('openLink', {url, disposition}) });
        }
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        backSwipe.name = "blanc.reader.back"
        backSwipe.edges = webView.effectiveUserInterfaceLayoutDirection == .rightToLeft ? .right : .left
        backSwipe.addTarget(self, action: #selector(handleBackSwipe(_:)))
        backSwipe.delegate = self
        webView.addGestureRecognizer(backSwipe)
        webView.scrollView.panGestureRecognizer.require(toFail: backSwipe)
        webView.load(URLRequest(url: URL(string: "blanc-reader://\(token)/")!))
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === backSwipe, !closed else { return false }
        let velocity = backSwipe.velocity(in: webView)
        let direction: CGFloat = backSwipe.edges == .right ? -1 : 1
        return velocity.x * direction > 0 && abs(velocity.x) > abs(velocity.y)
    }

    @objc private func handleBackSwipe(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended else { return }
        completeBackSwipe(translation: gesture.translation(in: webView), velocity: gesture.velocity(in: webView))
    }

    // Shared completion path for the real edge gesture and deterministic tests.
    func completeBackSwipe(translation: CGPoint, velocity: CGPoint) {
        guard !closed else { return }
        let direction: CGFloat = backSwipe.edges == .right ? -1 : 1
        let distance = translation.x * direction
        if distance >= max(44, webView.bounds.width * 0.15) || (distance > 0 && velocity.x * direction > 600) {
            onExit()
        }
    }

    func dispose() {
        guard !closed else { return }
        closed = true
        article = [:]; images = [:]
        webView.stopLoading()
        webView.removeGestureRecognizer(backSwipe)
        backSwipe.delegate = nil
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "reader", contentWorld: .page)
        webView.navigationDelegate = nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard !closed, message.webView === webView, message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.scheme == "blanc-reader", message.frameInfo.request.url?.host == token,
              message.frameInfo.request.url?.path == "/", message.frameInfo.request.url?.query == nil,
              let body = message.body as? [String: Any], let action = body["action"] as? String else {
            replyHandler(nil, "unavailable"); return
        }
        switch action {
        case "initialize": replyHandler(["article": article, "sourceUrl": sourceURL.absoluteString, "appearance": appearance.payload], nil)
        case "exit": replyHandler(NSNull(), nil); onExit()
        case "appearance":
            appearance = ReaderAppearance(body["value"] as? [String: Any] ?? [:])
            saveAppearance(appearance)
            replyHandler(appearance.payload, nil)
        case "openLink":
            if let value = body["value"] as? [String: Any], let raw = value["url"] as? String,
               raw.count <= 8192, let url = URL(string: raw), Self.isWebURL(url),
               let disposition = value["disposition"] as? String,
               ["current-tab", "background-tab", "foreground-tab", "new-window"].contains(disposition) {
                openLink(url, disposition)
            }
            replyHandler(NSNull(), nil)
        default: replyHandler(nil, "unavailable")
        }
    }

    static func isWebURL(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.host != nil && url.user == nil && url.password == nil
    }
    static func script(_ name: String) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "pages") else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "blanc-reader", url.host == token, url.path == "/" {
            decisionHandler(.allow); return
        }
        decisionHandler(.cancel)
        if Self.isWebURL(url) { openLink(url, navigationAction.targetFrame == nil ? "foreground-tab" : "current-tab") }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { onExit() }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard !closed, let url = urlSchemeTask.request.url, url.host == token, url.user == nil, url.password == nil,
              url.port == nil, url.query == nil else {
            urlSchemeTask.didFailWithError(URLError(.unsupportedURL)); return
        }
        let name = url.path == "/" ? "reader.html" : String(url.path.dropFirst())
        let files = ["reader.html": "reader.html", "reader.js": "reader.js", "reader.css": "reader.css",
                     "reader-content.js": "reader-content.js", "purify.js": "reader-purify.generated.js",
                     "instrument.woff2": "instrument-sans-latin-wdth-normal.woff2", "serif.woff2": "source-serif-4-regular.woff2",
                     "inter.woff2": "inter-latin.woff2", "mono.woff2": "jetbrains-mono-latin.woff2",
                     "i18n.js": "i18n.js"]
        var data: Data?
        var mime = "application/octet-stream"
        if name.hasPrefix("image/") {
            data = images[String(name.dropFirst(6))]; mime = "image/png"
        } else if name == "strings.js" {
            let filename = BlancPageResolver.stringsFilename(preferred: Locale.preferredLanguages)
            if let file = Bundle.main.resourceURL?.appendingPathComponent("pages/" + filename),
               let text = try? String(contentsOf: file, encoding: .utf8) {
                data = (text + BlancPageResolver.stringsSuffix(locale: BlancPageResolver.resolvedLocale(preferred: Locale.preferredLanguages), region: Locale.current.region?.identifier)).data(using: .utf8)
                mime = "text/javascript"
            }
        } else if let filename = files[name], let file = Bundle.main.resourceURL?.appendingPathComponent("pages/" + filename) {
            data = try? Data(contentsOf: file)
            mime = BlancPageResolver.mimeType(forFilename: filename)
        }
        guard let data else { urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return }
        urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: mime.hasPrefix("text/") ? "utf-8" : nil))
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

struct ReaderWebView: UIViewRepresentable {
    let reader: ReaderController
    func makeUIView(context: Context) -> WKWebView { reader.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

extension TabModel {
    func exitReader() {
        readerGeneration += 1
        reader?.dispose()
        reader = nil
    }

    func probeReader() {
        guard readerAllowed, ReaderController.isWebURL(currentURL), !isLoading, reader == nil else { readerAvailable = false; return }
        let generation = readerGeneration
        let url = currentURL
        Task { @MainActor [weak self] in
            guard let self, let script = ReaderController.script("reader-probe.generated") else { return }
            for retry in 0...1 {
                if retry == 1 { try? await Task.sleep(for: .milliseconds(2500)) }
                guard readerGeneration == generation, currentURL == url, !isLoading, reader == nil else { return }
                let result = try? await webView.evaluateJavaScript(script, in: nil, contentWorld: .world(name: "blanc-reader-extraction"))
                guard readerGeneration == generation, currentURL == url else { return }
                readerAvailable = result as? Bool == true
                if readerAvailable { return }
            }
        }
    }
}
