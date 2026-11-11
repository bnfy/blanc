import UIKit
import WebKit

/// Downloads (F11, D3). A file WebKit can't show in a tab, or one a page
/// offers to save, is fetched to a folder of its own in the app's temporary
/// directory and handed to iOS's share sheet, which has Save to Files,
/// AirDrop and the apps that open it. Blanc keeps no copy afterwards and,
/// for now, no list of what was downloaded.
final class PageDownloads: NSObject, WKDownloadDelegate {
    /// What a download is doing, for the notice over the Island.
    var onNotice: ((String) -> Void)?
    /// Running downloads, kept alive here: WebKit holds its delegate weakly.
    private var downloads: [ObjectIdentifier: WKDownload] = [:]
    private var files: [ObjectIdentifier: URL] = [:]
    /// Finished while Blanc was in the background, offered when it's back.
    private var waiting: [URL] = []
    private var activeObserver: Any?

    override init() {
        super.init()
        activeObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.offerWaiting() }
        }
    }

    deinit {
        if let activeObserver { NotificationCenter.default.removeObserver(activeObserver) }
    }

    /// Whether a response is saved rather than shown: one the page itself
    /// loads that WebKit can't draw, or that its server marks as an
    /// attachment. A frame inside a page never starts a download on its own.
    static func isDownload(showable: Bool, mainFrame: Bool, disposition: String?) -> Bool {
        guard mainFrame else { return false }
        if !showable { return true }
        return disposition?.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("attachment") == true
    }

    /// The server's name for the file as one safe path component.
    static func fileName(_ suggested: String) -> String {
        let unsafe = CharacterSet(charactersIn: "/\\:").union(.controlCharacters)
        let name = suggested.components(separatedBy: unsafe).joined(separator: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: ". ").union(.whitespacesAndNewlines))
        return name.isEmpty ? "download" : String(name.prefix(200))
    }

    func begin(_ download: WKDownload) {
        download.delegate = self
        downloads[ObjectIdentifier(download)] = download
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let name = Self.fileName(suggestedFilename)
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("downloads", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            // No destination cancels the download.
            finished(download)
            completionHandler(nil)
            return
        }
        let file = folder.appendingPathComponent(name)
        files[ObjectIdentifier(download)] = file
        onNotice?(SyncCopy.text("downloads.progressLabel", ["file": name]))
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = finished(download) else { return }
        waiting.append(file)
        offerWaiting()
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard let file = finished(download) else { return }
        Self.discard(file)
        let error = error as NSError
        if error.domain == NSURLErrorDomain, error.code == NSURLErrorCancelled { return }
        onNotice?(SyncCopy.text("ios.downloads.failed", ["file": file.lastPathComponent]))
    }

    @discardableResult
    private func finished(_ download: WKDownload) -> URL? {
        let id = ObjectIdentifier(download)
        downloads[id] = nil
        return files.removeValue(forKey: id)
    }

    /// One sheet at a time; the next file is offered when the sheet closes.
    private func offerWaiting() {
        guard !waiting.isEmpty, let presenter = Self.presenter(),
              !(presenter is UIActivityViewController) else { return }
        let file = waiting.removeFirst()
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { [weak self] _, _, _, _ in
            Self.discard(file)
            self?.offerWaiting()
        }
        // An iPad shows it as a popover, which has to point somewhere.
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        presenter.present(sheet, animated: true)
    }

    /// The top of what the front window shows.
    private static func presenter() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }),
              var presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return nil }
        while let presented = presenter.presentedViewController {
            if presented.isBeingDismissed { return nil }
            presenter = presented
        }
        return presenter
    }

    /// Removes a download's file with the folder made for it.
    private static func discard(_ file: URL) {
        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
    }
}
