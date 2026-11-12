import XCTest
@testable import Blanc

/// Downloads (F11) and links to other apps: which responses are saved rather
/// than shown, what a file is called, and which links are another app's.
@MainActor final class PageDownloadsTests: XCTestCase {
    func testAPageWebKitCantShowIsSaved() {
        XCTAssertTrue(PageDownloads.isDownload(showable: false, mainFrame: true, disposition: nil))
        XCTAssertFalse(PageDownloads.isDownload(showable: true, mainFrame: true, disposition: nil))
    }

    func testAnAttachmentIsSavedEvenWhenItCouldBeShown() {
        XCTAssertTrue(PageDownloads.isDownload(showable: true, mainFrame: true, disposition: "attachment; filename=\"report.pdf\""))
        XCTAssertTrue(PageDownloads.isDownload(showable: true, mainFrame: true, disposition: " Attachment"))
        XCTAssertFalse(PageDownloads.isDownload(showable: true, mainFrame: true, disposition: "inline"))
    }

    func testAFrameInsideAPageNeverStartsADownload() {
        XCTAssertFalse(PageDownloads.isDownload(showable: false, mainFrame: false, disposition: "attachment"))
    }

    func testAFileNameIsOneSafePathComponent() {
        XCTAssertEqual(PageDownloads.fileName("report.pdf"), "report.pdf")
        XCTAssertEqual(PageDownloads.fileName("../../etc/passwd"), "_.._etc_passwd")
        XCTAssertEqual(PageDownloads.fileName("a/b\\c:d"), "a_b_c_d")
        XCTAssertEqual(PageDownloads.fileName(" .. "), "download")
        XCTAssertEqual(PageDownloads.fileName(""), "download")
        XCTAssertEqual(PageDownloads.fileName(String(repeating: "n", count: 300)).count, 200)
    }

    func testOnlyAnotherAppsLinksAreAppLinks() {
        for link in ["itms-apps://apps.apple.com/app/id6828027794", "maps://?q=Paris", "spotify:track:1", "zoommtg://zoom.us/join"] {
            XCTAssertTrue(AppLinks.isAppLink(URL(string: link)!), link)
        }
        for link in ["https://blanc.day/", "http://example.com/", "blanc://newtab/", "about:blank", "blob:https://a.example/1",
                     "data:text/plain,hi", "javascript:void(0)", "mailto:a@example.com", "tel:5551234"] {
            XCTAssertFalse(AppLinks.isAppLink(URL(string: link)!), link)
        }
    }
}
