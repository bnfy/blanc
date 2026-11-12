import Foundation
import UIKit

final class SessionStore {
    private(set) var urls: [String] = []
    private(set) var activeIndex: Int = 0
    /// Groups, Spaces and the shown set (M17, `version: 2`). nil for a file
    /// written before M17, whose `urls` are This iPhone's tabs.
    private(set) var state: SessionState?

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
        if (dict["version"] as? Int) == 2, let raw = dict["state"],
           let data = try? JSONSerialization.data(withJSONObject: raw) {
            state = try? JSONDecoder().decode(SessionState.self, from: data)
        }
    }

    /// `urls` and `activeIndex` are always the shown set's, so a build from
    /// before M17 still opens the tabs that were showing.
    func save(urls: [String], activeIndex: Int, state: SessionState? = nil) {
        self.urls = urls
        self.activeIndex = activeIndex
        self.state = state
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
        var dict: [String: Any] = ["urls": urls, "activeIndex": activeIndex]
        if let state, let data = try? JSONEncoder().encode(state),
           let raw = try? JSONSerialization.jsonObject(with: data) {
            dict["version"] = 2
            dict["state"] = raw
        }
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]) else { return }
        // `.atomic` creates session.json on first run and replaces it thereafter.
        try? data.write(to: fileURL, options: .atomic)
    }
}
