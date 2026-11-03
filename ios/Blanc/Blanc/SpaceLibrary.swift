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

    /// What's saved: the library, with each window's shown set in its place.
    /// `shown` is the front window's set, as an older build reads it.
    func state(shown: String, windows: [(id: String, shown: String, set: SavedSet)]) -> SessionState {
        var state = SessionState(shown: shown, iphone: iphoneSet, spaces: spaces, deleted: recentlyDeleted,
                                 sharedBaselines: sharedBaselines.isEmpty ? nil : sharedBaselines,
                                 sharedAccepted: sharedAccepted.isEmpty ? nil : sharedAccepted,
                                 sharedAccount: sharedAccount,
                                 recoveryNoted: recoveryNoted.isEmpty ? nil : recoveryNoted.sorted())
        for window in windows {
            if window.shown == TabSets.iphoneId { state.iphone = window.set }
            else if let index = state.spaces.firstIndex(where: { $0.id == window.shown }) { state.spaces[index].set = window.set }
        }
        state.windows = windows.map { SavedWindow(id: $0.id, shown: $0.shown) }
        return state
    }
}

/// A window in the saved session: which set it showed (W2). Older builds
/// ignore the list and open `shown`, the front window's.
struct SavedWindow: Codable, Equatable {
    var id: String
    var shown: String
}
