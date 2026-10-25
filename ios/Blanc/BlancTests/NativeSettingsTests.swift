import XCTest
import CryptoKit
import WebKit
@testable import Blanc

@MainActor final class NativeSettingsTests: XCTestCase {
    private func manager() -> TabsManager {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return TabsManager(settingsDirectory: dir, sessionDirectory: dir)
    }

    func testInternalSettingsRoutes() {
        XCTAssertEqual(SettingsDestination.resolve(URL(string: "blanc://settings/#group-sync")!), .sync)
        XCTAssertEqual(SettingsDestination.resolve(URL(string: "blanc://settings/#privacy")!), .privacy)
        XCTAssertEqual(SettingsDestination.resolve(URL(string: "blanc://settings/")!), .root)
        XCTAssertNil(SettingsDestination.resolve(URL(string: "https://settings/")!))
        XCTAssertNil(SettingsDestination.resolve(URL(string: "blanc://history/")!))
    }

    func testPaletteWaitsForDismissalAndPreservesTabs() {
        let manager = manager(), id = manager.activeTabId, count = manager.tabs.count
        manager.isPalettePresented = true
        SlashCommand.available.first { $0.command == "/sync" }!.execute(manager)
        XCTAssertFalse(manager.isPalettePresented)
        XCTAssertNil(manager.settingsDestination)
        XCTAssertEqual(manager.pendingSettingsDestination, .sync)
        manager.presentPendingSettings()
        XCTAssertEqual(manager.settingsDestination, .sync)
        XCTAssertNil(manager.pendingSettingsDestination)
        XCTAssertEqual(manager.activeTabId, id)
        XCTAssertEqual(manager.tabs.count, count)
    }

    func testRestoredWebSettingsTabRemainsCompatible() {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let session = SessionStore(directory: directory)
        session.save(urls: ["blanc://settings/", "blanc://history/"], activeIndex: 0)
        session.flush()
        let restored = TabsManager(settingsDirectory: directory, sessionDirectory: directory)
        XCTAssertEqual(restored.tabs.map(\.currentURL.absoluteString), ["blanc://settings/", "blanc://history/"])
        XCTAssertNil(restored.settingsDestination)
    }

    func testTypedAndCreatedSettingsDoNotReplacePage() {
        let manager = manager(), id = manager.activeTabId, url = manager.activeTab!.currentURL
        manager.activeTab!.addressText = "blanc://settings/"
        manager.submitActiveTabAddress()
        XCTAssertEqual(manager.activeTab!.currentURL, url)
        XCTAssertEqual(manager.activeTab!.addressText, url.absoluteString)
        XCTAssertEqual(manager.createTab(url: URL(string: "blanc://settings/#sync")!), id)
        XCTAssertEqual(manager.tabs.count, 1)
        XCTAssertEqual(manager.settingsDestination, .sync)
    }

    func testSettingsUpdatesAndAppearanceRoundTrip() throws {
        let manager = manager()
        manager.applySettingsPatch(["searchEngine": "kagi", "theme": "dark"])
        XCTAssertEqual(manager.normalizer.searchURL(for: "test").host, "kagi.com")
        XCTAssertEqual(manager.settingsStore.theme, .dark)
        manager.setStartLayout(.shelf)
        XCTAssertEqual(manager.settingsStore.newtabLayout, .shelf)
        let payload = try manager.changeStartAppearance("setClock", value: ["font": "flex", "height": 280])
        let values = try XCTUnwrap(payload["settings"] as? [String: Any])
        XCTAssertEqual(values["newtabClockHeight"] as? Int, 280)
        XCTAssertEqual(manager.startAppearance.values["newtabClockFont"] as? String, "flex")
        manager.setAdblockExceptions(["https://WWW.Example.com/path", "example.com"])
        XCTAssertEqual(manager.settingsStore.adblockExceptions, ["example.com"])
        manager.settingsStore.flush()
    }

    func testPreviewIsOutsideSessionAndIsReleased() {
        let manager = manager(), count = manager.tabs.count, id = manager.activeTabId
        var preview: TabModel? = manager.makeStartPreview()
        weak var weakPreview = preview
        XCTAssertEqual(manager.startPreviews.count, 1)
        XCTAssertEqual(manager.tabs.count, count)
        XCTAssertEqual(manager.activeTabId, id)
        preview = nil
        XCTAssertNil(weakPreview)
        XCTAssertTrue(manager.startPreviews.isEmpty)
    }

