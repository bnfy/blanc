import SwiftUI

struct ContentView: View {
    @State private var model = BrowserModel(start: URL(string: "https://example.com")!)

    var body: some View {
        ZStack(alignment: .bottom) {
            (Color(blancHex: BlancTokens.bg(.light)) ?? .white)
                .ignoresSafeArea()
            WebView(model: model)
                .ignoresSafeArea(edges: .top)
            addressPill
        }
    }

    private var addressPill: some View {
        HStack(spacing: 10) {
            Button { model.goBack() } label: { Image(systemName: "chevron.left") }
                .disabled(!model.canGoBack)
            Button { model.goForward() } label: { Image(systemName: "chevron.right") }
                .disabled(!model.canGoForward)

            TextField("Search or enter address", text: $model.addressText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.go)
                .onSubmit { model.submitAddress() }

            Button {
                model.isLoading ? model.stop() : model.reload()
            } label: {
                Image(systemName: model.isLoading ? "xmark" : "arrow.clockwise")
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
}

#Preview { ContentView() }
