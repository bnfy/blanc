import SwiftUI
import AVFoundation
import VisionKit
import Vision
import UIKit

/// Pair with your Blanc (design 2026-10-28 §7.1–§7.2): what the button does,
/// kept apart from the camera so it can be tested. Access is asked for before
/// `isAvailable` is read, because VisionKit reports false until it's granted.
final class PairScanCoordinator {
    enum Route: Equatable { case scanner, codeField, denied }
    enum Result: Equatable { case join(String), ignore }

    struct Camera {
        var authorization: () -> AVAuthorizationStatus
        var requestAccess: () async -> Bool
        var isSupported: () -> Bool
        var isAvailable: () -> Bool

        static let live = Camera(
            authorization: { AVCaptureDevice.authorizationStatus(for: .video) },
            requestAccess: { await AVCaptureDevice.requestAccess(for: .video) },
            isSupported: { DataScannerViewController.isSupported },
            isAvailable: { DataScannerViewController.isAvailable })
    }

    private let camera: Camera
    private var matched = false

    init(camera: Camera = .live) { self.camera = camera }

    func start() async -> Route {
        guard camera.isSupported() else { return .codeField }
        switch camera.authorization() {
        case .authorized: break
        case .notDetermined: guard await camera.requestAccess() else { return .denied }
        default: return .denied
        }
        return camera.isAvailable() ? .scanner : .denied
    }

    /// A scanned payload: the first Blanc pairing code joins; anything else is ignored.
    func recognized(_ payload: String) -> Result {
        guard !matched, let code = PairLink.code(from: payload) else { return .ignore }
        matched = true
        return .join(code)
    }
}

/// VisionKit's live QR scanner. Frames never leave the device and nothing is kept.
struct PairScannerView: UIViewControllerRepresentable {
    let onPayload: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
            recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        DispatchQueue.main.async { try? scanner.startScanning() }
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onPayload: onPayload) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onPayload: (String) -> Void
        init(onPayload: @escaping (String) -> Void) { self.onPayload = onPayload }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue { onPayload(payload) }
            }
        }
    }
}

/// The scanner sheet: the live camera, or why it's off, and always a way to type the code.
struct PairScannerSheet: View {
    let route: PairScanCoordinator.Route
    let scan: PairScanCoordinator
    let onCode: (String) -> Void
    let onTypeInstead: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var hint: String?
    @State private var connecting = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if route == .scanner {
                    PairScannerView(onPayload: handle)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .bottom) {
                            if let text = connecting ? SyncCopy.text("ios.pair.connecting") : hint {
                                Text(text).font(.callout.weight(.medium)).padding(.horizontal, 14).padding(.vertical, 8)
                                    .background(.regularMaterial, in: Capsule()).padding(.bottom, 16)
                                    .transition(.opacity).accessibilityIdentifier("pair.status")
                            }
                        }
                        .animation(.easeOut(duration: 0.2), value: hint)
                } else {
                    Spacer()
                    Image(systemName: "camera.fill").font(.system(size: 40)).foregroundStyle(.secondary).accessibilityHidden(true)
                    Text(SyncCopy.text("ios.pair.cameraOff")).font(.headline).multilineTextAlignment(.center)
                    Button(SyncCopy.text("ios.pair.openSettings")) {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }.buttonStyle(.bordered).accessibilityIdentifier("pair.openSettings")
                    Spacer()
                }
                Button(SyncCopy.text("ios.pair.typeInstead")) { dismiss(); onTypeInstead() }
                    .accessibilityIdentifier("pair.typeInstead")
            }
            .padding()
            .navigationTitle(SyncCopy.text("ios.pair.scanTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SettingsCopy.text("cancel")) { dismiss() }
                }
            }
        }
    }

    private func handle(_ payload: String) {
        switch scan.recognized(payload) {
        case .join(let code):
            // The haptic, the status and the hand-off happen together, caused by the match.
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            connecting = true
            onCode(code)
        case .ignore:
            guard !connecting, PairLink.code(from: payload) == nil else { return }
            hint = SyncCopy.text("ios.pair.notBlanc")
            Task { try? await Task.sleep(for: .seconds(2)); hint = nil }
        }
    }
}

/// The same code as the desktop's QR, for a syncing iPhone pairing another device.
enum PairQR {
    static func image(for code: String, moduleSize: CGFloat = 8) -> UIImage? {
        guard let link = PairLink.link(for: code),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(link.absoluteString.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: moduleSize, y: moduleSize))
        guard let cgImage = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        // Dark on white with a four-module quiet zone, whatever the theme.
        let quiet = moduleSize * 4
        let size = CGSize(width: scaled.extent.width + quiet * 2, height: scaled.extent.height + quiet * 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            context.cgContext.interpolationQuality = .none
            UIImage(cgImage: cgImage).draw(in: CGRect(x: quiet, y: quiet, width: scaled.extent.width, height: scaled.extent.height))
        }
    }
}

/// A pair link that reached Blanc from another app (design 2026-10-28 §7.3).
/// Reading a code uses it up, so nothing is fetched until the person says Pair.
@Observable final class PairLinkConfirmModel {
    let code: String
    private let join: (String) async -> JSONValue
    private(set) var busy = false
    private(set) var done = false
    private(set) var error: String?

    init(code: String, join: @escaping (String) async -> JSONValue) {
        self.code = code
        self.join = join
    }

    func pair() async {
        guard !busy, !done else { return }
        busy = true; error = nil
        let result = await join(code)
        busy = false
        if result["ok"]?.bool == false {
            error = result["message"]?.text ?? SyncCopy.error(result["error"]?.text ?? "server")
        } else {
            done = true
        }
    }
}

struct PairLinkRequest: Identifiable {
    let code: String
    var id: String { code }
}

struct PairLinkConfirmView: View {
    let engine: SyncEngine
    @State private var model: PairLinkConfirmModel
    @Environment(\.dismiss) private var dismiss
    private var switching: Bool { SettingsSyncStatus(engine.status).enabled }

    init(engine: SyncEngine, code: String) {
        self.engine = engine
        let enabled = SettingsSyncStatus(engine.status).enabled
        _model = State(initialValue: PairLinkConfirmModel(code: code) { code in
            enabled ? await engine.switchWithCode(code) : await engine.joinWithCode(code)
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(SyncCopy.text(switching ? "ios.settings.switchHelp" : "ios.pair.linkConfirmBody"))
                        .accessibilityIdentifier("pair.linkConfirmBody")
                    if model.done {
                        Text(SettingsCopy.text("connected")).accessibilityIdentifier("pair.linkConnected")
                    } else {
                        Button(SyncCopy.text(switching ? "ios.settings.switchAccount" : "ios.pair.pair"), role: switching ? .destructive : nil) {
                            Task { await model.pair() }
                        }.disabled(model.busy).accessibilityIdentifier("pair.linkPair")
                    }
                    if model.busy { ProgressView() }
                    if let error = model.error { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(SyncCopy.text("ios.pair.linkConfirmTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(SettingsCopy.text(model.done ? "done" : "cancel")) { dismiss() }
                }
            }
        }
    }
}
