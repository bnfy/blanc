import XCTest

struct WaitTimedOut: Error {}

extension XCTestCase {
    /// Polls until `condition` holds. The deadline is generous because a hosted runner
    /// can take several seconds just to start WebKit's page process. A timeout stops
    /// the test there, so a later step never runs against a page that never loaded.
    @MainActor func waitUntil(timeout: Duration = .seconds(30), file: StaticString = #filePath, line: UInt = #line,
                              _ condition: () -> Bool) async throws {
        let clock = ContinuousClock(), deadline = clock.now + timeout
        while !condition() {
            guard clock.now < deadline else {
                XCTFail("timed out after \(timeout)", file: file, line: line)
                throw WaitTimedOut()
            }
            try await Task.sleep(for: .milliseconds(50))
        }
    }
}
