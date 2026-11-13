import Foundation
import Observation

/// The device's tab sets, shared by every window (multiple windows design
/// §3.1–3.2, W2): This iPhone's saved tabs, the Spaces and Recently deleted,
/// and the Shared Spaces bookkeeping. A window shows one set at a time and
/// keeps that set's live tabs itself; the copy here is stale while it shows.
@Observable final class SpaceLibrary {
    var iphoneSet = SavedSet()
    var spaces: [SpaceRecord] = []
    var recentlyDeleted: [DeletedSpace] = []
    /// Recovery Spaces whose one-time note has been shown.
    var recoveryNoted: Set<String> = []
    /// M17c, by shared Space id: each shared set's displayed baseline and the
    /// remote changes that wait for its selected tab.
    @ObservationIgnored var sharedBaselines: [String: JSONValue] = [:]
    @ObservationIgnored var sharedAccepted: [String: JSONValue] = [:]
    /// The sync account the shared links belong to.
    @ObservationIgnored var sharedAccount: String?
    /// Whether a saved session has been read into the library yet: the first
    /// window to start reads it, later windows share what it read.
    @ObservationIgnored private(set) var loaded = false

    /// Nothing was saved (a first launch): the library starts empty, read.
    func markLoaded() { loaded = true }

    /// Reads the saved sets, dropping Recently deleted entries past their 7 days.
    func load(_ state: SessionState, now: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        iphoneSet = state.iphone
        spaces = state.spaces
        sharedBaselines = state.sharedBaselines ?? [:]
        sharedAccepted = state.sharedAccepted ?? [:]
        sharedAccount = state.sharedAccount
        recoveryNoted = Set(state.recoveryNoted ?? [])
        recentlyDeleted = state.deleted.filter { now - $0.deletedAt < TabSets.deletedRetentionMs }
        loaded = true
    }

    /// Puts a window's live tabs back into the set it shows, so the library
    /// is current before a save. A window's unsaved set lives in its entry.
    func store(_ set: SavedSet, for setId: String) {
        if setId == TabSets.iphoneId { iphoneSet = set }
        else if let index = spaces.firstIndex(where: { $0.id == setId }) { spaces[index].set = set }
    }

    /// What's saved. `shown` is the front window's set, as an older build
    /// reads it.
    func state(shown: String, windows: [SavedWindow]) -> SessionState {
        SessionState(shown: shown, iphone: iphoneSet, spaces: spaces, deleted: recentlyDeleted,
                     sharedBaselines: sharedBaselines.isEmpty ? nil : sharedBaselines,
                     sharedAccepted: sharedAccepted.isEmpty ? nil : sharedAccepted,
                     sharedAccount: sharedAccount,
                     recoveryNoted: recoveryNoted.isEmpty ? nil : recoveryNoted.sorted(),
                     windows: windows)
    }
}

/// A window in the saved session: which set it showed (W2). Older builds
/// ignore the list and open `shown`, the front window's.
struct SavedWindow: Codable, Equatable {
    var id: String
    var shown: String
    /// The window's own tabs when it shows no saved set: a new window starts
    /// with an unsaved set until it switches to a Space.
    var set: SavedSet?
    /// The window's `UISceneSession.persistentIdentifier`, so a window iPadOS
    /// discards can be found again (W2b).
    var session: String?

    static func unsavedSetId(_ windowId: String) -> String { "window:" + windowId }
    var showsUnsavedSet: Bool { shown == Self.unsavedSetId(id) }
}
