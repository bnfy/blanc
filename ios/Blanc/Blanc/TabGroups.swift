import Foundation

/// A tab group (F3): a name kept in the case typed, an optional colour (one
/// of the eight Space presets, or none) and whether it is folded. A group
/// exists only while it holds tabs.
struct TabGroup: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var color: String?
    var collapsed = false

    /// A fresh id in the protocol's form: 32 lowercase hex characters.
    static func newId() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }
}

/// Group names keep the case typed and compare without regard to it, as
/// desktop's `src/main/group-name-case.js`.
enum GroupNames {
    static let maxLength = 40

    /// A storable name: trimmed and capped at 40 UTF-16 units, case kept.
    static func normalize(_ raw: String) -> String {
        let trimmed = Array(SyncCrypto.trim(raw).utf16)
        return String(decoding: trimmed.prefix(maxLength), as: UTF16.self)
    }

    /// Two names with the same key name the same group.
    static func key(_ name: String) -> String {
        SyncCrypto.lowercaseLikeJavaScript(normalize(name))
    }

    static func same(_ a: String, _ b: String) -> Bool { key(a) == key(b) }
}
