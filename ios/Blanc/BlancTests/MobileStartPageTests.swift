import XCTest
import WebKit
@testable import Blanc

@MainActor
final class MobileStartPageTests: XCTestCase {
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

    func testAllLayoutsLoadFitAndPersistInWebKit() async throws {
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
            if let value = try? await webView.evaluateJavaScript("document.body?.classList.contains('layout-ready') === true && document.documentElement.dataset.platform === 'ios'"),
               (value as? Bool) == true {
                ready = true
                break
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let diagnostics = try? await webView.evaluateJavaScript("JSON.stringify({errors:window.__pageErrors, url:location.href, ready:document.readyState, mobile:document.documentElement.dataset.platform === 'ios', classes:document.body?.className})")
        XCTAssertTrue(ready, "The real bundled Start Page must finish initializing: \(diagnostics ?? "none")")
        guard ready else { return }
        let initialLayout = try await webView.evaluateJavaScript("document.body.dataset.layout") as? String
        XCTAssertEqual(initialLayout, "billboard")
        let clockCentered = try await webView.evaluateJavaScript("{ const r=document.getElementById('bbClock').getBoundingClientRect(); Math.abs(r.x+r.width/2-innerWidth/2)<1 && Math.abs(r.y+r.height/2-innerHeight/2)<1; }") as? Bool
        XCTAssertEqual(clockCentered, true, "Clock must be centered in the full viewport")
        let first = XCTAttachment(image: try await webView.takeSnapshot(configuration: nil))
        first.name = "iOS Billboard default"
        first.lifetime = .keepAlways
        add(first)

        let normalClockSize = try await webView.evaluateJavaScript("getComputedStyle(document.getElementById('bbClock')).fontSize") as? String
        // Exercise the real Customize panel and its native persistence bridge.
        _ = try await webView.evaluateJavaScript("document.getElementById('customizeButton').click()")
        let customizeOpen = try await webView.evaluateJavaScript("document.getElementById('customizePopover').matches(':popover-open')") as? Bool
        XCTAssertEqual(customizeOpen, true)
        let panelFits = try await webView.evaluateJavaScript("document.getElementById('customizePopover').getBoundingClientRect().width >= innerWidth * 0.8") as? Bool
        XCTAssertEqual(panelFits, true, "The mobile panel must not use the desktop anchor's narrow width")
        _ = try await webView.evaluateJavaScript("document.getElementById('clockStyleOpen').click()")
        try await Task.sleep(nanoseconds: 250_000_000)
        let clockOpen = try await webView.evaluateJavaScript("document.getElementById('clockPopover').matches(':popover-open')") as? Bool
        XCTAssertEqual(clockOpen, true)
        let editingClockSize = try await webView.evaluateJavaScript("getComputedStyle(document.getElementById('bbClock')).fontSize") as? String
        XCTAssertEqual(editingClockSize, normalClockSize, "Editing must preserve the actual clock size")
        // Use the actual controls, not just the bridge API.
        for font in ["condensed", "inter", "flex", "instrument"] {
            _ = try await webView.evaluateJavaScript("document.querySelector('[data-clock-font-pick=\(font)]').click()")
            try await Task.sleep(nanoseconds: 150_000_000)
            XCTAssertEqual(manager.startAppearance.values["newtabClockFont"] as? String, font)
        }
        for (id, value, key) in [("clockWeight", 600, "Weight"), ("clockHeight", 125, "Height")] {
            _ = try await webView.evaluateJavaScript("{const el=document.getElementById('\(id)');el.value='\(value)';el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));}")
            try await Task.sleep(nanoseconds: 150_000_000)
            XCTAssertEqual(manager.startAppearance.values["newtabClock\(key)"] as? Int, value)
        }
        _ = try await webView.evaluateJavaScript("document.querySelector('[data-clock-color-pick=sky]').click()")
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(manager.startAppearance.values["newtabClockColor"] as? String, "sky")
        _ = try await webView.evaluateJavaScript("{const el=document.getElementById('clockTone');el.value='25';el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));}")
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(manager.startAppearance.values["newtabClockTone"] as? Int, 25)
        for style in ["glass", "solid"] {
            _ = try await webView.evaluateJavaScript("document.querySelector('[data-clock-style-pick=\(style)]').click()")
            try await Task.sleep(nanoseconds: 300_000_000)
            XCTAssertEqual(manager.startAppearance.values["newtabClockStyle"] as? String, style)
        }
        let previewClear = try await webView.evaluateJavaScript("document.querySelector('.bb-clock-row').getBoundingClientRect().bottom < document.getElementById('clockPopover').getBoundingClientRect().top") as? Bool
        XCTAssertEqual(previewClear, true, "Clock preview must stay above the editor")
        let controlsVisible = try await webView.evaluateJavaScript("getComputedStyle(document.getElementById('clockPopover')).visibility === 'visible'") as? Bool
        XCTAssertEqual(controlsVisible, true)
        let panelOnscreen = try await webView.evaluateJavaScript("document.getElementById('clockPopover').getBoundingClientRect().bottom <= innerHeight - 75") as? Bool
        XCTAssertEqual(panelOnscreen, true, "All controls must remain reachable by scrolling inside the panel")

        _ = try await webView.callAsyncJavaScript("return await window.bowserPages.start.setClock({font:'flex',weight:700,height:150,color:'iris',tone:35,style:'solid'});", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(manager.startAppearance.values["newtabClockFont"] as? String, "flex")
        XCTAssertEqual(manager.startAppearance.values["newtabClockHeight"] as? Int, 150)
        let clockImage = XCTAttachment(image: try await webView.takeSnapshot(configuration: nil))
        clockImage.name = "iOS Customize clock"
        clockImage.lifetime = .keepAlways
        add(clockImage)
        _ = try await webView.evaluateJavaScript("document.getElementById('clockPopoverBack').click()")
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').hidePopover()")
        _ = try await webView.callAsyncJavaScript("return await window.bowserPages.start.setClock({font:'instrument',height:100,style:'glass'});", arguments: [:], in: nil, contentWorld: .page)
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
        // Inspect real backdrop sampling across the WKWebView/native boundary.
        _ = try await webView.evaluateJavaScript("{ const probe = document.createElement('div'); probe.id='glassBackdropProbe'; probe.style.cssText='position:fixed;inset:0;z-index:1000;pointer-events:none;background:repeating-linear-gradient(90deg,#224477 0 24px,#e5ad65 24px 48px)'; document.body.append(probe); }")
        try await Task.sleep(nanoseconds: 300_000_000)
        let backdropImage = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) })
        backdropImage.name = "Native glass backdrop sampling"
        backdropImage.lifetime = .keepAlways
        add(backdropImage)
        _ = try await webView.evaluateJavaScript("document.getElementById('glassBackdropProbe').remove()")

