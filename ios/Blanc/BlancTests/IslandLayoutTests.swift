import SwiftUI
import XCTest
@testable import Blanc

/// Duo-1: the unfolded layout follows the size class, never the device.
final class IslandLayoutTests: XCTestCase {
    func testCompactIsTheIPhoneLayout() {
        let layout = IslandLayout(.compact, .regular)
        XCTAssertFalse(layout.showsHistoryButtons)
        XCTAssertEqual(layout.palette, .sheet)
    }

    func testAnUnknownSizeClassIsTheIPhoneLayout() {
        XCTAssertEqual(IslandLayout(nil, nil), IslandLayout(.compact, .regular))
        XCTAssertEqual(IslandLayout(.regular, nil), IslandLayout(.compact, .regular))
    }

    /// A Plus or Pro Max iPhone in landscape is regular width but compact
    /// height: still an iPhone.
    func testALargeIPhoneInLandscapeIsTheIPhoneLayout() {
        XCTAssertEqual(IslandLayout(.regular, .compact), IslandLayout(.compact, .regular))
    }

    func testRegularIsTheUnfoldedLayout() {
        let layout = IslandLayout(.regular, .regular)
        XCTAssertTrue(layout.showsHistoryButtons)
        XCTAssertEqual(layout.palette, .panel)
    }
}
