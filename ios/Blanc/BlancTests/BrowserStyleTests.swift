import SwiftUI
import XCTest
@testable import Blanc

final class BrowserStyleTests: XCTestCase {
    /// The switch's knob is always white, so a near-white track hides it.
    func testADarkSwitchIsNotFilledWithTheTextColor() {
        let dark = BrowserStyle(scheme: .dark)
        XCTAssertNotEqual(dark.switchOn, dark.text)
    }

    func testALightSwitchKeepsTheInk() {
        let light = BrowserStyle(scheme: .light)
        XCTAssertEqual(light.switchOn, light.text)
    }
}
