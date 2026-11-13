import XCTest
@testable import Blanc

/// Multiple windows W3: dragging tabs between windows, and window titles.
@MainActor final class TabDragTests: XCTestCase {
    private func services() -> BrowserServices {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("TabDrag-\(UUID().uuidString)")
        return BrowserServices(settingsDirectory: dir, sessionDirectory: dir)
    }

    func testOnlyBlancsOwnMarkerNamesATab() {
        let id = UUID()
        XCTAssertEqual(TabDrag.tabId(from: "blanc-tab:" + id.uuidString), id)
        XCTAssertNil(TabDrag.tabId(from: "https://example.com/"))
        XCTAssertNil(TabDrag.tabId(from: "blanc-tab:not-a-uuid"))
    }

    func testTheActivityNamesTheTab() {
        let id = UUID()
        let activity = NSUserActivity(activityType: TabDrag.activityType)
        activity.userInfo = [TabDrag.tabIdKey: id.uuidString]
        XCTAssertEqual(TabDrag.tabId(from: activity), id)
        XCTAssertNil(TabDrag.tabId(from: NSUserActivity(activityType: "com.example.other")))
    }

    func testADraggedTabsProviderCarriesTheMarkerForBlancAndTheAddressForOthers() throws {
        let manager = TabsManager(services: services())
        let id = manager.createTab(url: URL(string: "https://drag.test/")!)
        let provider = TabDrag.itemProvider(for: try XCTUnwrap(manager.tabs.first { $0.id == id }))
        XCTAssertTrue(provider.hasItemConformingToTypeIdentifier("public.plain-text"))
        XCTAssertTrue(provider.canLoadObject(ofClass: NSURL.self))
        let loaded = expectation(description: "marker")
        _ = TabDrag.loadTabId(from: [provider]) { found in
            XCTAssertEqual(found, id)
            loaded.fulfill()
        }
        wait(for: [loaded], timeout: 5)
    }

    func testTheWindowListNamesTheSpaceOrThePage() throws {
        let manager = TabsManager(services: services())
        manager.createTab(url: URL(string: "https://title.test/")!)
        XCTAssertEqual(manager.windowTitle, TabTitle.display(manager.activeTab!))
        let work = try manager.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        manager.show(set: work)
        XCTAssertEqual(manager.windowTitle, "Work")
    }
}
