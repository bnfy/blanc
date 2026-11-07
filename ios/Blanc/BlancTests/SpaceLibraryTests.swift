import XCTest
@testable import Blanc

/// Multiple windows W2a: the tab sets live in `SpaceLibrary`, shared by
/// every window, and one save holds every window.
@MainActor final class SpaceLibraryTests: XCTestCase {
    private func directory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("Library-\(UUID().uuidString)")
    }

    func testOneSaveHoldsEveryWindowsSetAndEachRestoresItsOwn() throws {
        let dir = directory()
        let services = BrowserServices(settingsDirectory: dir, sessionDirectory: dir)
        let a = TabsManager(services: services, windowId: "a")
        a.createTab(url: URL(string: "https://home.test/")!)
        let work = try a.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        let b = TabsManager(services: services, windowId: "b")
        b.show(set: work)
        b.createTab(url: URL(string: "https://work.test/")!)
        services.saveSession()
        services.sessionStore.flush()

        let state = try XCTUnwrap(SessionStore(directory: dir).state)
        XCTAssertEqual(state.windows, [SavedWindow(id: "a", shown: TabSets.iphoneId), SavedWindow(id: "b", shown: work)])
        XCTAssertTrue(state.iphone.tabs.contains { $0.url == "https://home.test/" })
        XCTAssertTrue(try XCTUnwrap(state.spaces.first { $0.id == work }).set.tabs.contains { $0.url == "https://work.test/" })

        let again = BrowserServices(settingsDirectory: dir, sessionDirectory: dir)
        let restoredB = TabsManager(services: again, windowId: "b")
        XCTAssertEqual(restoredB.shownSetId, work)
        XCTAssertTrue(restoredB.tabs.contains { $0.currentURL.host == "work.test" })
    }

    func testAFileWithoutWindowsOpensItsShownSet() throws {
        let dir = directory()
        let services = BrowserServices(settingsDirectory: dir, sessionDirectory: dir)
        let only = TabsManager(services: services)
        let work = try only.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        only.show(set: work)
        services.saveSession()
        services.sessionStore.flush()
        // As an older build wrote it: no windows list.
        let file = dir.appendingPathComponent("session.json")
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        var raw = try XCTUnwrap(json["state"] as? [String: Any])
        raw["windows"] = nil
        json["state"] = raw
        try JSONSerialization.data(withJSONObject: json).write(to: file)

        let restored = TabsManager(services: BrowserServices(settingsDirectory: dir, sessionDirectory: dir), windowId: "new")
        XCTAssertEqual(restored.shownSetId, work)
    }

    func testWindowsShareTheSpaces() throws {
        let services = BrowserServices(settingsDirectory: directory(), sessionDirectory: directory())
        let a = TabsManager(services: services, windowId: "a")
        let b = TabsManager(services: services, windowId: "b")
        _ = try a.createSpace(name: "Reading", color: "#426c4c", symbol: "book")
        XCTAssertEqual(b.spaces.map(\.name), ["Reading"])
    }

    func testASettingAppliesOnceAndReachesEveryWindow() {
        let services = BrowserServices(settingsDirectory: directory(), sessionDirectory: directory())
        let a = TabsManager(services: services, windowId: "a")
        let b = TabsManager(services: services, windowId: "b")
        b.applySettingsPatch(["searchEngine": "bing"])
        XCTAssertEqual(services.settingsStore.searchEngine, .bing)
        XCTAssertEqual(a.normalizer.searchEngine, .bing)
        XCTAssertEqual(b.normalizer.searchEngine, .bing)
    }
}
