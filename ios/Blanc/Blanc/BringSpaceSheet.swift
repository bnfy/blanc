import SwiftUI

/// Bring a Space (design §7, switch off): another device's Space reviewed —
/// its name and mark, its groups with their tabs, the count — and copied onto
/// this iPhone as a local Space. The Space's record is fetched for this sheet
/// only, kept in memory while it is open, and never merged or uploaded.
struct BringSpaceSheet: View {
    let manager: TabsManager
    let remote: TabsManager.RemoteSpace
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var blob: JSONValue?
    @State private var loading = true
    @State private var error: String?
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    private var set: SavedSet { SharedSpacesAdapter.project(blob) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        SpaceTile(color: remote.color, symbol: remote.symbol, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(remote.name).font(BrowserStyle.font(17, semibold: true)).lineLimit(1)
                            Text(SyncCopy.text("spaces.onDevice", ["device": remote.deviceName]))
                                .font(BrowserStyle.font(13)).foregroundStyle(style.secondary)
                            if blob != nil {
                                Text(SyncCopy.plural("newtab.groups.count", count: set.tabs.count))
                                    .font(BrowserStyle.font(13)).foregroundStyle(style.secondary)
                                    .accessibilityIdentifier("bringSpace.count")
                            }
                        }
                    }
                    .frame(minHeight: 52)
                }
                if loading {
                    ProgressView().frame(maxWidth: .infinity)
                } else if blob == nil {
                    Text(SyncCopy.text("sharedSpaces.unavailable")).foregroundStyle(style.secondary)
                } else {
                    ForEach(sections, id: \.id) { section in
                        Section {
                            ForEach(Array(section.tabs.enumerated()), id: \.offset) { _, tab in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tab.title.isEmpty ? tab.url : tab.title).lineLimit(1)
                                    Text(URL(string: tab.url)?.host ?? tab.url).font(BrowserStyle.font(12))
                                        .foregroundStyle(style.secondary).lineLimit(1)
                                }
                            }
                        } header: {
                            if let group = section.group {
                                HStack(spacing: 6) {
                                    GroupDot(color: group.color, style: style)
                                    Text(group.name)
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityIdentifier("bringSpace.group.\(group.name)")
                            }
                        }
                    }
                }
                Section {
                    Button {
                        bring()
                    } label: {
                        Text(SyncCopy.text("bringSpace.action")).font(BrowserStyle.font(17, semibold: true))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(blob == nil || set.tabs.isEmpty || !manager.canAddSpace)
                    .accessibilityIdentifier("bringSpace.bring")
                    if !manager.canAddSpace {
                        Text(SyncCopy.text("sharedSpaces.count", ["count": "\(TabSets.spaceLimit)", "limit": "\(TabSets.spaceLimit)"]))
                            .foregroundStyle(style.secondary)
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(SyncCopy.text("bringSpace.copyNote", ["device": remote.deviceName]))
                        Button(SyncCopy.text("sharedSpaces.switch.iphone")) {
                            // Settings → Sync opens once this sheet has gone.
                            manager.pendingSettingsDestination = .sync
                            dismiss()
                        }
                        .font(BrowserStyle.font(13, semibold: true))
                        .frame(minHeight: 32)
                        .accessibilityIdentifier("bringSpace.settings")
                    }
                }
            }
            .navigationTitle(remote.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SyncCopy.text("sharedSpaces.cancel")) { dismiss() }
                        .accessibilityIdentifier("bringSpace.cancel")
                }
            }
        }
        .task {
            blob = await manager.syncEngine.previewSpace(id: remote.id)
            loading = false
        }
        // The review copy goes with the sheet.
        .onDisappear { blob = nil }
    }

    private var sections: [(id: String, group: TabGroup?, tabs: [SavedTab])] {
        let set = self.set
        var out: [(id: String, group: TabGroup?, tabs: [SavedTab])] = []
        for group in set.groups {
            let tabs = set.tabs.filter { $0.groupId == group.id }
            if !tabs.isEmpty { out.append((group.id, group, tabs)) }
        }
        let loose = set.tabs.filter { tab in tab.groupId == nil || !set.groups.contains { $0.id == tab.groupId } }
        if !loose.isEmpty { out.append(("loose", nil, loose)) }
        return out
    }

    private func bring() {
        guard let blob else { return }
        do {
            try manager.bringSpace(remote, blob: blob)
            dismiss()
        } catch {
            self.error = SyncCopy.text("sharedSpaces.count", ["count": "\(TabSets.spaceLimit)", "limit": "\(TabSets.spaceLimit)"])
        }
    }
}
