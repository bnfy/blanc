import XCTest
@testable import Blanc

/// What the Sunrise mark's menu offers on each kind of page.
@MainActor final class IslandMenuTests: XCTestCase {
    private func manager() -> TabsManager {
        TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    }

    func testWebPageOffersEverything() {
        let m = manager()
        m.activeTab!.currentURL = URL(string: "https://nintendo.com/")!
        XCTAssertEqual(IslandMenu.items(for: m.activeTab, manager: m),
                       [.blocking(on: true), .favorite(saved: false), .share, .find, .newPrivateTab])
    }

    func testStartPageOffersCustomizeAndAPrivateTab() {
        let m = manager()
        m.activeTab!.currentURL = TabsManager.newTabURL
        XCTAssertEqual(IslandMenu.items(for: m.activeTab, manager: m), [.customizeStartPage, .newPrivateTab])
    }

    func testHoldingTheStartPageOpensItsSettings() {
        let m = manager()
        m.activeTab!.currentURL = TabsManager.newTabURL
        m.startPageHeld(m.activeTab!)
        XCTAssertEqual(m.settingsDestination, .startPage)
    }

    func testHoldingAWebPageDoesNothing() {
        let m = manager()
        m.activeTab!.currentURL = URL(string: "https://nintendo.com/")!
        m.startPageHeld(m.activeTab!)
        XCTAssertNil(m.settingsDestination)
    }

    func testStartPageSettingsLinkResolves() {
        XCTAssertEqual(SettingsDestination.resolve(URL(string: "blanc://settings/#start-page")!), .startPage)
    }

    func testPrivatePageIsNeverAFavorite() {
        let m = manager()
        let id = m.createTab(url: URL(string: "https://secret.example/")!, isPrivate: true)
        let tab = m.tabs.first { $0.id == id }
        XCTAssertEqual(IslandMenu.items(for: tab, manager: m), [.blocking(on: true), .share, .find, .newPrivateTab])
    }

    func testStatesFollowTheSiteAndTheFavorite() {
        let m = manager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://nintendo.com/")!
        m.setSiteProtection(tab, on: false)
        m.toggleFavorite(tab)
        XCTAssertEqual(Array(IslandMenu.items(for: tab, manager: m).prefix(2)), [.blocking(on: false), .favorite(saved: true)])
    }

    func testBlockingOffEverywhereOffersSettings() {
        let m = manager()
        m.activeTab!.currentURL = URL(string: "https://nintendo.com/")!
        m.applySettingsPatch(["adblockEnabled": false])
        XCTAssertEqual(IslandMenu.items(for: m.activeTab, manager: m).first, .blockingSettings)
    }
}
