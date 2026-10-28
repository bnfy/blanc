import XCTest
@testable import Blanc

/// Links from other apps (M18 §6): queued until the manager exists, then each
/// opens in a new, ordinary, current tab.
final class IncomingLinksTests: XCTestCase {
    private func makeManager() -> TabsManager {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("IncomingLinksTests-\(UUID().uuidString)")
        return TabsManager(settingsDirectory: dir, sessionDirectory: dir)
    }

    /// The desktop's pairing QR scanned with the Camera app (design
    /// 2026-10-28 §7.3): never loaded, never a tab; Blanc asks first.
    @MainActor func testPairLinkNeverOpensATabAndWaitsToBeAsked() {
        let m = makeManager()
        let before = m.tabs.count
        var links = IncomingLinks()
        links.receive(URL(string: "https://blanc.day/pair#K7MR-4PX2")!, into: m)
        XCTAssertEqual(m.tabs.count, before)
        XCTAssertTrue(links.pending.isEmpty)
        XCTAssertEqual(links.takePairCode(), "K7MR4PX2")
        XCTAssertNil(links.takePairCode(), "asked once")
        links.receive(URL(string: "https://blanc.day/pair#K7MR4PX2")!, into: nil)
        XCTAssertTrue(links.pending.isEmpty, "a pair link doesn't wait for the manager either")
        links.receive(URL(string: "https://blanc.day/pair")!, into: m)
        XCTAssertEqual(m.tabs.count, before + 1, "the page without a code is an ordinary link")
    }

    @MainActor func testLinkBeforeTheManagerWaitsThenOpens() {
        var links = IncomingLinks()
        let first = URL(string: "https://example.com/a")!, second = URL(string: "http://example.org/b")!
        links.receive(first, into: nil)
        links.receive(second, into: nil)
        XCTAssertEqual(links.pending, [first, second])

        let m = makeManager()
        let before = m.tabs.count
        links.flush(into: m)
        XCTAssertTrue(links.pending.isEmpty)
        XCTAssertEqual(m.tabs.count, before + 2)
        XCTAssertEqual(m.tabs.suffix(2).map(\.currentURL), [first, second], "in arrival order")
        XCTAssertEqual(m.activeTab?.currentURL, second, "the last link is current")
        XCTAssertEqual(m.incomingLinkCount, 2)

        links.flush(into: m)
        XCTAssertEqual(m.tabs.count, before + 2, "a flush opens each link once")
    }

    @MainActor func testLinkOpensInANewOrdinaryTabEvenFromAPrivateOne() {
        let m = makeManager()
        m.createTab(isPrivate: true)
        m.isPalettePresented = true
        var links = IncomingLinks()
        let url = URL(string: "https://example.com/")!
        links.receive(url, into: m)
        XCTAssertTrue(links.pending.isEmpty, "with a manager, nothing waits")
        XCTAssertEqual(m.activeTab?.currentURL, url)
        XCTAssertEqual(m.activeTab?.isPrivate, false)
        XCTAssertFalse(m.isPalettePresented, "the page shows, not the palette")
    }

    @MainActor func testOtherSchemesAreIgnored() {
        let m = makeManager()
        let before = m.tabs.count
        var links = IncomingLinks()
        for text in ["blanc://settings/", "mailto:a@example.com", "file:///etc/hosts", "javascript:alert(1)", "https:"] {
            links.receive(URL(string: text)!, into: nil)
            links.receive(URL(string: text)!, into: m)
        }
        XCTAssertTrue(links.pending.isEmpty)
        XCTAssertEqual(m.tabs.count, before)
        XCTAssertTrue(IncomingLinks.accepts(URL(string: "HTTPS://Example.com/")!), "the scheme is matched without regard to case")
    }
}
