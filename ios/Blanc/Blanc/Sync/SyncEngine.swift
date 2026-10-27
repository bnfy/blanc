import CryptoKit
import Foundation
import Observation

@MainActor @Observable final class SyncEngine {
  struct PairingState: Equatable {
    let code: String
    let expiresAt: Int64
    let pairId: String
  }
  private struct AccountSnapshot {
    let accountId: String
    let key: SymmetricKey
    let generation: Int
  }
  let stateStore: SyncStateStore
  private let secrets: any SyncSecretStore
  private let client: SyncWorkerClient
  private let clock: () -> Int64
  private let settingsSink: (SyncedSettings) -> Void
  private let tabsSource: () -> [(url: String, title: String)]
  private(set) var remoteDevices: [RemoteDevice] = []
  private(set) var favorites: [Favorite] = []
  private(set) var pairing: PairingState?
  private(set) var icons: JSONValue = .object([])
  /// Pages other devices sent here that this phone hasn't opened or dismissed,
  /// and the devices a page can be sent to (M7b).
  private(set) var inbox: [InboxItem] = []
  private(set) var sendTargets: [SendTarget] = []
  enum SendResult: Equatable { case sent, unavailable, failed, invalid }
  var onChanged: (() -> Void)?
  private var generation = 0
  private var pairingGeneration = 0
  private var transitioning = false
  private var inFlight = 0
  private var drainWaiters: [CheckedContinuation<Void, Never>] = []
  private var passTask: Task<Void, Never>?
  private var publishTask: Task<Void, Never>?
  private var firstPending: Int64?
  private var lastForeground: Int64?
  private var settingsRevision = 0
  private var favoritesRevision = 0
  private var rerunRequested = false
  private var settings: SyncedSettings
  private var session: JSONValue
  /// The local sends cache: `{devices, dismissed}`. Only `devices` is synced;
  /// opened and dismissed ids stay on this phone.
  private var sends: JSONValue

