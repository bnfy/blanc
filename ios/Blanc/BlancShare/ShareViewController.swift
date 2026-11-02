import UIKit
import UniformTypeIdentifiers

/// Blanc in the share sheet (M18 design §8): reads the shared link or text,
/// opens Blanc with it through a `blanc-share:` link, and closes. It shows
/// nothing, fetches nothing and keeps nothing; the app checks what arrives
/// (`SharedLink.fromShareURL`) and opens it through `IncomingLinks`.
final class ShareViewController: UIViewController {
    private var handedOff = false

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !handedOff else { return }
        handedOff = true
        Task { await handOff() }
    }

    private func handOff() async {
        var urls: [URL] = []
        var texts: [String] = []
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        for provider in items.flatMap({ $0.attachments ?? [] }) {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                urls.append(url)
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                      let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                texts.append(text)
            }
        }
        if SharedLink.url(fromItems: urls, texts: texts) != nil,
           let share = SharedLink.shareURL(items: urls, texts: texts) {
            openInBlanc(share)
        }
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// A share extension has no API to open its app. The responder chain
    /// reaches the host's UIApplication, whose open method an extension may
    /// not call directly, so it is called by selector (design §8 (b), the
    /// owner's choice on October 30, 2026; App Review risk accepted).
    private func openInBlanc(_ url: URL) {
        typealias Open = @convention(c) (NSObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let next = responder {
            if next is UIApplication, next.responds(to: selector) {
                let open = unsafeBitCast(next.method(for: selector), to: Open.self)
                open(next, selector, url as NSURL, NSDictionary(), nil)
                return
            }
            responder = next.next
        }
    }
}
