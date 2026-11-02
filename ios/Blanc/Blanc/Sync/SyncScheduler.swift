import Foundation

/// Desktop's sync request scheduler (`src/main/sync-scheduler.js`): at most
/// `limit` GETs in any trailing `windowMs`, served round robin over the classes
/// I (the Spaces index), S (Space blobs), F (the fixed stores) and R
/// (recovery), with cursors that survive a restart. Clocks are injected:
/// `now` is wall time, `monotonic` never goes back within a process.
nonisolated struct SyncScheduler {
  static let classes = ["I", "S", "F", "R"]
  static let fixed = ["bookmarks", "settings", "session", "icons", "sends", "closed", "shared"]

  enum Failure: Error, Equatable { case windowExhausted }

  struct Event: Equatable, Sendable {
    let id: Int
    var wall: Int64
    var at: Int64
  }
  struct Snapshot: Equatable, Sendable, Codable {
    var log: [Int64]
    var nextClass: String
    var cursors: [String: String]
    var windowLimit: Int
    var backoffUntil: Int64?
  }

  let limit: Int
  let windowMs: Int64
  private let now: () -> Int64
  private let monotonic: () -> Int64
  private var events: [Event]
  private var nextClass: String
  private var items: [String: String]
  private var indexDue = false
  private var cap: Int
  private var recoverAt: Int64?
  private var eventSerial = 0

  init(limit: Int = 10, windowMs: Int64 = 60_000, log: [Int64] = [], nextClass: String = "I",
    cursors: [String: String] = [:], now: @escaping () -> Int64,
    monotonic: @escaping () -> Int64, windowLimit: Int? = nil, backoffUntil: Int64? = nil)
  {
    precondition(limit >= 1 && windowMs > 0, "Invalid sync request window")
    self.limit = limit
    self.windowMs = windowMs
    self.now = now
    self.monotonic = monotonic
    self.nextClass = Self.classes.contains(nextClass) ? nextClass : "I"
    items = cursors
    cap = min(limit, max(min(3, limit), windowLimit ?? limit))
    let start = monotonic()
    // A restart conservatively charges every recent or future wall timestamp
    // for a whole monotonic window. Neither a restart nor a wall-clock
    // rollback refills it.
    let wall = now()
    events = []
    for t in log.filter({ $0 > wall || wall - $0 < windowMs }).suffix(limit) {
      events.append(Event(id: eventSerial, wall: t, at: start))
      eventSerial += 1
    }
    if cap < limit {
      recoverAt = start + max(0, (backoffUntil ?? wall + 300_000) - wall) + 60_000
    }
  }

  private mutating func refresh() {
    let t = monotonic()
    events = events.filter { t - $0.at < windowMs }
    if let at = recoverAt, t >= at {
      let steps = 1 + (t - at) / 60_000
      cap = min(limit, cap + Int(steps))
      recoverAt = cap == limit ? nil : at + steps * 60_000
    }
  }
  mutating func canRequest() -> Bool {
    refresh()
    return events.count < cap
  }
  mutating func windowFreesAt() -> Int64 {
    refresh()
    if events.count < cap { return now() }
    return now() + max(0, windowMs - (monotonic() - events[events.count - cap].at))
  }
  mutating func record() throws -> Event {
    guard canRequest() else { throw Failure.windowExhausted }
    let event = Event(id: eventSerial, wall: now(), at: monotonic())
    eventSerial += 1
    events.append(event)
    return event
  }
  /// Charges through completion, not just reservation: persisting the log and
  /// network latency could otherwise compress the actual dispatch windows.
  @discardableResult mutating func settle(_ event: Event) -> Event {
    var settled = event
    settled.wall = now()
    settled.at = monotonic()
    if let n = events.firstIndex(where: { $0.id == event.id }) {
      events[n] = settled
    } else {
      events.append(settled)
    }
    return settled
  }
  /// The next request to make, or nil when the window is full or nothing is
  /// due. `work["I"]` non-empty asks for the index, as desktop's `I: true`.
  mutating func next(work: [String: [String]]) -> (cls: String, item: String)? {
    guard canRequest() else { return nil }
    let order: (String) -> Int = { (v: String) -> Int in Self.fixed.firstIndex(of: v) ?? Self.fixed.count }
    let start = Self.classes.firstIndex(of: nextClass) ?? 0
    for n in 0..<4 {
      let kind = Self.classes[(start + n) % 4]
      var candidates: [String]
      if kind == "I" {
        candidates = work["I"]?.isEmpty == false || indexDue ? ["spaces"] : []
      } else {
        var seen = Set<String>()
        candidates = (work[kind] ?? []).filter { seen.insert($0).inserted }
      }
      if candidates.isEmpty { continue }
      if kind == "F" {
        candidates.sort { a, b in order(a) != order(b) ? order(a) < order(b) : utf16Less(a, b) }
      }
      // The caller supplies pending-first S order; otherwise lists are id
      // ordered. Remember a served id rather than an offset into a shrinking list.
      let cursor = items[kind]
      var i: Int
      if let cursor, let found = candidates.firstIndex(of: cursor) {
        i = (found + 1) % candidates.count
      } else if let cursor, kind != "F" {
        i = candidates.firstIndex { utf16Less(cursor, $0) } ?? 0
      } else if let cursor {
        i = candidates.firstIndex { order($0) > order(cursor) } ?? 0
      } else {
        i = 0
      }
      let item = candidates[i]
      items[kind] = item
      nextClass = Self.classes[((Self.classes.firstIndex(of: kind) ?? 0) + 1) % 4]
      if kind == "I" { indexDue = false }
      return (kind, item)
    }
    return nil
  }
  mutating func markIndexDue() { indexDue = true }
  /// Acceptance runs only: forget every request and any back-off.
  mutating func resetWindow() {
    events = []
    cap = limit
    recoverAt = nil
  }
  mutating func onRateLimited() {
    refresh()
    cap = max(min(3, limit), cap / 2)
    recoverAt = monotonic() + 360_000
  }
  mutating func snapshot() -> Snapshot {
    refresh()
    return Snapshot(
      log: events.map(\.wall), nextClass: nextClass, cursors: items, windowLimit: cap,
      backoffUntil: recoverAt.map { now() + max(0, $0 - monotonic() - 60_000) })
  }
}
