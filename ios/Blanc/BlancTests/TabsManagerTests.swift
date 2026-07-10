import XCTest
@testable import Blanc

final class TabsManagerTests: XCTestCase {
    private func tmpDir() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("TabsManagerTests-\(UUID().uuidString)")
    }

    private func makeManager() -> TabsManager {
        TabsManager(settingsDirectory: tmpDir())
    }

    func testInitCreatesOneTab() {
        let m = makeManager()
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertNotNil(m.activeTabId)
        XCTAssertNotNil(m.activeTab)
    }

    func testCreateTabAddsAndActivates() {
        let m = makeManager()
        let before = m.tabs.count
        let id = m.createTab()
        XCTAssertEqual(m.tabs.count, before + 1)
        XCTAssertEqual(m.activeTabId, id)
    }

    func testCloseTabRemoves() {
        let m = makeManager()
        let id = m.createTab()
        let count = m.tabs.count
        m.closeTab(id)
        XCTAssertEqual(m.tabs.count, count - 1)
    }

    func testCloseActivePicksRightNeighbor() {
        let m = makeManager()
        let _ = m.createTab(url: URL(string: "https://b.test")!)
        let c = m.createTab(url: URL(string: "https://c.test")!)
        let b = m.tabs[1].id
        m.setActive(b)
        m.closeTab(b)
        XCTAssertEqual(m.activeTabId, c)
    }

    func testCloseRightmostActivePicksLeft() {
        let m = makeManager()
        let a = m.tabs[0].id
        let b = m.createTab(url: URL(string: "https://b.test")!)
        m.closeTab(b)
        XCTAssertEqual(m.activeTabId, a)
    }

    func testCloseLastCreatesNew() {
        let m = makeManager()
        let onlyId = m.tabs[0].id
        m.closeTab(onlyId)
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertNotNil(m.activeTabId)
        XCTAssertNotEqual(m.activeTabId, onlyId)
    }

    func testSetActive() {
        let m = makeManager()
        let a = m.tabs[0].id
        let _ = m.createTab()
        m.setActive(a)
        XCTAssertEqual(m.activeTabId, a)
    }

    func testSetActiveIgnoresUnknownId() {
        let m = makeManager()
        let before = m.activeTabId
        m.setActive(UUID())
        XCTAssertEqual(m.activeTabId, before)
    }

    func testActiveTabMatchesId() {
        let m = makeManager()
        let id = m.createTab(url: URL(string: "https://test.com")!)
        XCTAssertEqual(m.activeTab?.id, id)
    }

    func testCloseNonActivePreservesActive() {
        let m = makeManager()
        let a = m.tabs[0].id
        let b = m.createTab()
        m.closeTab(a)
        XCTAssertEqual(m.activeTabId, b)
    }

    func testInitReadsStoredSearchEngine() {
        let dir = tmpDir()
        let data = try! JSONSerialization.data(withJSONObject: ["searchEngine": "brave"])
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try! data.write(to: dir.appendingPathComponent("settings.json"))

        let m = TabsManager(settingsDirectory: dir)
        XCTAssertEqual(m.normalizer.searchEngine, .brave)
    }

    func testInitReadsStoredAdblockDisabled() {
        let dir = tmpDir()
        let data = try! JSONSerialization.data(withJSONObject: ["adblockEnabled": false])
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try! data.write(to: dir.appendingPathComponent("settings.json"))

        let m = TabsManager(settingsDirectory: dir)
        XCTAssertEqual(m.settingsStore.adblockEnabled, false)
        XCTAssertFalse(m.isAdBlockReady)
    }

    // MARK: - applySettingsPatch

    func testPatchThemeUpdatesStore() {
        let m = makeManager()
        m.applySettingsPatch(["theme": "dark"])
        XCTAssertEqual(m.settingsStore.theme, .dark)
    }

    func testPatchSearchEngineUpdatesNormalizer() {
        let m = makeManager()
        m.applySettingsPatch(["searchEngine": "google"])
        XCTAssertEqual(m.settingsStore.searchEngine, .google)
        XCTAssertEqual(m.normalizer.searchEngine, .google)
    }

    func testPatchInvalidEnumIsDropped() {
        let m = makeManager()
        m.applySettingsPatch(["theme": "neon"])
        XCTAssertEqual(m.settingsStore.theme, BlancSettingsDefaults.theme)
    }

    func testPatchUnknownKeyIsDropped() {
        let m = makeManager()
        m.applySettingsPatch(["unknownKey": "value"])
        m.settingsStore.flush()   // `.atomic` write creates the file even on first save
        let data = try! Data(contentsOf: m.settingsStore.testFileURL)
        let dict = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertNil(dict["unknownKey"], "bridge patch must not persist unknown keys")
    }

    func testPatchAdblockDisabledUpdatesStore() {
        let m = makeManager()
        m.applySettingsPatch(["adblockEnabled": false])
        XCTAssertEqual(m.settingsStore.adblockEnabled, false)
    }
}
