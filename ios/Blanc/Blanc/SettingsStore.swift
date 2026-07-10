import Foundation
import Observation
import SwiftUI
import UIKit

func resolvedTheme(preference: BlancThemePreference, systemScheme: ColorScheme) -> BlancTheme {
    switch preference {
    case .system: return systemScheme == .dark ? .dark : .light
    case .light: return .light
    case .dark: return .dark
    }
}

@Observable
final class SettingsStore {
    private(set) var theme: BlancThemePreference = BlancSettingsDefaults.theme
    private(set) var searchEngine: BlancSearchEngine = BlancSettingsDefaults.searchEngine
    private(set) var adblockEnabled: Bool = BlancSettingsDefaults.adblockEnabled

    @ObservationIgnored private let fileURL: URL
    @ObservationIgnored private var unknownKeys: [String: Any] = [:]
    @ObservationIgnored private var saveWork: DispatchWorkItem?
    @ObservationIgnored private var backgroundObserver: Any?

    init(directory: URL? = nil) {
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.fileURL = dir.appendingPathComponent("settings.json")
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

    /// The single mutation path. Applies whichever fields are non-nil and
    /// schedules the debounced save — so no caller can change a setting
    /// without persisting it. Properties stay `private(set)` so SwiftUI can
    /// still observe reads.
    func update(theme: BlancThemePreference? = nil,
                searchEngine: BlancSearchEngine? = nil,
                adblockEnabled: Bool? = nil) {
        if let theme { self.theme = theme }
        if let searchEngine { self.searchEngine = searchEngine }
        if let adblockEnabled { self.adblockEnabled = adblockEnabled }
        scheduleSave()
    }

    func flush() {
        saveWork?.cancel()
        saveWork = nil
        save()
    }

    #if DEBUG
    var testFileURL: URL { fileURL }
    #endif

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        if let raw = dict["theme"] as? String, let v = BlancThemePreference(rawValue: raw) {
            theme = v
        }
        if let raw = dict["searchEngine"] as? String, let v = BlancSearchEngine(rawValue: raw) {
            searchEngine = v
        }
        if let v = dict["adblockEnabled"] as? Bool {
            adblockEnabled = v
        }

        let knownKeys: Set<String> = ["theme", "searchEngine", "adblockEnabled"]
        for (key, value) in dict where !knownKeys.contains(key) {
            unknownKeys[key] = value
        }
    }

    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.save() }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
    }

    private func save() {
        var dict: [String: Any] = unknownKeys
        dict["theme"] = theme.rawValue
        dict["searchEngine"] = searchEngine.rawValue
        dict["adblockEnabled"] = adblockEnabled

        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]) else { return }
        // `.atomic` writes to a sibling temp file and renames it into place —
        // creating settings.json on first run and replacing it thereafter.
        // (A hand-rolled replaceItemAt throws when the file doesn't exist yet.)
        try? data.write(to: fileURL, options: .atomic)
    }
}
