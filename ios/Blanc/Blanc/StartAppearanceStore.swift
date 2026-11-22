import Foundation
import Observation

/// Device-local Start Page clock, and what is left of the wallpaper choices
/// made before the fork's Start Page. The fork's page keeps the wallpaper and
/// photo in its own storage (`newtab-adapter.js`); this store hands the old
/// choices over once (`forkPreferences`), then forgets the photo. Never synced.
@Observable
final class StartAppearanceStore {
    /// What the phone draws: the saved choices over `defaults`.
    var values: [String: Any] { Self.defaults.merging(saved) { $1 } }
    /// The phone's own first-run clock, kept out of the file so a person who
    /// never changed it follows any later default: Roboto Flex at its tallest,
    /// in Liquid Glass, with a light stroke (stretching thins the figures, so
    /// anything under about 300 draws as a hairline). Desktop keeps
    /// settings-schema's defaults; this store never syncs.
    static let defaults: [String: Any] = ["newtabClockFont": "flex", "newtabClockHeight": 300,
                                          "newtabClockStyle": "glass", "newtabClockWeight": 450]
    private var saved: [String: Any] = [:]
    /// The photo chosen before the fork's page, until it's carried over.
    let imageURL: URL
    private let fileURL: URL
    static let presets = ["sage", "sky", "iris", "rose", "clay", "sand", "slate", "graphite"]

    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        fileURL = root.appendingPathComponent("start-appearance.json")
        imageURL = root.appendingPathComponent("start-wallpaper.jpg")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            self.saved = saved
        }
    }

    // MARK: The clock

    /// The fork's `clockRead` answer: every clock field, saved or default.
    var clock: [String: Any] { values.filter { $0.key.hasPrefix("newtabClock") } }

    /// The fork's `SanitizeClockUpdate` (billboard_clock_settings.inc), with
    /// the style: the iPhone draws Glass. Unknown keys and values are dropped.
    static func sanitizeClock(_ input: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        let choices = ["newtabClockFont": ["instrument", "condensed", "inter", "flex"],
                       "newtabClockColor": ["auto"] + presets, "newtabClockStyle": ["solid", "glass"]]
        for (key, allowed) in choices {
            if let value = input[key] as? String, allowed.contains(value) { out[key] = value }
        }
        for (key, range) in ["newtabClockWeight": 100...1000, "newtabClockTone": 0...100, "newtabClockHeight": 100...300] {
            if let n = input[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
               n.doubleValue == Double(n.intValue), range.contains(n.intValue) {
                out[key] = n.intValue
            }
        }
        return out
    }

    @discardableResult
    func writeClock(_ update: [String: Any]) throws -> [String: Any] {
        let clean = Self.sanitizeClock(update)
        if !clean.isEmpty { try save(saved.merging(clean) { $1 }) }
        return clock
    }

    // MARK: Carrying the old wallpaper over

    /// Whether the old choices were handed to the fork's page.
    var migratedToForkPage: Bool { saved["migratedToForkPage"] as? Bool == true }
    var hasLegacyPhoto: Bool { FileManager.default.fileExists(atPath: imageURL.path) }
    /// The address the old photo is read from once (BlancSchemeHandler checks the version).
    var legacyPhotoVersion: String? { hasLegacyPhoto ? saved["imageVersion"] as? String ?? "0" : nil }

    /// The fork adapter's `blanc.prototype.start.preferences.v1` record for the
    /// choices saved before it: only what was chosen, so the rest stays the
    /// fork's defaults. A photo is carried separately (the page stores it and
    /// sets `wallpaper.imageKey`), so a custom source waits for it.
    static func forkPreferences(from saved: [String: Any], hasPhoto: Bool) -> [String: Any] {
        var record: [String: Any] = [:]
        var wallpaper: [String: Any] = [:]
        let dynamic = saved["newtabDynamicWallpaper"] as? Bool == true
        if saved["newtabDynamicWallpaper"] is Bool { record["dynamicWallpaperEnabled"] = dynamic }
        if saved["newtabColorWallpaper"] as? Bool == true, !(saved["newtabCustomWallpaper"] as? Bool == true && hasPhoto) {
            wallpaper["source"] = "color"
        } else if dynamic {
            wallpaper["source"] = "time-of-day"
        }
        if let style = saved["newtabWallpaperStyle"] as? String, ["auto", "light", "dark", "spotlight"].contains(style) {
            wallpaper["style"] = style
        }
        if let wash = saved["newtabWallpaperWash"] as? NSNumber, CFGetTypeID(wash) != CFBooleanGetTypeID(),
           (0...100).contains(wash.intValue), wash.doubleValue == Double(wash.intValue) {
            wallpaper["wash"] = wash.intValue
        }
        var color: [String: Any] = [:]
        if let preset = saved["newtabWallpaperColor"] as? String, presets.contains(preset) { color["preset"] = preset }
        if let fill = saved["newtabWallpaperFill"] as? String, ["soft", "solid", "gradient"].contains(fill) {
            color["paint"] = ["fill": fill]
        }
        if !color.isEmpty { wallpaper["color"] = color }
        if !wallpaper.isEmpty { record["wallpaper"] = wallpaper }
        return record
    }

    /// What the first Start Page after the update carries over, or nil once done.
    var forkMigration: [String: Any]? {
        guard !migratedToForkPage else { return nil }
        let photo = saved["newtabCustomWallpaper"] as? Bool == true ? legacyPhotoVersion : nil
        var migration: [String: Any] = ["preferences": Self.forkPreferences(from: saved, hasPhoto: photo != nil)]
        if let photo { migration["photo"] = "ios-wallpaper.jpg?v=" + (photo.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "0") }
        return migration
    }

    /// The page has the old choices: stamp it, and drop the old photo file,
    /// which the page now keeps itself (or never wanted).
    func finishForkMigration() throws {
        guard !migratedToForkPage else { return }
        var next = saved
        for key in ["newtabDynamicWallpaper", "newtabColorWallpaper", "newtabCustomWallpaper", "newtabWallpaperStyle",
                    "newtabWallpaperWash", "newtabWallpaperColor", "newtabWallpaperFill", "imageVersion"] {
            next.removeValue(forKey: key)
        }
        next["migratedToForkPage"] = true
        try save(next)
        if hasLegacyPhoto { try? FileManager.default.removeItem(at: imageURL) }
    }

    #if DEBUG
    /// The App Store images' wallpaper: Blanc's own sunrise artwork, handed to
    /// the Start Page as a photo chosen before its page, so the shot shows the
    /// sunrise whatever the time (UITestSeed.appStore).
    func seedAppStorePhoto(_ data: Data) throws {
        guard !migratedToForkPage, !hasLegacyPhoto else { return }
        try data.write(to: imageURL, options: .atomic)
        try save(saved.merging(["newtabCustomWallpaper": true, "imageVersion": "appstore"]) { $1 })
    }
    #endif

    private func save(_ next: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: next, options: [.sortedKeys])
        try data.write(to: fileURL, options: .atomic)
        saved = next
    }
}
