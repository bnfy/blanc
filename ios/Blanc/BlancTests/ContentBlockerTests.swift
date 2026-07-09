import XCTest
import WebKit
@testable import Blanc

final class ContentBlockerTests: XCTestCase {

    // MARK: - Fakes

    final class FakeRuleListStore: RuleListStoring {
        var lookupResult: Bool = false
        var compileResult: Bool = true
        private var lookupCallback: ((Bool) -> Void)?
        private var compileCallback: ((Bool) -> Void)?

        func lookupRuleList(
            forIdentifier identifier: String,
            found: @escaping (Bool) -> Void
        ) {
            if lookupResult {
                found(true)
            } else {
                lookupCallback = found
            }
        }

        func compileRuleList(
            forIdentifier identifier: String,
            encodedContentRuleList: String,
            completed: @escaping (Bool) -> Void
        ) {
            if compileResult {
                completed(true)
            } else {
                compileCallback = completed
            }
        }

        func flushCompile() {
            compileCallback?(true)
            compileCallback = nil
        }

        func flushLookup(found: Bool) {
            lookupCallback?(found)
            lookupCallback = nil
        }
    }

    final class FakeAttachTarget: RuleListAttaching {
        var attachCount = 0
        func attachContentBlockingRules(from blocker: ContentBlocker) {
            attachCount += 1
        }
    }

    // MARK: - Unit Tests

    func testCacheHitSetsReady() {
        let store = FakeRuleListStore()
        store.lookupResult = true
        let blocker = ContentBlocker(store: store)
        blocker.prepare(version: "abc", jsonProvider: { "[]" })

        XCTAssertTrue(blocker.isReady)
    }

    func testCacheMissSetsReadyAfterCompile() {
        let store = FakeRuleListStore()
        store.lookupResult = false
        store.compileResult = false
        let blocker = ContentBlocker(store: store)
        blocker.prepare(version: "abc", jsonProvider: { "[]" })

        XCTAssertFalse(blocker.isReady)

        store.flushLookup(found: false)
        XCTAssertFalse(blocker.isReady)

        store.flushCompile()
        XCTAssertTrue(blocker.isReady)
    }

    func testAttachImmediatelyWhenReady() {
        let store = FakeRuleListStore()
        store.lookupResult = true
        let blocker = ContentBlocker(store: store)
        blocker.prepare(version: "abc", jsonProvider: { "[]" })

        let target = FakeAttachTarget()
        blocker.attach(to: target)

        XCTAssertEqual(target.attachCount, 1)
    }

    func testAttachEnqueuesAndDrainsAfterCompile() {
        let store = FakeRuleListStore()
        store.lookupResult = false
        store.compileResult = false
        let blocker = ContentBlocker(store: store)
        blocker.prepare(version: "abc", jsonProvider: { "[]" })

        let target1 = FakeAttachTarget()
        let target2 = FakeAttachTarget()
        blocker.attach(to: target1)
        blocker.attach(to: target2)

        XCTAssertEqual(target1.attachCount, 0)
        XCTAssertEqual(target2.attachCount, 0)

        store.flushLookup(found: false)
        store.flushCompile()

        XCTAssertEqual(target1.attachCount, 1)
        XCTAssertEqual(target2.attachCount, 1)
    }

    func testAttachAfterReadyDoesNotEnqueue() {
        let store = FakeRuleListStore()
        store.lookupResult = true
        let blocker = ContentBlocker(store: store)
        blocker.prepare(version: "abc", jsonProvider: { "[]" })

        let target = FakeAttachTarget()
        blocker.attach(to: target)
        blocker.attach(to: target)

        XCTAssertEqual(target.attachCount, 2)
    }

    func testCacheHitDoesNotLoadJSON() {
        let store = FakeRuleListStore()
        store.lookupResult = true
        let blocker = ContentBlocker(store: store)

        var providerCalls = 0
        blocker.prepare(version: "abc", jsonProvider: {
            providerCalls += 1
            return "[]"
        })

        // On a warm cache the multi-MB rule JSON must never be read.
        XCTAssertEqual(providerCalls, 0)
        XCTAssertTrue(blocker.isReady)
    }

    func testCacheMissLoadsJSONOnce() {
        let store = FakeRuleListStore()
        store.lookupResult = false
        store.compileResult = true
        let blocker = ContentBlocker(store: store)

        var providerCalls = 0
        blocker.prepare(version: "abc", jsonProvider: {
            providerCalls += 1
            return "[]"
        })

        // The fake defers the lookup result until flushed (mirrors the async store).
        XCTAssertEqual(providerCalls, 0)

        store.flushLookup(found: false)

        // Miss → provider read exactly once, then compiled.
        XCTAssertEqual(providerCalls, 1)
        XCTAssertTrue(blocker.isReady)
    }

    // MARK: - Integration Test

    func testBundledBlocklistCompilesInWebKit() {
        guard let loaded = ContentBlocker.loadBundledBlocklist() else {
            XCTFail("loadBundledBlocklist returned nil")
            return
        }

        guard let json = loaded.loadJSON() else {
            XCTFail("loadJSON returned nil")
            return
        }

        guard let store = WKContentRuleListStore.default() else {
            XCTFail("WKContentRuleListStore.default() returned nil")
            return
        }

        let exp = expectation(description: "compile bundled blocklist")
        store.compileContentRuleList(
            forIdentifier: "integration-\(loaded.version)",
            encodedContentRuleList: json
        ) { ruleList, error in
            if ruleList == nil {
                XCTFail("Compile failed: \(error?.localizedDescription ?? "unknown")")
            }
            exp.fulfill()
        }

        waitForExpectations(timeout: 120)
    }
}
