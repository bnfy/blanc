import XCTest
import BackgroundTasks
import UIKit
@testable import Blanc

/// M18 §6: when Blanc asks iOS for a Background App Refresh.
@MainActor final class BackgroundRefreshTests: XCTestCase {
    func testRequestIsFifteenMinutesOut() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let request = BackgroundRefresh.request(now: now)
        XCTAssertEqual(request.identifier, "me.bnfy.blanc.sync")
        XCTAssertEqual(request.earliestBeginDate, now.addingTimeInterval(15 * 60))
    }

    func testNoScheduleWithoutAccount() {
        XCTAssertFalse(BackgroundRefresh.shouldSchedule(hasAccount: false, status: .available))
        XCTAssertTrue(BackgroundRefresh.shouldSchedule(hasAccount: true, status: .available))
    }

    func testNoScheduleWhenRefreshIsOff() {
        XCTAssertFalse(BackgroundRefresh.shouldSchedule(hasAccount: true, status: .denied))
        XCTAssertFalse(BackgroundRefresh.shouldSchedule(hasAccount: true, status: .restricted))
    }

    func testIdentifierIsPermitted() {
        let permitted = Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String]
        XCTAssertEqual(permitted, [BackgroundRefresh.identifier])
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]
        XCTAssertEqual(modes, ["fetch"])
    }

    func testBackgroundEngineNeedsAnAccount() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        XCTAssertNil(BackgroundRefresh.backgroundEngine(directory: directory, secrets: InMemorySyncSecretStore()))
        try SyncStateStore(directory: directory).update { $0.enabled = true; $0.accountId = String(repeating: "a", count: 64) }
        XCTAssertNotNil(BackgroundRefresh.backgroundEngine(directory: directory, secrets: InMemorySyncSecretStore()))
    }
}
