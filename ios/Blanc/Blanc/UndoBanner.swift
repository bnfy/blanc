import SwiftUI

/// M11: "Tab closed · Undo" for the five seconds a closed tab can come back.
/// Shown over the Island, and in the tab grid while it covers the Island.
struct UndoBanner: View {
    let manager: TabsManager
    let style: BrowserStyle

    var body: some View {
        if manager.lastClosed != nil {
            HStack(spacing: 14) {
                Text(SyncCopy.text("tabs.closedToast")).font(BrowserStyle.font(13))
                Button(SyncCopy.text("menu.undo")) { withAnimation { manager.undoClose() } }
                    .font(BrowserStyle.font(13, semibold: true))
                    .frame(minHeight: 32)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("banner.undo")
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
            .foregroundStyle(style.text)
            .background(style.raised, in: Capsule())
            .overlay(Capsule().strokeBorder(style.border, lineWidth: 0.5))
            .transition(.opacity)
        }
    }
}
