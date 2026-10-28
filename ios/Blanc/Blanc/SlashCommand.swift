import Foundation

/// What the palette does after a command runs: close, or stay open with new
/// text typed (a bare `/send` asks for a device).
enum SlashOutcome: Equatable {
    case done
    case prompt(String)
}

struct SlashCommand: Identifiable {
    var id: String { command }
    let command: String
    let hintKey: String
    /// Whether the command is offered right now (desktop's `available`).
    var isAvailable: (TabsManager) -> Bool = { _ in true }
    /// Runs the command with the text typed after it.
    let action: (TabsManager, String) -> SlashOutcome

    var hint: String {
        if command == "/reader" { return ReaderCopy.text("reader.hint") }
        return NSLocalizedString(hintKey, tableName: "SlashCommands", bundle: .main, comment: "")
    }

    @discardableResult
    func execute(_ manager: TabsManager, argument: String = "") -> SlashOutcome {
        action(manager, argument)
    }

    /// The commands the phone offers. The shared set (F7) minus what waits for
    /// M17 (`/group`, `/ungroup`, `/close-group`, `/space`), `/sleep` (iOS frees
    /// a background page's memory itself, D8) and `/bangs` (after 1.0).
    static let available: [SlashCommand] = [
        SlashCommand(command: "/favorites", hintKey: "slash_favorites") { manager, _ in
            manager.createTab(url: URL(string: "blanc://bookmarks/")!)
            return .done
        },
        SlashCommand(command: "/history", hintKey: "slash_history") { manager, _ in
            manager.createTab(url: URL(string: "blanc://history/")!)
            return .done
        },
        SlashCommand(command: "/settings", hintKey: "slash_settings") { manager, _ in
            manager.showSettings(); return .done
        },
        SlashCommand(command: "/sync", hintKey: "slash_sync") { manager, _ in
            manager.showSettings(.sync); return .done
        },
        SlashCommand(command: "/new", hintKey: "slash_new") { manager, _ in
            manager.createTab(); return .done
        },
        SlashCommand(command: "/private", hintKey: "slash_private") { manager, _ in
            manager.createTab(isPrivate: true); return .done
        },
        SlashCommand(command: "/close", hintKey: "slash_close") { manager, _ in
            if let id = manager.activeTabId { manager.closeTab(id) }
            return .done
        },
        SlashCommand(command: "/reopen", hintKey: "slash_reopen") { manager, _ in
            manager.reopenLast(); return .done
        },
        // Never offered in a private tab, as on desktop.
        SlashCommand(command: "/send", hintKey: "slash_send",
                     isAvailable: { $0.activeTab?.isPrivate != true }) { manager, argument in
            guard !argument.isEmpty else { return .prompt("/send ") }
            manager.sendActiveTab(toDeviceNamed: argument)
            return .done
        },
        SlashCommand(command: "/reader", hintKey: "slash_reader") { manager, _ in
            manager.toggleReaderMode(); return .done
        },
        SlashCommand(command: "/find", hintKey: "slash_find") { manager, _ in
            manager.requestFind(); return .done
        },
        SlashCommand(command: "/block-ads", hintKey: "slash_block_ads") { manager, _ in
            manager.runBlockAdsCommand(); return .done
        },
        SlashCommand(command: "/allow-ads", hintKey: "slash_allow_ads") { manager, _ in
            if let tab = manager.activeTab { manager.setSiteProtection(tab, on: false) }
            return .done
        },
        SlashCommand(command: "/theme", hintKey: "slash_theme") { manager, argument in
            let next = nextTheme(after: manager.settingsStore.theme, argument: argument)
            manager.applySettingsPatch(["theme": next.rawValue])
            return .done
        },
    ]

    static func filter(prefix: String) -> [SlashCommand] {
        guard !prefix.isEmpty else { return available }
        return available.filter { $0.command.hasPrefix(prefix) }
    }

    /// `filter(prefix:)` without the commands `manager` doesn't offer now.
    static func filter(prefix: String, in manager: TabsManager) -> [SlashCommand] {
        filter(prefix: prefix).filter { $0.isAvailable(manager) }
    }

    /// Runs the first command matching the typed word, with the rest as its
    /// argument. Nil when nothing matches.
    static func run(_ input: String, in manager: TabsManager) -> SlashOutcome? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let word = String(trimmed.split(separator: " ").first ?? Substring(trimmed))
        return filter(prefix: word, in: manager).first?.execute(manager, argument: argument(from: trimmed))
    }

    /// The text after the command word, trimmed (desktop's `commandArgument`).
    static func argument(from input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let space = trimmed.firstIndex(of: " ") else { return "" }
        return trimmed[space...].trimmingCharacters(in: .whitespaces)
    }

    /// Bare `/theme` cycles system → light → dark; a word picks that theme,
    /// and an unknown word changes nothing (desktop's `chrome:cycle-theme`).
    static func nextTheme(after current: BlancThemePreference, argument: String) -> BlancThemePreference {
        let order: [BlancThemePreference] = [.system, .light, .dark]
        let word = argument.lowercased()
        if !word.isEmpty { return BlancThemePreference(rawValue: word) ?? current }
        let index = order.firstIndex(of: current) ?? 0
        return order[(index + 1) % order.count]
    }

    /// The device `name` means, without regard to case.
    static func sendTarget(named name: String, in targets: [SendTarget]) -> SendTarget? {
        let wanted = name.lowercased()
        return targets.first { $0.name.lowercased() == wanted }
    }
}
