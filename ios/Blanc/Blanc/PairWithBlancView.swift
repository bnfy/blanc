import SwiftUI

/// Pair with your Blanc (design 2026-10-28 §7.1): the camera first, every
/// other way one level deeper. Form sections, shared by Settings → Sync and
/// the first-minute walkthrough (M18 §3.2), so pairing behaves the same in
/// both. Switching to another sync reuses the code field; asking before the
/// switch stays with Settings (`onSwitch`).
struct PairWithBlancSections: View {
    let engine: SyncEngine
    let model: SyncSettingsModel
    var switching = false
    var onSwitch: () -> Void = {}
    var onCancelSwitch: () -> Void = {}
    @Environment(\.colorScheme) private var colorScheme
    @State private var showOtherWays = false
    @State private var typeCodeHint = false
    @State private var scanSheet: ScanSheet?
    private struct ScanSheet: Identifiable {
        let route: PairScanCoordinator.Route
        let scan: PairScanCoordinator
        var id: String { "\(route)" }
    }
    private var enabled: Bool { SettingsSyncStatus(engine.status).enabled }

    var body: some View {
        @Bindable var form = model
        Group {
            if !enabled && !switching {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(SettingsCopy.text("syncOffTitle")).font(.headline)
                        Text(SettingsCopy.text("syncOffBody")).foregroundStyle(.secondary)
                    }
                    Button(action: startPairing) {
                        // Settings tints with the text color, so the label takes the
                        // page's background color to stay readable on that fill.
                        Label(SettingsCopy.text("pairWithBlanc"), systemImage: "qrcode.viewfinder")
                            .foregroundStyle(BrowserStyle(scheme: colorScheme).background)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("settings.pairWithBlanc")
                    Button(SettingsCopy.text("otherWays")) {
                        withAnimation { showOtherWays.toggle() }
                    }.accessibilityIdentifier("settings.otherWays")
                }
            }
            if (!enabled && showOtherWays) || switching {
                Section {
                    TextField(SettingsCopy.text("pairingCode"), text: $form.code, axis: .vertical)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .privacySensitive().accessibilityIdentifier("settings.syncCode")
                    Button(SettingsCopy.text(switching ? "switchAccount" : "connect")) {
                        if switching { onSwitch() } else { PairJoin.join(engine: engine, model: model, code: model.code) }
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
                    Button(SettingsCopy.text("cancel")) { onCancelSwitch() }
                }
            }
        }
        .sheet(item: $scanSheet) { sheet in
            PairScannerSheet(route: sheet.route, scan: sheet.scan, onCode: { code in
                scanSheet = nil
                model.code = code
                PairJoin.join(engine: engine, model: model, code: code)
            }, onTypeInstead: { showCodeField() })
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
    private func signIn() {
        let handle = model.handle, passphrase = model.passphrase
        Task { await model.run { await engine.enable(handle: handle, passphrase: passphrase) } }
    }
}

/// Joining with a pairing or recovery code, from Settings, the walkthrough or
/// the scanner: a phone that already syncs switches (after Settings asked).
@MainActor enum PairJoin {
    static func join(engine: SyncEngine, model: SyncSettingsModel, code raw: String) {
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // The success line names the sync joined (design 2026-10-28 §7.3).
        Task { await model.run(successMessage: SyncCopy.text("settings.sync.connectedTo", ["name": SettingsSyncStatus(engine.status).handle])) {
            SettingsSyncStatus(engine.status).enabled ? await engine.switchWithCode(code) : await engine.joinWithCode(code)
        } }
    }
}
