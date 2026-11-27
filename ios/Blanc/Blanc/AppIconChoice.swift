import Combine
import SwiftUI
import UIKit

/// iOS icons in picker order. AppIcon.icon holds the primary Sunrise Amber
/// Glass artwork. The alternates use their Icon Composer package names.
enum AppIconChoice: String, CaseIterable, Identifiable {
    case sunriseAmberGlass = "sunrise-amber-glass"
    case sunrise
    case sunriseBronze = "sunrise-bronze"
    case sunriseGold = "sunrise-gold"
    case sunriseDawn = "sunrise-dawn"
    case sunriseDark = "sunrise-dark"
    case sunriseSpectrum = "sunrise-spectrum"
    case sunriseAmber = "sunrise-amber"

    var id: String { rawValue }

    /// The name `setAlternateIconName` takes; nil for the primary icon.
    var alternateIconName: String? {
        switch self {
        case .sunriseAmberGlass: return nil
        case .sunrise: return "Sunrise"
        case .sunriseBronze: return "SunriseBronze"
        case .sunriseGold: return "SunriseGold"
        case .sunriseDawn: return "SunriseDawn"
        case .sunriseDark: return "SunriseDark"
        case .sunriseSpectrum: return "SunriseSpectrum"
        case .sunriseAmber: return "SunriseAmber"
        }
    }

    /// Product names, untranslated as on desktop; shared ones come from the
    /// settings schema, the iPhone-only ones are here.
    var label: String {
        switch self {
        case .sunriseAmberGlass: return "Sunrise Amber Glass"
        case .sunriseDawn: return "Sunrise Dawn"
        case .sunriseBronze: return "Sunrise Bronze"
        default: return BlancAppIcon(rawValue: rawValue)?.label ?? rawValue
        }
    }

    /// Icon Composer's own render of the icon (npm run ios:icon-previews).
    var previewImageName: String { "AppIconPreview-\(alternateIconName ?? "AppIcon")" }

    /// iOS reports nil for the primary icon. An unknown name falls back to it.
    static func current(alternateIconName name: String?) -> AppIconChoice {
        allCases.first { $0.alternateIconName == name } ?? .sunriseAmberGlass
    }
}

/// UIApplication's alternate-icon API, so tests can stand in for iOS.
@MainActor protocol AlternateIconSwitching: AnyObject {
    var alternateIconName: String? { get }
    func setAlternateIconName(_ name: String?) async throws
}

extension UIApplication: AlternateIconSwitching {}

/// The current icon, read back from iOS, which stores the choice itself.
@MainActor final class AppIconModel: ObservableObject {
    @Published private(set) var current: AppIconChoice
    private let switcher: AlternateIconSwitching

    init(switcher: AlternateIconSwitching = UIApplication.shared) {
        self.switcher = switcher
        current = AppIconChoice.current(alternateIconName: switcher.alternateIconName)
    }

    func refresh() { current = AppIconChoice.current(alternateIconName: switcher.alternateIconName) }

    /// iOS confirms a change with its own alert. On failure nothing changes.
    func choose(_ choice: AppIconChoice) async {
        // Compared by name, not by choice: a name from an earlier build shows
        // as the primary, and choosing the primary must still clear it.
        guard switcher.alternateIconName != choice.alternateIconName else { return refresh() }
        do {
            try await switcher.setAlternateIconName(choice.alternateIconName)
            current = choice
        } catch {
            refresh()
        }
    }
}
