import SwiftUI

struct TabListSheet: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(manager.tabs) { tab in
                    Button {
                        manager.setActive(tab.id)
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle)
                                    .lineLimit(1)
                                Text(tab.currentURL.absoluteString)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            if tab.id == manager.activeTabId {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }
                .onDelete { offsets in
                    let ids = offsets.map { manager.tabs[$0].id }
                    for id in ids {
                        manager.closeTab(id)
                    }
                }
            }
            .navigationTitle("Tabs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
