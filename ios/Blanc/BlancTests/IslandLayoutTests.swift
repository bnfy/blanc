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
        let buttons = IslandLayout(.compact, .regular).buttons(backForward: true, isLoading: false)
        XCTAssertEqual(buttons, .init(history: .afterAddress, reload: false))
    }

    func testStopStillShowsWhileAPageLoads() {
        let buttons = IslandLayout(.compact, .regular).buttons(backForward: true, isLoading: true)
        XCTAssertEqual(buttons, .init(history: .afterAddress, reload: true))
    }

    func testWithBackAndForwardOffReloadTakesTheirPlace() {
        let layout = IslandLayout(.compact, .regular)
        XCTAssertEqual(layout.buttons(backForward: false, isLoading: false), .init(history: .hidden, reload: true))
        XCTAssertEqual(layout.buttons(backForward: false, isLoading: true), .init(history: .hidden, reload: true))
    }

    func testTheUnfoldedIslandShowsEveryButtonWhateverTheSetting() {
        let all = IslandLayout.Buttons(history: .beforeAddress, reload: true)
        let layout = IslandLayout(.regular, .regular)
        XCTAssertEqual(layout.buttons(backForward: true, isLoading: false), all)
        XCTAssertEqual(layout.buttons(backForward: false, isLoading: true), all)
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
