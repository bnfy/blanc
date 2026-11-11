import XCTest
import WebKit
@testable import Blanc

/// What a page may ask of the browser: a dialog, answered exactly once, and
/// closing a tab it opened.
@MainActor final class PageRequestsTests: XCTestCase {
    private func manager() -> TabsManager {
        TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    }

    func testADialogIsAnsweredOnce() {
        var answers: [Bool] = []
        let answer = DialogAnswer(unanswered: false) { answers.append($0) }
        answer(true)
        answer(false)
        XCTAssertEqual(answers, [true])
    }

    func testADialogThatGoesAwayUnansweredIsDismissed() {
        var answers: [String?] = []
        var answer: DialogAnswer<String?>? = DialogAnswer(unanswered: nil) { answers.append($0) }
        XCTAssertNotNil(answer)
        answer = nil
        XCTAssertEqual(answers, [nil], "WebKit raises an exception for a handler that is never called")
    }

    func testAnAnsweredDialogSaysNothingMoreWhenItGoes() {
        var answers: [Bool] = []
        var answer: DialogAnswer<Bool>? = DialogAnswer(unanswered: false) { answers.append($0) }
        answer?(true)
        answer = nil
        XCTAssertEqual(answers, [true])
    }

    func testAPageOffScreenHasNowhereToShowADialog() {
        // No window: a background tab's page can't put an alert over another's.
        let tab = TabModel(url: URL(string: "https://blanc.invalid/")!, configuration: WKWebViewConfiguration(), load: false)
        XCTAssertNil(PageDialog.presenter(for: tab.webView))
    }

    func testAPageClosesTheTabItOpenedAndNoOther() {
        let m = manager()
        let opener = m.activeTab!
        _ = opener.uiDelegate.onOpenChild?(opener.webView.configuration, URL(string: "https://popup.blanc.invalid/")!)
        XCTAssertEqual(m.tabs.count, 2)
        let child = m.tabs[1]
        XCTAssertTrue(child.openedByPage)

        opener.uiDelegate.webViewDidClose(opener.webView)
        XCTAssertEqual(m.tabs.count, 2, "a tab the person opened is theirs to close")

        child.uiDelegate.webViewDidClose(child.webView)
        XCTAssertEqual(m.tabs.map(\.id), [opener.id])
        XCTAssertEqual(m.activeTabId, opener.id)
    }
}
