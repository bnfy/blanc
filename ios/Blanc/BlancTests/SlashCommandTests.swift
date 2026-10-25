import XCTest
@testable import Blanc

final class SlashCommandTests: XCTestCase {
    func testAvailableContainsNewAndClose() {
        let names = SlashCommand.available.map(\.command)
        XCTAssertTrue(names.contains("/new"))
        XCTAssertTrue(names.contains("/close"))
    }

    func testAvailableCountIsThree() {
        XCTAssertEqual(SlashCommand.available.map(\.command), ["/new", "/private", "/close"])
    }

    @MainActor func testPrivateCommandOpensAPrivateTab() {
        let manager = TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let command = SlashCommand.available.first { $0.command == "/private" }
        XCTAssertEqual(command?.hint, "Open a private tab (history stays untouched)")
        command?.execute(manager)
        XCTAssertEqual(manager.tabs.count, 2)
        XCTAssertEqual(manager.activeTab?.isPrivate, true)
        XCTAssertEqual(manager.activeTab?.currentURL, TabsManager.privateNewTabURL)
    }

    func testFilterEmptyReturnsAll() {
        let results = SlashCommand.filter(prefix: "")
        XCTAssertEqual(results.count, SlashCommand.available.count)
    }

    func testFilterSlashAloneReturnsAll() {
        let results = SlashCommand.filter(prefix: "/")
        XCTAssertEqual(results.count, SlashCommand.available.count)
    }

    func testFilterMatchesPrefix() {
        let results = SlashCommand.filter(prefix: "/ne")
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].command, "/new")
    }

    func testFilterNoMatch() {
        let results = SlashCommand.filter(prefix: "/xyz")
        XCTAssertTrue(results.isEmpty)
    }
}
