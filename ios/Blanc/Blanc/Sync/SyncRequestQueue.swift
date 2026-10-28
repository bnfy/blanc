import Foundation

/// Desktop's sync request queue (`src/main/sync-request-queue.js`): one GET
/// on the wire at a time, chosen by `SyncScheduler` from everything waiting,
/// so every request the phone makes (a pass, a 409 retry, a preview, a send)
/// stays inside the trailing ten-GET window. An operation's `run` performs
/// its GET (and whatever follows it); returning `.retry` puts it back in the
/// rotation for another turn, as a 409 does on desktop.
@MainActor final class SyncRequestQueue {
  enum Step { case done, retry }
  private final class Op {
    let cls: String
    let item: String
    let key: String
    let priority: Int
    let cancelled: () -> Error?
    let run: (Int) async throws -> Step
    var attempt = 0
    var waiters: [CheckedContinuation<Error?, Never>] = []
    init(cls: String, item: String, key: String, priority: Int, cancelled: @escaping () -> Error?,
      run: @escaping (Int) async throws -> Step)
    {
      self.cls = cls
      self.item = item
      self.key = key
      self.priority = priority
      self.cancelled = cancelled
      self.run = run
    }
  }

  private var scheduler: SyncScheduler
  private let persist: (SyncScheduler.Snapshot) -> Void
  private let now: () -> Int64
  private let sleep: (Int64) async -> Void
  private var waiting: [Op] = []
  private var pumping = false
  private var sleeper: Task<Void, Never>?
  private var idleWaiters: [CheckedContinuation<Void, Never>] = []

  init(scheduler: SyncScheduler, now: @escaping () -> Int64, sleep: @escaping (Int64) async -> Void,
    persist: @escaping (SyncScheduler.Snapshot) -> Void)
  {
    self.scheduler = scheduler
    self.now = now
    self.sleep = sleep
    self.persist = persist
  }

  /// Waits for the operation's turn and returns its error, if any. With
  /// `coalesce`, a waiting operation of the same class, item and key takes
  /// this caller too (desktop's rule for repeated reconciliation reads).
  func enqueue(cls: String, item: String, key: String, coalesce: Bool = false, priority: Int = 1,
    cancelled: @escaping () -> Error?, run: @escaping (Int) async throws -> Step) async -> Error?
  {
    await withCheckedContinuation { (continuation: CheckedContinuation<Error?, Never>) in
      if coalesce, let op = waiting.first(where: { $0.cls == cls && $0.item == item && $0.key == key }) {
        op.waiters.append(continuation)
      } else {
        let op = Op(cls: cls, item: item, key: key, priority: priority, cancelled: cancelled, run: run)
        op.waiters.append(continuation)
        waiting.append(op)
      }
      wake()
    }
  }

  var canRequest: Bool { scheduler.canRequest() }
  var snapshot: SyncScheduler.Snapshot { scheduler.snapshot() }
  /// 429s in a row with no request between them succeeding (M16 §6.2's
  /// "Sync is busy; retrying" after two).
  private(set) var consecutiveRateLimits = 0
  func markIndexDue() { scheduler.markIndexDue() }
  /// A 429 seen outside a queued GET (a PUT): back off as for a GET.
  func noteRateLimited() {
    scheduler.onRateLimited()
    persist(scheduler.snapshot())
  }
  /// Completes every waiting operation whose `cancelled` now answers, at once,
  /// even while the queue waits for the window.
  func flushCancelled() {
    for (n, op) in waiting.enumerated().reversed() {
      if let error = op.cancelled() {
        waiting.remove(at: n)
        complete(op, error)
      }
    }
    wake()
    settleIdle()
  }
  /// Resolves once nothing waits and nothing runs.
  func settled() async {
    if !pumping && waiting.isEmpty { return }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      idleWaiters.append(continuation)
    }
  }

  private func complete(_ op: Op, _ error: Error?) {
    let waiters = op.waiters
    op.waiters = []
    for waiter in waiters { waiter.resume(returning: error) }
  }
  private func settleIdle() {
    guard !pumping, waiting.isEmpty else { return }
    let waiters = idleWaiters
    idleWaiters = []
    for waiter in waiters { waiter.resume() }
  }
  private func wake() {
    sleeper?.cancel()
    guard !pumping else { return }
    pumping = true
    Task { await self.pump() }
  }
  private func pump() async {
    defer {
      pumping = false
      settleIdle()
    }
    while true {
      for (n, op) in waiting.enumerated().reversed() {
        if let error = op.cancelled() {
          waiting.remove(at: n)
          complete(op, error)
        }
      }
      if waiting.isEmpty { return }
      if !scheduler.canRequest() {
        let delay = max(1, scheduler.windowFreesAt() - now())
        let wait = Task { await self.sleep(delay) }
        sleeper = wait
        await wait.value
        sleeper = nil
        continue
      }
      var work: [String: [String]] = ["I": [], "S": [], "F": [], "R": []]
      if waiting.contains(where: { $0.cls == "I" }) { work["I"] = ["spaces"] }
      for op in waiting where op.cls != "I" { work[op.cls, default: []].append(op.item) }
      for kind in ["S", "R"] {
        let rank: (String) -> Int = { (item: String) -> Int in
          self.waiting.first { $0.cls == kind && $0.item == item }?.priority ?? 1
        }
        work[kind] = (work[kind] ?? []).sorted { a, b in
          rank(a) != rank(b) ? rank(a) < rank(b) : utf16Less(a, b)
        }
      }
      guard let pick = scheduler.next(work: work) else {
        // Only an operation in an unknown class can be left: refuse it.
        let stuck = waiting
        waiting = []
        for op in stuck { complete(op, SyncError.cancelled) }
        return
      }
      // A focus refresh can make the index due with no index operation waiting.
      guard let n = waiting.firstIndex(where: { $0.cls == pick.cls && $0.item == pick.item }) else {
        continue
      }
      let op = waiting.remove(at: n)
      guard let event = try? scheduler.record() else {
        waiting.insert(op, at: n)
        continue
      }
      persist(scheduler.snapshot())
      var failure: Error?
      var step = Step.done
      do { step = try await op.run(op.attempt) } catch { failure = error }
      scheduler.settle(event)
      if (failure as? SyncError) == .rateLimited {
        scheduler.onRateLimited()
        consecutiveRateLimits += 1
      } else if failure == nil {
        consecutiveRateLimits = 0
      }
      persist(scheduler.snapshot())
      if failure == nil, let reason = op.cancelled() { failure = reason }
      if failure == nil, step == .retry {
        op.attempt += 1
        waiting.append(op)
      } else {
        complete(op, failure)
      }
    }
  }
}
