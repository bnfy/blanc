import XCTest
import WebKit
@testable import Blanc

@MainActor
final class NativeClockOverlayTests: XCTestCase {
    func testBundledVariableFontsProduceDistinctNativeOutlines() throws {
        for font in ["instrument", "condensed", "inter", "flex"] {
            let light = try XCTUnwrap(NativeClockOverlay.glyphPath(text: "12:34", fontID: font,
                size: 90, weight: 400, stretch: 98, spacing: 1))
            let heavy = try XCTUnwrap(NativeClockOverlay.glyphPath(text: "12:34", fontID: font,
                size: 90, weight: 700, stretch: 98, spacing: 1))
            XCTAssertFalse(light.isEmpty)
            XCTAssertNotEqual(light, heavy, "\(font) must retain its native variable weight axis")
        }
    }

    func testNativeMaterialClearsWhenHiddenOrNavigating() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Native Liquid Glass requires iOS 26") }
        let tab = TabModel(url: URL(string: "about:blank")!)
        let data: [String: Any] = ["text": "12:34", "font": "instrument", "x": 0.0, "y": 80.0,
            "width": 300.0, "height": 100.0, "size": 80.0, "weight": 500.0, "stretch": 98.0]
        XCTAssertTrue(tab.nativeClock.render(data, in: tab.webView))
        XCTAssertTrue(tab.nativeClock.isVisible)
        XCTAssertFalse(tab.nativeClock.render(nil, in: tab.webView))
        XCTAssertFalse(tab.nativeClock.isVisible)
        XCTAssertTrue(tab.nativeClock.render(data, in: tab.webView))
        tab.navigationDelegate.webView(tab.webView, didStartProvisionalNavigation: nil)
        XCTAssertFalse(tab.nativeClock.isVisible)
    }
}
