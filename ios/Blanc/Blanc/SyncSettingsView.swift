import SwiftUI
import Observation
import UIKit

struct SettingsSyncStatus: Equatable {
    let enabled: Bool
    let handle: String
    let deviceName: String
    let sharesTabs: Bool
    let lastSynced: Date?
    let error: String?
    init(_ value: JSONValue) {
        enabled = value["enabled"]?.bool ?? false
        handle = value["handle"]?.text ?? ""
        deviceName = value["deviceName"]?.text ?? ""
        sharesTabs = value["syncTabs"]?.bool ?? false
        lastSynced = value["lastSyncedAt"]?.number.map { Date(timeIntervalSince1970: $0 / 1000) }
        error = value["lastError"]?.text
    }
}

/// Presentation-only state. The injected operation is also used by tests;
/// account, encryption, and persistence remain owned by SyncEngine.
@MainActor @Observable final class SyncSettingsModel {
    var code = ""
    var handle = ""
    var passphrase = ""
    var deviceName = ""
    private(set) var busy = false
    private(set) var error: String?
    private(set) var notice: String?
    private var generation = 0

    var canJoin: Bool { SyncPairing.isRecoveryCode(code.trimmingCharacters(in: .whitespacesAndNewlines)) || SyncPairing.normalize(code) != nil }
    var canSignIn: Bool { SyncCrypto.validHandle(handle) && SyncCrypto.passphraseStrong(passphrase) }

    /// `successMessage` is read after the operation, so it can describe its result.
    func run(successMessage: @autoclosure () -> String? = nil, _ operation: () async -> JSONValue) async {
        guard !busy else { return }
        let token = generation
        busy = true; error = nil; notice = nil
        let result = await operation()
        guard token == generation else { return }
        busy = false
        if result["ok"]?.bool == false {
            error = result["message"]?.text ?? SyncCopy.error(result["error"]?.text ?? "server")
        } else {
            notice = successMessage() ?? SettingsCopy.text("saved")
            clearSecrets()
        }
    }
    func clearSecrets() { code = ""; handle = ""; passphrase = "" }
    func dismiss() {
        generation += 1
        busy = false
        error = nil; notice = nil
        clearSecrets()
    }
}

struct SyncSettingsView: View {
    let engine: SyncEngine
    @State private var model = SyncSettingsModel()
    @State private var confirm: Confirmation?
    @State private var switching = false
    @State private var showPairing = false
    // Pair with your Blanc (design 2026-10-28 §7.1): the camera first, every
    // other way one level deeper.
    @State private var showOtherWays = false
    @State private var typeCodeHint = false
    @State private var scanSheet: ScanSheet?
    private struct ScanSheet: Identifiable {
        let route: PairScanCoordinator.Route
        let scan: PairScanCoordinator
        var id: String { "\(route)" }
    }
    private enum Confirmation: String, Identifiable { case disconnect, switchAccount, recovery; var id: String { rawValue } }
    private var status: SettingsSyncStatus { SettingsSyncStatus(engine.status) }

