import XCTest
@testable import Blanc

/// M18 §3.3: the walkthrough's two device-local values.
final class WalkthroughStoreTests: XCTestCase {
    private func directory() -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    func testUsagePingIsUnsavedOnAFreshStore() {
        let store = SettingsStore(directory: directory())
        XCTAssertNil(store.usagePing, "no ping until the person saves or skips the privacy step")
        XCTAssertTrue(store.usagePingShown, "the switch shows the schema default")
        XCTAssertEqual(store.walkthroughCompletedVersion, 0)
    }

    func testBothValuesPersist() {
        let dir = directory()
        let store = SettingsStore(directory: dir)
        store.update(usagePing: false, walkthroughCompletedVersion: 1)
        store.flush()
        let reloaded = SettingsStore(directory: dir)
        XCTAssertEqual(reloaded.usagePing, false)
        XCTAssertEqual(reloaded.walkthroughCompletedVersion, 1)
    }

    func testNeitherValueIsSynced() {
        let synced = SyncedSettings(payload: .object([])).payload().jsStringify()
        XCTAssertFalse(synced.contains("walkthroughCompletedVersion"))
        XCTAssertFalse(synced.contains("usagePing"))
    }
}
