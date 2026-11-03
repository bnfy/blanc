import XCTest
@testable import Blanc

/// Glance (F34): where the card sits.
final class GlanceGeometryTests: XCTestCase {
    func testTheFirstCardIsLargeAndCentered() {
        let frame = GlanceGeometry.defaultFrame(in: CGSize(width: 1000, height: 800))
        XCTAssertEqual(frame, CGRect(x: 100, y: 16, width: 800, height: 768))
        XCTAssertEqual(GlanceGeometry.defaultFrame(in: CGSize(width: 2000, height: 800)).width, 1100)
    }

    func testCardsStayUsableAndInside() {
        let area = CGSize(width: 1000, height: 800)
        XCTAssertEqual(GlanceGeometry.clamp(CGRect(x: 900, y: -50, width: 100, height: 100), in: area),
                       CGRect(x: 640, y: 0, width: 360, height: 280))
        XCTAssertEqual(GlanceGeometry.clamp(CGRect(x: 0, y: 0, width: 5000, height: 5000), in: area),
                       CGRect(origin: .zero, size: area))
        XCTAssertEqual(GlanceGeometry.clamp(.zero, in: CGSize(width: 300, height: 200)),
                       CGRect(x: 8, y: 8, width: 284, height: 184))
    }

    func testTheRememberedFrameFitsAnyArea() {
        let frame = CGRect(x: 100, y: 80, width: 500, height: 400)
        let fraction = GlanceGeometry.fraction(frame, of: CGSize(width: 1000, height: 800))
        XCTAssertEqual(GlanceGeometry.frame(remembered: fraction, in: CGSize(width: 2000, height: 1600)),
                       CGRect(x: 200, y: 160, width: 1000, height: 800))
        XCTAssertEqual(GlanceGeometry.frame(remembered: nil, in: CGSize(width: 1000, height: 800)),
                       GlanceGeometry.defaultFrame(in: CGSize(width: 1000, height: 800)))
    }

    func testOnlyWebPagesOpenInGlance() {
        XCTAssertTrue(TabUIDelegate.glanceable(URL(string: "https://a.test/")!))
        XCTAssertFalse(TabUIDelegate.glanceable(URL(string: "mailto:a@b.test")!))
    }
}

/// Glance on the tab model: an ordinary tab, ended by a tab switch.
@MainActor final class GlanceTests: XCTestCase {
    private func manager() -> TabsManager {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("GlanceTests-\(UUID().uuidString)")
        let m = TabsManager(settingsDirectory: dir, sessionDirectory: dir)
        let first = m.tabs[0].id
        for url in ["https://a.test/", "https://b.test/"] { m.createTab(url: URL(string: url)!, quiet: true) }
        m.closeTab(first); m.expireUndo()
        m.setActive(m.tabs[0].id)
        m.showsWideLayout = true
        return m
    }

    func testOpeningALinkMakesATabShownInTheCard() {
        let m = manager()
        let current = m.activeTabId
        m.openInGlance(URL(string: "https://c.test/")!)
        XCTAssertEqual(m.tabs.count, 3)
        XCTAssertEqual(m.glanceTab?.currentURL.host, "c.test")
        XCTAssertEqual(m.activeTabId, current, "the page beneath stays current")
        XCTAssertFalse(m.glanceTab!.isQuiet)
    }

    func testClosingTheCardLeavesTheTabOpen() {
        let m = manager()
        m.openInGlance(URL(string: "https://c.test/")!)
        m.closeGlance()
        XCTAssertNil(m.glanceTab)
        XCTAssertEqual(m.tabs.count, 3)
    }

    func testATabSwitchOrNarrowWindowEndsIt() {
        let m = manager()
        m.showInGlance(m.tabs[1].id)
        XCTAssertNotNil(m.glanceTab)
        m.setActive(m.tabs[1].id)
        XCTAssertNil(m.glanceTab)
        m.showInGlance(m.tabs[0].id)
        m.showsWideLayout = false
        XCTAssertNil(m.glanceTab)
        XCTAssertFalse(m.canOpenGlance)
    }

    func testOpenAsTabAndKeepAsSplit() {
        let m = manager()
        let (a, b) = (m.tabs[0].id, m.tabs[1].id)
        m.showInGlance(b)
        m.openGlanceAsTab()
        XCTAssertEqual(m.activeTabId, b)
        XCTAssertNil(m.glanceTab)
        m.setActive(a)
        m.showInGlance(b)
        m.keepGlanceAsSplit()
        XCTAssertNil(m.glanceTab)
        XCTAssertEqual(m.activeSplit?.tabIds, [a, b])
        XCTAssertEqual(m.activeTabId, a)
    }

    func testNoGlanceOverASplitOrFromAPrivatePageIntoAnOrdinaryOne() {
        let m = manager()
        m.makeSplit(m.tabs[0].id, with: m.tabs[1].id)
        XCTAssertFalse(m.canOpenGlance)
        m.removeFromSplit(m.tabs[0].id)
        m.createTab(isPrivate: true)
        m.openInGlance(URL(string: "https://c.test/")!)
        XCTAssertEqual(m.glanceTab?.isPrivate, true)
    }

    func testTheIslandMenuOffersOtherTabsAndThenClose() {
        let m = manager()
        let current = m.activeTab!
        current.currentURL = URL(string: "https://a.test/")!
        XCTAssertEqual(m.glanceCandidates.map(\.id), [m.tabs[1].id])
        XCTAssertTrue(IslandMenu.items(for: current, manager: m).contains(.glance))
        m.showInGlance(m.tabs[1].id)
        let items = IslandMenu.items(for: current, manager: m)
        XCTAssertTrue(items.contains(.closeGlance))
        XCTAssertFalse(items.contains(.glance))
        XCTAssertTrue(m.glanceCandidates.isEmpty, "the Glance tab and the current tab aren't offered")
        m.showsWideLayout = false
        XCTAssertFalse(IslandMenu.items(for: current, manager: m).contains { $0 == .glance || $0 == .closeGlance })
    }

    func testClosingTheGlanceTabEndsTheGlance() {
        let m = manager()
        m.showInGlance(m.tabs[1].id)
        m.closeTab(m.tabs[1].id)
        XCTAssertNil(m.glanceTab)
    }
}
