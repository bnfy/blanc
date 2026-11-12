import Foundation
import Observation

/// The phone's own Recently closed (design §11): pages closed here — by the
/// person, or because another device closed them (`fromId` names it) —
/// http(s) only, never private, 24 hours and 25 items, newest first. Kept on
/// this iPhone; with the Spaces switch on, the same closes also go out in the
/// phone's synced `closed` entry (SyncEngine).
@Observable final class RecentlyClosedStore {
    static let maxItems = SyncedClosed.maxItems
    static let ttlMs = Int64(SyncedClosed.itemTTL)
    private(set) var rows: [ClosedRow] = []
    /// Windows that closed with tabs of their own, each one entry (multiple
    /// windows design §4). Kept on this device; their pages still reach
    /// other devices one by one, through sync.
    private(set) var windows: [ClosedWindow] = []
    @ObservationIgnored private let file: URL?
    @ObservationIgnored private let windowsFile: URL?
    @ObservationIgnored private let now: () -> Int64

    init(directory: URL?, now: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        file = directory?.appendingPathComponent("recently-closed.json")
        windowsFile = directory?.appendingPathComponent("recently-closed-windows.json")
        self.now = now
        if let file, let data = try? Data(contentsOf: file),
           let saved = try? JSONDecoder().decode([ClosedRow].self, from: data) {
            rows = saved
        }
        if let windowsFile, let data = try? Data(contentsOf: windowsFile),
           let saved = try? JSONDecoder().decode([ClosedWindow].self, from: data) {
            windows = saved
        }
        prune()
    }

    /// Rows still within 24 hours.
    var current: [ClosedRow] {
        let cutoff = now() - Self.ttlMs
        return rows.filter { $0.closedAt > cutoff }
    }

    func add(_ row: ClosedRow) {
        guard SharedSpacesAdapter.isHTTP(row.url) else { return }
        rows.removeAll { $0.id == row.id }
        rows.insert(row, at: 0)
        rows.sort { $0.closedAt > $1.closedAt }
        prune()
        save()
    }
    func remove(_ id: String) {
        guard rows.contains(where: { $0.id == id }) else { return }
        rows.removeAll { $0.id == id }
        save()
    }
    func clear() {
        rows = []
        windows = []
        save()
    }

    /// Closed windows still within 24 hours, newest first.
    var currentWindows: [ClosedWindow] {
        let cutoff = now() - Self.ttlMs
        return windows.filter { $0.closedAt > cutoff }
    }
    func addWindow(_ window: ClosedWindow) {
        windows.removeAll { $0.id == window.id }
        windows.insert(window, at: 0)
        prune()
        save()
    }
    func removeWindow(_ id: String) {
        guard windows.contains(where: { $0.id == id }) else { return }
        windows.removeAll { $0.id == id }
        save()
    }

    private func prune() {
        let cutoff = now() - Self.ttlMs
        rows = Array(rows.filter { $0.closedAt > cutoff }.prefix(Self.maxItems))
        windows = Array(windows.filter { $0.closedAt > cutoff }.prefix(Self.maxItems))
    }
    private func save() {
        guard let file else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(rows).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        if let windowsFile {
            try? JSONEncoder().encode(windows).write(to: windowsFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }
}

/// A closed window's web pages, reopened together in a window of their own.
struct ClosedWindow: Identifiable, Equatable, Codable {
    let id: String
    let closedAt: Int64
    let tabs: [SavedTab]
}