    var body: some View {
        @Bindable var form = model
        Form {
            Section {
                LabeledContent(SettingsCopy.text("status"), value: SettingsCopy.text(status.enabled ? "connected" : "notConnected"))
                if status.enabled {
                    LabeledContent(SettingsCopy.text("account"), value: status.handle)
                    if let date = status.lastSynced {
                        LabeledContent(SettingsCopy.text("lastSynced")) { Text(date, format: .dateTime.month().day().hour().minute()) }
                    }
                    if let error = status.error { Text(error).foregroundStyle(.red) }
                }
            } footer: { Text(SettingsCopy.text("syncHelp")) }

            if !status.enabled && !switching {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(SettingsCopy.text("syncOffTitle")).font(.headline)
                        Text(SettingsCopy.text("syncOffBody")).foregroundStyle(.secondary)
                    }
                    Button(action: startPairing) {
                        Label(SettingsCopy.text("pairWithBlanc"), systemImage: "qrcode.viewfinder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("settings.pairWithBlanc")
                    Button(SettingsCopy.text("otherWays")) {
                        withAnimation { showOtherWays.toggle() }
                    }.accessibilityIdentifier("settings.otherWays")
                }
            }
            if (!status.enabled && showOtherWays) || switching {
                Section {
                    TextField(SettingsCopy.text("pairingCode"), text: $form.code, axis: .vertical)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .privacySensitive().accessibilityIdentifier("settings.syncCode")
                    Button(SettingsCopy.text(switching ? "switchAccount" : "connect")) {
                        if switching { confirm = .switchAccount } else { join() }
                    }.disabled(!model.canJoin).accessibilityIdentifier("settings.connect")
                    if typeCodeHint && !switching {
                        Text(SettingsCopy.text("typeCodeShown")).foregroundStyle(.secondary)
                    }
                } header: { Text(SettingsCopy.text(switching ? "switchAccount" : "enterCode")) }
                  footer: { Text(SettingsCopy.text("pairingHelp")) }
                if !switching {
                    Section {
                        TextField(SettingsCopy.text("handle"), text: $form.handle)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityIdentifier("settings.syncHandle")
                        SecureField(SettingsCopy.text("passphrase"), text: $form.passphrase)
                            .textContentType(.password).accessibilityIdentifier("settings.syncPassphrase")
                        if !model.handle.isEmpty && !SyncCrypto.validHandle(model.handle) {
                            Text(SyncCopy.text("sync.error.nameTooShort")).foregroundStyle(.secondary)
                        }
                        if !model.passphrase.isEmpty && !SyncCrypto.passphraseStrong(model.passphrase) {
                            Text(SyncCopy.text("sync.error.weakPassphrase")).foregroundStyle(.secondary)
                        }
                        Button(SettingsCopy.text("signIn")) { signIn() }.disabled(!model.canSignIn)
                    } header: { Text(SettingsCopy.text("usePassphrase")) }
                      footer: { Text(SettingsCopy.text("desktopAccount")) }
                } else {
                    Button(SettingsCopy.text("cancel")) { switching = false; model.clearSecrets() }
                }
            } else {
                Section {
                    TextField(SettingsCopy.text("deviceName"), text: $form.deviceName)
                        .onSubmit(saveName).accessibilityIdentifier("settings.deviceName")
                    Button(SettingsCopy.text("saveName"), action: saveName)
                    Toggle(SettingsCopy.text("shareTabs"), isOn: Binding(get: { status.sharesTabs }, set: { value in
                        Task { await model.run { await engine.setShareTabs(value); return engineReply() } }
                    })).accessibilityIdentifier("settings.shareTabs")
                    Button(SettingsCopy.text("syncNow")) {
                        Task { await model.run {
                            await engine.syncNow()
                            return engineReply()
                        } }
                    }.accessibilityIdentifier("settings.syncNow")
                } footer: { Text(SettingsCopy.text("shareTabsHelp")) }
                Section {
                    Button(SettingsCopy.text("pairDevice")) { showPairing = true }
                    Button(SettingsCopy.text("copyRecovery")) { confirm = .recovery }
                    Button(SettingsCopy.text("switchAccount")) { switching = true }
                    Button(SettingsCopy.text("disconnect"), role: .destructive) { confirm = .disconnect }
                        .accessibilityIdentifier("settings.disconnect")
                }
            }
            if model.busy { ProgressView().accessibilityLabel(SettingsCopy.text("working")) }
            if let error = model.error { Text(error).foregroundStyle(.red).accessibilityIdentifier("settings.syncError") }
            if let notice = model.notice { Text(notice).foregroundStyle(.secondary).accessibilityIdentifier("settings.syncNotice") }
        }
        .disabled(model.busy)
        .settingsFormStyle().settingsTitle(SettingsCopy.text("sync"))
        .onAppear { model.deviceName = status.deviceName }
        .onChange(of: status.deviceName) { _, name in model.deviceName = name }
        .onChange(of: status.enabled) { _, enabled in if enabled { switching = false } }
        .onDisappear { model.dismiss() }
        .navigationDestination(isPresented: $showPairing) { PairDeviceSettingsView(engine: engine) }
        .sheet(item: $scanSheet) { sheet in
            PairScannerSheet(route: sheet.route, scan: sheet.scan, onCode: { code in
                scanSheet = nil
                model.code = code
                join()
            }, onTypeInstead: { showCodeField() })
        }
        .alert(item: $confirm) { confirmation in
            switch confirmation {
            case .disconnect:
                return Alert(title: Text(SettingsCopy.text("disconnect")), message: Text(SettingsCopy.text("disconnectHelp")), primaryButton: .destructive(Text(SettingsCopy.text("disconnect"))) {
                    Task { await model.run { await engine.disable() } }
                }, secondaryButton: .cancel(Text(SettingsCopy.text("cancel"))))
            case .switchAccount:
                return Alert(title: Text(SettingsCopy.text("switchAccount")), message: Text(SettingsCopy.text("switchHelp")), primaryButton: .destructive(Text(SettingsCopy.text("switchAccount"))) { join() }, secondaryButton: .cancel(Text(SettingsCopy.text("cancel"))))
            case .recovery:
                return Alert(title: Text(SyncCopy.text("settings.sync.recovery.dialogMessage")), message: Text(SyncCopy.text("settings.sync.recovery.dialogDetail")), primaryButton: .default(Text(SyncCopy.text("settings.sync.recovery.dialogCopy"))) {
                    Task { await model.run(successMessage: SyncCopy.text("settings.sync.recovery.copied")) {
                        guard let code = engine.recoveryCode() else { return .object([("ok", .bool(false))]) }
                        UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: code]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
                        return .object([("ok", .bool(true))])
                    } }
                }, secondaryButton: .cancel(Text(SettingsCopy.text("cancel"))))
            }
        }
    }
    private func startPairing() {
        let scan = PairScanCoordinator()
        Task {
            let route = await scan.start()
            if route == .codeField { showCodeField() } else { scanSheet = ScanSheet(route: route, scan: scan) }
        }
    }
    private func showCodeField() {
        typeCodeHint = true
        withAnimation { showOtherWays = true }
    }
    private func join() {
        let code = model.code.trimmingCharacters(in: .whitespacesAndNewlines)
        // The success line names the sync joined (design 2026-10-28 §7.3).
        Task { await model.run(successMessage: SyncCopy.text("settings.sync.connectedTo", ["name": SettingsSyncStatus(engine.status).handle])) {
            status.enabled ? await engine.switchWithCode(code) : await engine.joinWithCode(code)
        } }
    }
    private func signIn() {
        let handle = model.handle, passphrase = model.passphrase
        Task { await model.run { await engine.enable(handle: handle, passphrase: passphrase) } }
    }
    private func engineReply() -> JSONValue {
        if let error = SettingsSyncStatus(engine.status).error {
            return .object([("ok", .bool(false)), ("message", .string(error))])
        }
        return .object([("ok", .bool(true))])
    }
    private func saveName() {
        engine.setDeviceName(model.deviceName)
        model.deviceName = SettingsSyncStatus(engine.status).deviceName
    }
}

