import Foundation

/// A tab put away: what comes back when its set is shown again (M17). Never
/// page state, and never a private tab.
struct SavedTab: Codable, Equatable {
    var url: String
    var title: String
    var pinned = false
    var groupId: String?
    /// The shared record's id while the tab is in a shared Space (M17c).
    var tabId: String?
}

/// One set of tabs: This iPhone or a Space.
struct SavedSet: Codable, Equatable {
    var tabs: [SavedTab] = []
    var groups: [TabGroup] = []
    var activeIndex = 0
}

/// A Space on this phone. Local unless it has a `sharedId` (M17c).
struct SpaceRecord: Codable, Equatable, Identifiable {
    enum Link: String, Codable { case active, dormant }
    var id: String
    var name: String
    var color: String
    var symbol: String
    var set = SavedSet()
    var sharedId: String?
    var link: Link?
    /// Set on a "{Space} · kept on this iPhone" Space; such a Space doesn't
    /// count toward the 25.
    var recoveredFrom: String?
}

/// A deleted Space, kept for 7 days in Recently deleted.
struct DeletedSpace: Codable, Equatable {
    var space: SpaceRecord
    var deletedAt: Int64
    var index: Int
}

/// Everything about the phone's sets beyond the shown tabs (session.json v2).
struct SessionState: Codable, Equatable {
    /// "iphone" or a Space id.
    var shown = TabSets.iphoneId
    var iphone = SavedSet()
    var spaces: [SpaceRecord] = []
    var deleted: [DeletedSpace] = []
}

enum TabSets {
    static let iphoneId = "iphone"
    static let spaceLimit = 25
    static let nameLimit = 60
    static let deletedRetentionMs: Int64 = 7 * 86_400_000

    /// A Space name: trimmed and capped at 60 UTF-16 units; nil when empty.
    static func spaceName(_ raw: String) -> String? {
        let units = Array(SyncCrypto.trim(raw).utf16.prefix(nameLimit))
        return units.isEmpty ? nil : String(decoding: units, as: UTF16.self)
    }
}

enum SpaceError: Error, Equatable { case limit, emptyName, invalid }
