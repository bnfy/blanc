import XCTest

/// The private Island (M9), from a seeded state (`-BlancUITestPrivate`): one
/// ordinary tab and a current private tab, both on example.com.
final class PrivateTabsUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestPrivate"]
    app.launch()
  }

  func testThePageMenuSaysPrivateAndClosesTheTab() {
    let menu = app.buttons["island.menu"]
    XCTAssertTrue(menu.waitForExistence(timeout: 10))
    XCTAssertEqual(menu.value as? String, "Private tab")
    XCTAssertFalse(app.buttons["pill.private"].exists)
    app.openIslandMenu()
    let close = app.buttons["Close Private Tab"]
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    // The menu opens toward the page with its first item nearest the
    // button, so Close Private Tab sits right beside the Island.
    let nearest = app.collectionViews.buttons.allElementsBoundByIndex
      .min { abs($0.frame.midY - menu.frame.midY) < abs($1.frame.midY - menu.frame.midY) }
    XCTAssertEqual(nearest?.label, close.label)
    XCTAssertFalse(app.buttons["Save to Favorites"].exists)
    close.tap()
    let regular = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", "Private tab"), object: menu)
    XCTAssertEqual(XCTWaiter.wait(for: [regular], timeout: 5), .completed)
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Save to Favorites"].waitForExistence(timeout: 5))
  }

  /// Over a light page the private Island is plainly dark, not the mid-gray
  /// that dark glass alone gives.
  func testThePrivateIslandIsDarkOverALightPage() throws {
    let menu = app.buttons["island.menu"]
    XCTAssertTrue(menu.waitForExistence(timeout: 10))
    sleep(1)
    let shot = XCUIScreen.main.screenshot().image
    // Just before the page menu, between its glyph and the leading button's:
    // the Island's own surface.
    let point = CGPoint(x: menu.frame.minX - 3, y: menu.frame.midY)
    let brightness = try XCTUnwrap(Self.brightness(of: shot, at: point))
    XCTAssertLessThan(brightness, 0.35, "the private Island reads dark")
  }

  /// The brightness (0 black, 1 white) of the pixel under `point`, in points.
  private static func brightness(of image: UIImage, at point: CGPoint) -> CGFloat? {
    guard let cg = image.cgImage else { return nil }
    let x = Int(point.x * image.scale), y = Int(point.y * image.scale)
    guard x >= 0, y >= 0, x < cg.width, y < cg.height, let pixel = cg.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)) else { return nil }
    var rgba = [UInt8](repeating: 0, count: 4)
    guard let context = CGContext(data: &rgba, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    return (0.299 * CGFloat(rgba[0]) + 0.587 * CGFloat(rgba[1]) + 0.114 * CGFloat(rgba[2])) / 255
  }
}
