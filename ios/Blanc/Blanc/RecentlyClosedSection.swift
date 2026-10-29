import SwiftUI

/// The palette's Recently closed band (design §11, M16 §7): newest first,
/// each page once; another device's close says where it happened. Tapping a
/// row reopens the page as a new tab in the shown set; a swipe forgets it.
/// It folds from its heading and starts folded each time the palette opens,
/// as desktop's ⌘L band does; Clear all shows while it's open.
struct RecentlyClosedSection: View {
    let manager: TabsManager
    let style: BrowserStyle
    let onOpen: () -> Void
    @State private var open = false

    var body: some View {
        let rows = manager.closedBand
        if !rows.isEmpty {
            Section {
                if open {
                    ForEach(rows) { row in
                        Button {
                            manager.reopenClosed(row)
                            onOpen()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "clock.arrow.circlepath").font(.system(size: 16))
                                    .foregroundStyle(style.secondary).frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.title.isEmpty ? row.url : row.title).font(BrowserStyle.font(15)).lineLimit(1)
                                    Text(subtitle(row)).font(BrowserStyle.font(11)).foregroundStyle(style.secondary).lineLimit(1)
                                }
                                Spacer(minLength: 4)
                            }
                            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .accessibilityLabel(row.title.isEmpty ? row.url : row.title)
                        .accessibilityValue(subtitle(row))
                        .accessibilityHint(SyncCopy.text("closed.reopen"))
                        .accessibilityIdentifier("closed.row.\(row.id)")
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 2, leading: 22, bottom: 2, trailing: 22))
                        .swipeActions(edge: .trailing) {
                            Button(SyncCopy.text("closed.forget"), role: .destructive) { manager.forgetClosed(row) }
                                .buttonStyle(.automatic)
                                .accessibilityIdentifier("closed.forget")
                        }
                    }
                }
            } header: {
                HStack(spacing: 6) {
                    // The whole heading folds, as a group header does; Clear all
                    // keeps its own place at the end.
                    Button { withAnimation { open.toggle() } } label: {
                        HStack(spacing: 6) {
                            Text(SyncCopy.text("closed.header")).font(BrowserStyle.font(11, semibold: true))
                            Text("\(rows.count)").font(.system(size: 11))
                            Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 9, weight: .semibold))
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .contentShape(Rectangle())
                    }
                    .accessibilityHint(SyncCopy.text(open ? "closed.fold" : "closed.unfold"))
                    .accessibilityIdentifier("closed.toggle")
                    if open {
                        Button(SyncCopy.text("closed.clear")) { manager.clearClosedBand() }
                            .font(BrowserStyle.font(11, semibold: true))
                            .frame(minWidth: 44, minHeight: 32)
                            .contentShape(Rectangle())
                            .accessibilityLabel(SyncCopy.text("closed.clearAll"))
                            .accessibilityIdentifier("closed.clearAll")
                    }
                }
                .foregroundStyle(style.secondary)
                .textCase(nil)
                .padding(.top, 8)
            }
        }
    }

    private func subtitle(_ row: ClosedRow) -> String {
        if let device = manager.closedDeviceName(row) { return SyncCopy.text("sharedSpaces.closedOn", ["device": device]) }
        return URL(string: row.url)?.host ?? row.url
    }
}
