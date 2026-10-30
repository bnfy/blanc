import XCTest
@testable import Blanc

/// M18 §7.1: one launch ping per app session, only with a saved yes.
@MainActor final class LaunchPingTests: XCTestCase {
    private func directory() -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    func testBodyIsDesktopsShape() {
        let id = UUID(uuidString: "01234567-89AB-4CDE-8F01-23456789ABCD")!
        let body = LaunchPing.body(installId: id, sessionId: 42, version: "1.0.0", osMajor: 26)
        XCTAssertEqual(Set(body.keys), ["installId", "sessionId", "version", "platform", "arch", "osVersion"])
        XCTAssertEqual(body["installId"] as? String, "01234567-89ab-4cde-8f01-23456789abcd", "lowercased, as the Worker's UUID check reads it")
        XCTAssertEqual(body["sessionId"] as? Int32, 42)
        XCTAssertEqual(body["platform"] as? String, "ios")
        XCTAssertEqual(body["arch"] as? String, "arm64")
        XCTAssertEqual(body["osVersion"] as? String, "26", "the iOS major only")
    }

    func testSendsOnlyWithASavedYes() {
        XCTAssertFalse(LaunchPing.shouldSend(saved: nil, alreadySent: false, launchedInBackground: false), "an unsaved choice is no ping")
        XCTAssertFalse(LaunchPing.shouldSend(saved: false, alreadySent: false, launchedInBackground: false))
        XCTAssertTrue(LaunchPing.shouldSend(saved: true, alreadySent: false, launchedInBackground: false))
    }

    /// Review Focus 4: back and forth from the background is still one launch,
    /// and a launch iOS made only for Background App Refresh isn't one.
    func testOncePerLaunchAndNeverForABackgroundLaunch() {
        XCTAssertFalse(LaunchPing.shouldSend(saved: true, alreadySent: true, launchedInBackground: false))
        XCTAssertFalse(LaunchPing.shouldSend(saved: true, alreadySent: false, launchedInBackground: true))
    }

    func testInstallIdIsStableUntilTheFileGoes() throws {
        let dir = directory()
        let first = LaunchPing.installId(in: dir)
        XCTAssertEqual(LaunchPing.installId(in: dir), first)
        try FileManager.default.removeItem(at: dir.appendingPathComponent(LaunchPing.installFileName))
        XCTAssertNotEqual(LaunchPing.installId(in: dir), first, "a reinstall is a new install")
    }

    func testSessionIdIsAPositive31BitNumber() {
        for _ in 0..<200 {
            let id = LaunchPing.makeSessionId()
            XCTAssertGreaterThan(id, 0)
            XCTAssertLessThanOrEqual(Int64(id), 0x7fffffff)
        }
    }

    func testSenderPostsOnceAndNotWhenOff() async {
        var posts: [[String: Any]] = []
        let sender = LaunchPingSender(directory: directory(), allowed: true, post: { body in posts.append(body) })
        await sender.sendIfAllowed(saved: true)
        await sender.sendIfAllowed(saved: true)
        XCTAssertEqual(posts.count, 1)
        let off = LaunchPingSender(directory: directory(), allowed: true, post: { body in posts.append(body) })
        await off.sendIfAllowed(saved: false)
        XCTAssertEqual(posts.count, 1)
    }

    func testDevelopmentBuildsNeverSend() async {
        var posts = 0
        let sender = LaunchPingSender(directory: directory(), allowed: false, post: { _ in posts += 1 })
        await sender.sendIfAllowed(saved: true)
        XCTAssertEqual(posts, 0)
        #if DEBUG
        XCTAssertFalse(LaunchPing.buildSends, "a Debug build never pings")
        #endif
    }
}
