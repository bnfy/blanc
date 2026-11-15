import XCTest
@testable import Blanc

final class StartAppearanceTests: XCTestCase {
    private func directory() -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    func testClockReadsTheIPhonesFirstRunClock() {
        let clock = StartAppearanceStore(directory: directory()).clock
        XCTAssertEqual(clock["newtabClockFont"] as? String, "flex")
        XCTAssertEqual(clock["newtabClockHeight"] as? Int, 300)
        XCTAssertEqual(clock["newtabClockWeight"] as? Int, 450)
        // The iPhone keeps Liquid Glass (owner, 2026-11-15); Android is solid only.
        XCTAssertEqual(clock["newtabClockStyle"] as? String, "glass")
    }

    func testClockWritesTheForksFieldsAndPersists() throws {
        let dir = directory()
        let store = StartAppearanceStore(directory: dir)
        try store.writeClock(["newtabClockFont": "inter", "newtabClockWeight": 800, "newtabClockHeight": 200,
                              "newtabClockTone": 30, "newtabClockColor": "iris", "newtabClockStyle": "solid"])
        // Out of range, unknown or wrongly typed values are dropped, as the fork's SanitizeClockUpdate drops them.
        try store.writeClock(["newtabClockFont": "unknown", "newtabClockWeight": 1001, "newtabClockHeight": 99,
                              "newtabClockTone": -1, "newtabClockStyle": "chrome", "newtabClockColor": true, "other": "x"])
        let clock = StartAppearanceStore(directory: dir).clock
        XCTAssertEqual(clock["newtabClockFont"] as? String, "inter")
        XCTAssertEqual(clock["newtabClockWeight"] as? Int, 800)
        XCTAssertEqual(clock["newtabClockHeight"] as? Int, 200)
        XCTAssertEqual(clock["newtabClockTone"] as? Int, 30)
        XCTAssertEqual(clock["newtabClockColor"] as? String, "iris")
        XCTAssertEqual(clock["newtabClockStyle"] as? String, "solid")
        XCTAssertNil(clock["other"])
    }

    func testSanitizeClockRejectsBooleansAndFractions() {
        XCTAssertTrue(StartAppearanceStore.sanitizeClock(["newtabClockWeight": true, "newtabClockHeight": 150.5]).isEmpty)
    }

    func testForkPreferencesCarryOnlyWhatWasChosen() {
        XCTAssertTrue(StartAppearanceStore.forkPreferences(from: [:], hasPhoto: false).isEmpty)
        let record = StartAppearanceStore.forkPreferences(from: [
            "newtabColorWallpaper": true, "newtabWallpaperColor": "sky", "newtabWallpaperFill": "gradient",
            "newtabWallpaperStyle": "dark", "newtabWallpaperWash": 45, "newtabDynamicWallpaper": false,
        ], hasPhoto: false)
        XCTAssertEqual(record["dynamicWallpaperEnabled"] as? Bool, false)
        let wallpaper = record["wallpaper"] as? [String: Any]
        XCTAssertEqual(wallpaper?["source"] as? String, "color")
        XCTAssertEqual(wallpaper?["style"] as? String, "dark")
        XCTAssertEqual(wallpaper?["wash"] as? Int, 45)
        let color = wallpaper?["color"] as? [String: Any]
        XCTAssertEqual(color?["preset"] as? String, "sky")
        XCTAssertEqual((color?["paint"] as? [String: Any])?["fill"] as? String, "gradient")
    }

    func testForkPreferencesLeaveACustomSourceToThePhoto() {
        // A photo sets the source once the page has stored it; time of day stays the base choice.
        let record = StartAppearanceStore.forkPreferences(from: [
            "newtabCustomWallpaper": true, "newtabColorWallpaper": true, "newtabDynamicWallpaper": true,
        ], hasPhoto: true)
        XCTAssertEqual((record["wallpaper"] as? [String: Any])?["source"] as? String, "time-of-day")
        XCTAssertEqual(record["dynamicWallpaperEnabled"] as? Bool, true)
    }

