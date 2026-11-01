import XCTest
@testable import Blanc

/// M18 §5: the default-browser check and the offer that waits for Apple.
@MainActor final class DefaultBrowserStatusTests: XCTestCase {
    private struct Refused: Error {}

    func testAnErrorReadsAsUnknown() {
        let status = DefaultBrowserStatus(check: { throw Refused() })
        status.refresh()
        XCTAssertNil(status.isDefault)
    }

    func testAnswerIsKept() {
        let status = DefaultBrowserStatus(check: { true })
        XCTAssertNil(status.isDefault, "nothing asked until a screen needs it")
        status.refresh()
        XCTAssertEqual(status.isDefault, true)
    }

    func testEachRefreshAsksOnce() {
        var calls = 0
        let status = DefaultBrowserStatus(check: { calls += 1; return false })
        status.refresh()
        status.refresh()
        XCTAssertEqual(calls, 2)
    }

    func testTheOfferWaitsForTheEntitlement() {
        XCTAssertFalse(DefaultBrowserOffer.enabled, "turned on only with com.apple.developer.web-browser")
        XCTAssertNotNil(DefaultBrowserOffer.settingsURL)
    }
}
