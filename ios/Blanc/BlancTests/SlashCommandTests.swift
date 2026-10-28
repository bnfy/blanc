import XCTest
@testable import Blanc

final class SlashCommandTests: XCTestCase {
    func testAvailableContainsNewAndClose() {
        let names = SlashCommand.available.map(\.command)
        XCTAssertTrue(names.contains("/new"))
        XCTAssertTrue(names.contains("/close"))
    }

    func testAvailableIncludesPrivate() {
        XCTAssertTrue(SlashCommand.available.map(\.command).contains("/private"))
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

    func testAvailableIncludesNativeSettingsRoutes() {
        XCTAssertTrue(SlashCommand.available.map(\.command).contains("/settings"))
        XCTAssertTrue(SlashCommand.available.map(\.command).contains("/sync"))
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

    // MARK: M10, the shared commands

    @MainActor private func manager() -> TabsManager {
        TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    }

    @MainActor private func run(_ input: String, in manager: TabsManager) -> SlashOutcome? {
        SlashCommand.run(input, in: manager)
    }

    func testTheArgumentIsTheTextAfterTheCommand() {
        XCTAssertEqual(SlashCommand.argument(from: "/theme  Dark "), "Dark")
        XCTAssertEqual(SlashCommand.argument(from: "/theme"), "")
        XCTAssertEqual(SlashCommand.argument(from: "/send Anthony's iPhone"), "Anthony's iPhone")
    }

    func testTheSharedCommandsAreOffered() {
        let names = SlashCommand.available.map(\.command)
        for name in ["/favorites", "/history", "/find", "/block-ads", "/allow-ads", "/theme", "/send"] {
            XCTAssertTrue(names.contains(name), name)
        }
        for name in ["/sleep", "/bangs", "/glance", "/archive", "/dark-site"] {
            XCTAssertFalse(names.contains(name), name)
        }
    }

    @MainActor func testSendIsNotOfferedInAPrivateTab() {
        let m = manager()
        XCTAssertTrue(SlashCommand.filter(prefix: "/se", in: m).map(\.command).contains("/send"))
        m.createTab(isPrivate: true)
        XCTAssertFalse(SlashCommand.filter(prefix: "/se", in: m).map(\.command).contains("/send"))
    }

    func testThemeCyclesOrPicksTheWordGiven() {
        XCTAssertEqual(SlashCommand.nextTheme(after: .system, argument: ""), .light)
        XCTAssertEqual(SlashCommand.nextTheme(after: .light, argument: ""), .dark)
        XCTAssertEqual(SlashCommand.nextTheme(after: .dark, argument: ""), .system)
        XCTAssertEqual(SlashCommand.nextTheme(after: .light, argument: "DARK"), .dark)
        XCTAssertEqual(SlashCommand.nextTheme(after: .light, argument: "blue"), .light, "an unknown word changes nothing")
    }

    @MainActor func testThemeCommandSavesTheAppearance() {
        let m = manager()
        XCTAssertEqual(run("/theme dark", in: m), .done)
        XCTAssertEqual(m.settingsStore.theme, .dark)
    }

    @MainActor func testBlockAdsReblocksAnAllowedSite() {
        let m = manager()
        m.createTab(url: URL(string: "https://example.com/")!)
        m.setAdblockExceptions(["example.com"])
        _ = run("/block-ads", in: m)
        XCTAssertEqual(m.settingsStore.adblockExceptions, [])
        XCTAssertTrue(m.settingsStore.adblockEnabled)
    }

    @MainActor func testBlockAdsOtherwiseSwitchesBlockingEverywhere() {
        let m = manager()
        m.createTab(url: URL(string: "https://example.com/")!)
        XCTAssertTrue(m.settingsStore.adblockEnabled)
        _ = run("/block-ads", in: m)
        XCTAssertFalse(m.settingsStore.adblockEnabled)
        _ = run("/block-ads", in: m)
        XCTAssertTrue(m.settingsStore.adblockEnabled)
    }

    @MainActor func testAllowAdsAllowsTheSite() {
        let m = manager()
        m.createTab(url: URL(string: "https://www.example.com/page")!)
        _ = run("/allow-ads", in: m)
        XCTAssertEqual(m.settingsStore.adblockExceptions, ["example.com"])
    }

    @MainActor func testFavoritesAndHistoryOpenTheirPages() {
        let m = manager()
        _ = run("/favorites", in: m)
        XCTAssertEqual(m.activeTab?.currentURL, URL(string: "blanc://bookmarks/"))
        _ = run("/history", in: m)
        XCTAssertEqual(m.activeTab?.currentURL, URL(string: "blanc://history/"))
    }

    @MainActor func testFindWaitsForThePaletteToClose() {
        let m = manager()
        XCTAssertEqual(run("/find", in: m), .done)
        XCTAssertTrue(m.findRequested)
    }

    @MainActor func testBareSendAsksForADevice() {
        XCTAssertEqual(run("/send", in: manager()), .prompt("/send "))
    }

    func testSendMatchesADeviceWithoutRegardToCase() {
        let targets = [SendTarget(id: "a", name: "Mac mini", platform: "macos", updatedAt: 1),
                       SendTarget(id: "b", name: "iPhone", platform: "ios", updatedAt: 1)]
        XCTAssertEqual(SlashCommand.sendTarget(named: "IPHONE", in: targets)?.id, "b")
        XCTAssertNil(SlashCommand.sendTarget(named: "iPad", in: targets))
    }
}
