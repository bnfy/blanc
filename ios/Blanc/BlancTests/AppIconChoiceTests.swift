import XCTest
import UIKit
@testable import Blanc

final class AppIconChoiceTests: XCTestCase {
    func testCatalogOrderMatchesBrandBuild() {
        XCTAssertEqual(AppIconChoice.allCases.map(\.rawValue),
                       ["sunrise-gold", "sunrise-dawn", "sunrise", "sunrise-dark", "sunrise-spectrum", "sunrise-amber"])
    }

    func testGoldIsPrimary() {
        XCTAssertNil(AppIconChoice.sunriseGold.alternateIconName)
        XCTAssertEqual(AppIconChoice.current(alternateIconName: nil), .sunriseGold)
        XCTAssertEqual(AppIconChoice.sunriseGold.label, "Sunrise Gold")
        XCTAssertEqual(AppIconChoice.sunriseDawn.alternateIconName, "SunriseDawn")
        XCTAssertEqual(AppIconChoice.sunriseDawn.label, "Sunrise Dawn")
    }

    func testAlternateNamesRoundTrip() {
        for choice in AppIconChoice.allCases where choice != .sunriseGold {
            XCTAssertNotNil(choice.alternateIconName, choice.rawValue)
            XCTAssertEqual(AppIconChoice.current(alternateIconName: choice.alternateIconName), choice)
            if choice != .sunriseDawn { XCTAssertEqual(choice.label, BlancAppIcon(rawValue: choice.rawValue)?.label) }
        }
    }

    func testUnknownNameIsGold() {
        XCTAssertEqual(AppIconChoice.current(alternateIconName: "Ember"), .sunriseGold)
        // An earlier development build had Gold as an alternate under this name.
        XCTAssertEqual(AppIconChoice.current(alternateIconName: "SunriseGold"), .sunriseGold)
    }

    func testPreviewsAreBundled() {
        for choice in AppIconChoice.allCases {
            XCTAssertNotNil(UIImage(named: choice.previewImageName), choice.previewImageName)
        }
    }
}

@MainActor private final class FakeIconSwitcher: AlternateIconSwitching {
    var alternateIconName: String?
    var failure: Error?
    private(set) var requested: [String?] = []
    func setAlternateIconName(_ name: String?) async throws {
        requested.append(name)
        if let failure { throw failure }
        alternateIconName = name
    }
}

@MainActor final class AppIconModelTests: XCTestCase {
    func testChooseSwitches() async {
        let switcher = FakeIconSwitcher()
        let model = AppIconModel(switcher: switcher)
        XCTAssertEqual(model.current, .sunriseGold)
        await model.choose(.sunriseDawn)
        XCTAssertEqual(switcher.requested, ["SunriseDawn"])
        XCTAssertEqual(model.current, .sunriseDawn)
    }

    func testChooseGoldClearsName() async {
        let switcher = FakeIconSwitcher()
        switcher.alternateIconName = "SunriseAmber"
        let model = AppIconModel(switcher: switcher)
        XCTAssertEqual(model.current, .sunriseAmber)
        await model.choose(.sunriseGold)
        XCTAssertEqual(switcher.requested, [nil])
        XCTAssertEqual(model.current, .sunriseGold)
    }

    func testFailedSwitchKeepsCurrent() async {
        let switcher = FakeIconSwitcher()
        switcher.alternateIconName = "Sunrise"
        switcher.failure = CocoaError(.userCancelled)
        let model = AppIconModel(switcher: switcher)
        await model.choose(.sunriseSpectrum)
        XCTAssertEqual(model.current, .sunrise)
    }

    func testRefreshReadsTheSystem() {
        let switcher = FakeIconSwitcher()
        let model = AppIconModel(switcher: switcher)
        switcher.alternateIconName = "SunriseDark"
        model.refresh()
        XCTAssertEqual(model.current, .sunriseDark)
    }
}