        _ = try await webView.callAsyncJavaScript("return await window.bowserPages.start.setClock({font:'flex',height:150,style:'solid'});", arguments: [:], in: nil, contentWorld: .page)
        for _ in 0..<20 where manager.activeTab?.nativeClock.isVisible == true {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertFalse(manager.activeTab?.nativeClock.isVisible == true, "Solid style must remove native glass")
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').showPopover()")
        _ = try await webView.evaluateJavaScript("document.getElementById('colorWallpaperPick').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        _ = try await webView.evaluateJavaScript("document.querySelector('[data-wallpaper-color-pick=sky]').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        _ = try await webView.evaluateJavaScript("document.querySelector('[data-wallpaper-fill-pick=solid]').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(manager.startAppearance.values["newtabWallpaperColor"] as? String, "sky")
        XCTAssertEqual(manager.startAppearance.values["newtabWallpaperFill"] as? String, "solid")
        let customizeImage = XCTAttachment(image: try await webView.takeSnapshot(configuration: nil))
        customizeImage.name = "iOS Customize wallpaper"
        customizeImage.lifetime = .keepAlways
        add(customizeImage)
        _ = try await webView.callAsyncJavaScript("await window.bowserPages.start.setWallpaper('time-of-day'); return await window.bowserPages.start.setWallpaperWash(40);", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(manager.startAppearance.values["newtabDynamicWallpaper"] as? Bool, true)
        XCTAssertEqual(manager.startAppearance.values["newtabWallpaperWash"] as? Int, 40)
        // Complete the native picker callback with a local image, then verify
        // that the document can actually load the scheme-served JPEG.
        _ = try await webView.evaluateJavaScript("window.__picked = null; window.bowserPages.start.chooseWallpaper().then(result => { window.__picked = result; }); true")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertTrue(manager.isWallpaperPickerPresented)
        let photo = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 24)).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 32, height: 24))
        }
        let completePick = try XCTUnwrap(manager.wallpaperSelectionCompletion)
        manager.wallpaperSelectionCompletion = nil
        manager.isWallpaperPickerPresented = false
        completePick(photo)
        try await Task.sleep(nanoseconds: 200_000_000)
        let imageWidth = try await webView.callAsyncJavaScript("const data = await window.bowserPages.start.data(); return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth); image.onerror = reject; image.src = data.wallpaper.image; });", arguments: [:], in: nil, contentWorld: .page) as? Int
        XCTAssertEqual(imageWidth, 32)
        _ = try await webView.callAsyncJavaScript("return await window.bowserPages.start.removeWallpaper();", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertFalse(FileManager.default.fileExists(atPath: manager.startAppearance.imageURL.path))
        let saved = StartAppearanceStore(directory: directory)
        XCTAssertEqual(saved.values["newtabClockColor"] as? String, "iris")
        _ = try await webView.callAsyncJavaScript("await window.bowserPages.start.setClock({font:'instrument',weight:500,height:100,color:'auto',tone:50,style:'solid'}); return await window.bowserPages.start.setWallpaper('sunrise');", arguments: [:], in: nil, contentWorld: .page)
        _ = try await webView.evaluateJavaScript("document.getElementById('customizePopover').hidePopover()")

        // Exercise the real layout-picker bridge, using representative long
        // favorites to catch overflow which empty states cannot expose.
        _ = try await webView.evaluateJavaScript("state.favorites = Array.from({length: 6}, (_, i) => ({id: i, title: 'A long favorite title for mobile ' + i, url: 'https://example.com/' + i})); state.topSites = state.favorites; renderLedgerFavorites(); rendered.clear();")
        for width in [320, 390, 768] {
            webView.frame = CGRect(x: 0, y: 0, width: width, height: 700)
            for layout in BlancStartPageLayout.allCases {
                _ = try await webView.evaluateJavaScript("document.querySelector('[data-layout-pick=\"\(layout.rawValue)\"]').click()")
                try await Task.sleep(nanoseconds: 200_000_000)
                XCTAssertEqual(manager.settingsStore.newtabLayout, layout)
                let fits = try await webView.evaluateJavaScript("document.documentElement.scrollWidth <= window.innerWidth + 1") as? Bool
                XCTAssertEqual(fits, true, "\(layout) overflows at \(width) points")
                let attachment = XCTAttachment(image: try await webView.takeSnapshot(configuration: nil))
                attachment.name = "iOS \(layout.rawValue) \(width)"
                attachment.lifetime = .keepAlways
                add(attachment)
            }
        }
        _ = try await webView.evaluateJavaScript("window.bowserPages.start.openIsland(); true")
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(manager.isPalettePresented)
        let pageErrors = try await webView.evaluateJavaScript("JSON.stringify(window.__pageErrors)") as? String
        XCTAssertEqual(pageErrors, "[]")
    }
}
