import XCTest
@testable import Blanc

final class SettingsStoreTests: XCTestCase {
    private func tmpDir() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("SettingsStoreTests-\(UUID().uuidString)")
    }

    private func writeJSON(_ dict: [String: Any], to dir: URL) {
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let data = try! JSONSerialization.data(withJSONObject: dict)
        try! data.write(to: dir.appendingPathComponent("settings.json"))
    }

    func testDefaultsOnMissingFile() {
        let store = SettingsStore(directory: tmpDir())
        XCTAssertEqual(store.theme, BlancSettingsDefaults.theme)
        XCTAssertEqual(store.searchEngine, BlancSettingsDefaults.searchEngine)
        XCTAssertEqual(store.adblockEnabled, BlancSettingsDefaults.adblockEnabled)
    }

    func testLoadsFromDisk() {
        let dir = tmpDir()
        writeJSON(["theme": "dark", "searchEngine": "brave", "adblockEnabled": false], to: dir)
        let store = SettingsStore(directory: dir)
        XCTAssertEqual(store.theme, .dark)
        XCTAssertEqual(store.searchEngine, .brave)
        XCTAssertEqual(store.adblockEnabled, false)
    }

    func testRoundTrip() {
        let dir = tmpDir()
        let store = SettingsStore(directory: dir)
        store.update(theme: .dark, searchEngine: .google, adblockEnabled: false)
        store.flush()

        let store2 = SettingsStore(directory: dir)
        XCTAssertEqual(store2.theme, .dark)
        XCTAssertEqual(store2.searchEngine, .google)
        XCTAssertEqual(store2.adblockEnabled, false)
    }

    func testFirstEverSaveCreatesFile() {
        // Regression guard: a first-run save must CREATE settings.json, not throw
        // because the destination doesn't exist yet. `.atomic` handles create.
        let dir = tmpDir()
        let store = SettingsStore(directory: dir)
        store.update(theme: .dark)
        store.flush()

        let path = dir.appendingPathComponent("settings.json").path
        XCTAssertTrue(FileManager.default.fileExists(atPath: path),
                      "the very first save must create the file")
        let store2 = SettingsStore(directory: dir)
        XCTAssertEqual(store2.theme, .dark)
    }

    func testUnknownKeysPreserved() {
        let dir = tmpDir()
        writeJSON(["theme": "light", "futureKey": 42, "anotherFuture": "hello"], to: dir)
        let store = SettingsStore(directory: dir)
        store.update(theme: .dark)
        store.flush()

        let data = try! Data(contentsOf: dir.appendingPathComponent("settings.json"))
        let dict = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["futureKey"] as? Int, 42)
        XCTAssertEqual(dict["anotherFuture"] as? String, "hello")
        XCTAssertEqual(dict["theme"] as? String, "dark")
    }

    func testCorruptFileFallsBackToDefaults() {
        let dir = tmpDir()
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try! "not json".data(using: .utf8)!.write(to: dir.appendingPathComponent("settings.json"))
        let store = SettingsStore(directory: dir)
        XCTAssertEqual(store.theme, BlancSettingsDefaults.theme)
    }

    func testInvalidEnumValueFallsBackToDefault() {
        let dir = tmpDir()
        writeJSON(["theme": "neon", "searchEngine": "altavista"], to: dir)
        let store = SettingsStore(directory: dir)
        XCTAssertEqual(store.theme, BlancSettingsDefaults.theme)
        XCTAssertEqual(store.searchEngine, BlancSettingsDefaults.searchEngine)
    }
}
