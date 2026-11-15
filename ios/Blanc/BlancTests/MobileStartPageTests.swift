import XCTest
import WebKit
@testable import Blanc

@MainActor
final class MobileStartPageTests: XCTestCase {
    /// Older builds read `newtabLayout`; the fork's page shows Billboard whatever it says.
    func testBillboardDefaultAndSavedLayouts() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SettingsStore(directory: directory)
        XCTAssertEqual(store.newtabLayout, .billboard)
        for layout in BlancStartPageLayout.allCases {
            store.update(newtabLayout: layout)
            store.flush()
            XCTAssertEqual(SettingsStore(directory: directory).newtabLayout, layout)
        }
    }

    /// Holding the Start Page opens Customize, so a hold must not also
    /// select the text under the finger and bring up the text menu.
    func testHoldingTheStartPageCannotSelectItsText() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let manager = TabsManager(settingsDirectory: directory, sessionDirectory: directory)
        let webView = try XCTUnwrap(manager.activeTab?.webView)
        var selectable: String?
        for _ in 0..<100 {
            selectable = try? await webView.evaluateJavaScript("""
                document.readyState !== 'complete' || location.host !== 'newtab' ? null : JSON.stringify(
                  [...document.body.querySelectorAll('*')]
                    .filter(e => !e.matches('input, textarea, select') && getComputedStyle(e).webkitUserSelect !== 'none')
                    .map(e => e.id || e.className || e.tagName).slice(0, 10))
                """) as? String
            if selectable != nil { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertEqual(selectable, "[]")
    }

    /// The desktop fork's Start Page, as the iPhone serves it: it loads with
    /// the phone layer, its Customize and Font & color save through
    /// `StartPageBridge`, Glass goes to the native Liquid Glass clock, and it
    /// fits a phone.
    func testForkStartPageLoadsSavesAndFitsInWebKit() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let manager = TabsManager(settingsDirectory: directory, sessionDirectory: directory)
        let webView = try XCTUnwrap(manager.activeTab?.webView)
        webView.configuration.userContentController.addUserScript(WKUserScript(
            source: "window.__pageErrors=[]; window.addEventListener('error', e => window.__pageErrors.push(e.message)); window.addEventListener('unhandledrejection', e => window.__pageErrors.push(String(e.reason)));",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.reload()
        let controller = UIViewController()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        controller.view = webView
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        webView.frame = window.bounds

        var ready = false
        for _ in 0..<100 {
            if let value = try? await webView.evaluateJavaScript("document.body?.classList.contains('layout-ready') === true && document.documentElement.dataset.platform === 'ios' && typeof chrome.send === 'function'"),
               (value as? Bool) == true {
                ready = true
                break
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let diagnostics = try? await webView.evaluateJavaScript("JSON.stringify({errors:window.__pageErrors, url:location.href, ready:document.readyState, mobile:document.documentElement.dataset.platform === 'ios', classes:document.body?.className})")
        XCTAssertTrue(ready, "The fork's bundled Start Page must finish initializing: \(diagnostics ?? "none")")
        guard ready else { return }
        let initialLayout = try await webView.evaluateJavaScript("document.body.dataset.layout") as? String
        XCTAssertEqual(initialLayout, "billboard")
        // The figures sit at the screen's middle (ios-start.js moves the box by the font's metrics).
        let clockMiddle = try await webView.evaluateJavaScript("{ const r=document.getElementById('bbClock').getBoundingClientRect(); Math.abs(r.x+r.width/2-innerWidth/2)<2 && Math.abs(r.y+r.height/2-innerHeight/2)<innerHeight*0.1; }") as? Bool
        XCTAssertEqual(clockMiddle, true, "Clock must sit at the middle of the screen")
        // Mahjong isn't offered on phones yet (owner, 2026-11-15); Customize is.
        let footer = try await webView.evaluateJavaScript("[getComputedStyle(document.getElementById('mahjongPill')).display, getComputedStyle(document.getElementById('customizeButton')).display].join()") as? String
        XCTAssertEqual(footer?.hasPrefix("none,"), true)
        XCTAssertEqual(footer?.hasSuffix(",none"), false)
        let first = XCTAttachment(image: try await webView.takeSnapshot(configuration: nil))
        first.name = "iOS fork Start Page"
        first.lifetime = .keepAlways
        add(first)

        _ = try await webView.evaluateJavaScript("document.getElementById('customizeButton').click()")
        let customizeOpen = try await webView.evaluateJavaScript("document.getElementById('customizePopover').matches(':popover-open')") as? Bool
        XCTAssertEqual(customizeOpen, true)
        let panelFits = try await webView.evaluateJavaScript("document.getElementById('customizePopover').getBoundingClientRect().width >= innerWidth * 0.8") as? Bool
        XCTAssertEqual(panelFits, true, "Customize is a phone sheet, not the desktop anchor's narrow card")
        // A widget switch saves natively.
        _ = try await webView.evaluateJavaScript("document.querySelector('[data-widget-pick=favorites]').click()")
        for _ in 0..<20 where manager.services.startPage.widgets["favorites"] as? Bool != true {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(manager.services.startPage.widgets["favorites"] as? Bool, true)

        _ = try await webView.evaluateJavaScript("document.getElementById('clockStyleOpen').click()")
        try await Task.sleep(nanoseconds: 250_000_000)
        let clockOpen = try await webView.evaluateJavaScript("document.getElementById('clockPopover').matches(':popover-open')") as? Bool
        XCTAssertEqual(clockOpen, true)
        for font in ["condensed", "inter", "flex", "instrument"] {
            _ = try await webView.evaluateJavaScript("document.querySelector('[data-clock-font-pick=\(font)]').click()")
            try await Task.sleep(nanoseconds: 200_000_000)
            XCTAssertEqual(manager.startAppearance.values["newtabClockFont"] as? String, font)
        }
        for (id, value, key) in [("clockWeight", 600, "Weight"), ("clockHeight", 125, "Height")] {
            _ = try await webView.evaluateJavaScript("{const el=document.getElementById('\(id)');el.value='\(value)';el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));}")
            try await Task.sleep(nanoseconds: 200_000_000)
            XCTAssertEqual(manager.startAppearance.values["newtabClock\(key)"] as? Int, value)
        }
        _ = try await webView.evaluateJavaScript("document.querySelector('[data-clock-color-pick=sky]').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(manager.startAppearance.values["newtabClockColor"] as? String, "sky")
        // The iPhone keeps Glass or Solid (Android hides the row).
        for style in ["solid", "glass"] {
            _ = try await webView.evaluateJavaScript("document.querySelector('[data-clock-style-pick=\(style)]').click()")
            try await Task.sleep(nanoseconds: 300_000_000)
            XCTAssertEqual(manager.startAppearance.values["newtabClockStyle"] as? String, style)
        }
        let previewClear = try await webView.evaluateJavaScript("document.querySelector('.bb-clock-row').getBoundingClientRect().bottom < document.getElementById('clockPopover').getBoundingClientRect().top") as? Bool
        XCTAssertEqual(previewClear, true, "Clock preview must stay above the editor")
        _ = try await webView.evaluateJavaScript("document.getElementById('clockPopoverBack').click()")
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').hidePopover()")

        _ = try await webView.evaluateJavaScript("document.getElementById('bbClock').textContent='12:05'; window.dispatchEvent(new Event('resize'))")
        var glassDrawn = false
        for _ in 0..<40 {
            glassDrawn = (try await webView.evaluateJavaScript("document.getElementById('bbClock').classList.contains('native-clock-glass')") as? Bool) == true
            if glassDrawn { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertTrue(manager.activeTab?.nativeClock.isVisible == true)
        XCTAssertTrue(glassDrawn, "Glass must be handed to the native Liquid Glass renderer")
        let glassImage = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) })
        glassImage.name = "iOS Glass clock"
        glassImage.lifetime = .keepAlways
        add(glassImage)
        // Customize covers the clock: the native glass goes while it's open.
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').showPopover()")
        for _ in 0..<20 where manager.activeTab?.nativeClock.isVisible == true {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertFalse(manager.activeTab?.nativeClock.isVisible == true, "Customize must take the native glass clock away")
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').hidePopover()")
        for _ in 0..<40 where manager.activeTab?.nativeClock.isVisible != true {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertTrue(manager.activeTab?.nativeClock.isVisible == true, "Closing Customize must bring the glass clock back")

        // A load that fails before it commits leaves the Start Page in the web
        // view, with its glass clock, and the failure view over both.
        // Not port 9: it's on WebKit's blocked list, and iOS 26 answers that
        // by committing an empty page in place of the Start Page.
        let failing = URL(string: "http://127.0.0.1:\(try closedPort())/")!
        webView.load(URLRequest(url: failing))
        try await Task.sleep(nanoseconds: 200_000_000)
        for _ in 0..<100 where webView.isLoading {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(webView.url?.host, "newtab")
        XCTAssertTrue(manager.activeTab?.nativeClock.isVisible == true, "A failed load must not take the glass clock off the Start Page")
        XCTAssertEqual(manager.activeTab?.loadFailure?.url, failing, "the failure shows over the Start Page")
        webView.load(URLRequest(url: TabsManager.newTabURL))
        for _ in 0..<100 where manager.activeTab?.loadFailure != nil || webView.isLoading {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        for _ in 0..<100 {
            if (try? await webView.evaluateJavaScript("document.body?.classList.contains('layout-ready') === true")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }

        // The wallpaper stays in the page's own storage, as in the fork.
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').showPopover()")
        _ = try await webView.evaluateJavaScript("document.getElementById('colorWallpaperPick').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        _ = try await webView.evaluateJavaScript("document.querySelector('[data-wallpaper-color-pick=sky]').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        let stored = try await webView.evaluateJavaScript("JSON.parse(localStorage.getItem('blanc.prototype.start.preferences.v1')).wallpaper.color.preset") as? String
        XCTAssertEqual(stored, "sky")
        // ...and native code keeps a copy for private pages.
        XCTAssertEqual(manager.services.startPage.preferences?.contains("\"sky\""), true)
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').hidePopover()")

        for width in [320, 390, 768] {
            webView.frame = CGRect(x: 0, y: 0, width: width, height: 700)
            try await Task.sleep(nanoseconds: 200_000_000)
            let fits = try await webView.evaluateJavaScript("document.documentElement.scrollWidth <= window.innerWidth + 1") as? Bool
            XCTAssertEqual(fits, true, "The Start Page overflows at \(width) points")
        }
        _ = try await webView.evaluateJavaScript("window.bowserPages.start.openIsland(''); true")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertTrue(manager.isPalettePresented)
        let pageErrors = try await webView.evaluateJavaScript("JSON.stringify(window.__pageErrors)") as? String
        XCTAssertEqual(pageErrors, "[]")
        // The page's storage is the app's own: leave the next run the fork's defaults.
        _ = try await webView.evaluateJavaScript("localStorage.removeItem('blanc.prototype.start.preferences.v1'); true")
    }

    /// Favorites on the fork's Start Page: the Favorites widget lists the
    /// phone's synced Favorites, follows a change while the page is open (the
    /// `bookmarks` event, no reload), and its heading opens the Favorites page.
    func testFavoritesWidgetListsAndFollowsFavorites() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let manager = TabsManager(settingsDirectory: directory, sessionDirectory: directory)
        func save(_ url: String, _ title: String) {
            manager.syncEngine.editFavorites {
                SyncedFavorites.toggle($0, url: url, title: title, favicon: nil,
                                       now: Date().timeIntervalSince1970 * 1000, makeId: { UUID().uuidString.lowercased() }).store
            }
        }
        save("https://blanc.day/", "Blanc")
        try manager.services.startPage.changeWidgets("widgetsWrite", args: ["favorites", true])
        let webView = try XCTUnwrap(manager.activeTab?.webView)
        webView.reload()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let controller = UIViewController()
        controller.view = webView
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        webView.frame = window.bounds

        let names = "JSON.stringify([...document.querySelectorAll('#favoritesWidget #favoritesList .fav-item .name')].map(e => e.textContent.trim()))"
        func listed(_ expected: String) async throws -> String? {
            var value: String?
            for _ in 0..<100 {
                value = try? await webView.evaluateJavaScript(names) as? String
                if value == expected { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            return value
        }
        let first = try await listed(#"["Blanc"]"#)
        XCTAssertEqual(first, #"["Blanc"]"#, "The widget lists the saved Favorite")
        let shown = try await webView.evaluateJavaScript("(() => { const w = document.getElementById('favoritesWidget'); return !!w && !w.hidden && w.getClientRects().length > 0; })()") as? Bool
        XCTAssertEqual(shown, true, "The Favorites widget shows once it's switched on")
        // Widgets follow the shortcuts down the page, which scrolls (as on Android).
        _ = try await webView.evaluateJavaScript("scrollTo({top: document.scrollingElement.scrollHeight, behavior: 'instant'}); true")
        try await Task.sleep(nanoseconds: 500_000_000)
        let image = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        })
        image.name = "iOS Start Page Favorites widget"
        // Lists redraw as site icons arrive; scroll to the end again until the page settles.
        var clear: Bool?
        for _ in 0..<20 {
            clear = try await webView.evaluateJavaScript("""
              scrollTo({top: document.scrollingElement.scrollHeight, behavior: 'instant'});
              document.getElementById('favoritesWidget').getBoundingClientRect().bottom <= document.querySelector('.ledger-footer').getBoundingClientRect().top
              """) as? Bool
            if clear == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let layout = try await webView.evaluateJavaScript("JSON.stringify([document.getElementById('favoritesWidget').getBoundingClientRect().bottom, document.querySelector('.ledger-footer').getBoundingClientRect().top, scrollY, document.scrollingElement.scrollHeight, innerHeight])") as? String
        XCTAssertEqual(clear, true, "Scrolled to the end, the widget clears Customize: \(layout ?? "")")
        image.lifetime = .keepAlways
        add(image)

        // Saved while the page is open (the Island's heart): it appears without a reload.
        _ = try await webView.evaluateJavaScript("window.__sameDocument = true; true")
        save("https://example.com/", "Example")
        let both = try await listed(#"["Blanc","Example"]"#)
        XCTAssertEqual(both, #"["Blanc","Example"]"#, "A Favorite saved while the page is open appears")
        let sameDocument = try await webView.evaluateJavaScript("window.__sameDocument === true") as? Bool
        XCTAssertEqual(sameDocument, true, "The Start Page hears of Favorites; it isn't reloaded")

        // The heading opens the Favorites page in this tab.
        _ = try await webView.evaluateJavaScript("document.querySelector('#favoritesWidget a[href=\"blanc://bookmarks/\"]').click(); true")
        for _ in 0..<50 where webView.url?.host != "bookmarks" {
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertEqual(webView.url?.host, "bookmarks")
    }
}

/// A loopback port nothing listens on. It comes from below the ephemeral range
/// (49152 and up on Apple platforms), where every server that asks for port 0
/// lands: on a shared CI runner, another test's server once took a port this
/// picked there, and the "failing" load committed a real page. 20000–29999
/// holds no port on WebKit's blocked list.
private func closedPort() throws -> Int {
    for _ in 0..<50 {
        let port = UInt16.random(in: 20000..<30000)
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw XCTSkip("no socket") }
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let free = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0 }
        }
        if free { return Int(port) }
    }
    throw XCTSkip("no free loopback port")
}
