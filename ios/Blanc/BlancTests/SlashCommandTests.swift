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

    // MARK: M17: groups and Spaces

    @MainActor func testGroupFindsOrMakesTheGroupForTheCurrentTab() {
        let m = manager()
        XCTAssertEqual(run("/group", in: m), .prompt("/group "), "a bare /group asks for a name")
        XCTAssertEqual(run("/group Research", in: m), .done)
        let group = m.groups.first
        XCTAssertEqual(group?.name, "Research")
        XCTAssertEqual(m.activeTab?.groupId, group?.id)
        m.createTab(url: URL(string: "https://b.test/")!)
        _ = run("/gr research", in: m)
        XCTAssertEqual(m.groups.count, 1, "an existing name is found without regard to case")
        XCTAssertEqual(m.activeTab?.groupId, group?.id)
    }

    @MainActor func testUngroupAndCloseGroupNeedAGroupedTab() {
        let m = manager()
        XCTAssertNil(run("/ungroup", in: m), "not offered for an ungrouped tab")
        _ = run("/group G", in: m)
        _ = run("/ungroup", in: m)
        XCTAssertNil(m.activeTab?.groupId)
        _ = run("/group G", in: m)
        m.createTab(url: URL(string: "https://b.test/")!)
        _ = run("/group G", in: m)
        _ = run("/close-group", in: m)
        XCTAssertTrue(m.groups.isEmpty)
        XCTAssertEqual(m.lastClosed?.groupClose, true)
    }

    @MainActor func testGroupIsNotOfferedInAPrivateTab() {
        let m = manager()
        m.createTab(isPrivate: true)
        XCTAssertFalse(SlashCommand.filter(prefix: "/group", in: m).contains { $0.command == "/group" })
    }

    @MainActor func testSpaceSwitchesByNameOrOpensNewSpace() throws {
        let m = manager()
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        _ = run("/space work", in: m)
        XCTAssertEqual(m.shownSetId, work)
        _ = run("/space This iPhone", in: m)
        XCTAssertEqual(m.shownSetId, TabSets.iphoneId)
        _ = run("/space Reading", in: m)
        XCTAssertEqual(m.spaceEditor, .new(name: "Reading"))
        m.spaceEditor = nil
        _ = run("/space", in: m)
        XCTAssertTrue(m.isSpacesMenuPresented)
    }
}
