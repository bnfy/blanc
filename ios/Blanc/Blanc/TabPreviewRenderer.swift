import SwiftUI
import WebKit

/// Lay out already-open pages behind the opaque tab grid, one at a time.
/// This does not navigate, reload, or select tabs to obtain a preview.
struct TabPreviewRenderer: UIViewRepresentable {
    let tabs: [TabModel]
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.prepare(tabs, in: view)
    }
    static func dismantleUIView(_ view: UIView, coordinator: Coordinator) {
        coordinator.task?.cancel()
        coordinator.detach()
    }

    @MainActor
    final class Coordinator {
        var task: Task<Void, Never>?
        private var attempted: Set<UUID> = []
        private weak var staged: WKWebView?
        private weak var container: UIView?
        private var originalFrame: CGRect = .zero

        func detach() {
            if let staged, staged.superview === container {
                staged.removeFromSuperview()
                staged.frame = originalFrame
            }
            staged = nil
        }

        func prepare(_ tabs: [TabModel], in view: UIView) {
            guard task == nil else { return }
            let missing = tabs.filter { $0.thumbnail == nil && !attempted.contains($0.id) }
            guard !missing.isEmpty else { return }
            task = Task { @MainActor [weak self, weak view] in
                guard let self, let view else { return }
                defer { self.detach(); self.task = nil }
                for _ in 0..<40 {
                    if view.window != nil && view.bounds.width > 0 { break }
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    if Task.isCancelled { return }
                }
                guard view.window != nil, view.bounds.width > 0 else { return }
                for tab in missing {
                    if Task.isCancelled { return }
                    // Never reparent the visible browser or another owner's view.
                    guard tab.webView.superview == nil else { continue }
                    self.attempted.insert(tab.id)
                    self.originalFrame = tab.webView.frame
                    self.staged = tab.webView
                    self.container = view
                    tab.webView.frame = view.bounds
                    view.addSubview(tab.webView)
                    tab.webView.layoutIfNeeded()
                    for _ in 0..<60 {
                        try? await Task.sleep(nanoseconds: 50_000_000)
                        if Task.isCancelled { return }
                        if !tab.webView.isLoading { break }
                    }
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    if Task.isCancelled { return }
                    await tab.capturePreparedThumbnail()
                    self.detach()
                }
            }
        }
    }
}