    func testForkPreferencesDropInvalidValues() {
        let record = StartAppearanceStore.forkPreferences(from: [
            "newtabWallpaperColor": "neon", "newtabWallpaperFill": "glitter", "newtabWallpaperStyle": "loud",
            "newtabWallpaperWash": 101,
        ], hasPhoto: false)
        XCTAssertTrue(record.isEmpty)
    }

    func testMigrationHandsOverThePhotoOnceThenForgetsIt() throws {
        let dir = directory()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let saved: [String: Any] = ["newtabCustomWallpaper": true, "imageVersion": "v-1", "newtabWallpaperWash": 60,
                                    "newtabClockFont": "inter"]
        try JSONSerialization.data(withJSONObject: saved).write(to: dir.appendingPathComponent("start-appearance.json"))
        try Data([0xFF, 0xD8, 0xFF]).write(to: dir.appendingPathComponent("start-wallpaper.jpg"))
        let store = StartAppearanceStore(directory: dir)
        let migration = try XCTUnwrap(store.forkMigration)
        XCTAssertEqual(migration["photo"] as? String, "ios-wallpaper.jpg?v=v%2D1")
        XCTAssertEqual(store.legacyPhotoVersion, "v-1")
        XCTAssertEqual(((migration["preferences"] as? [String: Any])?["wallpaper"] as? [String: Any])?["wash"] as? Int, 60)

        try store.finishForkMigration()
        let reopened = StartAppearanceStore(directory: dir)
        XCTAssertNil(reopened.forkMigration)
        XCTAssertFalse(reopened.hasLegacyPhoto)
        XCTAssertNil(reopened.legacyPhotoVersion)
        // The clock stays with the store; the wallpaper keys went to the page.
        XCTAssertEqual(reopened.clock["newtabClockFont"] as? String, "inter")
        XCTAssertNil(reopened.values["newtabWallpaperWash"])
    }

    func testNoPhotoWithoutTheCustomChoice() throws {
        let dir = directory()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Data([0xFF]).write(to: dir.appendingPathComponent("start-wallpaper.jpg"))
        XCTAssertNil(StartAppearanceStore(directory: dir).forkMigration?["photo"])
    }
}

final class StartPageStoreTests: XCTestCase {
    private func store() -> (StartPageStore, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return (StartPageStore(directory: dir), dir)
    }

    func testWidgetsStartOffWithSixShortcuts() {
        let widgets = store().0.widgets
        XCTAssertEqual(widgets["favorites"] as? Bool, false)
        XCTAssertEqual(widgets["devices"] as? Bool, false)
        XCTAssertEqual(widgets["shortcuts"] as? Bool, false)
        XCTAssertEqual(widgets["shortcutCount"] as? Int, 6)
        XCTAssertEqual(widgets["place"] as? [String: [String]], ["left": ["favorites", "devices"], "right": ["sent"]])
    }

    func testWidgetChangesFollowAndroidsValidation() throws {
        let (store, dir) = store()
        try store.changeWidgets("widgetsWrite", args: ["favorites", true])
        try store.changeWidgets("widgetsShortcuts", args: [9])
        try store.changeWidgets("widgetsSize", args: ["devices", 480])
        try store.changeWidgets("widgetsPlace", args: [["sent", "sent", "nope"], ["favorites"]])
        XCTAssertThrowsError(try store.changeWidgets("widgetsWrite", args: ["weather", true]))
        XCTAssertThrowsError(try store.changeWidgets("widgetsWrite", args: ["favorites", 1]))
        XCTAssertThrowsError(try store.changeWidgets("widgetsShortcuts", args: [13]))
        XCTAssertThrowsError(try store.changeWidgets("widgetsSize", args: ["sent", 240]))
        XCTAssertThrowsError(try store.changeWidgets("widgetsSize", args: ["devices", 250]))
        let widgets = StartPageStore(directory: dir).widgets
        XCTAssertEqual(widgets["favorites"] as? Bool, true)
        XCTAssertEqual(widgets["shortcutCount"] as? Int, 9)
        XCTAssertEqual(widgets["sizes"] as? [String: Int], ["devices": 480])
        XCTAssertEqual(widgets["place"] as? [String: [String]], ["left": ["sent", "devices"], "right": ["favorites"]])
        try store.changeWidgets("widgetsSize", args: ["devices", 0])
        XCTAssertEqual(store.widgets["sizes"] as? [String: Int], [:])
        // The old 6-or-12 switch sets the count it stood for.
        try store.changeWidgets("widgetsWrite", args: ["shortcuts", true])
        XCTAssertEqual(store.widgets["shortcutCount"] as? Int, 12)
    }

