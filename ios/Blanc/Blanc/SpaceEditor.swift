import SwiftUI

/// What the Space editor is for.
enum SpaceEditorTarget: Identifiable, Equatable {
    /// New Space from the Spaces menu: made, then shown.
    case new
    /// New Space… from a tab's menu: made with that tab, without switching.
    case newWithTab(UUID)
    case edit(String)
    var id: String {
        switch self {
        case .new: "new"
        case .newWithTab(let tab): "tab-\(tab)"
        case .edit(let space): "edit-\(space)"
        }
    }
}

/// Name, colour and symbol for a new or existing Space, and Delete.
struct SpaceEditor: View {
    let manager: TabsManager
    let target: SpaceEditorTarget
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var name = ""
    @State private var color = SpaceIdentity.presets[0].hex
    @State private var symbol = SpaceIdentity.symbolIds[0]
    @State private var error: String?
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    private var editing: SpaceRecord? {
        if case .edit(let id) = target { return manager.spaces.first { $0.id == id } }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(SyncCopy.text("ws.editor.name")) {
                    TextField(SyncCopy.text("ws.editor.name"), text: $name)
                        .accessibilityIdentifier("space.name")
                    if let error {
                        Text(error).font(BrowserStyle.font(13)).foregroundStyle(.red)
                    }
                }
                Section(SyncCopy.text("ws.editor.color")) {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                        ForEach(SpaceIdentity.presets, id: \.hex) { preset in
                            Button { color = preset.hex } label: {
                                Circle().fill(Color(blancHex: preset.hex) ?? .gray)
                                    .frame(width: 36, height: 36)
                                    .overlay(Circle().strokeBorder(style.text, lineWidth: color == preset.hex ? 2.5 : 0).padding(-4))
                                    .frame(width: 48, height: 48)
                            }
                            .accessibilityLabel(SyncCopy.text("spaces.color.\(preset.id)"))
                            .accessibilityAddTraits(color == preset.hex ? .isSelected : [])
                        }
                    }
                }
                Section(SyncCopy.text("ws.editor.symbol")) {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                        ForEach(SpaceIdentity.symbolIds, id: \.self) { id in
                            Button { symbol = id } label: {
                                SpaceTile(color: symbol == id ? color : "#576471", symbol: id, size: 40)
                                    .opacity(symbol == id ? 1 : 0.55)
                                    .frame(width: 48, height: 48)
                            }
                            .accessibilityLabel(SyncCopy.text("spaces.symbol.\(id)"))
                            .accessibilityAddTraits(symbol == id ? .isSelected : [])
                        }
                    }
                }
                if let editing {
                    Section {
                        Button(SyncCopy.text("ws.delete.button"), role: .destructive) {
                            dismiss()
                            withAnimation { manager.deleteSpace(editing.id) }
                        }
                        .accessibilityIdentifier("space.delete")
                    }
                }
            }
            .buttonStyle(.plain)
            .navigationTitle(SyncCopy.text(editing == nil ? "ws.editor.newTitle" : "ws.editor.editTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SyncCopy.text("sharedSpaces.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(SyncCopy.text(editing == nil ? "ws.editor.createButton" : "ws.editor.done"), action: save)
                        .accessibilityIdentifier("space.save")
                }
            }
        }
        .onAppear(perform: load)
    }

    private func load() {
        if let editing {
            name = editing.name; color = editing.color; symbol = editing.symbol
        } else {
            let picked = SpaceIdentity.defaults(existing: manager.spaces.map { ($0.color, $0.symbol) })
            color = picked.color; symbol = picked.symbol
        }
    }

    private func save() {
        do {
            switch target {
            case .new:
                let id = try manager.createSpace(name: name, color: color, symbol: symbol)
                manager.show(set: id)
            case .newWithTab(let tab):
                try manager.createSpace(name: name, color: color, symbol: symbol, withTab: tab)
            case .edit(let id):
                try manager.updateSpace(id, name: name, color: color, symbol: symbol)
            }
            dismiss()
        } catch SpaceError.limit {
            error = SyncCopy.text("ws.error.limit", ["limit": "\(TabSets.spaceLimit)"])
        } catch SpaceError.duplicateName {
            error = SyncCopy.text("ws.error.duplicateName")
        } catch {
            self.error = SyncCopy.text("ws.error.invalidName")
        }
    }
}
