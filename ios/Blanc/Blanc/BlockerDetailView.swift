import SwiftUI

struct BlockerDetailView: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss

    private var siteLabel: String {
        manager.activeSiteHost ?? "This page"
    }

    private var status: String {
        if !manager.settingsStore.adblockEnabled { return "Global blocking is off" }
        if manager.activeSiteHost == nil { return "Unavailable on this page" }
        return manager.isActiveSiteProtected ? "On for this site" : "Off for this site"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 11) {
                BlancIslandGlyph(kind: .shield,
                                 color: manager.isActiveSiteProtected ? .primary : .secondary)
                    .frame(width: 27, height: 27)
                Text("Blanc Blocker")
                    .font(.custom("Inter-SemiBold", size: 20, relativeTo: .headline))
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(siteLabel)
                    .font(.custom("Inter-Regular", size: 14, relativeTo: .subheadline))
                    .foregroundStyle(.secondary)
                Text(status)
                    .font(.custom("Inter-SemiBold", size: 24, relativeTo: .title2))
                if manager.activeSiteHost != nil && manager.settingsStore.adblockEnabled {
                    Text(manager.isActiveSiteProtected
                         ? "Ads and trackers are blocked here."
                         : "Ads and trackers are allowed here.")
                        .font(.custom("Inter-Regular", size: 14, relativeTo: .body))
                        .foregroundStyle(.secondary)
                }
            }

            Toggle("Site protection", isOn: Binding(
                get: { manager.isActiveSiteProtected },
                set: { enabled in
                    if enabled != manager.isActiveSiteProtected {
                        manager.toggleProtectionForActiveSite()
                    }
                }
            ))
            .font(.custom("Inter-Medium", size: 15, relativeTo: .body))
            .disabled(!manager.canToggleActiveSiteProtection)

            Button("Global blocking settings") {
                manager.createTab(url: URL(string: "blanc://settings/")!)
                dismiss()
            }
            .font(.custom("Inter-Regular", size: 14, relativeTo: .body))
        }
        .padding(22)
        .presentationDetents([.medium])
    }
}
