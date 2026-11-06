import SwiftUI

/// Floating Glance (F34): an open tab shown in a card over the current page,
/// in the wide layout only. Its header moves it; the grip at its corner
/// resizes it. Open as tab makes its page current, Keep as split puts it
/// beside the current page, and × closes the card, leaving the tab open.
struct GlanceCard: View {
    let manager: TabsManager
    let tab: TabModel
    let style: BrowserStyle
    @State private var move: CGSize = .zero
    @State private var grow: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            let area = geo.size
            let base = GlanceGeometry.frame(remembered: manager.glanceFrame, in: area)
            let frame = live(base, in: area)
            VStack(spacing: 0) {
                header(base: base, area: area)
                WebView(tab: tab, cornerRadius: GlanceGeometry.radius - GlanceGeometry.pageInset)
                    .overlay {
                        if !tab.hasCommitted { style.background.allowsHitTesting(false) }
                    }
                    .padding([.horizontal, .bottom], GlanceGeometry.pageInset)
            }
            .frame(width: frame.width, height: frame.height)
            // The shadow is the card's shape's alone: on the whole card it
            // would be redrawn from the live page beneath it.
            .background {
                RoundedRectangle(cornerRadius: GlanceGeometry.radius).fill(style.raised)
                    .shadow(color: .black.opacity(style.scheme == .dark ? 0.35 : 0.16), radius: 18, y: 8)
            }
            .overlay(RoundedRectangle(cornerRadius: GlanceGeometry.radius).strokeBorder(style.border, lineWidth: 0.5))
            .overlay(alignment: .bottomTrailing) { grip(base: base, area: area) }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("glance.card")
            .position(x: frame.midX, y: frame.midY)
        }
        .transition(.opacity)
        .task(id: tab.id) { manager.wakePane(tab) }
    }

    /// The frame while it's dragged or resized, kept inside the page area.
    private func live(_ base: CGRect, in area: CGSize) -> CGRect {
        GlanceGeometry.clamp(CGRect(x: base.minX + move.width, y: base.minY + move.height,
                                    width: base.width + grow.width, height: base.height + grow.height), in: area)
    }

    private func commit(_ base: CGRect, in area: CGSize) {
        manager.glanceFrame = GlanceGeometry.fraction(live(base, in: area), of: area)
        move = .zero
        grow = .zero
    }

    private func header(base: CGRect, area: CGSize) -> some View {
        let title = TabTitle.display(tab)
        return HStack(spacing: 4) {
            Text(SyncCopy.text("glance.eyebrow"))
                .font(BrowserStyle.font(11, semibold: true))
                .tracking(0.6)
                .foregroundStyle(style.secondary)
            Text(title).font(BrowserStyle.font(14)).lineLimit(1).truncationMode(.middle)
                .padding(.leading, 6)
            Spacer(minLength: 8)
            headerButton("glance.openAsTab", symbol: "arrow.up.left.and.arrow.down.right",
                         label: SyncCopy.text("glance.openAsTab.title"), id: "glance.openAsTab") {
                manager.openGlanceAsTab()
            }
            headerButton("split.keepAsSplit", symbol: "rectangle.split.2x1",
                         label: SyncCopy.text("split.keepAsSplit"), id: "glance.keepAsSplit") {
                withAnimation(.snappy) { manager.keepGlanceAsSplit() }
            }
            Button { manager.closeGlance() } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                    .frame(width: 36, height: GlanceGeometry.headerHeight).contentShape(Rectangle())
                    .pointerHighlight()
            }
            .accessibilityLabel(SyncCopy.text("glance.close"))
            .accessibilityIdentifier("glance.close")
            if !manager.isPalettePresented {
                Button("") { manager.closeGlance() }
                    .keyboardShortcut(.cancelAction)
                    .opacity(0).frame(width: 0).accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(style.text)
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .frame(height: GlanceGeometry.headerHeight)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 4)
            .onChanged { move = $0.translation }
            .onEnded { _ in commit(base, in: area) })
        .accessibilityElement(children: .contain)
        .accessibilityLabel(SyncCopy.text("glance.eyebrow"))
    }

    /// A header button with its label, the label hidden when the card is narrow.
    private func headerButton(_ key: String, symbol: String, label: String, id: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ViewThatFits(in: .horizontal) {
                Label(SyncCopy.text(key), systemImage: symbol).labelStyle(.titleAndIcon)
                Image(systemName: symbol)
            }
            .font(BrowserStyle.font(13))
            .padding(.horizontal, 8)
            .frame(minWidth: 36, minHeight: GlanceGeometry.headerHeight)
            .contentShape(Rectangle())
            .pointerHighlight()
        }
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }

    /// The corner grip that resizes the card.
    private func grip(base: CGRect, area: CGSize) -> some View {
        Image(systemName: "arrow.down.right")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(style.secondary)
            .frame(width: 32, height: 32)
            .background(style.raised.opacity(0.9), in: Circle())
            .contentShape(Rectangle())
            .pointerHighlight(cornerRadius: 16)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { grow = $0.translation }
                .onEnded { _ in commit(base, in: area) })
            .offset(x: 8, y: 8)
            .accessibilityHidden(true)
    }
}
