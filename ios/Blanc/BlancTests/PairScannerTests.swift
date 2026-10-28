import XCTest
import AVFoundation
import CoreImage
@testable import Blanc

/// Pair with your Blanc (design 2026-10-28 §7.1–§7.3): the camera is asked
/// for before anything reads whether scanning is available, a code joins
/// once, and a link from outside Blanc asks before any network call.
@MainActor final class PairScannerTests: XCTestCase {
    private func coordinator(status: AVAuthorizationStatus, grant: Bool = true, supported: Bool = true,
                             available: @escaping () -> Bool = { true }, log: Log) -> PairScanCoordinator {
        PairScanCoordinator(camera: .init(
            authorization: { log.calls.append("authorization"); return status },
            requestAccess: { log.calls.append("requestAccess"); return grant },
            isSupported: { log.calls.append("isSupported"); return supported },
            isAvailable: { log.calls.append("isAvailable"); return available() }))
    }
    final class Log { var calls: [String] = [] }

    func testNotDeterminedRequestsAccessBeforeReadingAvailability() async {
        let log = Log()
        let route = await coordinator(status: .notDetermined, log: log).start()
        XCTAssertEqual(route, .scanner)
        let request = try? XCTUnwrap(log.calls.firstIndex(of: "requestAccess"))
        let available = try? XCTUnwrap(log.calls.firstIndex(of: "isAvailable"))
        XCTAssertNotNil(request); XCTAssertNotNil(available)
        if let request, let available { XCTAssertLessThan(request, available) }
    }

    func testRefusedAccessRoutesToDenied() async {
        let refused = await coordinator(status: .notDetermined, grant: false, log: Log()).start()
        let denied = await coordinator(status: .denied, log: Log()).start()
        let restricted = await coordinator(status: .restricted, log: Log()).start()
        XCTAssertEqual([refused, denied, restricted], [.denied, .denied, .denied])
    }

    func testUnsupportedRoutesToCodeFieldWithoutAskingForTheCamera() async {
        let log = Log()
        let route = await coordinator(status: .notDetermined, supported: false, log: log).start()
        XCTAssertEqual(route, .codeField)
        XCTAssertFalse(log.calls.contains("requestAccess"))
    }

    func testMatchingPayloadJoinsOnce() {
        let scan = coordinator(status: .authorized, log: Log())
        XCTAssertEqual(scan.recognized("https://blanc.day/pair#K7MR4PX2"), .join("K7MR4PX2"))
        XCTAssertEqual(scan.recognized("https://blanc.day/pair#K7MR4PX2"), .ignore, "a second sighting doesn't join again")
    }

    func testOtherQRIsIgnored() {
        let scan = coordinator(status: .authorized, log: Log())
        for payload in ["https://example.com/", "K7MR4PX2", "https://www.blanc.day/pair#K7MR4PX2", "blanc://pair#K7MR4PX2"] {
            XCTAssertEqual(scan.recognized(payload), .ignore, payload)
        }
        XCTAssertEqual(scan.recognized("https://blanc.day/pair#K7MR4PX2"), .join("K7MR4PX2"), "still scanning after a miss")
    }

    func testSyncingPhoneQRDecodesToThePairLink() throws {
        let image = try XCTUnwrap(PairQR.image(for: "K7MR4PX2"))
        let detector = try XCTUnwrap(CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]))
        let ciImage = try XCTUnwrap(CIImage(image: image))
        let found = detector.features(in: ciImage).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        XCTAssertEqual(found, ["https://blanc.day/pair#K7MR4PX2"])
        XCTAssertNil(PairQR.image(for: "not a code"))
    }

    func testOutsideLinkAsksBeforeAnyNetwork() async {
        var joins: [String] = []
        let model = PairLinkConfirmModel(code: "K7MR4PX2") { code in joins.append(code); return .object([("ok", .bool(true))]) }
        XCTAssertEqual(joins, [], "showing the question makes no call")
        await model.pair()
        await model.pair()
        XCTAssertEqual(joins, ["K7MR4PX2"], "Pair joins once")
        XCTAssertTrue(model.done)
    }
}
