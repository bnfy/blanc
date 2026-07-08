import SwiftUI

struct ContentView: View {
    @State private var manager = TabsManager()
    @State private var showTabList = false

    var body: some View {
        ZStack(alignment: .bottom) {
            (Color(blancHex: BlancTokens.bg(.light)) ?? .white)
                .ignoresSafeArea()

            if let tab = manager.activeTab {
                WebView(tab: tab)
                    .id(tab.id)
                    .ignoresSafeArea(edges: .top)
            }

            addressPill
        }
        .sheet(isPresented: $showTabList) {
            TabListSheet(manager: manager)
        }
    }

    private var addressPill: some View {
        HStack(spacing: 10) {
            Button { manager.activeTab?.goBack() } label: {
                Image(systemName: "chevron.left")
            }
            .disabled(!(manager.activeTab?.canGoBack ?? false))

            Button { manager.activeTab?.goForward() } label: {
                Image(systemName: "chevron.right")
            }
            .disabled(!(manager.activeTab?.canGoForward ?? false))

            tabDots

            TextField("Search or enter address", text: addressBinding)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.go)
                .onSubmit { manager.submitActiveTabAddress() }

            Button {
                if manager.activeTab?.isLoading == true {
                    manager.activeTab?.stop()
                } else {
                    manager.activeTab?.reload()
                }
            } label: {
                Image(systemName:
                    manager.activeTab?.isLoading == true ? "xmark" : "arrow.clockwise")
            }

            Button { manager.createTab() } label: {
                Image(systemName: "plus")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(blancHex: BlancTokens.surfaceRaised(.light)) ?? .white)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Color(blancHex: BlancTokens.border(.light)) ?? .gray))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private var addressBinding: Binding<String> {
        Binding(
            get: { manager.activeTab?.addressText ?? "" },
            set: { manager.activeTab?.addressText = $0 }
        )
    }

    private var tabDots: some View {
        let maxVisible = 3
        let overflow = manager.tabs.count > maxVisible
        let visible = overflow ? Array(manager.tabs.prefix(maxVisible - 1)) : manager.tabs
        let overflowCount = manager.tabs.count - visible.count

        return HStack(spacing: 6) {
            ForEach(visible) { tab in
                Circle()
                    .fill(tab.id == manager.activeTabId
                          ? Color.primary
                          : Color.secondary.opacity(0.4))
                    .frame(width: 7, height: 7)
            }
            if overflow {
                Text("+\(overflowCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { showTabList = true }
    }
}

#Preview { ContentView() }
