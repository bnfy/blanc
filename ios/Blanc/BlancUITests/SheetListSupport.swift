import XCTest

extension XCUIApplication {
  /// Finds `element` in an open sheet's list, scrolling the list itself: a
  /// SwiftUI list builds rows only as they scroll in, and on the unfolded
  /// iPhone Duo a sheet is a centered card shorter than an iPhone's screen, so
  /// a row an iPhone shows may not exist yet. Up first (rows below), then down
  /// (rows the list has scrolled past). True once it can be tapped.
  @discardableResult
  func reveal(_ element: XCUIElement, timeout: TimeInterval = 5) -> Bool {
    func shown() -> Bool { element.exists && element.isHittable }
    if element.waitForExistence(timeout: timeout), element.isHittable { return true }
    let list = collectionViews.firstMatch
    guard list.exists else { return element.exists }
    for _ in 0..<4 where !shown() { list.swipeUp() }
    for _ in 0..<8 where !shown() { list.swipeDown() }
    return shown()
  }
}
