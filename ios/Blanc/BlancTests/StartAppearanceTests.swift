import XCTest
import UIKit
@testable import Blanc

final class StartAppearanceTests: XCTestCase {
    func testAppearancePersistsAndRejectsInvalidValues() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = StartAppearanceStore(directory: dir)
        try store.change("setClock", value: ["font": "flex", "weight": 800, "height": 200, "tone": 30, "color": "iris", "style": "glass"])
        try store.change("setWallpaper", value: "color")
        try store.change("setWallpaperColor", value: "sky")
        try store.change("setWallpaperFill", value: "solid")
        try store.change("setWallpaperStyle", value: "dark")
        try store.change("setWallpaperWash", value: 45)
        try store.change("setDynamicWallpaper", value: true)
        try store.change("setClock", value: ["font": "unknown", "weight": 1001, "height": 99, "tone": -1])
        try store.change("setWallpaperWash", value: 101)
        try store.change("setWallpaperColor", value: "invalid")
        let saved = StartAppearanceStore(directory: dir).values
        XCTAssertEqual(saved["newtabClockFont"] as? String, "flex")
        XCTAssertEqual(saved["newtabClockWeight"] as? Int, 800)
        XCTAssertEqual(saved["newtabClockHeight"] as? Int, 200)
        XCTAssertEqual(saved["newtabClockTone"] as? Int, 30)
        XCTAssertEqual(saved["newtabClockColor"] as? String, "iris")
        XCTAssertEqual(saved["newtabClockStyle"] as? String, "glass")
        XCTAssertEqual(saved["newtabWallpaperColor"] as? String, "sky")
        XCTAssertEqual(saved["newtabWallpaperFill"] as? String, "solid")
        XCTAssertEqual(saved["newtabWallpaperStyle"] as? String, "dark")
        XCTAssertEqual(saved["newtabWallpaperWash"] as? Int, 45)
        XCTAssertEqual(saved["newtabDynamicWallpaper"] as? Bool, true)
    }

    func testCustomImageIsLocalResizedReplaceableAndRemovable() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = StartAppearanceStore(directory: dir)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4000, height: 2000), format: format).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4000, height: 2000))
        }
        try store.importImage(image)
        let stored = try XCTUnwrap(UIImage(contentsOfFile: store.imageURL.path))
        XCTAssertEqual(stored.size.width, 3840)
        XCTAssertEqual(stored.size.height, 1920)
        XCTAssertEqual(store.payload["hasImage"] as? Bool, true)
        XCTAssertEqual(store.values["newtabCustomWallpaper"] as? Bool, true)
        let previousURL = store.payload["image"] as? String
        try store.importImage(image)
        XCTAssertNotEqual(store.payload["image"] as? String, previousURL)
        try store.change("removeWallpaper", value: nil)
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.imageURL.path))
        XCTAssertEqual(store.payload["hasImage"] as? Bool, false)
        XCTAssertEqual(StartAppearanceStore(directory: dir).values["newtabCustomWallpaper"] as? Bool, false)
    }
}