  init(
    state: SyncStateStore, secrets: any SyncSecretStore, client: SyncWorkerClient,
    clock: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) },
    settingsSink: @escaping (SyncedSettings) -> Void,
    tabsSource: @escaping () -> [(url: String, title: String)]
  ) {
    stateStore = state
    self.secrets = secrets
    self.client = client
    self.clock = clock
    self.settingsSink = settingsSink
    self.tabsSource = tabsSource
    settings = SyncedSettings(payload: state.load(.settings) ?? .object([]))
    session = state.load(.session) ?? .object([("devices", .object([]))])
    icons = state.load(.icons) ?? .object([("devices", .object([]))])
    sends = state.load(.sends) ?? Self.emptySends
    if state.state.enabled { refreshViews() }
    // Favorites are the phone's own and stay when sync is off.
    favorites = SyncedFavorites.list(state.load(.bookmarks) ?? .object([]))
  }
  private static let emptySends: JSONValue = .object([
    ("devices", .object([])), ("dismissed", .object([])),
  ])
  var status: JSONValue {
    let s = stateStore.state
    return .object([
      ("enabled", .bool(s.enabled)), ("handle", s.handle.map(JSONValue.string) ?? .string("")),
      ("lastSyncedAt", s.lastSyncedAt.map { .number(Double($0)) } ?? .null),
      ("lastError", s.lastError.map { .string(SyncCopy.error($0)) } ?? .null),
      ("syncTabs", .bool(s.syncTabs)), ("deviceName", .string(chosenName)),
      ("deviceNamePublished", .string("iPhone")),
    ])
  }
  private var chosenName: String {
    settings.payload()["values"]?["deviceNames"]?[stateStore.state.deviceId]?["name"]?.text ?? ""
  }
  private func reply(_ error: Error? = nil, extra: [(String, JSONValue)] = []) -> JSONValue {
    let code = (error as? SyncError)?.code ?? (error == nil ? nil : "offline")
    return .object(
      [("ok", .bool(error == nil)), ("status", status)]
        + (code.map { [("error", .string($0)), ("message", .string(SyncCopy.error($0)))] } ?? [])
        + extra)
  }
  private func check(_ expected: Int) throws { if expected != generation { throw SyncError.stale } }
  private func request<T>(_ operation: () async throws -> T) async throws -> T {
    inFlight += 1
    defer {
      inFlight -= 1
      if inFlight == 0 {
        let waiters = drainWaiters
        drainWaiters = []
        waiters.forEach { $0.resume() }
      }
    }
    return try await operation()
  }
  private func barrier() async {
    generation += 1
    publishTask?.cancel()
    publishTask = nil
    firstPending = nil
    // Do not cancel an already dispatched HTTP task: wait until its outcome is known.
    if inFlight > 0 { await withCheckedContinuation { drainWaiters.append($0) } }
    if let task = passTask { await task.value }
    passTask = nil
  }
  private func snapshot() throws -> AccountSnapshot {
    guard stateStore.state.enabled, let id = stateStore.state.accountId else {
      throw SyncError.syncOff
    }
    guard let key = try secrets.readKey() else { throw SyncError.storage }
    return AccountSnapshot(accountId: id, key: key, generation: generation)
  }
  func preflight(handle: String, passphrase: String) async -> JSONValue {
    guard SyncCrypto.validHandle(handle), SyncCrypto.passphraseStrong(passphrase) else {
      return reply(SyncError.pairInvalid, extra: [("outcome", .string("invalid"))])
    }
    let g = generation
    do {
      let keys = try await Task.detached {
        try SyncCrypto.deriveKeys(handle: handle, passphrase: passphrase)
      }.value
      try check(g)
      let found = try await request { try await client.get(keys.accountId, .settings) }
      try check(g)
      return reply(extra: [("outcome", .string(found == nil ? "notFound" : "found"))])
    } catch {
      let outcome =
        (error as? SyncError) == .rateLimited
        ? "rateLimited" : ((error as? SyncError) == .offline ? "offline" : "error")
      return reply(error, extra: [("outcome", .string(outcome))])
    }
  }
  func enable(handle: String, passphrase: String) async -> JSONValue {
    guard !stateStore.state.enabled else { return reply(SyncError.syncOn) }
    guard !transitioning else { return reply(SyncError.stale) }
    transitioning = true
    defer { transitioning = false }
    await barrier()
    let g = generation
    do {
      guard SyncCrypto.validHandle(handle), SyncCrypto.passphraseStrong(passphrase) else {
        throw SyncError.pairInvalid
      }
      let keys = try await Task.detached {
        try SyncCrypto.deriveKeys(handle: handle, passphrase: passphrase)
      }.value
      try check(g)
      guard let found = try await request({ try await client.get(keys.accountId, .settings) })
      else { throw SyncError.createOnComputer }
      try check(g)
      // Authenticate existing data before persisting credentials. A typo never creates an account.
      _ = try decode(found.blob, key: keys.contentKey)
      try adopt(
        handle: handle.trimmingCharacters(in: .whitespacesAndNewlines), id: keys.accountId,
        key: keys.contentKey)
      transitioning = false
      await syncNow()
      return stateStore.state.lastError.map { replyCode($0) }
        ?? reply(extra: [("created", .bool(false))])
    } catch { return reply(error) }
  }
  private func replyCode(_ code: String) -> JSONValue {
    .object([
      ("ok", .bool(false)), ("error", .string(code)), ("message", .string(SyncCopy.error(code))),
      ("status", status),
    ])
  }
  func joinWithCode(_ code: String) async -> JSONValue {
    guard !stateStore.state.enabled else { return reply(SyncError.syncOn) }
    return await switchWithCode(code)
  }
  func switchWithCode(_ code: String, wipeRemote: Bool = false) async -> JSONValue {
    guard !wipeRemote else { return reply(SyncError.wipeUnsupported) }
    guard !transitioning else { return reply(SyncError.stale) }
    transitioning = true
    defer { transitioning = false }
    await barrier()
    let g = generation
    do {
      let payload: PairPayload
      if SyncPairing.isRecoveryCode(code) {
        payload = try SyncPairing.decodeRecovery(code)
      } else {
        guard let normalized = SyncPairing.normalize(code) else { throw SyncError.pairInvalid }
        let material = try await Task.detached { try SyncPairing.material(code: normalized) }.value
        try check(g)
        let blob = try await request { try await client.takePair(material.pairId) }
        try check(g)
        payload = try SyncPairing.unwrap(blob, wrapKey: material.wrapKey)
      }
      guard let bytes = Data(base64Encoded: payload.key), bytes.count == 32 else {
        throw SyncError.pairInvalid
      }
      let key = SymmetricKey(data: bytes)
      // Read/decrypt first; a broken or mismatched recovery code leaves the old account intact.
      guard let found = try await request({ try await client.get(payload.accountId, .settings) })
      else { throw SyncError.createOnComputer }
      try check(g)
      _ = try decode(found.blob, key: key)
      if stateStore.state.enabled, stateStore.state.accountId != payload.accountId {
        await retractBestEffort()
        await retractSendsBestEffort()
        try check(g)
      }
      await cancelPairing()
      try adopt(handle: payload.handle, id: payload.accountId, key: key)
      transitioning = false
      await syncNow()
      return stateStore.state.lastError.map { replyCode($0) } ?? reply()
    } catch { return reply(error) }
  }
  private func adopt(handle: String, id: String, key: SymmetricKey) throws {
    let oldKey = try secrets.readKey()
    let oldState = stateStore.state
    let oldData = Dictionary(
      uniqueKeysWithValues: SyncStore.allCases.compactMap { store in
        stateStore.load(store).map { (store, $0) }
      })
    do {
      try secrets.writeKey(key)
      try stateStore.clearData(keeping: [.bookmarks])
      try stateStore.update {
        $0.enabled = true
        $0.handle = handle
        $0.accountId = id
        $0.lastError = nil
        $0.lastSyncedAt = nil
      }
    } catch {
      if let oldKey { try? secrets.writeKey(oldKey) } else { try? secrets.deleteKey() }
      try? stateStore.update { $0 = oldState }
      for (store, data) in oldData { try? stateStore.save(store, data) }
      throw SyncError.storage
    }
    settings = SyncedSettings(payload: .object([]))
    session = .object([("devices", .object([]))])
    icons = .object([("devices", .object([]))])
    sends = Self.emptySends
    remoteDevices = []
    inbox = []
    sendTargets = []
    onChanged?()
  }
  func beginPairing() async -> JSONValue {
    guard !transitioning else { return reply(SyncError.stale) }
    do {
      let snap = try snapshot()
      await cancelPairing()
      let pairingToken = pairingGeneration
      try check(snap.generation)
      for attempt in 0..<3 {
        let code = SyncPairing.generateCode()
        let material = try await Task.detached { try SyncPairing.material(code: code) }.value
        try check(snap.generation)
        guard pairingToken == pairingGeneration else { throw SyncError.stale }
        let payload = PairPayload(
          v: 1, handle: stateStore.state.handle ?? "", accountId: snap.accountId,
          key: snap.key.withUnsafeBytes { Data($0).base64EncodedString() })
        let blob = try SyncPairing.wrap(payload, wrapKey: material.wrapKey)
        do {
          try await request { try await client.postPair(material.pairId, blob: blob) }
        } catch SyncError.conflict {
          if attempt < 2 { continue }
          throw SyncError.server(409)
        }
        if snap.generation != generation || pairingToken != pairingGeneration {
          // The panel may close (or the account change) during POST. Revoke this
          // specific old entry without publishing it into the new account's state.
          try? await request { try await client.deletePair(material.pairId) }
          throw SyncError.stale
        }
        pairing = PairingState(code: code, expiresAt: clock() + 600_000, pairId: material.pairId)
        return reply(extra: [
          ("code", .string(SyncPairing.format(code))),
          ("expiresAt", .number(Double(pairing!.expiresAt))),
        ])
      }
      throw SyncError.server(409)
    } catch { return reply(error) }
  }
  func pairingStatus() -> JSONValue {
    guard let pairing, pairing.expiresAt > clock() else {
      return .object([("active", .bool(false))])
    }
    return .object([
      ("active", .bool(true)), ("code", .string(SyncPairing.format(pairing.code))),
      ("expiresAt", .number(Double(pairing.expiresAt))),
    ])
  }
  func cancelPairing() async {
    pairingGeneration += 1
    guard let old = pairing else { return }
    pairing = nil
    try? await request { try await client.deletePair(old.pairId) }
  }
  func recoveryCode() -> String? {
    guard let snap = try? snapshot() else { return nil }
    return try? SyncPairing.encodeRecovery(
      PairPayload(
        v: 1, handle: stateStore.state.handle ?? "", accountId: snap.accountId,
        key: snap.key.withUnsafeBytes { Data($0).base64EncodedString() }))
  }
  func disable(wipeRemote: Bool = false) async -> JSONValue {
    guard !wipeRemote else { return reply(SyncError.wipeUnsupported) }
    guard !transitioning else { return reply(SyncError.stale) }
    transitioning = true
    defer { transitioning = false }
    await barrier()
    do {
      if stateStore.state.enabled { await retractBestEffort() }
      if stateStore.state.enabled { await retractSendsBestEffort() }
      await cancelPairing()
      let oldKey = try secrets.readKey()
      let oldState = stateStore.state
      let oldData = Dictionary(
        uniqueKeysWithValues: SyncStore.allCases.compactMap { store in
          stateStore.load(store).map { (store, $0) }
        })
      do {
        try stateStore.update {
          $0.enabled = false
          $0.handle = nil
          $0.accountId = nil
          $0.lastError = nil
          $0.lastSyncedAt = nil
        }
        try stateStore.clearData(keeping: [.bookmarks])
        try secrets.deleteKey()
      } catch {
        if let oldKey { try? secrets.writeKey(oldKey) }
        try? stateStore.update { $0 = oldState }
        for (store, data) in oldData { try? stateStore.save(store, data) }
        throw SyncError.storage
      }
      settings = SyncedSettings(payload: .object([]))
      session = .object([])
      icons = .object([])
      sends = Self.emptySends
      remoteDevices = []
      inbox = []
      sendTargets = []
      onChanged?()
      return reply()
    } catch { return reply(error) }
  }
  private func decode(_ blob: SyncEnvelope, key: SymmetricKey) throws -> JSONValue {
    do { return try JSONValue(data: SyncCrypto.open(blob, key: key)) } catch {
      throw SyncError.badPassphrase
    }
  }
  func syncNow() async {
    guard !transitioning, stateStore.state.enabled else { return }
    if let task = passTask {
      rerunRequested = true
      await task.value
      return
    }
    let g = generation
    let task = Task { await self.runPass(generation: g) }
    passTask = task
    await task.value
    if generation == g {
      passTask = nil
      if rerunRequested {
        rerunRequested = false
        await syncNow()
      }
    }
  }
  private func runPass(generation g: Int) async {
    do {
      let snap = try snapshot()
      try check(g)
      var pulled: [SyncStore: (String, JSONValue)] = [:]
      var iconsUnavailable = false
      var sendsUnavailable = false
      for store in SyncStore.allCases {
        do {
          let item = try await request { try await client.get(snap.accountId, store) }
          try check(g)
          if let item { pulled[store] = (item.version, try decode(item.blob, key: snap.key)) }
        } catch let error
          where (store == .icons || store == .sends) && (error as? SyncError) != .stale
        {
          // Favicons and sent pages are optional, as on desktop: a missing,
          // broken or busy store (or an older Worker without `sends`) keeps
          // the phone's last copy and never blocks the rest or sets lastError.
          try check(g)
          if store == .icons { iconsUnavailable = true } else { sendsUnavailable = true }
        }
      }
      try check(g)
      // Desktop creates the settings store when a sync starts, so its absence
      // means the sync was deleted (Settings → Sync → delete synced data). The
      // phone joins only: it stops and says so rather than recreating it.
      guard pulled[.settings] != nil else { throw SyncError.accountGone }
      // Stage all reads/authentication before applying anything or writing remotely.
      var mergedSettings = settings
      if let data = pulled[.settings]?.1 {
        mergedSettings.merge(remote: SyncedSettings(payload: data))
      }
      var mergedSession = TabSnapshots.merge(
        local: session["devices"] ?? .object([]),
        remote: pulled[.session]?.1["devices"] ?? .object([]), ownId: stateStore.state.deviceId,
        now: clock())
      mergedSession = .object([("devices", mergedSession)])
      // Every device announces itself, so Settings → Sync can list it: a
      // phone that doesn't share its tabs publishes its presence alone (no
      // tabs). It never creates a missing tab list, which would recreate data
      // deleted from desktop; desktop creates that list.
      let announcesPresence = !stateStore.state.syncTabs && pulled[.session] != nil
      if stateStore.state.syncTabs || announcesPresence {
        let previous = mergedSession["devices"]?[stateStore.state.deviceId]
        mergedSession = replacingOwn(
          in: mergedSession,
          entry: TabSnapshots.ownEntry(
            tabs: stateStore.state.syncTabs ? tabsSource() : [], previous: previous, now: clock()))
      }
      let mergedIcons: JSONValue =
        iconsUnavailable
        ? icons
        : .object([
          (
            "devices",
            SyncedIcons.merge(
              local: icons["devices"] ?? .object([]),
              remote: pulled[.icons]?.1["devices"] ?? .object([]), now: clock())
          )
        ])
      let favoritesBeforeWrite = favoritesRevision
      let mergedFavorites = SyncedFavorites.merge(
        local: stateStore.load(.bookmarks) ?? .object([]),
        remote: pulled[.bookmarks]?.1 ?? .object([]), now: Double(clock()))
      var mergedSendDevices = sends["devices"] ?? .object([])
      if !sendsUnavailable {
        mergedSendDevices = withOwnPresence(
          SyncSends.merge(
            local: mergedSendDevices, remote: pulled[.sends]?.1["devices"] ?? .object([]),
            ownId: stateStore.state.deviceId, now: Double(clock())))
      }
      // Preserve a concurrent local settings edit made during a GET.
      mergedSettings.merge(remote: settings)
      let revisionBeforeWrite = settingsRevision
      let savedSettings = try await writeMerged(
        .settings, payload: mergedSettings.payload(), remote: pulled[.settings], snapshot: snap)
      try check(g)
      // Never create an account's Favorites store just to hold nothing.
      var savedFavorites = mergedFavorites
      if pulled[.bookmarks] != nil || !(mergedFavorites["items"]?.array ?? []).isEmpty
        || !(mergedFavorites["tombstones"]?.array ?? []).isEmpty
      {
        savedFavorites = try await writeMerged(
          .bookmarks, payload: mergedFavorites, remote: pulled[.bookmarks], snapshot: snap)
        try check(g)
      }
      if stateStore.state.syncTabs || announcesPresence {
        let uploadedSession = try await writeMerged(
          .session,
          payload: .object([
            (
              "devices",
              TabSnapshots.trimmedForUpload(
                mergedSession["devices"] ?? .object([]), ownId: stateStore.state.deviceId)
            )
          ]), remote: pulled[.session], snapshot: snap)
        // The budget bounds the wire copy, not the cache or own-entry
        // fingerprint. Keep full tabs and merge conflict-time peers back.
        mergedSession = .object([
          (
            "devices",
            TabSnapshots.merge(
              local: mergedSession["devices"] ?? .object([]),
              remote: uploadedSession["devices"] ?? .object([]), ownId: stateStore.state.deviceId,
              now: clock())
          )
        ])
      }
      try check(g)
      // Sent pages (M7b §6): presence alone never creates the store, and any
      // failure here is the optional store's, never the pass's.
      if !sendsUnavailable, pulled[.sends] == nil, !ownHasItems(mergedSendDevices) {
        // Nothing published: don't keep a presence entry the server never saw,
        // so leaving this sync has nothing to take back.
        mergedSendDevices[stateStore.state.deviceId] = nil
      } else if !sendsUnavailable {
        do {
          let uploaded = try await writeMerged(
            .sends,
            payload: .object([
              ("devices", SyncSends.applyBudget(mergedSendDevices, ownId: stateStore.state.deviceId))
            ]), remote: pulled[.sends], snapshot: snap)
          mergedSendDevices = SyncSends.merge(
            local: mergedSendDevices, remote: uploaded["devices"] ?? .object([]),
            ownId: stateStore.state.deviceId, now: Double(clock()))
        } catch let error where (error as? SyncError) != .stale {}
      }
      try check(g)
      // A Favorites edit made during any upload above is merged back and
      // published next. Nothing awaits between here and the save.
      if favoritesRevision != favoritesBeforeWrite {
        savedFavorites = SyncedFavorites.merge(
          local: stateStore.load(.bookmarks) ?? .object([]), remote: savedFavorites,
          now: Double(clock()))
        rerunRequested = true
      }
      var finalSettings = SyncedSettings(payload: savedSettings)
      finalSettings.merge(remote: settings)
      settings = finalSettings
      session = mergedSession
      icons = mergedIcons
      sends = localSends(devices: mergedSendDevices)
      if settingsRevision != revisionBeforeWrite { rerunRequested = true }
      for (store, value) in [
        (SyncStore.settings, settings.payload()), (.session, session), (.icons, icons),
        (.bookmarks, savedFavorites), (.sends, sends),
      ] { try stateStore.save(store, value) }
      try stateStore.update {
        $0.lastError = nil
        $0.lastSyncedAt = clock()
      }
      settingsSink(settings)
      refreshViews()
      onChanged?()
    } catch {
      guard g == generation else { return }
      let code = (error as? SyncError)?.code ?? "offline"
      try? stateStore.update { $0.lastError = code }
      onChanged?()
    }
  }
  private func replacingOwn(in payload: JSONValue, entry: JSONValue) -> JSONValue {
    var pairs = payload["devices"]?.pairs ?? []
    pairs.removeAll { $0.0 == stateStore.state.deviceId }
    pairs.append((stateStore.state.deviceId, entry))
    return .object([("devices", .object(pairs))])
  }
  private func writeMerged(
    _ store: SyncStore, payload: JSONValue, remote: (String, JSONValue)?,
    snapshot snap: AccountSnapshot
  ) async throws -> JSONValue {
    var value = payload
    var current = remote
    for attempt in 0...3 {
      try check(snap.generation)
      if current?.1.canonical() == value.canonical() { return value }
      do {
        let blob = try SyncCrypto.seal(Data(value.jsStringify().utf8), key: snap.key)
        _ = try await request {
          try await client.put(snap.accountId, store, ifVersion: current?.0, blob: blob)
        }
        try check(snap.generation)
        return value
      } catch SyncError.conflict {
        try check(snap.generation)
        guard attempt < 3 else { throw SyncError.conflict(version: nil) }
        let latest = try await request { try await client.get(snap.accountId, store) }
        try check(snap.generation)
        // A conflict whose store has since vanished was a delete: never
        // recreate it with ifVersion null.
        guard let latest else { throw SyncError.accountGone }
        current = (latest.version, try decode(latest.blob, key: snap.key))
        if store == .settings {
          var merged = SyncedSettings(payload: value)
          if let current { merged.merge(remote: SyncedSettings(payload: current.1)) }
          merged.merge(remote: settings)
          value = merged.payload()
        } else if store == .bookmarks {
          value = SyncedFavorites.merge(
            local: value, remote: current?.1 ?? .object([]), now: Double(clock()))
        } else if store == .sends {
          let ownId = stateStore.state.deviceId
          value = .object([
            (
              "devices",
              SyncSends.applyBudget(
                SyncSends.merge(
                  local: value["devices"] ?? .object([]),
                  remote: current?.1["devices"] ?? .object([]), ownId: ownId,
                  now: Double(clock())), ownId: ownId)
            )
          ])
        } else {
          value = .object([
            (
              "devices",
              TabSnapshots.trimmedForUpload(
                TabSnapshots.merge(
                  local: value["devices"] ?? .object([]),
                  remote: current?.1["devices"] ?? .object([]), ownId: stateStore.state.deviceId,
                  now: clock()), ownId: stateStore.state.deviceId)
            )
          ])
        }
      }
    }
    throw SyncError.conflict(version: nil)
  }
  /// Leaving a sync (turning it off, or switching to another) must never depend
  /// on the network or on the key still being there (a backup restored to a new
  /// phone keeps sync.json but not the device-only key). Try to tell the other
  /// devices this phone stopped sharing; if that can't happen, its entry ages
  /// out after 30 days like any silent device's.
  /// Leaving a sync: take this phone off the others' device lists. Only an
  /// entry the server holds is retracted; a phone that never published sends
  /// nothing to the old account.
  private func retractBestEffort() async {
    guard let snap = try? snapshot() else { return }
    try? await retract(snap, leaving: true)
  }
  /// Turning sharing off (`leaving: false`) replaces this phone's tabs with its
  /// presence alone, whose fresh clock beats every stale copy of the tabs;
  /// leaving the sync (`leaving: true`) publishes a retraction.
  private func retract(_ snap: AccountSnapshot, leaving: Bool = false) async throws {
    let item = try await request { try await client.get(snap.accountId, .session) }
    try check(snap.generation)
    // No tab list on the server: nothing lists this phone, and writing one
    // would recreate data deleted from desktop.
    guard let item else { return }
    let remote: (String, JSONValue)? = (item.version, try decode(item.blob, key: snap.key))
    let merged: JSONValue = .object([
      (
        "devices",
        TabSnapshots.merge(
          local: session["devices"] ?? .object([]), remote: remote?.1["devices"] ?? .object([]),
          ownId: stateStore.state.deviceId, now: clock())
      )
    ])
    let own = merged["devices"]?[stateStore.state.deviceId]
    if leaving, own == nil || own?["retracted"]?.isTruthy == true { return }
    let previous = own?["updatedAt"]?.integer ?? 0
    let now = max(clock(), previous + 1)
    let value = replacingOwn(
      in: merged,
      entry: leaving
        ? TabSnapshots.retraction(now: now)
        : TabSnapshots.ownEntry(tabs: [], previous: nil, now: now))
    session = try await writeMerged(.session, payload: value, remote: remote, snapshot: snap)
    try stateStore.save(.session, session)
  }
  func setShareTabs(_ on: Bool) async {
    guard !transitioning else { return }
    if !on, stateStore.state.syncTabs, stateStore.state.enabled {
      transitioning = true
      await barrier()
      do { try await retract(try snapshot()) } catch {
        try? stateStore.update { $0.lastError = (error as? SyncError)?.code ?? "offline" }
        transitioning = false
        return
      }
      transitioning = false
    }
    try? stateStore.update { $0.syncTabs = on }
    if on { await syncNow() }
    onChanged?()
  }
  func setDeviceName(_ name: String) {
    guard stateStore.state.enabled, !transitioning else { return }
    settingsRevision += 1
    settings.setDeviceName(
      id: stateStore.state.deviceId, name: name, now: clock(), tie: UUID().uuidString.lowercased())
    try? stateStore.save(.settings, settings.payload())
    refreshViews()
    onChanged?()
    schedulePublish(delay: 250)
  }
  func localSettingChanged(key: String, value: JSONValue) {
    guard stateStore.state.enabled, !transitioning else { return }
    settingsRevision += 1
    settings.stampLocal(key: key, value: value, now: clock(), tie: UUID().uuidString.lowercased())
    try? stateStore.save(.settings, settings.payload())
    schedulePublish(delay: 250)
  }
  /// A Favorites edit on the phone. Favorites are local when sync is off and
  /// published to the account when it is on.
  func editFavorites(_ change: (JSONValue) -> JSONValue) {
    let empty: JSONValue = .object([("items", .array([])), ("tombstones", .array([]))])
    let current = stateStore.load(.bookmarks) ?? empty
    let next = change(current)
    guard next.canonical() != current.canonical() else { return }
    try? stateStore.save(.bookmarks, next)
    favoritesRevision += 1
    refreshViews()
    onChanged?()
    if stateStore.state.enabled, !transitioning { schedulePublish(delay: 250) }
  }
  func isFavorite(url: String) -> Bool {
    favorites.contains { $0.url == url }
  }
  func tabsChanged() {
    guard stateStore.state.enabled, stateStore.state.syncTabs, !transitioning else { return }
    if firstPending == nil { firstPending = clock() }
    schedulePublish(delay: min(15_000, max(0, (firstPending ?? clock()) + 60_000 - clock())))
  }
  private func schedulePublish(delay: Int64) {
    publishTask?.cancel()
    let g = generation
    publishTask = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(delay)) } catch { return }
      guard let self, self.generation == g else { return }
      self.firstPending = nil
      await self.syncNow()
    }
  }
  func appDidBecomeActive() async {
    guard lastForeground == nil || clock() - lastForeground! >= 60_000 else { return }
    lastForeground = clock()
    await syncNow()
  }
  private func refreshViews() {
    var names: [String: String] = [:]
    for (id, entry) in settings.payload()["values"]?["deviceNames"]?.pairs ?? [] {
      names[id] = entry["name"]?.text ?? ""
    }
    remoteDevices = TabSnapshots.devices(
      session["devices"] ?? .object([]), excluding: stateStore.state.deviceId, names: names)
    favorites = SyncedFavorites.list(stateStore.load(.bookmarks) ?? .object([]))
    let ownId = stateStore.state.deviceId
    inbox = SyncSends.inbox(
      sends["devices"] ?? .object([]), ownId: ownId, dismissed: dismissedIds, now: Double(clock()))
    sendTargets = SyncSends.targets(
      sends: sends["devices"] ?? .object([]), session: session["devices"] ?? .object([]),
      ownId: ownId, names: names)
  }

  // MARK: Send to device (M7b)

  private var dismissedIds: [String: Double] {
    Dictionary(
      uniqueKeysWithValues: (sends["dismissed"]?.pairs ?? []).compactMap { id, at in
        at.number.map { (id, $0) }
      })
  }
  private func localSends(devices: JSONValue) -> JSONValue {
    let kept = SyncSends.pruneDismissed(dismissedIds, now: Double(clock()))
    return .object([
      ("devices", devices),
      ("dismissed", .object(kept.sorted { $0.key < $1.key }.map { ($0.key, .number($0.value)) })),
    ])
  }
  /// The phone's presence entry, refreshed once a day (it publishes "iPhone",
  /// as it does for tab sync).
  private func withOwnPresence(_ devices: JSONValue) -> JSONValue {
    var out = devices
    out[stateStore.state.deviceId] =
      SyncSends.ownEntry(
        previous: devices[stateStore.state.deviceId], name: "iPhone", platform: "ios",
        now: Double(clock())
      ).entry
    return out
  }
  private func ownHasItems(_ devices: JSONValue) -> Bool {
    !(devices[stateStore.state.deviceId]?["items"]?.array.isEmpty ?? true)
  }

  /// Send a page to another device of this account (M7b §6): one immediate
  /// PUT with the usual conflict re-merge. "Sent" never means delivered.
  func send(url: String, title: String, to target: String) async -> SendResult {
    guard stateStore.state.enabled, !transitioning,
      sendTargets.contains(where: { $0.id == target })
    else { return .invalid }
    // Let a pass already on the wire finish, so this send hears its own result.
    if let task = passTask { await task.value }
    guard !transitioning else { return .failed }
    do {
      let snap = try snapshot()
      let ownId = stateStore.state.deviceId
      let item = try await request { try await client.get(snap.accountId, .sends) }
      try check(snap.generation)
      let remote = try item.map { ($0.version, try decode($0.blob, key: snap.key)) }
      let merged = SyncSends.merge(
        local: sends["devices"] ?? .object([]), remote: remote?.1["devices"] ?? .object([]),
        ownId: ownId, now: Double(clock()))
      let now = Double(clock())
      guard
        case .success(let added) = SyncSends.addItem(
          to: SyncSends.ownEntry(previous: merged[ownId], name: "iPhone", platform: "ios", now: now)
            .entry,
          url: url, title: title, to: target, ownId: ownId, now: now,
          makeId: { UUID().uuidString.lowercased() })
      else { return .invalid }
      var devices = merged
      devices[ownId] = added.entry
      let uploaded = try await writeMerged(
        .sends, payload: .object([("devices", SyncSends.applyBudget(devices, ownId: ownId))]),
        remote: remote, snapshot: snap)
      try check(snap.generation)
      sends = localSends(
        devices: SyncSends.merge(
          local: devices, remote: uploaded["devices"] ?? .object([]), ownId: ownId,
          now: Double(clock())))
      try? stateStore.save(.sends, sends)
      refreshViews()
      onChanged?()
      return .sent
    } catch SyncError.unknownStore {
      return .unavailable
    } catch {
      return .failed
    }
  }

  /// Hide a page sent here, opened or dismissed alike; kept on this phone only.
  func dismiss(_ id: String) {
    guard inbox.contains(where: { $0.id == id }) else { return }
    var dismissed = dismissedIds
    dismissed[id] = Double(clock())
    sends["dismissed"] = .object(
      dismissed.sorted { $0.key < $1.key }.map { ($0.key, .number($0.value)) })
    try? stateStore.save(.sends, sends)
    refreshViews()
    onChanged?()
  }

  /// Leaving a sync: publish this phone's sends entry as retracted, so other
  /// devices stop offering it and drop its pages. Never creates the store.
  private func retractSendsBestEffort() async {
    let ownId = stateStore.state.deviceId
    // Only a phone that published to the store has anything to take back;
    // otherwise leaving sends nothing to the old account.
    guard sends["devices"]?[ownId] != nil, let snap = try? snapshot() else { return }
    guard let item = try? await request({ try await client.get(snap.accountId, .sends) }),
      generation == snap.generation, let current = try? decode(item.blob, key: snap.key),
      let own = current["devices"]?[ownId], own["retracted"]?.isTruthy != true
    else { return }
    var devices = current["devices"] ?? .object([])
    let previous = own["updatedAt"]?.number ?? 0
    devices[ownId] = SyncSends.retraction(now: max(Double(clock()), previous + 1))
    _ = try? await writeMerged(
      .sends, payload: .object([("devices", devices)]), remote: (item.version, current),
      snapshot: snap)
  }
}

extension JSONValue {
  var text: String? { if case .string(let s) = self { s } else { nil } }
  var integer: Int64? {
    if case .number(let n) = self, n.isFinite, n >= Double(Int64.min), n < Double(Int64.max) {
      Int64(n)
    } else {
      nil
    }
  }
  var boolean: Bool? { if case .bool(let b) = self { b } else { nil } }
}
