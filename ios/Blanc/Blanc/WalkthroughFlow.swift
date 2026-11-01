import Foundation

/// The first-minute walkthrough's steps (M18 §3.2): a card over the start page
/// that leads with pairing. Pure, so every path is tested.
enum WalkthroughStep: Equatable {
    case welcome, pair, arrived, shareBack, privacy, defaultBrowser
}

struct WalkthroughFlow: Equatable {
    /// Bumped when a later release adds steps (§3.3); M18 ships 1.
    static let version = 1

    private(set) var current: WalkthroughStep?
    private let offerDefaultBrowser: Bool
    private var isDefaultBrowser: Bool?
    /// Whether the privacy choice has been saved by this run of the card.
    private(set) var privacySaved = false

    /// `nil` `current` means the card isn't shown. A phone already paired
    /// skips pairing and starts at Share back; one that has seen this
    /// version of the walkthrough sees nothing.
    init(paired: Bool, completedVersion: Int, offerDefaultBrowser: Bool, isDefaultBrowser: Bool?) {
        self.offerDefaultBrowser = offerDefaultBrowser
        self.isDefaultBrowser = isDefaultBrowser
        current = completedVersion >= Self.version ? nil : (paired ? .shareBack : .welcome)
    }

    /// Settings → Show the welcome again.
    static func replay(paired: Bool, offerDefaultBrowser: Bool, isDefaultBrowser: Bool?) -> WalkthroughFlow {
        WalkthroughFlow(paired: paired, completedVersion: 0, offerDefaultBrowser: offerDefaultBrowser, isDefaultBrowser: isDefaultBrowser)
    }

    mutating func pairWithBlanc() { if current == .welcome { current = .pair } }

    mutating func browseWithoutPairing() { if current == .welcome { current = .privacy } }

    /// The phone joined a sync: from the Pair step, or from a pairing link
    /// confirmed while the card showed any step.
    mutating func joined() { if current != nil { current = .arrived } }

    mutating func next() {
        switch current {
        case .arrived: current = .shareBack
        case .shareBack: current = .privacy
        case .privacy:
            privacySaved = true
            current = showsDefaultBrowser ? .defaultBrowser : nil
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

    private var showsDefaultBrowser: Bool { offerDefaultBrowser && isDefaultBrowser != true }
}
