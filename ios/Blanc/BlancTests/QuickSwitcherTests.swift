import XCTest
@testable import Blanc

final class QuickSwitcherTests: XCTestCase {
    private func makeTab(title: String, url: String) -> TabModel {
        let tab = TabModel(url: URL(string: url)!)
        tab.pageTitle = title
        return tab
    }

    func testSubstringMatchScores2PlusKindBonus() {
        let tab = makeTab(title: "Gmail", url: "https://mail.google.com/inbox")
        let results = QuickSwitcher.search(query: "gmail", tabs: [tab])
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].score, 2.2)
    }

    func testInOrderMatchScores1PlusKindBonus() {
        let tab = makeTab(title: "Gmail", url: "https://mail.google.com/inbox")
        let results = QuickSwitcher.search(query: "gml", tabs: [tab])
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].score, 1.2)
    }

    func testNoMatchExcluded() {
        let tab = makeTab(title: "Gmail", url: "https://mail.google.com")
        let results = QuickSwitcher.search(query: "xyz123", tabs: [tab])
        XCTAssertTrue(results.isEmpty)
    }

    func testCaseInsensitive() {
        let tab = makeTab(title: "GitHub", url: "https://github.com")
        let results = QuickSwitcher.search(query: "GITHUB", tabs: [tab])
        XCTAssertEqual(results.count, 1)
    }

    func testStrongMatchBeatsWeak() {
        let strong = makeTab(title: "gmail inbox", url: "https://gmail.com")
        let weak = makeTab(title: "game library", url: "https://games.example.com")
        // "gmail" is a substring of "gmail inbox" → score 2.2
        // "gmail" does not in-order match "game library games.example.com" (missing 'i' after 'a') → excluded (score 0)
        let results = QuickSwitcher.search(query: "gmail", tabs: [weak, strong])
        XCTAssertEqual(results[0].tab.id, strong.id)
    }

    func testEqualScorePreservesTabOrder() {
        let first = makeTab(title: "game library", url: "https://games.example.com")
        let second = makeTab(title: "good morning list", url: "https://list.example.com")
        // Both in-order match "gml" → score 1.2 each; first wins by tab position
        let results = QuickSwitcher.search(query: "gml", tabs: [first, second])
        XCTAssertEqual(results[0].tab.id, first.id)
        XCTAssertEqual(results[1].tab.id, second.id)
    }

    func testCapAt6() {
        let tabs = (0..<10).map { makeTab(title: "Tab \($0)", url: "https://tab\($0).test") }
        let results = QuickSwitcher.search(query: "tab", tabs: tabs)
        XCTAssertEqual(results.count, 6)
    }

    func testDedupByTabId() {
        let tab = makeTab(title: "test", url: "https://test.com")
        let results = QuickSwitcher.search(query: "test", tabs: [tab, tab])
        XCTAssertEqual(results.count, 1)
    }

    func testEmptyQueryReturnsEmpty() {
        let tab = makeTab(title: "test", url: "https://test.com")
        let results = QuickSwitcher.search(query: "", tabs: [tab])
        XCTAssertTrue(results.isEmpty)
    }

    func testQueryStringNotSearchable() {
        let tab = makeTab(title: "Login", url: "https://auth.example.com/callback?token=abc123")
        let tokenResults = QuickSwitcher.search(query: "abc123", tabs: [tab])
        XCTAssertTrue(tokenResults.isEmpty)
        let hostResults = QuickSwitcher.search(query: "auth", tabs: [tab])
        XCTAssertEqual(hostResults.count, 1)
    }
    func testFuzzyLocalAndFavoriteMatchesStayWeakDespiteSourceRanking() {
        let local = makeTab(title: "Gmail", url: "https://mail.google.com")
        let favorite = Favorite(id: "saved", url: "https://saved.example/", title: "Gmail", favicon: nil, folder: nil)
        let results = QuickSwitcher.search(query: "gml", tabs: [local], remote: [], favorites: [favorite])
        XCTAssertEqual(results.count, 2)
        XCTAssertTrue(results.allSatisfy { $0.score >= QuickSwitcher.strongMatchScore })
        XCTAssertTrue(results.allSatisfy { $0.strength < QuickSwitcher.strongMatchScore })
        XCTAssertEqual(results.first?.localTabID, local.id)
    }
    func testSubstringStrengthDoesNotDependOnSource() {
        let local = makeTab(title: "Gmail", url: "https://mail.google.com")
        let favorite = Favorite(id: "saved", url: "https://saved.example/", title: "Gmail", favicon: nil, folder: nil)
        let remote = RemoteDevice(id: "laptop", name: "Laptop", platform: "darwin", updatedAt: 1, tabs: [RemoteTab(url: "https://remote.example/", title: "Gmail", groupId: nil, pinned: false)])
        let results = QuickSwitcher.search(query: "gmail", tabs: [local], remote: [remote], favorites: [favorite])
        XCTAssertEqual(results.count, 3)
        XCTAssertTrue(results.allSatisfy { $0.strength == QuickSwitcher.strongMatchScore })
        XCTAssertEqual(results.map(\.id).map { $0.split(separator: ":").first! }, ["local", "favorite", "remote"])
    }

    func testHistoryRanksBelowRemoteTabs() {
        let remote = RemoteDevice(id: "laptop", name: "Laptop", platform: "darwin", updatedAt: 1, tabs: [RemoteTab(url: "https://remote.example/", title: "Recipes", groupId: nil, pinned: false)])
        let history = [HistoryEntry(url: "https://visited.example/", title: "Recipes", visitedAt: 1)]
        let results = QuickSwitcher.search(query: "recipes", tabs: [], remote: [remote], favorites: [], history: history)
        XCTAssertEqual(results.map(\.id), ["remote:laptop:0", "history:https://visited.example/"])
        XCTAssertEqual(results.last?.url?.absoluteString, "https://visited.example/")
        XCTAssertEqual(results.last?.strength, QuickSwitcher.strongMatchScore)
    }
    func testHistoryIsDeduplicatedAgainstOpenTabs() {
        let local = makeTab(title: "Recipes", url: "https://recipes.example/")
        let favorite = Favorite(id: "saved", url: "https://saved.example/", title: "Recipes", favicon: nil, folder: nil)
        let history = [
            HistoryEntry(url: local.currentURL.absoluteString, title: "Recipes", visitedAt: 3),
            HistoryEntry(url: "https://saved.example/", title: "Recipes", visitedAt: 2),
            HistoryEntry(url: "https://other.example/", title: "Recipes", visitedAt: 1),
            HistoryEntry(url: "https://other.example/", title: "Recipes", visitedAt: 0),
        ]
        let results = QuickSwitcher.search(query: "recipes", tabs: [local], remote: [], favorites: [favorite], history: history)
        XCTAssertEqual(results.map { $0.id.split(separator: ":").first! }, ["local", "favorite", "history"])
        XCTAssertEqual(results.last?.id, "history:https://other.example/")
    }
    func testHistoryKeepsTheListAtTwelve() {
        let history = (0..<20).map { HistoryEntry(url: "https://site.example/\($0)", title: "Match", visitedAt: Int64($0)) }
        XCTAssertEqual(QuickSwitcher.search(query: "match", tabs: [], remote: [], favorites: [], history: history).count, 12)
    }
    func testGoNeverTradesATypedAddressForAHistoryMatch() {
        let history = [HistoryEntry(url: "https://github.com/bnfy/blanc/pull/1097", title: "Move to Space", visitedAt: 1)]
        for typed in ["github.com", "https://github.com", "localhost:3000", "192.168.1.1", "mailto:a@b.test"] {
            let results = QuickSwitcher.search(query: typed, tabs: [], remote: [], favorites: [], history: history)
            XCTAssertNil(QuickSwitcher.goTarget(query: typed, results: results), typed)
        }
        let words = QuickSwitcher.search(query: "move to space", tabs: [], remote: [], favorites: [], history: history)
        XCTAssertEqual(QuickSwitcher.goTarget(query: "move to space", results: words)?.id, "history:https://github.com/bnfy/blanc/pull/1097")
        let fuzzy = QuickSwitcher.search(query: "mvsp", tabs: [], remote: [], favorites: [], history: history)
        XCTAssertNil(QuickSwitcher.goTarget(query: "mvsp", results: fuzzy), "a weak match never takes Go")
    }
    func testGroupsAndSpacesRankAboveTabs() {
        let tab = TabModel(url: URL(string: "https://research.example/")!)
        tab.pageTitle = "Research notes"
        let group = TabGroup(id: String(repeating: "a", count: 32), name: "Research")
        tab.groupId = group.id
        let results = QuickSwitcher.search(query: "research", tabs: [tab], remote: [], favorites: [],
                                           groups: [group], sets: [(id: "s", name: "Research lab", count: 3)])
        XCTAssertEqual(results.prefix(2).map(\.id).sorted(), ["group:" + group.id, "set:s"])
        XCTAssertEqual(results.last?.localTabID, tab.id)
        XCTAssertEqual(results.first { $0.groupId != nil }?.subtitle, "1 tab")
    }

    /// M17c: another device's Space (switch off) is found by name, labelled
    /// with its device, and ranks above tabs.
    func testRemoteSpacesMatchByName() {
        let results = QuickSwitcher.search(query: "trav", tabs: [], remote: [], favorites: [],
                                           remoteSpaces: [(id: "s1", name: "Travel", device: "MacBook Pro")])
        XCTAssertEqual(results.first?.remoteSpaceId, "s1")
        XCTAssertEqual(results.first?.subtitle, "On MacBook Pro")
    }
}
