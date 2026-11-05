import SwiftUI

/// Turning on "Keep Spaces and groups in sync on this iPhone" (design §9,
/// M16 §4.6): the phone's Spaces with their tab counts and the library's
/// room. Every Space that fits is ticked; an oversized one is greyed with the
/// reason; a dormant copy offers Rejoin or Add as a copy; This iPhone can be
/// saved as a Space first.
struct SharedSpacesSheet: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [SharedSpacesSharing.Row] = []
    @State private var chosen: [String: SharedSpacesSharing.Mode] = [:]
    @State private var savedIPhone = false
    @State private var error: String?

    private var engine: SyncEngine { manager.syncEngine }
    private var copies: Int { chosen.values.filter { $0 == .copy }.count }
    private var roomCount: Int { engine.libraryCount + copies }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(SyncCopy.text("sharedSpaces.explanation"))
                    Text(SyncCopy.text("sharedSpaces.count", ["count": "\(roomCount)", "limit": "\(SharedSpacesModel.limits.spaces)"]))
                        .foregroundStyle(roomCount > SharedSpacesModel.limits.spaces ? .red : .secondary)
                        .accessibilityIdentifier("sharedSpaces.room")
                }
                if !savedIPhone {
                    Section {
                        Button {
                            if (try? manager.saveIPhoneAsSpace()) != nil {
                                savedIPhone = true
                                load()
                            }
                        } label: {
                            Label(SyncCopy.text("sharedSpaces.saveThisIPhone"), systemImage: "iphone")
                                .frame(minHeight: 44)
                        }
                        .accessibilityIdentifier("sharedSpaces.saveIPhone")
                    }
                }
                if !rows.isEmpty {
                    Section {
                        ForEach(rows) { row in rowView(row) }
                    } footer: { Text(SyncCopy.text("sharedSpaces.accountLine")) }
                }
                if let error {
                    Text(error).foregroundStyle(.red).accessibilityIdentifier("sharedSpaces.error")
                }
            }
            .navigationTitle(SyncCopy.text("sharedSpaces.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SyncCopy.text("sharedSpaces.cancel")) { dismiss() }
                        .accessibilityIdentifier("sharedSpaces.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(SyncCopy.text("sharedSpaces.confirm")) { confirm() }
                        .disabled(roomCount > SharedSpacesModel.limits.spaces)
                        .accessibilityIdentifier("sharedSpaces.confirm")
                }
            }
        }
        .onAppear(perform: load)
    }

    @ViewBuilder private func rowView(_ row: SharedSpacesSharing.Row) -> some View {
        let mode = chosen[row.id]
        let blocked = row.reason != nil && !row.canRejoin
        VStack(alignment: .leading, spacing: 8) {
            Button {
                guard !row.shared, !blocked else { return }
                chosen[row.id] = mode == nil ? (row.canRejoin ? .rejoin : .copy) : nil
            } label: {
                HStack(spacing: 12) {
                    SpaceTile(color: row.color, symbol: row.symbol, size: 30)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).lineLimit(1)
                        Text(SyncCopy.text("sharedSpaces.tabs", ["count": "\(row.tabCount)"]))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    if row.shared {
                        Text(SyncCopy.text("sharedSpaces.shared")).font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Image(systemName: mode != nil ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 20)).foregroundStyle(blocked ? Color.secondary.opacity(0.4) : Color.accentColor)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(row.shared || blocked)
            .accessibilityAddTraits(mode != nil ? .isSelected : [])
            .accessibilityIdentifier("sharedSpaces.row.\(row.name)")
            if blocked {
                Text(SyncCopy.text("sharedSpaces.full")).font(.footnote).foregroundStyle(.secondary)
                    .accessibilityIdentifier("sharedSpaces.reason.\(row.name)")
            }
            if row.canRejoin, mode != nil {
                Picker(row.name, selection: Binding(get: { chosen[row.id] ?? .rejoin }, set: { chosen[row.id] = $0 })) {
                    Text(SyncCopy.text("sharedSpaces.rejoin")).tag(SharedSpacesSharing.Mode.rejoin)
                    Text(SyncCopy.text("sharedSpaces.copy")).tag(SharedSpacesSharing.Mode.copy)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("sharedSpaces.mode.\(row.name)")
            }
        }
    }

    private func load() {
        rows = manager.sharingRows()
        var next: [String: SharedSpacesSharing.Mode] = [:]
        for row in rows where !row.shared {
            if row.canRejoin { next[row.id] = chosen[row.id] ?? .rejoin }
            else if row.reason == nil { next[row.id] = chosen[row.id] ?? .copy }
        }
        chosen = next
    }

    private func confirm() {
        let choices = rows.compactMap { row in chosen[row.id].map { (id: row.id, mode: $0) } }
        if let failure = manager.turnOnSharedSpaces(choices) {
            switch failure {
            case .limit: error = SyncCopy.text("sharedSpaces.count", ["count": "\(roomCount)", "limit": "\(SharedSpacesModel.limits.spaces)"])
            case .tooLarge: error = SyncCopy.text("sharedSpaces.full")
            case .notFound, .deleted: error = SyncCopy.text("sharedSpaces.unavailable")
            }
            load()
            return
        }
        dismiss()
    }
}
