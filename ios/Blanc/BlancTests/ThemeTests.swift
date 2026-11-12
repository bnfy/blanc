import XCTest
import SwiftUI
@testable import Blanc

final class ThemeTests: XCTestCase {
    func testSystemLightResolvesToLight() {
        XCTAssertEqual(resolvedTheme(preference: .system, systemScheme: .light), .light)
    }

    func testSystemDarkResolvesToDark() {
        XCTAssertEqual(resolvedTheme(preference: .system, systemScheme: .dark), .dark)
    }

    func testExplicitLightIgnoresSystem() {
        XCTAssertEqual(resolvedTheme(preference: .light, systemScheme: .dark), .light)
    }

    func testExplicitDarkIgnoresSystem() {
        XCTAssertEqual(resolvedTheme(preference: .dark, systemScheme: .light), .dark)
    }

    func testLightWithLightSystem() {
        XCTAssertEqual(resolvedTheme(preference: .light, systemScheme: .light), .light)
    }

    func testDarkWithDarkSystem() {
        XCTAssertEqual(resolvedTheme(preference: .dark, systemScheme: .dark), .dark)
    }

    func testPrivateTabForcesPrivateTheme() {
        for preference in [BlancThemePreference.system, .light, .dark] {
            for scheme in [ColorScheme.light, .dark] {
                XCTAssertEqual(resolvedTheme(preference: preference, systemScheme: scheme, isPrivate: true), .privateBrowsing)
                XCTAssertNotEqual(resolvedTheme(preference: preference, systemScheme: scheme, isPrivate: false), .privateBrowsing)
            }
        }
    }
}
