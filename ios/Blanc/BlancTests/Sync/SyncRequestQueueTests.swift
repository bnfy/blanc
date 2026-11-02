import XCTest
@testable import Blanc

/// The change check in the request queue (design 2026-11-02): it goes ahead
/// of the class rotation, is charged like any GET, and is skipped, never
/// queued, when the window is full.
@MainActor final class SyncRequestQueueTests: XCTestCase {
    private let start: Int64 = 1_800_000_000_000
    /// A window holding `recent` requests; waiting for it to free never ends on its own.
    private func make(_ clock: TestClock, recent: Int) -> SyncRequestQueue {
        let scheduler = SyncScheduler(
            log: Array(repeating: start, count: recent), now: { clock.now() }, monotonic: { clock.now() })
        return SyncRequestQueue(
            scheduler: scheduler, now: { clock.now() }, sleep: { _ in try? await Task.sleep(for: .seconds(3600)) },
            persist: { _ in })
    }

    func testACheckOnAFullWindowIsSkippedNotQueued() async {
        let clock = TestClock(start)
        let queue = make(clock, recent: 10)
        var ran = false
        let error = await queue.check(cancelled: { nil }) { ran = true }
        XCTAssertEqual(error as? SyncError, .cancelled)
        XCTAssertFalse(ran, "a full window never sends the check")
        XCTAssertEqual(clock.now(), start, "and nothing waited for the window")
        await queue.settled()
    }
    func testACheckRunsAheadOfRoutineWorkWaitingForItsShare() async {
        let clock = TestClock(start)
        let queue = make(clock, recent: 6)
        queue.checkShare = 4
        var order: [String] = []
        var stop = false
        let routine = Task {
            await queue.enqueue(cls: "F", item: "settings", key: "a", cancelled: { stop ? SyncError.cancelled : nil }) { _ in
                order.append("routine"); return .done
            }
        }
        for _ in 0..<20 { await Task.yield() }
        let error = await queue.check(cancelled: { nil }) { order.append("check") }
        XCTAssertNil(error)
        XCTAssertEqual(order, ["check"], "routine work leaves the check its requests")
        stop = true
        queue.flushCancelled()
        _ = await routine.value
    }
    func testWithoutAShareRoutineWorkUsesTheWholeWindow() async {
        let clock = TestClock(start)
        let queue = make(clock, recent: 9)
        let error = await queue.enqueue(cls: "F", item: "settings", key: "a", cancelled: { nil }) { _ in .done }
        XCTAssertNil(error)
        XCTAssertEqual(clock.now(), start, "the tenth request went at once")
    }
}
