import XCTest
@testable import Blanc

@MainActor final class SyncStateStoreTests: XCTestCase {
    func testDeviceIdMintedOnceAndKept() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = SyncStateStore(directory: dir)
        let id = store.state.deviceId
        XCTAssertEqual(id, id.lowercased())
        XCTAssertNotNil(UUID(uuidString: id))
        try store.update { $0.enabled = true }
        try store.clearData()
        XCTAssertEqual(SyncStateStore(directory: dir).state.deviceId, id)
    }
    func testClearDataRemovesStoreFilesOnly() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = SyncStateStore(directory: dir)
        try store.save(.settings, .object([]))
        try store.clearData()
        XCTAssertNil(store.load(.settings))
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("sync.json").path))
    }
}
