import XCTest
@testable import Blanc

/// Multiple windows W2b: what each window shows, moving tabs between them,
/// and closing them.
@MainActor final class MultipleWindowsTests: XCTestCase {
    private var dir: URL!
    override func setUp() {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("Windows-\(UUID().uuidString)")
    }
    private func services() -> BrowserServices { BrowserServices(settingsDirectory: dir, sessionDirectory: dir) }

    func testASecondWindowStartsWithItsOwnStartPage() {
        let shared = services()
        let a = TabsManager(services: shared, windowId: "a")
        a.createTab(url: URL(string: "https://a.test/")!)
        let b = TabsManager(services: shared, windowId: "b")
        XCTAssertTrue(b.showsUnsavedSet)
        XCTAssertEqual(b.tabs.map(\.currentURL), [TabsManager.newTabURL])
        XCTAssertEqual(a.shownSetId, TabSets.iphoneId)
    }

    func testASetShowsInOneWindowAndChoosingItBringsThatWindowForward() throws {
        let shared = services()
        var opened: [WindowRequest] = []
        shared.openWindowAction = { opened.append($0) }
        let a = TabsManager(services: shared, windowId: UUID().uuidString)
        let b = TabsManager(services: shared, windowId: UUID().uuidString)
        b.show(set: TabSets.iphoneId)
        XCTAssertTrue(b.showsUnsavedSet, "This iPhone is open in the other window")
        XCTAssertEqual(opened.map(\.id.uuidString), [a.windowId])
        let work = try a.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        b.show(set: work)
        XCTAssertEqual(b.shownSetId, work)
    }

    func testLeavingAnUnsavedSetSendsItsTabsToRecentlyClosed() throws {
        let shared = services()
        let a = TabsManager(services: shared, windowId: "a")
        let b = TabsManager(services: shared, windowId: "b")
        b.createTab(url: URL(string: "https://draft.test/")!)
        let work = try a.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        b.show(set: work)
        XCTAssertTrue(shared.recentlyClosed.rows.contains { $0.url == "https://draft.test/" })
    }

    func testMovingATabCarriesThePageAndReplacesTheStartPage() {
        let shared = services()
        let a = TabsManager(services: shared, windowId: "a")
        let id = a.createTab(url: URL(string: "https://moving.test/")!)
        let page = a.tabs.first { $0.id == id }!
        let b = TabsManager(services: shared, windowId: "b")
        shared.moveTab(id, to: b)
        XCTAssertFalse(a.tabs.contains { $0 === page })
        XCTAssertEqual(b.tabs.count, 1)
        XCTAssertTrue(b.tabs[0] === page, "the same tab, web view and all")
        XCTAssertEqual(b.activeTabId, id)
    }

    func testClosingTheLastTabClosesTheWindowWhenAnotherIsOpen() {
        let shared = services()
        let a = TabsManager(services: shared, windowId: "a")
        var closed = 0
        a.closeWindowAction = { closed += 1 }
        a.closeTab(a.tabs[0].id)
        XCTAssertEqual(closed, 0, "the only window keeps a Start Page")
        XCTAssertEqual(a.tabs.count, 1)
        let b = TabsManager(services: shared, windowId: "b")
        b.closeWindowAction = { closed += 1 }
        b.closeTab(b.tabs[0].id)
        XCTAssertEqual(closed, 1)
    }

    func testADiscardedWindowsUnsavedTabsGoToRecentlyClosed() {
        let shared = services()
        let a = TabsManager(services: shared, windowId: "a", sceneSessionId: "session-a")
        var b: TabsManager? = TabsManager(services: shared, windowId: "b", sceneSessionId: "session-b")
        b?.createTab(url: URL(string: "https://kept.test/")!)
        shared.saveSession()
        b = nil
        XCTAssertNotNil(shared.savedWindow("b"), "a window iPadOS set aside stays saved")
        XCTAssertEqual(shared.savedWindow("b")?.session, "session-b")
        XCTAssertEqual(shared.savedWindow("b")?.showsUnsavedSet, true)
        XCTAssertTrue(shared.savedWindow("b")?.set?.tabs.contains { $0.url == "https://kept.test/" } == true,
                      "\(String(describing: shared.savedWindow("b")?.set?.tabs.map(\.url)))")
        shared.windowsDiscarded(["session-b"])
        XCTAssertNil(shared.savedWindow("b"))
        XCTAssertTrue(shared.recentlyClosed.rows.contains { $0.url == "https://kept.test/" })
        XCTAssertEqual(shared.windows.map(\.windowId), [a.windowId])
    }

    func testEachWindowComesBackAfterARelaunch() throws {
        let shared = services()
        let a = TabsManager(services: shared, windowId: "a")
        a.createTab(url: URL(string: "https://home.test/")!)
        let b = TabsManager(services: shared, windowId: "b")
        b.createTab(url: URL(string: "https://draft.test/")!)
        shared.saveSession()
        shared.sessionStore.flush()

        let again = services()
        let restoredA = TabsManager(services: again, windowId: "a")
        let restoredB = TabsManager(services: again, windowId: "b")
        XCTAssertEqual(restoredA.shownSetId, TabSets.iphoneId)
        XCTAssertTrue(restoredA.tabs.contains { $0.currentURL.host == "home.test" })
        XCTAssertTrue(restoredB.showsUnsavedSet)
        XCTAssertTrue(restoredB.tabs.contains { $0.currentURL.host == "draft.test" })
    }

    func testTheDeviceSetIsThisIPhoneOnAPhone() {
        guard UIDevice.current.userInterfaceIdiom == .phone else { return }
        XCTAssertEqual(TabSets.deviceSetName, SyncCopy.text("spaces.thisIPhone"))
    }
}
