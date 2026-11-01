import XCTest
import SwiftUI
import WebKit
@testable import Blanc

@MainActor
final class TabGridTests: XCTestCase {
    func testVisiblePageProducesSquarePreviewAndGridRenders() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let manager = TabsManager(settingsDirectory: directory, sessionDirectory: directory)
        let tab = try XCTUnwrap(manager.activeTab)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let controller = UIViewController()
        controller.view = tab.webView
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        tab.webView.frame = window.bounds
        for _ in 0..<100 {
            if (try? await tab.webView.evaluateJavaScript("document.body?.classList.contains('layout-ready')")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        tab.captureThumbnail()
        let preview = try XCTUnwrap(tab.thumbnail)
        XCTAssertEqual(preview.size, CGSize(width: 320, height: 320))
        let originalID = tab.id
        let secondID = manager.createTab(url: URL(string: "about:blank")!)
        for _ in 0..<40 {
            if manager.activeTab?.webView.isLoading == false { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        manager.activeTab?.webView.loadHTMLString("<meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#cde5f4;color:#173a52;font:28px system-ui'><h1>Example Domain</h1><p>A real webpage preview.</p></body>", baseURL: URL(string: "https://example.com"))
        for _ in 0..<100 {
            if (try? await manager.activeTab?.webView.evaluateJavaScript("document.body.innerText.includes('A real webpage preview.')")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        let loaded = try await manager.activeTab?.webView.evaluateJavaScript("document.body.innerText.includes('A real webpage preview.')") as? Bool
        XCTAssertEqual(loaded, true)
        manager.activeTab?.currentURL = URL(string: "https://example.com")!
        manager.activeTab?.pageTitle = "Example Domain"
        manager.setActive(originalID)
        XCTAssertEqual(manager.activeTabId, originalID)
        XCTAssertNotNil(manager.activeTab?.thumbnail)
        let grid = UIHostingController(rootView: TabGridView(manager: manager))
        window.rootViewController = grid
        grid.view.frame = window.bounds
        for _ in 0..<100 {
            if manager.tabs.first(where: { $0.id == secondID })?.thumbnail != nil { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertNotNil(manager.tabs.first(where: { $0.id == secondID })?.thumbnail, "Unvisited tabs need real page snapshots")
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "Full-screen square tab grid"
        attachment.lifetime = .keepAlways
        add(attachment)
        manager.closeTab(secondID)
        XCTAssertEqual(manager.tabs.count, 1)
        XCTAssertEqual(manager.activeTabId, originalID)
    }
}
