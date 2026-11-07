import Foundation

/// Split View (F53) on iOS: two tabs side by side, kept as one item. Only
/// shown in the unfolded layout (the iPhone Duo's inner display, an iPad);
/// elsewhere the focused pane fills the screen and the split comes back when
/// there is room again (D30). The focused pane is always the active tab.
struct TabSplit: Equatable, Identifiable {
    var id: String
    /// The panes, leading first.
    var tabIds: [UUID]
    /// The leading pane's share of the width.
    var ratio: Double
}

/// What session.json keeps of a split: the tabs are a `splitIds` column
/// parallel to the saved set's tabs, as desktop's session does.
struct SavedSplit: Codable, Equatable {
    var id: String
    var ratio: Double
}

/// The pure rules, a port of desktop's `src/main/split-model.js` (two panes,
/// the "columns" layout only).
enum SplitModel {
    static let maxPanes = 2
    /// Desktop's MIN_COLUMN_SHARE: the narrowest a pane gets.
    static let minShare = 0.2

    static func newId() -> String { "split-\(UUID().uuidString.lowercased())" }

    static func clampRatio(_ ratio: Double) -> Double {
        ratio.isFinite ? min(max(ratio, minShare), 1 - minShare) : 0.5
    }

    /// A new split led by `initiator`, its panes equal.
    static func create(initiator: UUID, other: UUID) -> TabSplit {
        TabSplit(id: newId(), tabIds: [initiator, other], ratio: 0.5)
    }

    /// The split without `tabId`. With one tab left it dissolves: `split` is
    /// nil and `dissolved` names the tab that becomes ordinary again.
    static func remove(_ split: TabSplit, tabId: UUID) -> (split: TabSplit?, dissolved: [UUID]) {
        guard split.tabIds.contains(tabId) else { return (split, []) }
        let rest = split.tabIds.filter { $0 != tabId }
        if rest.count < 2 { return (nil, rest) }
        var next = split
        next.tabIds = rest
        return (next, [])
    }

    static func split(for tabId: UUID?, in splits: [TabSplit]) -> TabSplit? {
        guard let tabId else { return nil }
        return splits.first { $0.tabIds.contains(tabId) }
    }

    /// Each split's members contiguous, in its pane order, where its first
    /// member in `order` sits. Idempotent.
    static func normalizeOrder(_ order: [UUID], splits: [TabSplit]) -> [UUID] {
        var out = order
        for split in splits {
            let members = split.tabIds.filter(out.contains)
            guard members.count >= 2, let at = out.firstIndex(where: members.contains) else { continue }
            let insertAt = out[..<at].filter { !members.contains($0) }.count
            out.removeAll(where: members.contains)
            out.insert(contentsOf: members, at: insertAt)
        }
        return out
    }

    /// The `splits` and `splitIds` columns for the tabs being saved. A split
    /// with fewer than two saved members (a private one) is saved as plain tabs.
    static func capture(_ splits: [TabSplit], saved: [UUID]) -> (splits: [SavedSplit], splitIds: [String?]) {
        let kept = Set(saved)
        var out: [SavedSplit] = []
        var idOf: [UUID: String] = [:]
        for split in splits {
            let members = split.tabIds.filter(kept.contains)
            guard members.count >= 2 else { continue }
            out.append(SavedSplit(id: split.id, ratio: clampRatio(split.ratio)))
            for id in members { idOf[id] = split.id }
        }
        return (out, saved.map { idOf[$0] })
    }

    /// Splits rebuilt after restore. `restored` is parallel to `splitIds`; a
    /// split with fewer than two restored members, or more than two, is
    /// dropped. A `splitIds` column that doesn't line up restores nothing.
    static func restore(_ saved: [SavedSplit]?, splitIds: [String?]?, restored: [UUID]) -> [TabSplit] {
        guard let saved, let splitIds, splitIds.count == restored.count else { return [] }
        var members: [String: [UUID]] = [:]
        for (splitId, tabId) in zip(splitIds, restored) {
            if let splitId, !splitId.isEmpty { members[splitId, default: []].append(tabId) }
        }
        var seen = Set<String>()
        return saved.compactMap { split in
            guard seen.insert(split.id).inserted, let tabIds = members[split.id],
                  (2...maxPanes).contains(tabIds.count) else { return nil }
            return TabSplit(id: split.id, tabIds: tabIds, ratio: clampRatio(split.ratio))
        }
    }

    /// The two panes' widths in `width`, `gap` between them.
    static func paneWidths(_ ratio: Double, width: CGFloat, gap: CGFloat) -> (leading: CGFloat, trailing: CGFloat) {
        let usable = max(width - gap, 0)
        let leading = (usable * CGFloat(clampRatio(ratio))).rounded()
        return (leading, usable - leading)
    }
}
