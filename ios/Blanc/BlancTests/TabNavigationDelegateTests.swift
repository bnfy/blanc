import XCTest
@testable import Blanc

final class TabNavigationDelegateTests: XCTestCase {
    func testApplyURLFiresCallbackOnChange() {
        let delegate = TabNavigationDelegate()
        let tab = TabModel(url: URL(string: "https://old.test/")!)
        var fired: [URL] = []
        delegate.onURLChange = { fired.append($0) }

        delegate.applyURL(URL(string: "https://new.test/")!, to: tab)

        XCTAssertEqual(tab.currentURL.absoluteString, "https://new.test/")
        XCTAssertEqual(tab.addressText, "https://new.test/")
        XCTAssertEqual(fired, [URL(string: "https://new.test/")!])
    }

    func testApplyURLSuppressesCallbackOnSameURL() {
        let delegate = TabNavigationDelegate()
        let tab = TabModel(url: URL(string: "https://same.test/")!)
        var fired: [URL] = []
        delegate.onURLChange = { fired.append($0) }

        delegate.applyURL(URL(string: "https://same.test/")!, to: tab)

        XCTAssertTrue(fired.isEmpty, "a same-URL reload must not fire onURLChange")
    }
}
