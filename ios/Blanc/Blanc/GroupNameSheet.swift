import SwiftUI

/// Names a new tab group or renames one. A sheet rather than an alert: on
/// iOS 27 an alert's button doesn't commit while its text field is focused.
struct GroupNameSheet: View {
    let title: String
    let confirm: String
    let initial: String
    /// Applies the name; returns the message to show when it's refused.
    let commit: (String) -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                TextField(SyncCopy.text("groupMenu.nameLabel"), text: $name)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(save)
                    .accessibilityIdentifier("group.nameField")
                if let error {
                    Text(error).font(BrowserStyle.font(13)).foregroundStyle(.red)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SyncCopy.text("sharedSpaces.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(confirm, action: save)
                        .disabled(GroupNames.normalize(name).isEmpty)
                        .accessibilityIdentifier("group.nameSave")
                }
            }
        }
        .presentationDetents([.height(220)])
        .onAppear { name = initial; focused = true }
    }

    private func save() {
        guard !GroupNames.normalize(name).isEmpty else { return }
        if let message = commit(name) { error = message } else { dismiss() }
    }
}
