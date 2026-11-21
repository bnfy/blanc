import SwiftUI
import XCTest
@testable import Blanc

/// Duo-1: the unfolded layout follows the size class, never the device.
final class IslandLayoutTests: XCTestCase {
    func testCompactIsTheIPhoneLayout() {
        let layout = IslandLayout(.compact, .regular)
        XCTAssertEqual(layout.palette, .sheet)
    }

    func testBackLeadsAndForwardOnlyWhenThereIsSomewhereToGo() {
        let phone = IslandLayout(.compact, .regular)
        XCTAssertEqual(phone.buttons(backForward: true, canGoForward: false, isLoading: false),
                       .init(leading: .back, forward: false, trailing: .newTab))
        XCTAssertEqual(phone.buttons(backForward: true, canGoForward: true, isLoading: false),
                       .init(leading: .back, forward: true, trailing: .newTab))
    }

    func testStopTakesNewTabsSlotWhileLoading() {
        let buttons = IslandLayout(.compact, .regular).buttons(backForward: true, canGoForward: false, isLoading: true)
        XCTAssertEqual(buttons.trailing, .stop)
    }

    func testWithBackAndForwardOffReloadLeads() {
        let buttons = IslandLayout(.compact, .regular).buttons(backForward: false, canGoForward: true, isLoading: false)
        XCTAssertEqual(buttons, .init(leading: .reload, forward: false, trailing: .newTab))
    }

    func testTheUnfoldedIslandHasTheIPhonesButtons() {
        let unfolded = IslandLayout(.regular, .regular), phone = IslandLayout(.compact, .regular)
        for backForward in [true, false] {
            for canGoForward in [true, false] {
                for isLoading in [true, false] {
                    XCTAssertEqual(unfolded.buttons(backForward: backForward, canGoForward: canGoForward, isLoading: isLoading),
                                   phone.buttons(backForward: backForward, canGoForward: canGoForward, isLoading: isLoading))
                }
            }
        }
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
        XCTAssertEqual(layout.palette, .panel)
    }
}
