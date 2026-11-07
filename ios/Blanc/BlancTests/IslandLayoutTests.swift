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

    func testTheIPhoneIslandKeepsReloadAndNewTabByDefault() {
        let buttons = IslandLayout(.compact, .regular).buttons(historySetting: false, isLoading: false)
        XCTAssertEqual(buttons, .init(history: false, reload: true, newTab: true))
    }

    func testTheHistorySettingSwapsOutReloadAndNewTab() {
        let buttons = IslandLayout(.compact, .regular).buttons(historySetting: true, isLoading: false)
        XCTAssertEqual(buttons, .init(history: true, reload: false, newTab: false, centersAddress: true))
    }

    func testStopStillShowsWhileAPageLoads() {
        let buttons = IslandLayout(.compact, .regular).buttons(historySetting: true, isLoading: true)
        XCTAssertEqual(buttons, .init(history: true, reload: true, newTab: false, centersAddress: true))
    }

    /// The narrower side takes the difference, so the address lands in the middle.
    func testTheAddressIsBalancedAgainstTheWiderSide() {
        XCTAssertEqual(IslandLayout.addressInsets(leading: 100, trailing: 48).trailing, 52)
        XCTAssertEqual(IslandLayout.addressInsets(leading: 100, trailing: 48).leading, 0)
        XCTAssertEqual(IslandLayout.addressInsets(leading: 48, trailing: 100).leading, 52)
        XCTAssertEqual(IslandLayout.addressInsets(leading: 60, trailing: 60).leading, 0)
    }

    func testTheUnfoldedIslandShowsEveryButtonWhateverTheSetting() {
        let all = IslandLayout.Buttons(history: true, reload: true, newTab: true)
        let layout = IslandLayout(.regular, .regular)
        XCTAssertEqual(layout.buttons(historySetting: false, isLoading: false), all)
        XCTAssertEqual(layout.buttons(historySetting: true, isLoading: false), all)
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