    func testPinsAreTheForksRules() {
        let (store, dir) = store()
        XCTAssertEqual(store.changePin(pin: true, url: "HTTPS://Example.com", title: "  Example  ") as? [String: Bool], ["ok": true])
        XCTAssertEqual(store.changePin(pin: true, url: "javascript:alert(1)", title: "") as? [String: AnyHashable],
                       ["ok": false, "reason": "invalid"])
        XCTAssertEqual(store.changePin(pin: true, url: "https://www.blanc.day/x", title: "") as? [String: Bool], ["ok": true])
        // A new pin leads; an untitled one is named after its host without www.
        XCTAssertEqual(StartPageStore(directory: dir).pins, [["url": "https://www.blanc.day/x", "title": "blanc.day"],
                                                             ["url": "https://example.com/", "title": "Example"]])
        for i in 0..<6 { _ = store.changePin(pin: true, url: "https://site\(i).test/", title: "") }
        XCTAssertEqual(store.changePin(pin: true, url: "https://ninth.test/", title: "") as? [String: AnyHashable],
                       ["ok": false, "reason": "full"])
        XCTAssertEqual(store.changePin(pin: false, url: "https://example.com/", title: "") as? Bool, true)
        XCTAssertEqual(store.changePin(pin: false, url: "https://example.com/", title: "") as? Bool, false)
        XCTAssertEqual(store.pinsList["max"] as? Int, 8)
        XCTAssertEqual(store.pins.count, 7)
    }

    func testPrivatePagesPreferencesPersist() {
        let (store, dir) = store()
        XCTAssertNil(store.preferences)
        store.preferences = #"{"wallpaper":{"source":"color"}}"#
        XCTAssertEqual(StartPageStore(directory: dir).preferences, #"{"wallpaper":{"source":"color"}}"#)
    }

    func testIntegersOnly() {
        XCTAssertEqual(StartPageStore.int(3), 3)
        XCTAssertNil(StartPageStore.int(true))
        XCTAssertNil(StartPageStore.int(1.5))
    }

    func testTopSitesRankVisitsPerSite() {
        let now: Int64 = 100 * 24 * 60 * 60 * 1000
        let day: Int64 = 24 * 60 * 60 * 1000
        let entries = [
            HistoryEntry(url: "https://www.news.test/today", title: "Today", visitedAt: now - 1),
            HistoryEntry(url: "https://duckduckgo.com/?q=blanc", title: "blanc at DuckDuckGo", visitedAt: now - 2),
            HistoryEntry(url: "https://blog.test/a", title: "A", visitedAt: now - 3),
            HistoryEntry(url: "https://news.test/yesterday", title: "Yesterday", visitedAt: now - day),
            HistoryEntry(url: "https://www.google.com/search?q=x", title: "x - Google", visitedAt: now - day),
            HistoryEntry(url: "https://duckduckgo.com/", title: "DuckDuckGo", visitedAt: now - day),
            HistoryEntry(url: "http://user:pw@login.test/", title: "Login", visitedAt: now - day),
            HistoryEntry(url: "ftp://files.test/", title: "Files", visitedAt: now - day),
            HistoryEntry(url: "https://old.test/", title: "Old", visitedAt: now - 91 * day),
        ]
        let sites = StartPageStore.topSites(entries, now: now)
        // www. folds into one site, shown as its page visited last; a results page doesn't count, the engine's home does.
        XCTAssertEqual(sites, [
            ["url": "https://www.news.test/today", "key": "news.test", "title": "Today"],
            ["url": "https://blog.test/a", "key": "blog.test", "title": "A"],
            ["url": "https://duckduckgo.com/", "key": "duckduckgo.com", "title": "DuckDuckGo"],
        ])
        XCTAssertEqual(StartPageStore.topSites(entries, now: now, offset: 1, limit: 1).map { $0["key"] }, ["blog.test"])
    }
}
