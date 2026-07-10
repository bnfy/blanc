import Foundation
import UIKit

final class SessionStore {
    private(set) var urls: [String] = []
    private(set) var activeIndex: Int = 0

    private let fileURL: URL
    private var saveWork: DispatchWorkItem?
    private var backgroundObserver: Any?

    init(directory: URL? = nil) {
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.fileURL = dir.appendingPathComponent("session.json")
        load()
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.flush()
        }
    }

    deinit {
        if let obs = backgroundObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let u = dict["urls"] as? [String] { urls = u }
        if let i = dict["activeIndex"] as? Int { activeIndex = i }
    }

    func save(urls: [String], activeIndex: Int) {
        self.urls = urls
        self.activeIndex = activeIndex
        scheduleSave()
    }

    func flush() {
        saveWork?.cancel()
        saveWork = nil
        write()
    }

    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.write() }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
    }

    private func write() {
        guard !urls.isEmpty else { return }
        let dict: [String: Any] = ["urls": urls, "activeIndex": activeIndex]
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]) else { return }
        // `.atomic` creates session.json on first run and replaces it thereafter.
        try? data.write(to: fileURL, options: .atomic)
    }
}
