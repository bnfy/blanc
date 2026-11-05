import CryptoKit
import Foundation

/// Each tab's Back and Forward list, so they survive a relaunch. WebKit's
/// `interactionState` can hold page state, so it lives apart from the session
/// and `SavedTab`, which holds only its id: its own folder on this device, kept
/// out of backups. Never holds a private tab.
final class TabHistoryStore {
    /// A list this large is more page state than history; such a tab restores
    /// its address only.
    static let maxBytes = 1_000_000

    private let folder: URL

    init(directory: URL? = nil) {
        let parent = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        folder = parent.appendingPathComponent("tab-history", isDirectory: true)
    }

    func save(_ state: Data, id: String) {
        guard state.count <= Self.maxBytes else { return remove(id) }
        prepareFolder()
        try? state.write(to: file(for: id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func state(id: String) -> Data? {
        try? Data(contentsOf: file(for: id))
    }

    func remove(_ id: String) {
        try? FileManager.default.removeItem(at: file(for: id))
    }

    /// Drops the lists of tabs that are gone, so a closed tab's history doesn't
    /// stay on the device.
    func keepOnly(_ ids: Set<String>) {
        let kept = Set(ids.map { file(for: $0).lastPathComponent })
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        for file in files where !kept.contains(file.lastPathComponent) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    func removeAll() {
        try? FileManager.default.removeItem(at: folder)
    }

    /// Hashed so an id read from a saved session can't name a path.
    private func file(for id: String) -> URL {
        let name = SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appendingPathComponent(name)
    }

    private func prepareFolder() {
        guard !FileManager.default.fileExists(atPath: folder.path) else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var marked = folder
        try? marked.setResourceValues(values)
    }
}
