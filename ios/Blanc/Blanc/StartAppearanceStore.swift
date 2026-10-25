import Foundation
import Observation
import UIKit

/// Device-local Start Page appearance. Image data never leaves the app.
@Observable
final class StartAppearanceStore {
    private(set) var values: [String: Any] = [:]
    let imageURL: URL
    private let fileURL: URL
    private static let presets = ["sage", "sky", "iris", "rose", "clay", "sand", "slate", "graphite"]

    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        fileURL = root.appendingPathComponent("start-appearance.json")
        imageURL = root.appendingPathComponent("start-wallpaper.jpg")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            values = saved
        }
    }

    var payload: [String: Any] {
        let hasImage = FileManager.default.fileExists(atPath: imageURL.path)
        return ["settings": values, "hasImage": hasImage,
                "image": hasImage ? "blanc://newtab/ios-wallpaper.jpg?v=\(values["imageVersion"] ?? "0")" : NSNull()]
    }

    @discardableResult
    func change(_ method: String, value: Any?) throws -> [String: Any] {
        var next = values
        func select(_ key: String, _ choices: [String]) {
            if let s = value as? String, choices.contains(s) { next[key] = s }
        }
        switch method {
        case "setClock":
            if let patch = value as? [String: Any] {
                let enums = ["font": ["instrument", "condensed", "inter", "flex"],
                             "color": ["auto"] + Self.presets, "style": ["solid", "glass"]]
                for (key, options) in enums {
                    if let v = patch[key] as? String, options.contains(v) {
                        next["newtabClock" + key.prefix(1).uppercased() + key.dropFirst()] = v
                    }
                }
                for (key, range) in ["weight": 100...1000, "tone": 0...100, "height": 100...300] {
                    if let n = patch[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
                       n.doubleValue == Double(n.intValue), range.contains(n.intValue) {
                        next["newtabClock" + key.prefix(1).uppercased() + key.dropFirst()] = n.intValue
                    }
                }
            }
        case "setDynamicWallpaper":
            if let v = value as? Bool { next["newtabDynamicWallpaper"] = v }
        case "setWallpaper":
            if let source = value as? String {
                switch source {
                case "custom": next["newtabCustomWallpaper"] = true
                case "color": next["newtabColorWallpaper"] = true; next["newtabCustomWallpaper"] = false
                case "sunrise", "time-of-day":
                    next["newtabDynamicWallpaper"] = source == "time-of-day"
                    next["newtabColorWallpaper"] = false; next["newtabCustomWallpaper"] = false
                default: break
                }
            }
        case "setWallpaperColor": select("newtabWallpaperColor", Self.presets)
        case "setWallpaperFill": select("newtabWallpaperFill", ["soft", "solid", "gradient"])
        case "setWallpaperStyle": select("newtabWallpaperStyle", ["auto", "light", "dark", "spotlight"])
        case "setWallpaperWash":
            if let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
               n.doubleValue == Double(n.intValue), (0...100).contains(n.intValue) {
                next["newtabWallpaperWash"] = n.intValue
            }
        case "removeWallpaper":
            if FileManager.default.fileExists(atPath: imageURL.path) { try FileManager.default.removeItem(at: imageURL) }
            next["newtabCustomWallpaper"] = false
        default: break
        }
        try save(next)
        return payload
    }

    func importImage(_ image: UIImage) throws {
        let longest = max(image.size.width, image.size.height)
        guard longest > 0 else { throw CocoaError(.fileReadCorruptFile) }
        let scale = min(1, 3840 / longest)
        let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let data = normalized.jpegData(compressionQuality: 0.85) else { throw CocoaError(.fileWriteUnknown) }
        try data.write(to: imageURL, options: .atomic)
        var next = values
        next["newtabCustomWallpaper"] = true
        next["imageVersion"] = UUID().uuidString
        try save(next)
    }

    private func save(_ next: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: next, options: [.sortedKeys])
        try data.write(to: fileURL, options: .atomic)
        values = next
    }
}
