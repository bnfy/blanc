import XCTest
@testable import Blanc

/// Search suggestions (F5): what may be sent to a search provider, where, and
/// what comes back. The eligibility cases are desktop's, from
/// test/unit/search-suggestions.test.js.
@MainActor final class SearchSuggestionsTests: XCTestCase {
    private func manager() -> TabsManager {
        TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    }

    func testOrdinarySearchesAreEligible() {
        for query in ["blanc browser", #"how to escape \ in a regex"#, "sketch app recommendations",
                      "github token best practices", "akia resort reviews", "password manager recommendations"] {
            XCTAssertTrue(SearchSuggestions.isEligible(query), query)
        }
    }

    func testAddressesPathsAndSecretsStayOnThePhone() {
        let local = [
            "a", "/history", "https://example.com/private", "mailto:a@example.com", "localhost:3000",
            "localhost:3000#access-token", "192.168.1.1/admin", "10.0.0.1:8080?auth=private", "example.com/path",
            "example.com?access_token=private", "xn--e1afmkfd.xn--p1ai/private", "例え.テスト/private",
            "[2001:db8::1]/admin", "[fe80::1%en0]/admin", "[fe80::1%25en0]/admin", "2001:db8::1/admin",
            "./drafts/private notes", #"\Windows\System32\drivers\etc\hosts"#, #"\\corp\HR\Payroll 2026.xlsx"#,
            #"\\?\C:\Users\me\private.txt"#, #"\\.\pipe\private-service"#, "My Tax Return.html",
            "4111 1111 1111 1111", "api_key=", "api_key=very-secret-value", "token:", "sk-", "sk-proj-", "sk-proj-a",
            "sk-proj-abcdefghijklmnop1234", "ghp_", "ghp_a", "ghp_abcdefghijklmnopqrstuvwxyz123456", "AKIA", "AKIAI",
            "AKIAIOSFODNN7EXAMPLE", "two\nlines", String(repeating: "x", count: 201),
        ]
        for query in local { XCTAssertFalse(SearchSuggestions.isEligible(query), query) }
    }

    func testEachProviderHasItsAddressAndACustomEngineHasNone() {
        func address(_ engine: BlancSearchEngine) -> String? {
            SearchSuggestions.requestURL(engine: engine, query: " c++ tips ")?.absoluteString
        }
        XCTAssertEqual(address(.duckduckgo), "https://duckduckgo.com/ac/?q=c%2B%2B%20tips&type=list")
        XCTAssertEqual(address(.google), "https://www.google.com/complete/search?output=chrome&ie=utf-8&oe=utf-8&q=c%2B%2B%20tips")
        XCTAssertEqual(address(.bing), "https://api.bing.com/osjson.aspx?query=c%2B%2B%20tips")
        XCTAssertEqual(address(.brave), "https://search.brave.com/api/suggest?q=c%2B%2B%20tips")
        XCTAssertEqual(address(.kagi), "https://kagi.com/api/autosuggest?q=c%2B%2B%20tips")
        XCTAssertNil(address(.custom))
        XCTAssertNil(SearchSuggestions.requestURL(engine: .duckduckgo, query: "a"))
    }

    func testAnswersAreTrimmedDedupedAndCapped() {
        let answer = #"["blanc", ["blanc browser", "  blanc   mont  ", "Blanc Browser", 7, "", "blanc day", "blanc de blancs", "blanc noir", "blanc six"]]"#
        XCTAssertEqual(SearchSuggestions.parse(Data(answer.utf8)),
                       ["blanc browser", "blanc mont", "blanc day", "blanc de blancs", "blanc noir"])
    }

