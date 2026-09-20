import UIKit
import XCTest
@testable import Blanc

final class InterFontTests: XCTestCase {
    func testInterFacesShipInTheAppBundle() {
        InterFont.register()
        for face in ["Inter-Regular", "Inter-Medium", "Inter-SemiBold"] {
            XCTAssertNotNil(UIFont(name: face, size: 17), "Missing bundled \(face)")
        }
    }
}
