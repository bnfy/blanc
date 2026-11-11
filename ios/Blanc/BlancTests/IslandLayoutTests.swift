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

    func testTheIPhoneIslandHasBackForwardAndNewTabButNoReload() {
        let buttons = IslandLayout(.compact, .regular).buttons(isLoading: false)
        XCTAssertEqual(buttons, .init(reload: false, historyTrails: true))
    }

    func testStopStillShowsWhileAPageLoads() {
        let buttons = IslandLayout(.compact, .regular).buttons(isLoading: true)
        XCTAssertEqual(buttons, .init(reload: true, historyTrails: true))
    }

    func testTheUnfoldedIslandShowsEveryButton() {
        let all = IslandLayout.Buttons(reload: true)
        let layout = IslandLayout(.regular, .regular)
        XCTAssertEqual(layout.buttons(isLoading: false), all)
        XCTAssertEqual(layout.buttons(isLoading: true), all)
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