    func testAnythingElseIsNoSuggestions() {
        XCTAssertEqual(SearchSuggestions.parse(Data("not json".utf8)), [])
        XCTAssertEqual(SearchSuggestions.parse(Data(#"{"q": ["a"]}"#.utf8)), [])
        XCTAssertEqual(SearchSuggestions.parse(Data(#"["blanc"]"#.utf8)), [])
        let long = "[\"q\", [\"" + String(repeating: "x", count: SearchSuggestions.maxResponseBytes) + "\"]]"
        XCTAssertEqual(SearchSuggestions.parse(Data(long.utf8)), [], "an answer over the size limit is dropped whole")
    }

    func testTypingIsOneCharacterAtATime() {
        XCTAssertTrue(SearchSuggestions.isTypedEdit(from: "", to: "b"))
        XCTAssertTrue(SearchSuggestions.isTypedEdit(from: "blan", to: "blanc"))
        XCTAssertTrue(SearchSuggestions.isTypedEdit(from: "blnc", to: "blanc"), "a letter added in the middle")
        XCTAssertTrue(SearchSuggestions.isTypedEdit(from: "blanc browser", to: "blanc"), "deleting")
        XCTAssertTrue(SearchSuggestions.isTypedEdit(from: "blanc browser", to: "x"), "typing over a selection")
        XCTAssertFalse(SearchSuggestions.isTypedEdit(from: "", to: "hunter2"), "pasted")
        XCTAssertFalse(SearchSuggestions.isTypedEdit(from: "hello world", to: "hunter2pw"), "pasted over a selection")
        XCTAssertFalse(SearchSuggestions.isTypedEdit(from: "blanc ", to: "blanc browser"), "a dictated word")
    }

    func testPastedTextIsNeverSentUntilTheFieldIsEmptied() {
        let m = manager()
        m.paletteDraft = "b"
        XCTAssertTrue(m.paletteTyped)
        m.paletteDraft = "bank statement 2026"
        XCTAssertFalse(m.paletteTyped)
        m.paletteDraft = "bank statement 202"
        XCTAssertFalse(m.paletteTyped, "editing pasted text doesn't make it typed")
        m.paletteDraft = ""
        XCTAssertTrue(m.paletteTyped)
    }

    func testSuggestionsAreOffUntilTheChoiceIsSaved() async {
        let m = manager()
        XCTAssertNil(m.settingsStore.searchSuggestions)
        XCTAssertFalse(m.settingsStore.searchSuggestionsOn, "an unsaved choice sends nothing")
        XCTAssertTrue(m.settingsStore.searchSuggestionsShown, "the walkthrough's switch shows the schema default")
        m.paletteDraft = "b"
        m.paletteDraft = "bl"
        // Off: nothing is asked of any provider, so the answer is immediate.
        let none = await m.searchSuggestions(for: "bl")
        XCTAssertEqual(none, [])
    }

    func testThePrivateTabAndPastedTextAskNoProvider() async {
        let m = manager()
        m.settingsStore.update(searchSuggestions: true)
        m.paletteDraft = "pasted all at once"
        let pasted = await m.searchSuggestions(for: "pasted all at once")
        XCTAssertEqual(pasted, [])
        m.paletteDraft = ""
        m.createTab(isPrivate: true)
        m.paletteDraft = "b"
        m.paletteDraft = "bl"
        let fromPrivate = await m.searchSuggestions(for: "bl")
        XCTAssertEqual(fromPrivate, [])
    }

    func testTheChoiceIsSavedOnlyOnceMade() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = SettingsStore(directory: directory)
        store.update(theme: .dark)
        store.flush()
        let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("settings.json"))) as? [String: Any]
        XCTAssertNil(saved?["searchSuggestions"], "another setting's save doesn't make the choice")
        store.update(searchSuggestions: false)
        store.flush()
        let reloaded = SettingsStore(directory: directory)
        XCTAssertEqual(reloaded.searchSuggestions, false)
        XCTAssertFalse(reloaded.searchSuggestionsShown, "a saved off stays off when the welcome is shown again")
    }

    func testClosingTheWalkthroughSavesBothPrivacyChoices() {
        let m = manager()
        m.walkthrough = WalkthroughFlow(paired: false, completedVersion: 0, isDefaultBrowser: nil)
        m.closeWalkthrough(usagePingShown: true, searchSuggestionsShown: false)
        XCTAssertEqual(m.settingsStore.usagePing, true)
        XCTAssertEqual(m.settingsStore.searchSuggestions, false)
    }

    func testWithNoCardShowingNothingIsSaved() {
        let m = manager()
        m.walkthrough = WalkthroughFlow(paired: true, completedVersion: WalkthroughFlow.version, isDefaultBrowser: nil)
        m.closeWalkthrough(usagePingShown: true, searchSuggestionsShown: true)
        XCTAssertNil(m.settingsStore.searchSuggestions)
        XCTAssertFalse(m.settingsStore.searchSuggestionsOn)
    }

    func testAPhoneFromTheEarlierWalkthroughIsAskedAndItsAnswerSaved() {
        let m = manager()
        m.settingsStore.update(usagePing: false, walkthroughCompletedVersion: 1)
        m.walkthrough = WalkthroughFlow(paired: true, completedVersion: 1, isDefaultBrowser: nil)
        XCTAssertEqual(m.walkthrough.current, .privacy)
        XCTAssertFalse(m.settingsStore.searchSuggestionsOn, "nothing is sent while the card waits")
        m.closeWalkthrough(usagePingShown: false, searchSuggestionsShown: true)
        XCTAssertEqual(m.settingsStore.searchSuggestions, true)
        XCTAssertEqual(m.settingsStore.usagePing, false, "the earlier choice is kept")
        XCTAssertEqual(m.settingsStore.walkthroughCompletedVersion, WalkthroughFlow.version)
    }

    func testTheSearchRowSearchesWhateverTheTextLooksLike() {
        let m = manager()
        m.search(for: "example.com")
        XCTAssertEqual(m.activeTab?.currentURL.absoluteString, "https://duckduckgo.com/?q=example.com")
    }
}
