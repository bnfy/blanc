import CryptoKit
import Foundation
import Observation

/// Whether the account's Worker serves the Shared Spaces stores (M16 §9): an
/// older Worker answers `404 unknown store`, and the phone then leaves the
/// Spaces switch off while everything else keeps syncing.
nonisolated enum SpacesAvailability: Equatable, Sendable { case unknown, available, unavailable }

/// A value an escaping request closure fills in for its caller.
private final class Box<T> {
  var value: T
  init(_ value: T) { self.value = value }
}

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

  // MARK: Shared Spaces (M17c)

  /// The account-bound Spaces state (`shared-spaces.json`), also holding the
  /// request window every GET is charged to.
  let sharedState: SharedSpacesState
  private(set) var spacesAvailability: SpacesAvailability = .unknown
  /// Other devices' Recently closed rows (M16 §7), while the Spaces switch is on.
  private(set) var closedInbox: [ClosedRow] = []
  /// Called with the Space ids whose merged blob changed, and `"index"` when
  /// the index did, as each fetch is merged.
  var onSpacesMerged: (([String]) -> Void)?
  /// The tabs as F27 publishes them, with their group, pin and shared Space;
  /// used instead of `tabsSource` when set. Shared Spaces are left out of the
  /// snapshot (and its membership) while the Spaces switch is off.
  var sharedTabsSource: (() -> [SnapshotTab])?
  /// The groups the snapshot's tabs refer to (desktop publishes them, F27).
  var sharedGroupsSource: (() -> [(id: String, name: String)])?
  /// "Sync is busy; retrying" (two 429s in a row) and "Checking for changes
  /// is slowed by rate limiting" (the request window is reduced), M16 §6.2.
  private(set) var spacesBusy = false
  private(set) var spacesSlowed = false
  /// Observable mirrors of the Spaces state for Settings: the switch, and
  /// how many live Spaces the merged library index holds.
  private(set) var spacesEnabled = false
  private(set) var libraryCount = 0
  /// Moves whenever the Spaces state may have changed, so marks and status
  /// lines (which read the unobserved state) redraw.
  private(set) var spacesRevision = 0
  /// The local `closed` cache: `{devices, dismissed, published}`; only
  /// `devices` is synced, and `published` says this phone's entry reached the Worker.
  private var closed: JSONValue
  private var closedRevision = 0
  private let queue: SyncRequestQueue
  private var lastPreview: (at: Int64, ok: Bool)?
  private var reconciling: [UUID: Task<Void, Never>] = [:]

  init(
    state: SyncStateStore, secrets: any SyncSecretStore, client: SyncWorkerClient,
    clock: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) },
    monotonic: @escaping () -> Int64 = { Int64(ProcessInfo.processInfo.systemUptime * 1000) },
    sleep: @escaping (Int64) async -> Void = { (ms: Int64) async -> Void in
      try? await Task.sleep(for: .milliseconds(ms))
    },
    sharedState: SharedSpacesState? = nil,
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
    closed = state.load(.closed) ?? Self.emptyClosed
    let shared = sharedState ?? SharedSpacesState(directory: state.directoryURL, now: clock)
    shared.rebind(accountId: state.state.enabled ? (state.state.accountId ?? "") : "")
    self.sharedState = shared
    let d = shared.data
    let cursors = Dictionary(
      (d["cursors"]?.pairs ?? []).compactMap { (k: String, v: JSONValue) -> (String, String)? in
        v.string.map { (k, $0) }
      }, uniquingKeysWith: { (a: String, _: String) -> String in a })
    let scheduler = SyncScheduler(
      log: (d["requestLog"]?.array ?? []).compactMap { (v: JSONValue) -> Int64? in v.integer },
      nextClass: d["nextClass"]?.string ?? "I", cursors: cursors, now: clock, monotonic: monotonic,
      windowLimit: d["windowLimit"]?.integer.map { (n: Int64) -> Int in Int(n) },
      backoffUntil: d["backoffUntil"]?.integer)
    queue = SyncRequestQueue(
      scheduler: scheduler, now: clock, sleep: sleep,
      persist: { (s: SyncScheduler.Snapshot) -> Void in shared.setRequestState(s) })
    if state.state.enabled { refreshViews() }
    // Favorites are the phone's own and stay when sync is off.
    favorites = SyncedFavorites.list(state.load(.bookmarks) ?? .object([]))
  }
  private static let emptySends: JSONValue = .object([
    ("devices", .object([])), ("dismissed", .object([])),
  ])
  private static let emptyClosed: JSONValue = .object([
    ("devices", .object([])), ("dismissed", .object([])), ("published", .bool(false)),
  ])
  private typealias Fetched = (version: String, blob: SyncEnvelope)?
  private struct SpaceOutcome {
    var stored = false
    var needsIndex = false
  }
  /// The switch is on and the Worker isn't known to lack the stores.
  private var spacesConsent: Bool {
    stateStore.state.enabled && sharedState.isEnabled && spacesAvailability != .unavailable
  }
  private func staleCheck(_ g: Int) -> () -> Error? {
    { [weak self] () -> Error? in
      guard let self, self.generation == g else { return SyncError.stale }
      return nil
    }
  }
  /// One GET, made when the request window and the I/S/F/R rotation give it a turn.
  private func scheduledGet(
    _ cls: String, _ name: String, accountId: String, generation g: Int,
    cancelled: (() -> Error?)? = nil
  ) async throws -> Fetched {
    let box = Box<Fetched>(nil)
    let stale = staleCheck(g)
    let error = await queue.enqueue(
      cls: cls, item: name, key: UUID().uuidString,
      cancelled: { () -> Error? in stale() ?? cancelled?() },
      run: { [weak self] (_: Int) async throws -> SyncRequestQueue.Step in
        guard let self else { throw SyncError.stale }
        box.value = try await self.request { try await self.client.get(accountId, storeName: name) }
        return .done
      })
    if let error { throw error }
    try check(g)
    return box.value
  }
  /// Resolves once no request waits or runs, reconciliation reads included.
  func requestsSettled() async {
    while let entry = reconciling.first {
      await entry.value.value
      reconciling[entry.key] = nil
    }
    await queue.settled()
  }
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
    // Requests still waiting for the window belong to the old generation.
    queue.flushCancelled()
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
      let found = try await scheduledGet("F", "settings", accountId: keys.accountId, generation: g)
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
      guard let found = try await scheduledGet("F", "settings", accountId: keys.accountId, generation: g)
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
      guard let found = try await scheduledGet("F", "settings", accountId: payload.accountId, generation: g)
      else { throw SyncError.createOnComputer }
      try check(g)
      _ = try decode(found.blob, key: key)
      if stateStore.state.enabled, stateStore.state.accountId != payload.accountId {
        if listedInTabList { await retractBestEffort() }
        await retractSendsBestEffort()
        await retractClosedBestEffort()
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
    resetSpaces(accountId: id)
    remoteDevices = []
    inbox = []
    sendTargets = []
    onChanged?()
  }
  /// Another account (or none): the Spaces state starts clean with its switch
  /// off, and the Recently closed cache goes with the old account.
  private func resetSpaces(accountId: String) {
    sharedState.rebind(accountId: accountId)
    closed = Self.emptyClosed
    closedInbox = []
    spacesAvailability = .unknown
    lastPreview = nil
    spacesEnabled = false
    libraryCount = 0
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
      if stateStore.state.enabled, listedInTabList { await retractBestEffort() }
      if stateStore.state.enabled {
        await retractSendsBestEffort()
        await retractClosedBestEffort()
      }
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
      resetSpaces(accountId: "")
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
  /// One pass: the fixed stores (read together, then merged and written), and
  /// with the Spaces switch on the index and the Space blobs beside them.
  /// Every GET waits for its turn in the request window (M16 §6.2).
  private func runPass(generation g: Int) async {
    var spaces: Task<Void, Never>?
    do {
      let snap = try snapshot()
      try check(g)
      sharedState.rebind(accountId: snap.accountId)
      let consent = spacesConsent
      if consent { spaces = Task { await self.syncSpaces(snap) } }
      try await syncFixed(snap, consent: consent)
      await spaces?.value
    } catch {
      await spaces?.value
      guard g == generation else { return }
      let code = (error as? SyncError)?.code ?? "offline"
      try? stateStore.update { $0.lastError = code }
      onChanged?()
    }
  }
  /// Reads every fixed store through the request queue at once, so the
  /// scheduler serves them in its F order among the other classes.
  private func readFixed(_ snap: AccountSnapshot, consent: Bool) async throws -> (
    pulled: [SyncStore: (String, JSONValue)], unavailable: Set<SyncStore>
  ) {
    let g = snap.generation
    let stores: [SyncStore] =
      [.bookmarks, .settings, .session, .icons, .sends] + (consent ? [.closed, .shared] : [])
    // Favicons, sent pages and the Spaces sidecars are optional, as on
    // desktop: a missing, broken or busy store (or an older Worker without it)
    // keeps the phone's last copy and never blocks the rest or sets lastError.
    let optional: Set<SyncStore> = [.icons, .sends, .closed, .shared]
    let aborted = Box(false)
    var reads: [(SyncStore, Task<Result<Fetched, Error>, Never>)] = []
    for store in stores {
      let spacesStore = store == .closed || store == .shared
      let read = Task { () async -> Result<Fetched, Error> in
        do {
          let item = try await self.scheduledGet(
            "F", store.rawValue, accountId: snap.accountId, generation: g,
            cancelled: { [weak self] () -> Error? in
              aborted.value || (spacesStore && !(self?.spacesConsent ?? false)) ? SyncError.cancelled : nil
            })
          return .success(item)
        } catch {
          // A required store's failure ends the pass: drop the reads still waiting.
          if !optional.contains(store) { aborted.value = true }
          return .failure(error)
        }
      }
      reads.append((store, read))
    }
    var pulled: [SyncStore: (String, JSONValue)] = [:]
    var unavailable = Set<SyncStore>()
    var failure: Error?
    for (store, read) in reads {
      switch await read.value {
      case .success(let item):
        guard let item else { continue }
        do { pulled[store] = (item.version, try decode(item.blob, key: snap.key)) } catch {
          if optional.contains(store) { unavailable.insert(store) } else { failure = failure ?? error }
        }
      case .failure(let error):
        let code = error as? SyncError
        if optional.contains(store), code != .stale {
          unavailable.insert(store)
          if code == .unknownStore, store == .closed || store == .shared { markSpacesUnavailable() }
        } else if code != .cancelled, failure == nil {
          failure = error
        }
      }
    }
    try check(g)
    if let failure { throw failure }
    return (pulled, unavailable)
  }
  private func syncFixed(_ snap: AccountSnapshot, consent: Bool) async throws {
    let g = snap.generation
    let ownId = stateStore.state.deviceId
    do {
      let (pulled, unavailable) = try await readFixed(snap, consent: consent)
      let iconsUnavailable = unavailable.contains(.icons)
      let sendsUnavailable = unavailable.contains(.sends)
      let closedRevisionBefore = closedRevision
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
      // With the Spaces switch on the snapshot's tabs carry their shared Space,
      // and a change of membership alone gives the entry a fresh clock
      // (desktop's tabsync), so an older sidecar binding can't tie and win.
      let sharedSource = sharedTabsSource
      let snapshotTabs: [SnapshotTab] =
        stateStore.state.syncTabs
        ? (sharedSource?().map { (t: SnapshotTab) -> SnapshotTab in
          var tab = t
          if !consent { tab.sharedSpaceId = nil }
          return tab
        }
          ?? tabsSource().map { (t: (url: String, title: String)) -> SnapshotTab in
            SnapshotTab(url: t.url, title: t.title)
          }) : []
      let snapshotGroups = stateStore.state.syncTabs ? (sharedGroupsSource?() ?? []) : []
      let membership: String? =
        consent && sharedSource != nil && stateStore.state.syncTabs ? TabSnapshots.membership(snapshotTabs) : nil
      if stateStore.state.syncTabs || announcesPresence {
        let previous = mergedSession["devices"]?[stateStore.state.deviceId]
        mergedSession = replacingOwn(
          in: mergedSession,
          entry: TabSnapshots.ownEntry(
            tabs: snapshotTabs, groups: snapshotGroups, previous: previous, now: clock(), membership: membership,
            previousMembership: session["membership"]?.string))
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
        // The sidecar describes exactly the entry the Worker now holds (M16 §8).
        if consent, let own = uploadedSession["devices"]?[ownId], own["retracted"]?.isTruthy != true,
          let at = own["updatedAt"]?.integer,
          let binding = SharedSidecar.ownEntry(
            forUpdatedAt: at, bindings: TabSnapshots.bindings(tabs: snapshotTabs, entry: own), now: clock())
        {
          sharedState.setOwnSidecar(binding, deviceId: ownId)
        }
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
      // Recently closed and the shared sidecar (M16 §7, §8): Spaces stores,
      // optional, synced only under the Spaces switch.
      var mergedClosed = closed
      if consent, spacesConsent, !unavailable.contains(.closed) {
        do { mergedClosed = try await syncClosed(remote: pulled[.closed], snap) } catch let error
          where (error as? SyncError) != .stale
        {
          if (error as? SyncError) == .unknownStore { markSpacesUnavailable() }
        }
        try check(g)
      }
      if consent, spacesConsent, !unavailable.contains(.shared) {
        do { try await syncSidecar(remote: pulled[.shared], snap) } catch let error
          where (error as? SyncError) != .stale
        {
          if (error as? SyncError) == .unknownStore { markSpacesUnavailable() }
        }
        try check(g)
      }
      // A page closed during the uploads above stays, and goes out next.
      if closedRevision != closedRevisionBefore {
        mergedClosed["devices"] = SyncedClosed.mergeDevices(
          local: closed["devices"], remote: mergedClosed["devices"], ownId: ownId, now: Double(clock()))
        var dismissed = mergedClosed["dismissed"] ?? .object([])
        for (id, at) in closed["dismissed"]?.pairs ?? [] { dismissed[id] = at }
        mergedClosed["dismissed"] = dismissed
        rerunRequested = true
      }
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
      // Kept locally beside the snapshot: what the last published entry's
      // membership was, for the next entry's clock.
      session["membership"] = membership.map(JSONValue.string)
      icons = mergedIcons
      sends = localSends(devices: mergedSendDevices)
      closed = mergedClosed
      if settingsRevision != revisionBeforeWrite { rerunRequested = true }
      for (store, value) in [
        (SyncStore.settings, settings.payload()), (.session, session), (.icons, icons),
        (.bookmarks, savedFavorites), (.sends, sends), (.closed, closed),
      ] { try stateStore.save(store, value) }
      try stateStore.update {
        $0.lastError = nil
        $0.lastSyncedAt = clock()
      }
      settingsSink(settings)
      refreshViews()
      onChanged?()
    }
  }

  // MARK: Recently closed and the sidecar (M16 §7, §8)

  /// Desktop's `synced-closed.js`: merge, refresh this phone's entry, PUT when
  /// it differs. Presence alone never creates the store.
  private func syncClosed(remote: (String, JSONValue)?, _ snap: AccountSnapshot) async throws -> JSONValue {
    let ownId = stateStore.state.deviceId
    let now = Double(clock())
    var devices = closed["devices"] ?? .object([])
    if let remote {
      devices = SyncedClosed.mergeDevices(local: devices, remote: remote.1["devices"], ownId: ownId, now: now)
    }
    var withOwn = devices
    withOwn[ownId] =
      SyncedClosed.ownEntry(previous: devices[ownId], name: "iPhone", platform: "ios", now: now).entry
    devices = SyncedClosed.mergeDevices(local: withOwn, remote: nil, ownId: ownId, now: now)
    let payload: JSONValue = .object([("devices", SyncedClosed.applyBudget(devices, ownId: ownId))])
    var published = closed["published"] == .bool(true)
    let ownItems = !(payload["devices"]?[ownId]?["items"]?.array.isEmpty ?? true)
    if remote == nil && !ownItems {
      // Nothing to publish into a store that doesn't exist yet.
    } else if let remote,
      (remote.1["devices"] ?? .object([])).canonical() == (payload["devices"] ?? .object([])).canonical()
    {
      published = published || remote.1["devices"]?[ownId] != nil
    } else {
      let uploaded = try await writeMerged(.closed, payload: payload, remote: remote, snapshot: snap)
      devices = SyncedClosed.mergeDevices(local: devices, remote: uploaded["devices"], ownId: ownId, now: now)
      published = true
    }
    return .object([
      ("devices", devices),
      ("dismissed", SyncedClosed.pruneDismissed(closed["dismissed"] ?? .object([]), now: now)),
      ("published", .bool(published)),
    ])
  }
  /// Desktop's `shared` store: every peer's binding is kept; this phone's
  /// binding goes out with the snapshot it describes.
  private func syncSidecar(remote: (String, JSONValue)?, _ snap: AccountSnapshot) async throws {
    let ownId = stateStore.state.deviceId
    if let remote {
      // An oversized sidecar can't be trusted; ours mustn't overwrite its peers either.
      guard remote.1.jsStringify().utf8.count <= SharedSidecar.maxBytes, sharedState.mergeSidecar(remote.1)
      else { return }
    }
    guard let payload = sharedState.exportSidecar(deviceId: ownId) else { return }
    let publishable = (payload["devices"]?.pairs ?? []).contains { (_: String, entry: JSONValue) -> Bool in
      !(entry["tabs"]?.array.isEmpty ?? true)
    }
    if remote == nil && !publishable { return }
    if let remote, remote.1.canonical() == payload.canonical() { return }
    _ = try await writeMerged(.shared, payload: payload, remote: remote, snapshot: snap)
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
      } catch SyncError.rateLimited {
        // A PUT the Worker refused for load backs the window off like a GET's 429.
        queue.noteRateLimited()
        throw SyncError.rateLimited
      } catch SyncError.conflict {
        try check(snap.generation)
        guard attempt < 3 else { throw SyncError.conflict(version: nil) }
        // The retry's merge-first GET is spent from the request window (M16 §3.6).
        let latest = try await scheduledGet(
          "F", store.rawValue, accountId: snap.accountId, generation: snap.generation)
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
        } else if store == .closed {
          let ownId = stateStore.state.deviceId
          value = .object([
            (
              "devices",
              SyncedClosed.applyBudget(
                SyncedClosed.mergeDevices(
                  local: value["devices"], remote: current?.1["devices"], ownId: ownId,
                  now: Double(clock())), ownId: ownId)
            )
          ])
        } else if store == .shared {
          // Peers' bindings that arrived meanwhile are kept; an oversized
          // store holds publication, as on desktop.
          guard let latest = current?.1, latest.jsStringify().utf8.count <= SharedSidecar.maxBytes,
            sharedState.mergeSidecar(latest),
            let next = sharedState.exportSidecar(deviceId: stateStore.state.deviceId)
          else { throw SyncError.cancelled }
          value = next
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
  /// Whether this phone may be on the others' device lists: it shares its
  /// tabs, or a pass published its presence. A phone that never published
  /// sends nothing to the old account when it leaves.
  private var listedInTabList: Bool {
    if stateStore.state.syncTabs { return true }
    guard let own = session["devices"]?[stateStore.state.deviceId] else { return false }
    return own["retracted"]?.isTruthy != true
  }
  /// Leaving a sync (turning it off, or switching to another) must never depend
  /// on the network or on the key still being there (a backup restored to a new
  /// phone keeps sync.json but not the device-only key). Try to take this phone
  /// off the others' device lists; only an entry the server holds is retracted,
  /// and if that can't happen, the entry ages out after 30 days like any silent
  /// device's.
  private func retractBestEffort() async {
    // Leaving never waits for (or refills) the request window, as on desktop.
    guard queue.canRequest, let snap = try? snapshot() else { return }
    try? await retract(snap, leaving: true)
  }
  /// Turning sharing off (`leaving: false`) replaces this phone's tabs with its
  /// presence alone, whose fresh clock beats every stale copy of the tabs;
  /// leaving the sync (`leaving: true`) publishes a retraction.
  private func retract(_ snap: AccountSnapshot, leaving: Bool = false) async throws {
    let item = try await scheduledGet(
      "F", "session", accountId: snap.accountId, generation: snap.generation)
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
    debouncedPublish(15_000)
  }
  /// Tab Sync's trailing debounce, bounded: never later than a minute past
  /// the first unpublished change.
  private func debouncedPublish(_ delay: Int64) {
    if firstPending == nil { firstPending = clock() }
    schedulePublish(delay: min(delay, max(0, (firstPending ?? clock()) + 60_000 - clock())))
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
    // A focus refresh makes the index due; it waits its turn and never moves
    // the class cursor, so focus events can't starve the other classes.
    if spacesConsent { queue.markIndexDue() }
    await syncNow()
  }
  private func refreshViews() {
    var names: [String: String] = [:]
    for (id, entry) in settings.payload()["values"]?["deviceNames"]?.pairs ?? [] {
      names[id] = entry["name"]?.text ?? ""
    }
    remoteDevices = TabSnapshots.devices(
      visibleSessionDevices(), excluding: stateStore.state.deviceId, names: names)
    spacesEnabled = stateStore.state.enabled && sharedState.isEnabled
    spacesRevision += 1
    libraryCount = SharedSpacesSharing.liveCount(sharedState.data["index"])
    spacesBusy = sharedState.isEnabled && queue.consecutiveRateLimits >= 2
    spacesSlowed = sharedState.isEnabled && queue.snapshot.windowLimit < 10
    favorites = SyncedFavorites.list(stateStore.load(.bookmarks) ?? .object([]))
    let ownId = stateStore.state.deviceId
    inbox = SyncSends.inbox(
      sends["devices"] ?? .object([]), ownId: ownId, dismissed: dismissedIds, now: Double(clock()))
    sendTargets = SyncSends.targets(
      sends: sends["devices"] ?? .object([]), session: session["devices"] ?? .object([]),
      ownId: ownId, names: names)
    // Each page once: a row this phone also holds as its own close isn't listed again.
    let own = Set(
      (closed["devices"]?[ownId]?["items"]?.array ?? []).compactMap { (v: JSONValue) -> String? in
        v["id"]?.string
      })
    closedInbox =
      stateStore.state.enabled && sharedState.isEnabled
      ? SyncedClosed.inbox(
        closed["devices"] ?? .object([]), ownId: ownId, dismissed: closed["dismissed"] ?? .object([]),
        now: Double(clock())
      ).filter { (row: ClosedRow) -> Bool in !own.contains(row.id) } : []
  }

  /// The session entries with every tab another device placed in a shared
  /// Space this phone shows taken out (M16 §8, desktop's `hideOccurrences`),
  /// so Other devices, the start page and the Quick Switcher list it once.
  private func visibleSessionDevices() -> JSONValue {
    let devices = session["devices"] ?? .object([])
    guard stateStore.state.enabled, sharedState.isEnabled else { return devices }
    let visible = Set(sharedState.spaceIds.filter { (id: String) -> Bool in sharedState.blob(id) != nil })
    let hidden = SharedSidecar.hiddenIndices(
      devices: sharedState.data["sidecar"]?["devices"] ?? .object([]), sessionEntries: devices,
      visibleSpaceIds: visible)
    guard !hidden.isEmpty else { return devices }
    var out = devices
    for (id, indices) in hidden {
      guard var entry = out[id], let tabs = entry["tabs"]?.array else { continue }
      entry["tabs"] = .array(tabs.enumerated().filter { !indices.contains($0.offset) }.map(\.element))
      out[id] = entry
    }
    return out
  }
  /// A shared Space's sync state for its mark (M16 §10, desktop's
  /// `markState`): unavailable, full, not synced (a push failing for over an
  /// hour, or tabs past the budget), waiting to upload, or shared.
  enum SpaceSyncState: Equatable {
    case shared, waiting, full, unavailable
    case notSynced(since: Int64?)
  }
  func spaceSyncState(_ sharedId: String) -> SpaceSyncState {
    _ = spacesRevision
    if spacesAvailability == .unavailable { return .unavailable }
    let entry = sharedState.data["blobs"]?[sharedId]
    if let reason = entry?["reason"]?.string, Self.fullReasons.contains(reason) { return .full }
    let published = entry?["lastPublishedAt"]?.integer
    if let failed = entry?["failedAt"]?.integer, clock() - (published ?? failed) > 3_600_000 {
      return .notSynced(since: published)
    }
    if !unsyncedTabIds(sharedId).isEmpty { return .notSynced(since: published) }
    if sharedState.hasPendingEdits(sharedId) || sharedState.data["pending"]?[sharedId]?["index"] != nil {
      return .waiting
    }
    return .shared
  }
  private static let fullReasons: Set<String> = [
    "full", "tombstones", "tabs", "remote-over-budget", "required-state-over-budget",
  ]
  /// Tabs of a full Space whose records couldn't be uploaded (desktop's `unsyncedTabIds`).
  func unsyncedTabIds(_ sharedId: String) -> Set<String> {
    _ = spacesRevision
    let entry = sharedState.data["blobs"]?[sharedId]
    return Set(
      (entry?["unsynced"]?.array ?? []).compactMap { (v: JSONValue) -> String? in
        guard let id = v.string, SharedSpacesModel.isId(id), entry?["blob"]?["tabs"]?[id] != nil else { return nil }
        return id
      })
  }
  /// Settings → Sync's status lines (M16 §5, §6.2), as catalog keys.
  var spacesStatusKeys: [String] {
    guard spacesEnabled else { return [] }
    let reasons = (sharedState.data["blobs"]?.pairs ?? []).compactMap { (_: String, entry: JSONValue) -> String? in
      entry["reason"]?.string
    }
    var keys: [String] = []
    if reasons.contains(where: { Self.fullReasons.contains($0) && $0 != "tombstones" }) { keys.append("sharedSpaces.capacity") }
    if reasons.contains("tombstones") { keys.append("sharedSpaces.tombstones") }
    if spacesBusy { keys.append("sharedSpaces.busy") }
    if spacesSlowed { keys.append("sharedSpaces.slowed") }
    return keys
  }
  /// The name a device goes by here: the one chosen for it, else the one it
  /// publishes in Tab Sync, Send to device or Recently closed.
  func deviceName(for id: String) -> String? {
    if let chosen = settings.payload()["values"]?["deviceNames"]?[id]?["name"]?.text, !chosen.isEmpty {
      return chosen
    }
    for store in [session, sends, closed] {
      if let name = store["devices"]?[id]?["name"]?.text, !name.isEmpty { return name }
    }
    return nil
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
      let item = try await scheduledGet(
        "F", "sends", accountId: snap.accountId, generation: snap.generation)
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
    guard sends["devices"]?[ownId] != nil, queue.canRequest, let snap = try? snapshot() else { return }
    guard
      let item = try? await scheduledGet(
        "F", "sends", accountId: snap.accountId, generation: snap.generation),
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

  // MARK: Shared Spaces (M16 §3, §6; design §6, §9–§11)

  /// Turns "Keep Spaces and groups in sync on this iPhone" on or off. Off
  /// keeps every local copy and record; nothing is deleted or retracted.
  func setSpacesEnabled(_ on: Bool) {
    guard stateStore.state.enabled, let accountId = stateStore.state.accountId, !transitioning else {
      return
    }
    sharedState.rebind(accountId: accountId)
    guard sharedState.setEnabled(on) else { return }
    // Trying again after "isn't available" asks the Worker once more.
    if on, spacesAvailability == .unavailable { spacesAvailability = .unknown }
    queue.flushCancelled()
    refreshViews()
    onChanged?()
    schedulePublish(delay: 1000)
  }
  /// A shared Space changed here (the adapter noted its edits): push it on
  /// Tab Sync's debounce; the push rides the next class S turn.
  func spacesChanged() {
    guard stateStore.state.enabled, sharedState.isEnabled, !transitioning else { return }
    debouncedPublish(15_000)
  }
  /// A page this phone closed, itself or by applying a remote close: into
  /// its `closed` entry (http(s) only, never private; the caller leaves
  /// private tabs out), only while the Spaces switch is on.
  func recordClosed(url: String, title: String, id: String, spaceId: String?) {
    guard stateStore.state.enabled, sharedState.isEnabled, !transitioning else { return }
    let ownId = stateStore.state.deviceId
    let now = Double(clock())
    let item: JSONValue = .object([
      ("id", .string(id)), ("url", .string(url)), ("title", .string(title)), ("closedAt", .number(now)),
      ("spaceId", spaceId.map(JSONValue.string) ?? .null),
    ])
    var devices = closed["devices"] ?? .object([])
    guard
      let entry = SyncedClosed.addItem(
        to: devices[ownId], item: item, name: "iPhone", platform: "ios", now: now)
    else { return }
    devices[ownId] = entry
    closed["devices"] = devices
    closedChanged()
    debouncedPublish(4_000)
  }
  /// Hides another device's row on this phone (desktop's Forget).
  func forgetClosed(id: String) {
    guard closedInbox.contains(where: { (row: ClosedRow) -> Bool in row.id == id }) else { return }
    var dismissed = closed["dismissed"] ?? .object([])
    dismissed[id] = .number(Double(clock()))
    closed["dismissed"] = dismissed
    closedChanged()
  }
  /// Clear all: this phone's own entry is emptied and every remote row hidden.
  func clearClosed() {
    guard stateStore.state.enabled else { return }
    let ownId = stateStore.state.deviceId
    let now = Double(clock())
    let rows = closedInbox
    var devices = closed["devices"] ?? .object([])
    var entry =
      SyncedClosed.ownEntry(previous: devices[ownId], name: "iPhone", platform: "ios", now: now, force: true)
      .entry
    let ownIds = (entry["items"]?.array ?? []).compactMap { (v: JSONValue) -> String? in v["id"]?.string }
    entry["items"] = .array([])
    devices[ownId] = entry
    closed["devices"] = devices
    var dismissed = closed["dismissed"] ?? .object([])
    for id in ownIds + rows.map(\.id) { dismissed[id] = .number(now) }
    closed["dismissed"] = dismissed
    closedChanged()
    if sharedState.isEnabled { debouncedPublish(4_000) }
  }
  private func closedChanged() {
    closedRevision += 1
    try? stateStore.save(.closed, closed)
    refreshViews()
    onChanged?()
  }

  /// Reads the library index (desktop's `sharedIndexPreview`), switch on or
  /// off, merging it into the Spaces state; at most once a minute. False when
  /// it couldn't be read or the Worker has no Spaces stores.
  func previewIndex() async -> Bool {
    guard stateStore.state.enabled, !transitioning, let snap = try? snapshot() else { return false }
    if let last = lastPreview, clock() - last.at < 60_000 { return last.ok }
    var ok = false
    do {
      let item = try await scheduledGet("I", "spaces", accountId: snap.accountId, generation: snap.generation)
      sharedState.rebind(accountId: snap.accountId)
      noteSpacesAvailable()
      if let item, try sharedState.mergeIndex(try decode(item.blob, key: snap.key)) {
        reportMerged(["index"])
      }
      ok = true
    } catch SyncError.unknownStore {
      markSpacesUnavailable()
    } catch {}
    guard snap.generation == generation else { return false }
    lastPreview = (clock(), ok)
    refreshViews()
    onChanged?()
    return ok
  }
  /// One Space's blob for its review sheet (Bring a Space), sanitized. It is
  /// never merged into or written to the Spaces state.
  func previewSpace(id: String) async -> JSONValue? {
    guard let name = SyncStore.spaceName(id), stateStore.state.enabled, !transitioning,
      let snap = try? snapshot()
    else { return nil }
    do {
      guard
        let item = try await scheduledGet(
          "S", name, accountId: snap.accountId, generation: snap.generation)
      else { return nil }
      noteSpacesAvailable()
      let blob = SharedSpacesModel.sanitizeBlob(try decode(item.blob, key: snap.key))
      return blob?["spaceId"] == .string(id) ? blob : nil
    } catch SyncError.unknownStore {
      markSpacesUnavailable()
      return nil
    } catch {
      return nil
    }
  }

  private func reportMerged(_ ids: [String]) {
    guard !ids.isEmpty else { return }
    onSpacesMerged?(ids)
  }
  private func noteSpacesAvailable() {
    if spacesAvailability != .available { spacesAvailability = .available }
  }
  /// An older Worker (Review Focus 5): the switch turns off, Spaces requests
  /// still waiting are dropped, and every other store keeps syncing.
  private func markSpacesUnavailable() {
    spacesAvailability = .unavailable
    if sharedState.isEnabled { sharedState.setEnabled(false) }
    queue.flushCancelled()
    refreshViews()
    onChanged?()
  }
  private func spaceCancelled(_ id: String) -> Error? {
    if !spacesConsent { return SyncError.cancelled }
    if !sharedState.deletedSpaceIds.contains(id), sharedState.isDormant(id) || sharedState.isDraft(id) {
      return SyncError.cancelled
    }
    return nil
  }
  private func needsSync(_ id: String) -> Bool {
    sharedState.deletedSpaceIds.contains(id) || sharedState.hasPendingEdits(id)
      || sharedState.revisionDiffers(id)
  }

  /// The Spaces half of a pass (desktop's `syncNow` with consent): the index,
  /// class S for Spaces with pending writes or a moved revision, class R for
  /// every Space (not awaited: it rotates on across passes), then the index
  /// again when a blob was written, so the blob always lands first (§3.6).
  private func syncSpaces(_ snap: AccountSnapshot) async {
    let g = snap.generation
    var served = Set<String>()
    var pushes: [Task<SpaceOutcome, Never>] = []
    func push(_ ids: [String]) {
      for id in ids where !served.contains(id) && needsSync(id) {
        served.insert(id)
        pushes.append(Task { () async -> SpaceOutcome in await self.syncSpace(id, cls: "S", snap) })
      }
    }
    let before = Set(sharedState.spaceIds + sharedState.deletedSpaceIds)
    let index = Task { () async -> SpaceOutcome in await self.syncIndex(snap) }
    push(before.sorted(by: utf16Less))
    for id in before.sorted(by: utf16Less) { reconcile(id, snap) }
    _ = await index.value
    var wrote = false
    for task in pushes {
      let outcome = await task.value
      wrote = wrote || outcome.stored || outcome.needsIndex
    }
    guard g == generation, spacesConsent else { return }
    // Spaces the index just named, and revisions it just moved.
    let after = Set(sharedState.spaceIds + sharedState.deletedSpaceIds)
    let offset = pushes.count
    push(after.sorted(by: utf16Less))
    for id in after.subtracting(before).sorted(by: utf16Less) { reconcile(id, snap) }
    for task in pushes[offset...] {
      let outcome = await task.value
      wrote = wrote || outcome.stored || outcome.needsIndex
    }
    if wrote, g == generation, spacesConsent { _ = await syncIndex(snap) }
    guard g == generation else { return }
    refreshViews()
    onChanged?()
  }
  /// Class R: re-read Space `id` regardless of its revision. A waiting read
  /// takes later passes' requests too; one that wrote the blob schedules the
  /// index publish.
  private func reconcile(_ id: String, _ snap: AccountSnapshot) {
    let token = UUID()
    reconciling[token] = Task { () async -> Void in
      let outcome = await self.syncSpace(id, cls: "R", snap)
      self.reconciling[token] = nil
      if outcome.stored || outcome.needsIndex, snap.generation == self.generation, self.spacesConsent {
        self.schedulePublish(delay: 4_000)
      }
    }
  }
  private func syncSpace(_ id: String, cls: String, _ snap: AccountSnapshot) async -> SpaceOutcome {
    guard let name = SyncStore.spaceName(id) else { return SpaceOutcome() }
    let g = snap.generation
    let outcome = Box(SpaceOutcome())
    let stale = staleCheck(g)
    let error = await queue.enqueue(
      cls: cls, item: name, key: cls == "R" ? "R:\(g)" : UUID().uuidString, coalesce: cls == "R",
      priority: sharedState.hasPendingEdits(id) ? 0 : 1,
      cancelled: { [weak self] () -> Error? in stale() ?? self?.spaceCancelled(id) },
      run: { [weak self] (attempt: Int) async throws -> SyncRequestQueue.Step in
        guard let self else { throw SyncError.stale }
        return try await self.pushSpace(id, name: name, snap, attempt: attempt, into: outcome)
      })
    guard g == generation else { return outcome.value }
    switch error as? SyncError {
    case .unknownStore?: markSpacesUnavailable()
    case .cancelled?, .stale?: break
    default: sharedState.noteSpaceOutcome(id: id, failed: error != nil)
    }
    return outcome.value
  }
  /// Desktop's `syncOne` for `space-<id>`: merge-first GET, the push plan,
  /// a PUT with `ifVersion`, and a 409 back into the rotation (three retries).
  private func pushSpace(
    _ id: String, name: String, _ snap: AccountSnapshot, attempt: Int, into outcome: Box<SpaceOutcome>
  ) async throws -> SyncRequestQueue.Step {
    let g = snap.generation
    let item = try await request { try await client.get(snap.accountId, storeName: name) }
    try check(g)
    noteSpacesAvailable()
    let remote = try item.map { (fetched: (version: String, blob: SyncEnvelope)) -> JSONValue in
      try decode(fetched.blob, key: snap.key)
    }
    var plan: PushPlan?
    let payload: JSONValue
    if sharedState.deletedSpaceIds.contains(id) {
      // A deleted Space keeps its index tombstone; its content goes at once,
      // and no tab edit is replayed into it.
      payload = .object([
        ("v", .number(1)), ("spaceId", .string(id)), ("groups", .object([])), ("tabs", .object([])),
      ])
      if remote == nil || remote?.canonical() == payload.canonical() { return .done }
    } else {
      let before = (sharedState.blob(id) ?? .null).canonical()
      let p = try sharedState.mergeSpace(
        id: id, remote: remote, version: item?.version, deviceId: stateStore.state.deviceId,
        now: clock(),
        encrypt: { (text: String) throws -> SyncEnvelope in
          try SyncCrypto.seal(Data(text.utf8), key: snap.key)
        })
      if (sharedState.blob(id) ?? .null).canonical() != before { reportMerged([id]) }
      guard let upload = p.upload?["blob"] else {
        outcome.value.needsIndex = p.indexEntry != nil
        return .done
      }
      plan = p
      payload = upload
    }
    var stored = false
    defer {
      if let plan { sharedState.settleSpace(id: id, plan: plan, blobStored: stored, indexStored: false) }
    }
    let blob = try SyncCrypto.seal(Data(payload.jsStringify().utf8), key: snap.key)
    guard try JSONEncoder().encode(blob).count <= 524_288 - 4096 else { throw SyncError.tooLarge }
    try check(g)
    do {
      _ = try await request {
        try await client.put(snap.accountId, storeName: name, ifVersion: item?.version, blob: blob)
      }
    } catch SyncError.conflict {
      try check(g)
      if attempt < 3 { return .retry }
      throw SyncError.conflict(version: nil)
    } catch SyncError.notFound {
      throw SyncError.unknownStore
    }
    try check(g)
    stored = true
    outcome.value.stored = true
    return .done
  }
  private func syncIndex(_ snap: AccountSnapshot) async -> SpaceOutcome {
    let g = snap.generation
    let outcome = Box(SpaceOutcome())
    let stale = staleCheck(g)
    let error = await queue.enqueue(
      cls: "I", item: "spaces", key: UUID().uuidString,
      cancelled: { [weak self] () -> Error? in
        stale() ?? ((self?.spacesConsent ?? false) ? nil : SyncError.cancelled)
      },
      run: { [weak self] (attempt: Int) async throws -> SyncRequestQueue.Step in
        guard let self else { throw SyncError.stale }
        return try await self.pushIndex(snap, attempt: attempt, into: outcome)
      })
    if g == generation, (error as? SyncError) == .unknownStore { markSpacesUnavailable() }
    return outcome.value
  }
  /// Desktop's `syncOne` for `spaces`: merge, export (only Spaces the Worker
  /// named or this phone published, with fresh revision hints), PUT when it
  /// differs; presence alone never creates the store.
  private func pushIndex(_ snap: AccountSnapshot, attempt: Int, into outcome: Box<SpaceOutcome>)
    async throws -> SyncRequestQueue.Step
  {
    let g = snap.generation
    let item = try await request { try await client.get(snap.accountId, storeName: "spaces") }
    try check(g)
    noteSpacesAvailable()
    let remote = try item.map { (fetched: (version: String, blob: SyncEnvelope)) -> JSONValue in
      try decode(fetched.blob, key: snap.key)
    }
    if let remote, try sharedState.mergeIndex(remote) { reportMerged(["index"]) }
    let payload = try sharedState.exportIndex(deviceId: stateStore.state.deviceId, now: clock())
    if remote == nil, payload["spaces"]?.pairs.isEmpty ?? true { return .done }
    if let remote, remote.canonical() == payload.canonical() {
      sharedState.settleIndex(payload, accountId: snap.accountId)
      return .done
    }
    let blob = try SyncCrypto.seal(Data(payload.jsStringify().utf8), key: snap.key)
    guard try JSONEncoder().encode(blob).count <= 524_288 - 4096 else { throw SyncError.tooLarge }
    try check(g)
    do {
      _ = try await request {
        try await client.put(snap.accountId, storeName: "spaces", ifVersion: item?.version, blob: blob)
      }
    } catch SyncError.conflict {
      try check(g)
      if attempt < 3 { return .retry }
      throw SyncError.conflict(version: nil)
    } catch SyncError.notFound {
      throw SyncError.unknownStore
    }
    try check(g)
    sharedState.settleIndex(payload, accountId: snap.accountId)
    outcome.value.stored = true
    return .done
  }
  /// Leaving a sync takes this phone's Recently closed entry back, when it
  /// ever reached the Worker (desktop's `retractSends(…, 'closed')`).
  private func retractClosedBestEffort() async {
    let ownId = stateStore.state.deviceId
    guard closed["published"] == .bool(true), queue.canRequest, let snap = try? snapshot() else { return }
    guard
      let item = try? await scheduledGet(
        "F", "closed", accountId: snap.accountId, generation: snap.generation),
      generation == snap.generation, let current = try? decode(item.blob, key: snap.key),
      let own = current["devices"]?[ownId], own["retracted"]?.isTruthy != true
    else { return }
    var devices = current["devices"] ?? .object([])
    let previous = own["updatedAt"]?.number ?? 0
    devices[ownId] = .object([
      ("retracted", .bool(true)), ("updatedAt", .number(max(Double(clock()), previous + 1))),
    ])
    _ = try? await writeMerged(
      .closed, payload: .object([("devices", devices)]), remote: (item.version, current),
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
