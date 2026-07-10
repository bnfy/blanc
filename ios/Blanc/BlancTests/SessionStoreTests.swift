import XCTest
@testable import Blanc

final class SessionStoreTests: XCTestCase {
    private func tmpDir() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("SessionStoreTests-\(UUID().uuidString)")
    }

    private func writeJSON(_ dict: [String: Any], to dir: URL) {
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let data = try! JSONSerialization.data(withJSONObject: dict)
        try! data.write(to: dir.appendingPathComponent("session.json"))
    }

    func testDefaultsOnMissingFile() {
        let store = SessionStore(directory: tmpDir())
        XCTAssertEqual(store.urls, [])
        XCTAssertEqual(store.activeIndex, 0)
    }

    func testLoadsFromDisk() {
        let dir = tmpDir()
        writeJSON(["urls": ["https://a.test", "https://b.test"], "activeIndex": 1], to: dir)
        let store = SessionStore(directory: dir)
        XCTAssertEqual(store.urls, ["https://a.test", "https://b.test"])
        XCTAssertEqual(store.activeIndex, 1)
    }

    func testRoundTrip() {
        let dir = tmpDir()
        let store = SessionStore(directory: dir)
        store.save(urls: ["https://x.test"], activeIndex: 0)
        store.flush()

        let store2 = SessionStore(directory: dir)
        XCTAssertEqual(store2.urls, ["https://x.test"])
        XCTAssertEqual(store2.activeIndex, 0)
    }

    func testEmptyURLsNotWritten() {
        let dir = tmpDir()
        let store = SessionStore(directory: dir)
        store.save(urls: [], activeIndex: 0)
        store.flush()

        let exists = FileManager.default.fileExists(
            atPath: dir.appendingPathComponent("session.json").path)
        XCTAssertFalse(exists, "empty session must not be written to disk")
    }

    func testCorruptFileFallsBackToEmpty() {
        let dir = tmpDir()
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try! "garbage".data(using: .utf8)!
            .write(to: dir.appendingPathComponent("session.json"))
        let store = SessionStore(directory: dir)
        XCTAssertEqual(store.urls, [])
    }

    func testActiveIndexLoadedVerbatim() {
        // SessionStore stores the raw activeIndex — it has no tab count, so it
        // cannot clamp. Clamping to the restored tab range is TabsManager's job
        // (see TabsManagerTests.testActiveIndexClampedToRange).
        let dir = tmpDir()
        writeJSON(["urls": ["https://a.test"], "activeIndex": 99], to: dir)
        let store = SessionStore(directory: dir)
        XCTAssertEqual(store.activeIndex, 99)
    }
}
