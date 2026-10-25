import SwiftUI

struct TabGridView: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.colorScheme) private var colorScheme
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Open tabs").font(BrowserStyle.font(24, semibold: true))
                Text("\(manager.tabs.count)").font(.system(size: 14)).foregroundStyle(style.secondary)
                Spacer()
                Button("Done") { dismiss() }
                    .font(BrowserStyle.font(16, semibold: true))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: sizeClass == .regular ? 3 : 2), spacing: 24) {
                        ForEach(manager.tabs) { tab in
                            card(tab).id(tab.id)
                        }
                    }
                    .padding(20)
                }
                .onAppear {
                    if let id = manager.activeTabId { proxy.scrollTo(id, anchor: .center) }
                }
            }
            Button {
                manager.createTab()
                dismiss()
            } label: {
                Label("New tab", systemImage: "plus")
                    .font(BrowserStyle.font(16, semibold: true))
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(style.raised, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(style.border, lineWidth: 1))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .foregroundStyle(style.text)
        .background(style.surface.ignoresSafeArea())
        .background(TabPreviewRenderer(tabs: manager.tabs).allowsHitTesting(false).accessibilityHidden(true))
        .buttonStyle(.plain)
        .accessibilityIdentifier("tabs.grid")
    }

    private func card(_ tab: TabModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                manager.setActive(tab.id)
                dismiss()
            } label: {
                ZStack {
                    style.raised
                    if let image = tab.thumbnail {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: tab.currentURL.scheme == "blanc" ? "sun.horizon" : "globe")
                                .font(.system(size: 30, weight: .light))
                            Text(title(tab)).font(BrowserStyle.font(14)).lineLimit(2)
                        }
                        .foregroundStyle(style.secondary)
                        .padding(20)
                    }
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(
                    manager.activeTabId == tab.id ? style.text : style.border,
                    lineWidth: manager.activeTabId == tab.id ? 2 : 1))
            }
            .accessibilityLabel("Switch to \(title(tab))")
            .accessibilityAddTraits(manager.activeTabId == tab.id ? .isSelected : [])
            .overlay(alignment: .topTrailing) {
                Button { manager.closeTab(tab.id) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 28, height: 28)
                        .background(style.raised, in: Circle())
                        .overlay(Circle().strokeBorder(style.border, lineWidth: 0.5))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Close \(title(tab))")
            }
            Text(title(tab)).font(BrowserStyle.font(14, semibold: true)).lineLimit(1)
            if let host = tab.currentURL.host, tab.currentURL.scheme != "blanc" {
                Text(host).font(BrowserStyle.font(12)).foregroundStyle(style.secondary).lineLimit(1)
            }
        }
    }

    private func title(_ tab: TabModel) -> String {
        if tab.currentURL == TabsManager.newTabURL { return "Start Page" }
        return tab.pageTitle.isEmpty ? (tab.currentURL.host ?? tab.currentURL.absoluteString) : tab.pageTitle
    }
}
