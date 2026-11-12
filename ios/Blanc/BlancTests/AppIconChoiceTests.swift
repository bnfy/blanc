import XCTest
import UIKit
@testable import Blanc

final class AppIconChoiceTests: XCTestCase {
    func testCatalogOrderMatchesBrandBuild() {
        XCTAssertEqual(AppIconChoice.allCases.map(\.rawValue),
                       ["sunrise", "sunrise-bronze", "sunrise-gold", "sunrise-dawn", "sunrise-dark",
                        "sunrise-spectrum", "sunrise-amber"])
    }

    func testSunriseIsPrimary() {
        XCTAssertNil(AppIconChoice.sunrise.alternateIconName)
        XCTAssertEqual(AppIconChoice.current(alternateIconName: nil), .sunrise)
        XCTAssertEqual(AppIconChoice.sunrise.label, "Sunrise")
        XCTAssertEqual(AppIconChoice.sunriseGold.alternateIconName, "SunriseGold")
        XCTAssertEqual(AppIconChoice.sunriseBronze.alternateIconName, "SunriseBronze")
        XCTAssertEqual(AppIconChoice.sunriseBronze.label, "Sunrise Bronze")
        XCTAssertEqual(AppIconChoice.sunriseDawn.label, "Sunrise Dawn")
    }

    func testAlternateNamesRoundTrip() {
        for choice in AppIconChoice.allCases where choice != .sunrise {
            XCTAssertNotNil(choice.alternateIconName, choice.rawValue)
            XCTAssertEqual(AppIconChoice.current(alternateIconName: choice.alternateIconName), choice)
            if ![.sunriseDawn, .sunriseBronze].contains(choice) {
                XCTAssertEqual(choice.label, BlancAppIcon(rawValue: choice.rawValue)?.label)
            }
        }
    }

    func testUnknownNameIsSunrise() {
        XCTAssertEqual(AppIconChoice.current(alternateIconName: "Ember"), .sunrise)
        // Until 1.0.2 Sunrise was an alternate under this name; it is the
        // primary now, so a phone that had chosen it still reads as Sunrise.
        XCTAssertEqual(AppIconChoice.current(alternateIconName: "Sunrise"), .sunrise)
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
        XCTAssertEqual(model.current, .sunrise)
        await model.choose(.sunriseDawn)
        XCTAssertEqual(switcher.requested, ["SunriseDawn"])
        XCTAssertEqual(model.current, .sunriseDawn)
    }

    func testChooseSunriseClearsName() async {
        let switcher = FakeIconSwitcher()
        switcher.alternateIconName = "SunriseAmber"
        let model = AppIconModel(switcher: switcher)
        XCTAssertEqual(model.current, .sunriseAmber)
        await model.choose(.sunrise)
        XCTAssertEqual(switcher.requested, [nil])
        XCTAssertEqual(model.current, .sunrise)
    }

    func testFailedSwitchKeepsCurrent() async {
        let switcher = FakeIconSwitcher()
        switcher.alternateIconName = "SunriseGold"
        switcher.failure = CocoaError(.userCancelled)
        let model = AppIconModel(switcher: switcher)
        await model.choose(.sunriseSpectrum)
        XCTAssertEqual(model.current, .sunriseGold)
    }

    func testChoosingPrimaryClearsAStaleName() async {
        // iOS still reports an icon name an earlier build had (Sunrise),
        // which this build shows as the primary; choosing it must clear it.
        let switcher = FakeIconSwitcher()
        switcher.alternateIconName = "Sunrise"
        let model = AppIconModel(switcher: switcher)
        XCTAssertEqual(model.current, .sunrise)
        await model.choose(.sunrise)
        XCTAssertEqual(switcher.requested, [nil])
        XCTAssertNil(switcher.alternateIconName)
    }

    func testRefreshReadsTheSystem() {
        let switcher = FakeIconSwitcher()
        let model = AppIconModel(switcher: switcher)
        switcher.alternateIconName = "SunriseDark"
        model.refresh()
        XCTAssertEqual(model.current, .sunriseDark)
    }
}
