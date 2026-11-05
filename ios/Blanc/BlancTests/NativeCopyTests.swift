import XCTest
import WebKit
@testable import Blanc

/// M18 §4: every word Swift draws comes from the shared catalog.
@MainActor
final class NativeCopyTests: XCTestCase {
    static let keys = [
        "ios.island.searchOrSwitch", "ios.island.showAllTabs", "ios.island.reload", "ios.island.stop",
        "ios.island.pageActions", "ios.island.collapse", "ios.palette.placeholder", "ios.palette.clear",
        "ios.palette.noCommand", "ios.palette.noMatches", "ios.tabs.openTabs", "ios.tabs.switchTo",
        "ios.tabs.close", "ios.tabs.startPage", "ios.pages.syncUnavailable", "ios.pages.supporterUnavailable",
        "tab.new", "tab.untitled", "dialog.ok", "tabsMenu.header", "pagesNav.bookmarks", "pagesNav.history",
        "pagesNav.settings",
    ]

    func testEveryNativeKeyResolves() {
        for key in Self.keys { XCTAssertNotEqual(SyncCopy.text(key), key, key) }
    }

    func testParametersAreFilled() {
        XCTAssertEqual(SyncCopy.text("ios.tabs.close", ["title": "Example"]), "Close Example")
        XCTAssertEqual(SyncCopy.plural("tabsMenu.header", count: 3), "3 tabs")
    }

    func testTabTitle() {
        XCTAssertEqual(TabTitle.display(TabModel(url: TabsManager.newTabURL)), SyncCopy.text("ios.tabs.startPage"))
        XCTAssertEqual(TabTitle.display(TabModel(url: URL(string: "https://example.com/")!)), "example.com")
        let titled = TabModel(url: URL(string: "https://example.com/")!)
        titled.pageTitle = "Example Domain"
        XCTAssertEqual(TabTitle.display(titled), "Example Domain")
    }

    func testEveryOfferedCommandHasACatalogHint() {
        XCTAssertEqual(SlashCommand.hintKey("/close-group"), "slash.closeGroup.hint")
        for command in SlashCommand.available {
            XCTAssertFalse(command.hint.isEmpty, command.command)
            XCTAssertFalse(command.hint.hasPrefix("slash."), command.command)
        }
    }

    func testMissingTranslationReadsAsEnglish() {
        let source = #"window.x=({"locale":"de","dir":"ltr","messages":{"a":"A-de"},"fallback":{"b":"B"}});"#
        XCTAssertEqual(SyncCopy.messages(fromCatalog: source), ["a": "A-de", "b": "B"])
    }

    func testUnknownLanguageIsEnglish() {
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["ja-JP"]), "en")
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["pt-BR"]), "pt-BR")
    }
}