    func testNativeChangesReachTheRealStartPagePreview() async throws {
        let manager = manager(), preview = manager.makeStartPreview(layout: .billboard)
        let webView = preview.webView
        defer { withExtendedLifetime(preview) {} }
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        let controller = UIViewController()
        controller.view = webView
        window.rootViewController = controller
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 600)
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var ready = false
        for _ in 0..<100 {
            if (try? await webView.evaluateJavaScript("document.body?.classList.contains('layout-ready')")) as? Bool == true { ready = true; break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(ready)
        guard ready else { return }
        let customizeDisplay = try await webView.evaluateJavaScript("getComputedStyle(document.getElementById('customizeButton')).display") as? String
        XCTAssertEqual(customizeDisplay, "none", "Read-only previews must not show the page’s customization controls")
        _ = try await webView.evaluateJavaScript("window.bowserPages.start.onStatus(value => window.__nativeSettingsChange = value); true")
        manager.setStartLayout(.ledger)
        try await Task.sleep(for: .milliseconds(200))
        let layout = try await webView.evaluateJavaScript("document.body.dataset.layout") as? String
        XCTAssertEqual(layout, "billboard", "Clock previews remain on Billboard without changing the saved layout")
        XCTAssertEqual(manager.settingsStore.newtabLayout, .ledger)
        try manager.changeStartAppearance("setClock", value: ["font": "flex", "height": 280])
        try await Task.sleep(for: .milliseconds(200))
        let height = try await webView.evaluateJavaScript("window.__nativeSettingsChange.appearance.settings.newtabClockHeight") as? Int
        XCTAssertEqual(height, 280)
    }

    func testSyncStatusMapping() {
        let status = SettingsSyncStatus(.object([
            ("enabled", .bool(true)), ("handle", .string("Test")), ("syncTabs", .bool(true)),
            ("lastSyncedAt", .number(1000)), ("lastError", .string("Offline")), ("deviceName", .string("Phone"))
        ]))
        XCTAssertTrue(status.enabled)
        XCTAssertTrue(status.sharesTabs)
        XCTAssertEqual(status.handle, "Test")
        XCTAssertEqual(status.lastSynced, Date(timeIntervalSince1970: 1))
        XCTAssertEqual(status.error, "Offline")
        XCTAssertEqual(status.deviceName, "Phone")
    }

    func testSyncSuccessClearsSecretsAndFailureKeepsRetryInput() async {
        let model = SyncSettingsModel()
        model.code = "K7MR-4PX2"
        XCTAssertTrue(model.canJoin)
        await model.run { .object([("ok", .bool(false)), ("message", .string("Offline"))]) }
        XCTAssertEqual(model.error, "Offline")
        XCTAssertFalse(model.busy)
        XCTAssertEqual(model.code, "K7MR-4PX2")
        await model.run { .object([("ok", .bool(true))]) }
        XCTAssertNil(model.error)
        XCTAssertEqual(model.code, "")
        XCTAssertNotNil(model.notice)
    }

    func testSyncRejectsConcurrentActionAndDismissalDropsLateReply() async {
        let model = SyncSettingsModel()
        var continuation: CheckedContinuation<JSONValue, Never>?
        let task = Task { await model.run { await withCheckedContinuation { continuation = $0 } } }
        while continuation == nil { await Task.yield() }
        var duplicateRan = false
        await model.run { duplicateRan = true; return .null }
        XCTAssertFalse(duplicateRan)
        model.code = "secret"
        model.dismiss()
        continuation?.resume(returning: .object([("ok", .bool(false)), ("message", .string("Late"))]))
        await task.value
        XCTAssertEqual(model.code, "")
        XCTAssertNil(model.error)
        XCTAssertFalse(model.busy)
    }

    func testSettingsUITestServiceMatchesDesktopPairingVector() async throws {
        let vector = try XCTUnwrap(try SyncVectors.section("pairing").first)
        let expected = try XCTUnwrap(vector["expected"])
        XCTAssertEqual(SettingsUITestFixture.pairId, expected["pairId"]?.text)
        let wrapHex = SettingsUITestFixture.wrapKey.withUnsafeBytes { bytes in
            bytes.map { String(format: "%02x", $0) }.joined()
        }
        XCTAssertEqual(wrapHex, expected["wrapKey"]?.text)
        let transport = SettingsUITestTransport()
        let client = SyncWorkerClient(transport: transport)
        let envelope = try await client.takePair(SettingsUITestFixture.pairId)
        let payload = try SyncPairing.unwrap(envelope, wrapKey: SettingsUITestFixture.wrapKey)
        XCTAssertEqual(payload, SettingsUITestFixture.payload)
        let expectedPayload = try JSONDecoder().decode(PairPayload.self,
            from: Data(try XCTUnwrap(vector["input"]?["payload"]).serialized.utf8))
        XCTAssertEqual(payload, expectedPayload)
        let account = try XCTUnwrap(try SyncVectors.section("deriveKeys").first?["expected"])
        XCTAssertEqual(payload.accountId, account["accountId"]?.text)
        let contentHex = SettingsUITestFixture.keys.contentKey.withUnsafeBytes { bytes in
            bytes.map { String(format: "%02x", $0) }.joined()
        }
        XCTAssertEqual(contentHex, account["contentKey"]?.text)
        let response = try await client.get(payload.accountId, .settings)
        let settings = try XCTUnwrap(response)
        XCTAssertEqual(try JSONValue(data: SyncCrypto.open(settings.blob, key: SettingsUITestFixture.keys.contentKey))["values"], .object([]))
        let unknown = try await transport.send(method: "GET", path: "v1/pair/" + String(repeating: "0", count: 64), body: nil)
        XCTAssertEqual(unknown.status, 404)
    }

    func testAllowedSiteInputValidation() {
        XCTAssertEqual(SettingsSiteInput.normalize(" https://www.example.com:443/path "), "example.com")
        XCTAssertEqual(SettingsSiteInput.normalize("localhost:8080"), "localhost")
        XCTAssertNil(SettingsSiteInput.normalize("ftp://example.com"))
        XCTAssertNil(SettingsSiteInput.normalize("bad host"))
        XCTAssertNil(SettingsSiteInput.normalize(""))
    }

    func testAllNativeLabelsHaveTranslations() {
        XCTAssertFalse(SettingsCopy.text("title").hasPrefix("ios.settings."))
        XCTAssertFalse(SettingsCopy.searchEngines.contains(.custom))
    }
}
