import XCTest
@testable import Blanc

/// M18 §5: the default-browser check behind the offer.
@MainActor final class DefaultBrowserStatusTests: XCTestCase {
    private struct Refused: Error {}

    private func defaults() -> UserDefaults {
        let name = "DefaultBrowserStatusTests-\(UUID().uuidString)"
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: name) }
        return UserDefaults(suiteName: name)!
    }

    func testAnErrorWithNoAnswerYetReadsAsUnknown() {
        let status = DefaultBrowserStatus(check: { throw Refused() }, defaults: defaults())
        status.refresh()
        XCTAssertNil(status.isDefault)
    }

    /// Apple rate-limits the check: a refusal never turns "Blanc" into "Not Blanc".
    func testARefusedCheckKeepsTheLastAnswer() {
        var refused = false
        let status = DefaultBrowserStatus(check: { if refused { throw Refused() }; return true }, defaults: defaults())
        status.refresh()
        refused = true
        status.refresh()
        XCTAssertEqual(status.isDefault, true)
    }

    /// Each screen makes its own status, so the answer has to outlive one.
    func testTheLastAnswerReachesTheNextScreen() {
        let store = defaults()
        DefaultBrowserStatus(check: { true }, defaults: store).refresh()
        XCTAssertEqual(DefaultBrowserStatus(check: { throw Refused() }, defaults: store).isDefault, true)
    }

    func testAnswerIsKept() {
        let status = DefaultBrowserStatus(check: { true }, defaults: defaults())
        XCTAssertNil(status.isDefault, "nothing asked until a screen needs it")
        status.refresh()
        XCTAssertEqual(status.isDefault, true)
    }

    func testEachRefreshAsksOnce() {
        var calls = 0
        let status = DefaultBrowserStatus(check: { calls += 1; return false }, defaults: defaults())
        status.refresh()
        status.refresh()
        XCTAssertEqual(calls, 2)
    }

    func testTheOfferOpensDefaultApps() {
        XCTAssertNotNil(DefaultBrowserOffer.settingsURL)
    }
}
