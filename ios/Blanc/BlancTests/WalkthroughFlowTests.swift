import XCTest
@testable import Blanc

/// M18 §3.2–§3.3: every path through the first-minute card.
final class WalkthroughFlowTests: XCTestCase {
    private func flow(paired: Bool = false, completed: Int = 0, offer: Bool = false, isDefault: Bool? = nil) -> WalkthroughFlow {
        WalkthroughFlow(paired: paired, completedVersion: completed, offerDefaultBrowser: offer, isDefaultBrowser: isDefault)
    }
    private func walk(_ f: inout WalkthroughFlow, _ moves: [(inout WalkthroughFlow) -> Void]) -> [WalkthroughStep?] {
        var seen: [WalkthroughStep?] = [f.current]
        for move in moves { move(&f); seen.append(f.current) }
        return seen
    }

    func testFreshInstallStartsAtWelcome() { XCTAssertEqual(flow().current, .welcome) }

    func testSeenThisVersionShowsNothing() { XCTAssertNil(flow(completed: WalkthroughFlow.version).current) }

    func testPairedPhoneStartsAtShareBack() { XCTAssertEqual(flow(paired: true).current, .shareBack) }

    func testPairPath() {
        var f = flow()
        let seen = walk(&f, [{ $0.pairWithBlanc() }, { $0.joined() }, { $0.next() }, { $0.next() }, { $0.next() }])
        XCTAssertEqual(seen, [.welcome, .pair, .arrived, .shareBack, .privacy, nil])
        XCTAssertTrue(f.privacySaved)
    }

    func testBrowseWithoutPairingGoesToPrivacy() {
        var f = flow()
        let seen = walk(&f, [{ $0.browseWithoutPairing() }, { $0.next() }])
        XCTAssertEqual(seen, [.welcome, .privacy, nil])
    }

    func testDefaultBrowserFollowsPrivacyWhenOffered() {
        for isDefault in [false, nil] as [Bool?] {
            var f = flow(offer: true, isDefault: isDefault)
            let seen = walk(&f, [{ $0.browseWithoutPairing() }, { $0.next() }, { $0.next() }])
            XCTAssertEqual(seen, [.welcome, .privacy, .defaultBrowser, nil], "\(String(describing: isDefault))")
        }
    }

    func testDefaultBrowserSkippedWhenBlancIsDefault() {
        var f = flow(offer: true, isDefault: true)
        let seen = walk(&f, [{ $0.browseWithoutPairing() }, { $0.next() }])
        XCTAssertEqual(seen, [.welcome, .privacy, nil])
    }

    func testDefaultBrowserSkippedWhileTheOfferIsHidden() {
        var f = flow(offer: false, isDefault: false)
        let seen = walk(&f, [{ $0.browseWithoutPairing() }, { $0.next() }])
        XCTAssertEqual(seen, [.welcome, .privacy, nil])
    }

    func testClosingBeforePrivacySavesTheShownValue() {
        for moves in [[], [{ $0.pairWithBlanc() }], [{ $0.pairWithBlanc() }, { $0.joined() }],
                      [{ $0.pairWithBlanc() }, { $0.joined() }, { $0.next() }]] as [[(inout WalkthroughFlow) -> Void]] {
            var f = flow()
            _ = walk(&f, moves)
            XCTAssertTrue(f.close())
            XCTAssertNil(f.current)
        }
    }

    func testClosingAfterPrivacySavesNothingMore() {
        var f = flow(offer: true, isDefault: false)
        _ = walk(&f, [{ $0.browseWithoutPairing() }, { $0.next() }])
        XCTAssertEqual(f.current, .defaultBrowser)
        XCTAssertFalse(f.close())
    }

    func testPairLinkMidFlowLandsOnArrived() {
        var f = flow(paired: true)
        f.joined()
        XCTAssertEqual(f.current, .arrived)
        var closed = flow(completed: WalkthroughFlow.version)
        closed.joined()
        XCTAssertNil(closed.current, "no card, no step")
    }

    func testReplayStartsOverForThePairingState() {
        XCTAssertEqual(WalkthroughFlow.replay(paired: false, offerDefaultBrowser: false, isDefaultBrowser: nil).current, .welcome)
        XCTAssertEqual(WalkthroughFlow.replay(paired: true, offerDefaultBrowser: false, isDefaultBrowser: nil).current, .shareBack)
    }

    func testBecomingDefaultMidFlowSkipsTheStep() {
        var f = flow(offer: true, isDefault: false)
        f.browseWithoutPairing()
        f.defaultBrowserChanged(true)
        f.next()
        XCTAssertNil(f.current)
    }
}