private struct PairDeviceSettingsView: View {
    let engine: SyncEngine
    @State private var model = SyncSettingsModel()
    @State private var pairingTask: Task<Void, Never>?
    var body: some View {
        Form {
            Section {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    if let pairing = engine.pairing, Double(pairing.expiresAt) / 1000 > context.date.timeIntervalSince1970 {
                        // The same QR as the desktop's sheet (design 2026-10-28 §7.1).
                        if let qr = PairQR.image(for: pairing.code) {
                            Image(uiImage: qr).interpolation(.none).resizable().scaledToFit()
                                .frame(maxWidth: 200).frame(maxWidth: .infinity).accessibilityHidden(true)
                        }
                        Text(SyncPairing.format(pairing.code)).font(.system(.largeTitle, design: .monospaced))
                            .textSelection(.enabled).privacySensitive().accessibilityIdentifier("settings.pairCode")
                        Text(Date(timeIntervalSince1970: Double(pairing.expiresAt) / 1000), style: .timer)
                            .accessibilityLabel(SettingsCopy.text("expires"))
                    } else { Text(SettingsCopy.text("pairExpired")) }
                }
                Button(SettingsCopy.text("newCode")) { begin() }.disabled(model.busy)
                if model.busy { ProgressView() }
                if let error = model.error { Text(error).foregroundStyle(.red) }
            } footer: { Text(SettingsCopy.text("pairDeviceHelp")) }
        }.settingsFormStyle().settingsTitle(SettingsCopy.text("pairDevice"))
            .onAppear { begin() }
            .onDisappear {
                pairingTask?.cancel()
                model.dismiss()
                Task { await engine.cancelPairing() }
            }
    }
    private func begin() {
        pairingTask = Task {
            await model.run { await engine.beginPairing() }
            if Task.isCancelled { await engine.cancelPairing() }
        }
    }
}
