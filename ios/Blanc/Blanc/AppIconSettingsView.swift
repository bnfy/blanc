import SwiftUI

/// Settings → Appearance → App icon: the six icons, each with Icon Composer's
/// own preview, and a checkmark on the one iOS shows now.
struct AppIconSettingsView: View {
    @ObservedObject var model: AppIconModel

    var body: some View {
        Form {
            Section {
                ForEach(AppIconChoice.allCases) { choice in
                    let selected = choice == model.current
                    Button {
                        Task { await model.choose(choice) }
                    } label: {
                        HStack(spacing: 14) {
                            Image(choice.previewImageName).resizable().frame(width: 60, height: 60)
                                .accessibilityHidden(true)
                            Text(choice.label)
                            Spacer()
                            if selected {
                                Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold))
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("appIcon.\(choice.id)")
                    .accessibilityLabel(choice.label)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            } footer: { Text(SettingsCopy.text("appIconHint")) }
        }
        .settingsFormStyle().settingsTitle(SettingsCopy.text("appIcon"))
        .onAppear { model.refresh() }
    }
}
