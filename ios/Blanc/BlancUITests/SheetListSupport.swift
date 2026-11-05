import XCTest

extension XCUIApplication {
  /// A drag from the Island into the page. `swipeUp` stays inside an element
  /// this short, which is less than the gesture needs.
  func openTabGrid() {
    let start = buttons["pill.palette"].firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -180)))
  }

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
