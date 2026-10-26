import Foundation

struct SlashCommand: Identifiable {
    var id: String { command }
    let command: String
    let hintKey: String
    let execute: (TabsManager) -> Void

    var hint: String {
        if command == "/reader" { return ReaderCopy.text("reader.hint") }
        return NSLocalizedString(hintKey, tableName: "SlashCommands", bundle: .main, comment: "")
    }

    static let available: [SlashCommand] = [
        SlashCommand(command: "/reader", hintKey: "slash_reader") { $0.toggleReaderMode() },
        SlashCommand(command: "/settings", hintKey: "slash_settings") { $0.showSettings() },
        SlashCommand(command: "/sync", hintKey: "slash_sync") { $0.showSettings(.sync) },
        SlashCommand(command: "/new", hintKey: "slash_new") { manager in
            manager.createTab()
        },
        SlashCommand(command: "/private", hintKey: "slash_private") { manager in
            manager.createTab(isPrivate: true)
        },
        SlashCommand(command: "/close", hintKey: "slash_close") { manager in
            if let id = manager.activeTabId {
                manager.closeTab(id)
            }
        },
    ]

    static func filter(prefix: String) -> [SlashCommand] {
        guard !prefix.isEmpty else { return available }
        return available.filter { $0.command.hasPrefix(prefix) }
    }
}
