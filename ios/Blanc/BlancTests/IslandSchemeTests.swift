import SwiftUI
import XCTest
@testable import Blanc

final class IslandSchemeTests: XCTestCase {
    func testPrivateAlwaysUsesDark() {
        for glass in [true, false] {
            XCTAssertEqual(IslandScheme.resolve(isPrivate: true, pageScheme: .light, appScheme: .light, glass: glass), .dark)
        }
    }

    func testGlassFollowsThePage() {
        XCTAssertEqual(IslandScheme.resolve(isPrivate: false, pageScheme: .dark, appScheme: .light, glass: true), .dark)
    }

    func testTheSolidIslandFollowsTheApp() {
        XCTAssertEqual(IslandScheme.resolve(isPrivate: false, pageScheme: .dark, appScheme: .light, glass: false), .light)
    }

    func testGlassWithoutAPageSchemeFollowsTheApp() {
        XCTAssertEqual(IslandScheme.resolve(isPrivate: false, pageScheme: nil, appScheme: .dark, glass: true), .dark)
    }
}
