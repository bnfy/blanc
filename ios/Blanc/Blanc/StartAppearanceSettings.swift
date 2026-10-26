import SwiftUI

/// Bindings retain the store's validation and report write failures in the sheet.
struct AppearanceControls {
    let manager: TabsManager
    let reportError: (String) -> Void
    func string(_ key: String, fallback: String, method: String, clock: Bool = false) -> Binding<String> {
        Binding(get: { manager.startAppearance.values[key] as? String ?? fallback }, set: {
            save(method, value: clock ? [String(key.dropFirst("newtabClock".count)).lowercased(): $0] : $0)
        })
    }
    func number(_ key: String, fallback: Double, method: String, clock: Bool = false) -> Binding<Double> {
        Binding(get: { (manager.startAppearance.values[key] as? NSNumber)?.doubleValue ?? fallback }, set: {
            save(method, value: clock ? [String(key.dropFirst("newtabClock".count)).lowercased(): Int($0)] : Int($0))
        })
    }
    func save(_ method: String, value: Any?) {
        do { try manager.changeStartAppearance(method, value: value) }
        catch { reportError(SettingsCopy.text("saveFailed")) }
    }
}

struct WallpaperSettingsView: View {
    let manager: TabsManager
    @State private var showPhotos = false
    @State private var error: String?
    private var controls: AppearanceControls { AppearanceControls(manager: manager, reportError: { error = $0 }) }
    private var source: String {
        let v = manager.startAppearance.values
        if v["newtabCustomWallpaper"] as? Bool == true, FileManager.default.fileExists(atPath: manager.startAppearance.imageURL.path) { return "custom" }
        if v["newtabColorWallpaper"] as? Bool == true { return "color" }
        return v["newtabDynamicWallpaper"] as? Bool == true ? "time-of-day" : "sunrise"
    }
    var body: some View {
        Form {
            Section { StartSettingsPreviewRow(manager: manager) }
            Section {
                Picker(SettingsCopy.text("source"), selection: Binding(get: { source }, set: {
                    if $0 == "custom", !FileManager.default.fileExists(atPath: manager.startAppearance.imageURL.path) { showPhotos = true }
                    else { controls.save("setWallpaper", value: $0) }
                })) {
                    ForEach(["sunrise", "time-of-day", "color", "custom"], id: \.self) { Text(SettingsCopy.text($0)).tag($0) }
                }.accessibilityIdentifier("settings.wallpaperSource")
                Button(SettingsCopy.text("choosePhoto")) { showPhotos = true }.accessibilityIdentifier("settings.choosePhoto")
                if FileManager.default.fileExists(atPath: manager.startAppearance.imageURL.path) {
                    Button(SettingsCopy.text("removePhoto"), role: .destructive) { controls.save("removeWallpaper", value: nil) }
                }
            } footer: { Text(SettingsCopy.text("photoHelp")) }
            if source == "color" {
                Section {
                    colorPicker("color", selection: controls.string("newtabWallpaperColor", fallback: "sage", method: "setWallpaperColor"))
                    Picker(SettingsCopy.text("fill"), selection: controls.string("newtabWallpaperFill", fallback: "soft", method: "setWallpaperFill")) {
                        ForEach(["soft", "solid", "gradient"], id: \.self) { Text(SettingsCopy.text($0)).tag($0) }
                    }
                }
            }
            Section {
                Picker(SettingsCopy.text("treatment"), selection: controls.string("newtabWallpaperStyle", fallback: "auto", method: "setWallpaperStyle")) {
                    ForEach(["auto", "light", "dark", "spotlight"], id: \.self) { Text(SettingsCopy.text($0)).tag($0) }
                }
                SettingsSlider(key: "wash", value: controls.number("newtabWallpaperWash", fallback: 100, method: "setWallpaperWash"), range: 0...100)
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .settingsFormStyle().settingsTitle(SettingsCopy.text("wallpaper"))
        .sheet(isPresented: $showPhotos) {
            WallpaperPicker { image in
                showPhotos = false
                guard let image else { return }
                do {
                    try manager.importWallpaper(image)
                    try manager.changeStartAppearance("setWallpaper", value: "custom")
                } catch { self.error = SettingsCopy.text("saveFailed") }
            }.ignoresSafeArea()
        }
    }
}

struct ClockSettingsView: View {
    let manager: TabsManager
    @State private var error: String?
    private var controls: AppearanceControls { AppearanceControls(manager: manager, reportError: { error = $0 }) }
    private var font: String { manager.startAppearance.values["newtabClockFont"] as? String ?? "instrument" }
    private var weightRange: ClosedRange<Double> {
        switch font { case "inter": return 100...900; case "flex": return 100...1000; default: return 400...700 }
    }
    private var heightMax: Double { font == "flex" ? 300 : (font == "instrument" ? 130 : 100) }
    var body: some View {
        Form {
            Section { StartSettingsPreviewRow(manager: manager, layout: .billboard) }
            Section {
                Picker(SettingsCopy.text("font"), selection: controls.string("newtabClockFont", fallback: "instrument", method: "setClock", clock: true)) {
                    ForEach(["instrument", "condensed", "inter", "flex"], id: \.self) { Text(SettingsCopy.text($0)).tag($0) }
                }.accessibilityIdentifier("settings.clockFont")
                SettingsSlider(key: "weight", value: constrained("newtabClockWeight", fallback: 500, range: weightRange), range: weightRange)
                if heightMax > 100 {
                    SettingsSlider(key: "height", value: constrained("newtabClockHeight", fallback: 100, range: 100...heightMax), range: 100...heightMax)
                }
            }
            Section {
                colorPicker("color", selection: controls.string("newtabClockColor", fallback: "auto", method: "setClock", clock: true), automatic: true)
                SettingsSlider(key: "tone", value: controls.number("newtabClockTone", fallback: 50, method: "setClock", clock: true), range: 0...100)
                Picker(SettingsCopy.text("style"), selection: controls.string("newtabClockStyle", fallback: "solid", method: "setClock", clock: true)) {
                    ForEach(["solid", "glass"], id: \.self) { Text(SettingsCopy.text($0)).tag($0) }
                }
            } footer: { Text(SettingsCopy.text("glassHelp")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }.settingsFormStyle().settingsTitle(SettingsCopy.text("clock"))
    }
    private func constrained(_ key: String, fallback: Double, range: ClosedRange<Double>) -> Binding<Double> {
        let binding = controls.number(key, fallback: fallback, method: "setClock", clock: true)
        return Binding(get: { min(range.upperBound, max(range.lowerBound, binding.wrappedValue)) }, set: { binding.wrappedValue = $0 })
    }
}

private struct SettingsSlider: View {
    let key: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    var body: some View {
        VStack(alignment: .leading) {
            LabeledContent(SettingsCopy.text(key), value: "\(Int(value))")
            Slider(value: $value, in: range, step: 1)
                .accessibilityLabel(SettingsCopy.text(key))
                .accessibilityIdentifier("settings." + key)
        }
    }
}

private func colorPicker(_ key: String, selection: Binding<String>, automatic: Bool = false) -> some View {
    Picker(SettingsCopy.text(key), selection: selection) {
        ForEach((automatic ? ["auto"] : []) + SettingsCopy.colors, id: \.self) { Text(SettingsCopy.text($0)).tag($0) }
    }
}

struct StartSettingsPreviewRow: View {
    let manager: TabsManager
    var layout: BlancStartPageLayout? = nil
    var body: some View {
        StartSettingsPreview(manager: manager, layout: layout).frame(height: 250).listRowInsets(EdgeInsets())
            .accessibilityLabel(SettingsCopy.text("preview"))
    }
}
