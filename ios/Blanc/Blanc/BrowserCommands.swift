import SwiftUI

/// Hardware-keyboard shortcuts (D7's iPad allowance): desktop's keys for what
/// the app already does, in iPadOS's menu bar and its ⌘-hold list. Every one
/// also has a touch path (the Island, its menu, a slash command). A focused
/// page gets a shortcut first (`PageKeys`), except the ones Blanc keeps: ⌘L,
/// ⌘T, ⌘N, ⌘W and their ⇧ forms, as desktop keeps them.
struct BrowserCommands: Commands {
    /// The focused window's tabs.
    @FocusedValue(\.tabsManager) private var manager: TabsManager?

    private func t(_ key: String) -> String { SyncCopy.text(key) }
    private var hasTab: Bool { manager?.activeTab != nil }

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button(t("menu.newTab")) { manager?.createTab() }
                .keyboardShortcut("t")
            if UIApplication.shared.supportsMultipleScenes {
                Button(t("menu.newWindow")) { manager?.services.openNewWindow() }
                    .keyboardShortcut("n")
            }
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
            Button(t("menu.settings")) { pageFirst(",") { $0.showSettings() } }
                .keyboardShortcut(",")
        }
        CommandGroup(after: .pasteboard) {
            Divider()
            Button(t("menu.findInPage")) { pageFirst("f") { $0.presentFind() } }
                .keyboardShortcut("f")
                .disabled(!hasTab)
        }
        CommandMenu(t("menu.view")) {
            Button(t("menu.reload")) { pageFirst("r") { $0.activeTab?.reload() } }
                .keyboardShortcut("r")
                .disabled(!hasTab)
            Button(t("pill.back")) { pageFirst("[") { $0.activeTab?.goBack() } }
                .keyboardShortcut("[")
                .disabled(manager?.activeTab?.canGoBack != true)
            Button(t("pill.forward")) { pageFirst("]") { $0.activeTab?.goForward() } }
                .keyboardShortcut("]")
                .disabled(manager?.activeTab?.canGoForward != true)
            Divider()
            Button(t("menu.zoomIn")) { pageFirst("+") { $0.zoomActive(step: 1) } }
                .keyboardShortcut("+")
            Button(t("menu.zoomOut")) { pageFirst("-") { $0.zoomActive(step: -1) } }
                .keyboardShortcut("-")
            Button(t("menu.actualSize")) { pageFirst("0") { $0.zoomActive(step: 0) } }
                .keyboardShortcut("0")
            Divider()
            Button(t("menu.showHistory")) { pageFirst("y") { $0.createTab(url: URL(string: "blanc://history/")!) } }
                .keyboardShortcut("y")
            Button(t("menu.showFavorites")) { pageFirst("b", option: true) { $0.createTab(url: URL(string: "blanc://bookmarks/")!) } }
                .keyboardShortcut("b", modifiers: [.command, .option])
        }
        CommandMenu(t("menu.tabs")) {
            // Safari's keys, not desktop's Ctrl+Tab: iPadOS keeps Tab for
            // moving keyboard focus, and Ctrl+Tab never reaches the app.
            Button(t("menu.nextTab")) { pageFirst("]", shift: true) { $0.cycleTab(by: 1) } }
                .keyboardShortcut("]", modifiers: [.command, .shift])
            Button(t("menu.previousTab")) { pageFirst("[", shift: true) { $0.cycleTab(by: -1) } }
                .keyboardShortcut("[", modifiers: [.command, .shift])
            Divider()
            ForEach(1..<9) { number in
                Button(t("menu.tabOrGroup", ["number": "\(number)"])) { pageFirst("\(number)") { $0.selectTab(number: number) } }
                    .keyboardShortcut(KeyEquivalent(Character("\(number)")))
            }
            Button(t("menu.lastTabOrGroup")) { pageFirst("9") { $0.selectTab(number: 9) } }
                .keyboardShortcut("9")
            Divider()
            Button(t("menu.focusNextPane")) { pageFirst("ArrowRight", option: true) { $0.focusPane(by: 1) } }
                .keyboardShortcut(.rightArrow, modifiers: [.command, .option])
                .disabled(manager?.activeSplit == nil)
            Button(t("menu.focusPreviousPane")) { pageFirst("ArrowLeft", option: true) { $0.focusPane(by: -1) } }
                .keyboardShortcut(.leftArrow, modifiers: [.command, .option])
                .disabled(manager?.activeSplit == nil)
            Button(t("menu.toggleGlance")) { pageFirst("g", shift: true) { $0.toggleGlance() } }
                .keyboardShortcut("g", modifiers: [.command, .shift])
                .disabled(manager?.canToggleGlance != true)
            Divider()
            Button(t("menu.addFavorite")) { pageFirst("d") { m in m.activeTab.map { m.toggleFavorite($0) } } }
                .keyboardShortcut("d")
                .disabled(manager?.activeTab.map { !$0.isPrivate && TabsManager.canFavorite($0.currentURL) } != true)
        }
    }

    private func t(_ key: String, _ params: [String: String]) -> String { SyncCopy.text(key, params) }

    private func pageFirst(_ key: String, shift: Bool = false, option: Bool = false, run: @escaping (TabsManager) -> Void) {
        guard let manager else { return }
        PageKeys.offer(key, shift: shift, option: option, to: manager.activeTab) { run(manager) }
    }
}
