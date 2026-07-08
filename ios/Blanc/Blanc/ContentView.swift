import SwiftUI

struct ContentView: View {
    @State private var manager = TabsManager()

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
}

#Preview { ContentView() }
