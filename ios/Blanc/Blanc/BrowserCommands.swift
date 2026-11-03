import SwiftUI

/// Hardware-keyboard shortcuts (D7's iPad allowance): desktop's keys for what
/// the app already does, in iPadOS's menu bar and its ⌘-hold list. Every one
/// also has a touch path (the Island, its menu, a slash command).
struct BrowserCommands: Commands {
    let manager: TabsManager?

    private func t(_ key: String) -> String { SyncCopy.text(key) }
    private var hasTab: Bool { manager?.activeTab != nil }

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button(t("menu.newTab")) { manager?.createTab() }
                .keyboardShortcut("t")
            Button(t("menu.newPrivateTab")) { manager?.createTab(isPrivate: true) }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button(t("menu.searchCommands")) { manager?.isPalettePresented = true }
                .keyboardShortcut("l")
            Divider()
            Button(t("menu.closeTab")) { if let id = manager?.activeTabId { manager?.closeTab(id) } }
                .keyboardShortcut("w")
                .disabled(!hasTab)
            Button(t("menu.reopenClosedTab")) { manager?.reopenLast() }
                .keyboardShortcut("t", modifiers: [.command, .shift])
        }
        CommandGroup(replacing: .appSettings) {
            Button(t("menu.settings")) { manager?.showSettings() }
                .keyboardShortcut(",")
        }
        CommandGroup(after: .pasteboard) {
            Divider()
            Button(t("menu.findInPage")) { manager?.presentFind() }
                .keyboardShortcut("f")
                .disabled(!hasTab)
        }
        CommandMenu(t("menu.view")) {
            Button(t("menu.reload")) { manager?.activeTab?.reload() }
                .keyboardShortcut("r")
                .disabled(!hasTab)
            Button(t("pill.back")) { manager?.activeTab?.goBack() }
                .keyboardShortcut("[")
                .disabled(manager?.activeTab?.canGoBack != true)
            Button(t("pill.forward")) { manager?.activeTab?.goForward() }
                .keyboardShortcut("]")
                .disabled(manager?.activeTab?.canGoForward != true)
            Divider()
            Button(t("menu.zoomIn")) { manager?.zoomActive(step: 1) }
                .keyboardShortcut("+")
            Button(t("menu.zoomOut")) { manager?.zoomActive(step: -1) }
                .keyboardShortcut("-")
            Button(t("menu.actualSize")) { manager?.zoomActive(step: 0) }
                .keyboardShortcut("0")
            Divider()
            Button(t("menu.showHistory")) { manager?.createTab(url: URL(string: "blanc://history/")!) }
                .keyboardShortcut("y")
            Button(t("menu.showFavorites")) { manager?.createTab(url: URL(string: "blanc://bookmarks/")!) }
                .keyboardShortcut("b", modifiers: [.command, .option])
        }
        CommandMenu(t("menu.tabs")) {
            // Safari's keys, not desktop's Ctrl+Tab: iPadOS keeps Tab for
            // moving keyboard focus, and Ctrl+Tab never reaches the app.
            Button(t("menu.nextTab")) { manager?.cycleTab(by: 1) }
                .keyboardShortcut("]", modifiers: [.command, .shift])
            Button(t("menu.previousTab")) { manager?.cycleTab(by: -1) }
                .keyboardShortcut("[", modifiers: [.command, .shift])
            Divider()
            ForEach(1..<9) { number in
                Button(t("menu.tabOrGroup", ["number": "\(number)"])) { manager?.selectTab(number: number) }
                    .keyboardShortcut(KeyEquivalent(Character("\(number)")))
            }
            Button(t("menu.lastTabOrGroup")) { manager?.selectTab(number: 9) }
                .keyboardShortcut("9")
            Divider()
            Button(t("menu.addFavorite")) { if let tab = manager?.activeTab { manager?.toggleFavorite(tab) } }
                .keyboardShortcut("d")
                .disabled(manager?.activeTab.map { !$0.isPrivate && TabsManager.canFavorite($0.currentURL) } != true)
        }
    }

    private func t(_ key: String, _ params: [String: String]) -> String { SyncCopy.text(key, params) }
}
