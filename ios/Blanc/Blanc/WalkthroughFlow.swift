import Foundation

/// The first-minute walkthrough's steps (M18 §3.2): a card over the start page
/// that leads with pairing. Pure, so every path is tested.
enum WalkthroughStep: Equatable {
    case welcome, pair, arrived, shareBack, privacy, defaultBrowser
}

struct WalkthroughFlow: Equatable {
    /// Bumped when a later release adds steps (§3.3). M18 shipped 1; 2 added
    /// Search suggestions to the privacy step.
    static let version = 2

    private(set) var current: WalkthroughStep?
    private var isDefaultBrowser: Bool?
    /// Whether the privacy choice has been saved by this run of the card.
    private(set) var privacySaved = false
    /// A phone that saw an earlier version is shown only what is new (§3.3):
    /// the privacy step, and nothing after it.
    private var onlyNewSteps = false

    /// `nil` `current` means the card isn't shown. A phone already paired
    /// skips pairing and starts at Share back; one that has seen this
    /// version of the walkthrough sees nothing, and one that saw an earlier
    /// version sees the privacy step alone.
    init(paired: Bool, completedVersion: Int, isDefaultBrowser: Bool?) {
        self.isDefaultBrowser = isDefaultBrowser
        if completedVersion >= Self.version {
            current = nil
        } else if completedVersion >= 1 {
            current = .privacy
            onlyNewSteps = true
        } else {
            current = paired ? .shareBack : .welcome
        }
    }

    /// Settings → Show the welcome again.
    static func replay(paired: Bool, isDefaultBrowser: Bool?) -> WalkthroughFlow {
        WalkthroughFlow(paired: paired, completedVersion: 0, isDefaultBrowser: isDefaultBrowser)
    }

    mutating func pairWithBlanc() { if current == .welcome { current = .pair } }

    mutating func browseWithoutPairing() { if current == .welcome { current = .privacy } }

    /// The phone joined a sync: from the Pair step, or from a pairing link
    /// confirmed while the card showed any step.
    mutating func joined() {
        guard current != nil else { return }
        current = .arrived
        // A phone that pairs now gets the rest of the card, as a new one does.
        onlyNewSteps = false
    }

    mutating func next() {
        switch current {
        case .arrived: current = .shareBack
        case .shareBack: current = .privacy
        case .privacy:
            privacySaved = true
            current = showsDefaultBrowser && !onlyNewSteps ? .defaultBrowser : nil
        case .defaultBrowser: current = nil
        case .welcome, .pair, nil: break
        }
    }

    /// What iOS answered about the default browser; the step is skipped once
    /// Blanc is the default.
    mutating func defaultBrowserChanged(_ isDefault: Bool?) { isDefaultBrowser = isDefault }

    /// Closes the card. Returns true when the privacy choice still has to be
    /// saved with the value on screen (§3.2: closing never loses it).
    mutating func close() -> Bool {
        defer { current = nil }
        return current != nil && !privacySaved
    }

    private var showsDefaultBrowser: Bool { isDefaultBrowser != true }
}
