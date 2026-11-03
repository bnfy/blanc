import XCTest
@testable import Blanc

/// Multiple windows W1: the app's shared things live in `BrowserServices`,
/// and each window's `TabsManager` reads them from there.
@MainActor final class BrowserServicesTests: XCTestCase {
    private func services() -> BrowserServices {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("Services-\(UUID().uuidString)")
        return BrowserServices(settingsDirectory: dir, sessionDirectory: dir)
    }

    func testWindowsShareTheDevicesStoresButNotTheirTabs() {
        let shared = services()
        let first = TabsManager(services: shared)
        let second = TabsManager(services: shared)
        XCTAssertTrue(first.settingsStore === second.settingsStore)
        XCTAssertTrue(first.historyStore === second.historyStore)
        XCTAssertTrue(first.syncEngine === second.syncEngine)
        XCTAssertTrue(first.recentlyClosed === second.recentlyClosed)
        XCTAssertEqual(shared.windows.count, 2)
        second.createTab(url: URL(string: "https://b.test/")!)
        XCTAssertFalse(first.tabs.contains { $0.currentURL.host == "b.test" })
    }

    func testSyncSeesEveryWindowsOrdinaryTabs() {
        let shared = services()
        let first = TabsManager(services: shared)
        let second = TabsManager(services: shared)
        first.createTab(url: URL(string: "https://a.test/")!)
        second.createTab(url: URL(string: "https://b.test/")!)
        second.createTab(url: URL(string: "https://secret.test/")!, isPrivate: true)
        let urls = shared.windows.flatMap(\.syncedTabs).map(\.url)
        XCTAssertTrue(urls.contains("https://a.test/"))
        XCTAssertTrue(urls.contains("https://b.test/"))
        XCTAssertFalse(urls.contains("https://secret.test/"))
    }

    func testPrivateBrowsingEndsOnlyWhenNoWindowHasAPrivateTab() {
        let shared = services()
        let first = TabsManager(services: shared)
        let second = TabsManager(services: shared)
        first.createTab(isPrivate: true)
        let store = shared.privateDataStore
        second.createTab(isPrivate: true)
        XCTAssertTrue(second.privateDataStore === store, "private tabs in every window share one store")
        first.closeTab(first.tabs.first(where: \.isPrivate)!.id)
        XCTAssertNotNil(shared.existingPrivateStore, "the other window still has one")
        second.closeTab(second.tabs.first(where: \.isPrivate)!.id)
        XCTAssertNil(shared.existingPrivateStore)
    }

    func testAWindowThatGoesAwayLeavesTheList() {
        let shared = services()
        let first = TabsManager(services: shared)
        var second: TabsManager? = TabsManager(services: shared)
        XCTAssertEqual(shared.windows.count, 2)
        second = nil
        XCTAssertEqual(shared.windows.map(ObjectIdentifier.init), [ObjectIdentifier(first)])
        _ = second
    }
}
