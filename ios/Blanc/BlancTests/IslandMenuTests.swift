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
        XCTAssertEqual(IslandMenu.items(for: m.activeTab, manager: m, onPad: false),
                       [.blocking(on: true), .favorite(saved: false), .reload, .share, .copyLink, .find, .pageZoom,
                        .desktopSite(on: false), .newPrivateTab, .settings])
    }

    func testStartPageOffersCustomizeAndAPrivateTab() {
        let m = manager()
        m.activeTab!.currentURL = TabsManager.newTabURL
        XCTAssertEqual(IslandMenu.items(for: m.activeTab, manager: m, onPad: false), [.customizeStartPage, .newPrivateTab, .settings])
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
        XCTAssertEqual(IslandMenu.items(for: tab, manager: m, onPad: false),
                       [.blocking(on: true), .reload, .share, .copyLink, .find, .pageZoom, .desktopSite(on: false),
                        .newPrivateTab, .settings])
    }

    func testStatesFollowTheSiteAndTheFavorite() {
        let m = manager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://nintendo.com/")!
        m.setSiteProtection(tab, on: false)
        m.toggleFavorite(tab)
        XCTAssertEqual(Array(IslandMenu.items(for: tab, manager: m, onPad: false).prefix(2)), [.blocking(on: false), .favorite(saved: true)])
    }

    func testDesktopSiteReadsAsMobileOnceAsked() {
        let m = manager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://nintendo.com/")!
        tab.wantsDesktopSite = true
        XCTAssertTrue(IslandMenu.items(for: tab, manager: m, onPad: false).contains(.desktopSite(on: true)))
    }

    func testBlockingOffEverywhereOffersSettings() {
        let m = manager()
        m.activeTab!.currentURL = URL(string: "https://nintendo.com/")!
        m.applySettingsPatch(["adblockEnabled": false])
        XCTAssertEqual(IslandMenu.items(for: m.activeTab, manager: m, onPad: false).first, .blockingSettings)
    }

    func testAnIPadOffersTheOtherLayoutOfTheSite() {
        let m = manager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://www.nintendo.com/store")!
        XCTAssertFalse(IslandMenu.items(for: tab, manager: m, onPad: false).contains(.requestSite(mobile: true)), "a phone asks for nothing")
        XCTAssertTrue(IslandMenu.items(for: tab, manager: m, onPad: true).contains(.requestSite(mobile: true)))
        m.setMobileSite(tab, mobile: true)
        XCTAssertEqual(m.settingsStore.mobileSites, ["nintendo.com"])
        XCTAssertTrue(IslandMenu.items(for: tab, manager: m, onPad: true).contains(.requestSite(mobile: false)))
        XCTAssertTrue(m.wantsMobileSite(URL(string: "https://nintendo.com/news")!, isPrivate: false), "the whole site, in any tab")
        m.setMobileSite(tab, mobile: false)
        XCTAssertEqual(m.settingsStore.mobileSites, [])
    }

    func testASitesPhoneLayoutCoversItsSubdomains() {
        let m = manager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://example.com/")!
        m.setMobileSite(tab, mobile: true)
        XCTAssertTrue(m.wantsMobileSite(URL(string: "https://m.example.com/")!, isPrivate: false), "the redirect keeps the phone layout")
        XCTAssertFalse(m.wantsMobileSite(URL(string: "https://notexample.com/")!, isPrivate: false))
        tab.currentURL = URL(string: "https://m.example.com/")!
        m.setMobileSite(tab, mobile: false)
        XCTAssertEqual(m.settingsStore.mobileSites, [], "Request Desktop Website works from the subdomain")
    }

    func testThePhoneLayoutChosenOnASubdomainClearsFromTheSite() {
        let m = manager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://m.example.com/")!
        m.setMobileSite(tab, mobile: true)
        tab.currentURL = URL(string: "https://example.com/")!
        m.setMobileSite(tab, mobile: false)
        XCTAssertEqual(m.settingsStore.mobileSites, [], "the redirect to m.example.com would bring the phone layout back")
        XCTAssertFalse(m.wantsMobileSite(URL(string: "https://m.example.com/")!, isPrivate: false))
    }

    func testAPrivateTabsLayoutChoiceIsNeverSaved() {
        let m = manager()
        let id = m.createTab(url: URL(string: "https://secret.example/")!, isPrivate: true)
        let tab = m.tabs.first { $0.id == id }!
        m.setMobileSite(tab, mobile: true)
        XCTAssertTrue(m.wantsMobileSite(tab.currentURL, isPrivate: true))
        XCTAssertFalse(m.wantsMobileSite(tab.currentURL, isPrivate: false), "only private tabs")
        XCTAssertEqual(m.settingsStore.mobileSites, [])
    }
}
