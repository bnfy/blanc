import XCTest

@testable import Blanc

final class SyncSchedulerTests: XCTestCase {
  final class Clock {
    var wall: Int64 = 0
    var mono: Int64 = 0
  }
  func make(_ clock: Clock, _ options: JSONValue? = nil) -> SyncScheduler {
    let o = options ?? .object([])
    var cursors: [String: String] = [:]
    for (k, v) in o["cursors"]?.pairs ?? [] { cursors[k] = v.string }
    return SyncScheduler(
      log: (o["log"]?.array ?? []).compactMap(\.intValue), nextClass: o["nextClass"]?.string ?? "I",
      cursors: cursors, now: { clock.wall }, monotonic: { clock.mono },
      windowLimit: o["windowLimit"]?.intValue.map(Int.init), backoffUntil: o["backoffUntil"]?.intValue)
  }
  func json(_ s: SyncScheduler.Snapshot) -> JSONValue {
    .object([
      ("log", .array(s.log.map { .number(Double($0)) })), ("nextClass", .string(s.nextClass)),
      ("cursors", .object(s.cursors.map { ($0.key, JSONValue.string($0.value)) })),
      ("windowLimit", .number(Double(s.windowLimit))),
      ("backoffUntil", s.backoffUntil.map { .number(Double($0)) } ?? .null),
    ])
  }

  func testScriptMatchesDesktop() throws {
    let steps = try XCTUnwrap(SyncVectors.section("schedulerScript").first?["input"]?["steps"]).array
    XCTAssertGreaterThan(steps.count, 1000)
    let clock = Clock()
    var scheduler: SyncScheduler?
    var events: [SyncScheduler.Event] = []
    var picks = 0
    for (n, step) in steps.enumerated() {
      clock.wall = step["wall"]!.intValue!
      clock.mono = step["mono"]!.intValue!
      let expected = step["expected"]
      let label = "step \(n) \(step["op"]!.string!)"
      switch step["op"]!.string! {
      case "start":
        scheduler = make(clock, step["options"])
        events = []
        XCTAssertEqual(json(scheduler!.snapshot()).canonical(), expected?.canonical(), label)
      case "markIndexDue": scheduler!.markIndexDue()
      case "canRequest": XCTAssertEqual(scheduler!.canRequest(), expected?.bool, label)
      case "windowFreesAt": XCTAssertEqual(scheduler!.windowFreesAt(), expected?.intValue, label)
      case "next":
        var work: [String: [String]] = [:]
        for (k, v) in step["work"]!.pairs {
          work[k] = k == "I" ? (v.bool == true ? ["spaces"] : []) : v.array.compactMap(\.string)
        }
        let pick = scheduler!.next(work: work)
        if pick != nil { picks += 1 }
        XCTAssertEqual(
          pick.map { JSONValue.object([("class", .string($0.cls)), ("item", .string($0.item))]) }?.canonical()
            ?? "null", expected?.canonical(), label)
      case "record":
        let e = try scheduler!.record()
        events.append(e)
        XCTAssertEqual(e.wall, expected?["wall"]?.intValue, label)
        XCTAssertEqual(e.at, expected?["at"]?.intValue, label)
      case "settle":
        let e = scheduler!.settle(events[Int(step["event"]!.intValue!)])
        events[Int(step["event"]!.intValue!)] = e
        XCTAssertEqual(e.wall, expected?["wall"]?.intValue, label)
        XCTAssertEqual(e.at, expected?["at"]?.intValue, label)
      case "rateLimited": scheduler!.onRateLimited()
      case "snapshot":
        XCTAssertEqual(json(scheduler!.snapshot()).canonical(), expected?.canonical(), label)
      default: XCTFail(label)
      }
    }
    XCTAssertGreaterThan(picks, 100)
  }

  /// A simulated hour with a restart, a wall clock that jumps back, 429s and
  /// greedy passes every second: never more than ten in any trailing minute.
  func testNeverMoreThanTenInAnyTrailingMinute() throws {
    let clock = Clock()
    var real: Int64 = 0
    clock.wall = 1_800_000_000_000
    clock.mono = 0
    var scheduler = SyncScheduler(now: { clock.wall }, monotonic: { clock.mono })
    var sent: [Int64] = []
    let work = ["I": ["spaces"], "S": ["a", "b"], "F": SyncScheduler.fixed, "R": ["r"]]
    while real < 3_600_000 {
      if real == 1_800_000 {
        let s = scheduler.snapshot()
        clock.mono = 0
        scheduler = SyncScheduler(
          log: s.log, nextClass: s.nextClass, cursors: s.cursors, now: { clock.wall },
          monotonic: { clock.mono }, windowLimit: s.windowLimit, backoffUntil: s.backoffUntil)
      }
      if real == 2_700_000 { clock.wall -= 900_000 }
      while scheduler.next(work: work) != nil {
        let e = try scheduler.record()
        sent.append(real)
        scheduler.settle(e)
        if sent.count % 37 == 0 { scheduler.onRateLimited() }
      }
      real += 1000
      clock.wall += 1000
      clock.mono += 1000
    }
    XCTAssertGreaterThan(sent.count, 200)
    for (n, t) in sent.enumerated() {
      XCTAssertLessThanOrEqual(sent[n...].prefix { $0 - t < 60_000 }.count, 10, "at \(t)")
    }
  }

  func testOneRequestPerPassServesIDSFRInTurn() throws {
    let clock = Clock()
    clock.wall = 1_800_000_000_000
    var scheduler = SyncScheduler(now: { clock.wall }, monotonic: { clock.mono })
    let work = ["S": ["a", "b"], "F": ["session", "settings"], "R": ["r"]]
    var classes: [String] = []
    for _ in 0..<1000 {
      scheduler.markIndexDue()  // a focus event before every pass
      let pick = try XCTUnwrap(scheduler.next(work: work))
      classes.append(pick.cls)
      scheduler.settle(try scheduler.record())
      clock.wall += 7000
      clock.mono += 7000
    }
    for (n, cls) in classes.enumerated() { XCTAssertEqual(cls, SyncScheduler.classes[n % 4]) }
  }

  func testRecordRefusesAFullWindow() throws {
    let clock = Clock()
    var scheduler = SyncScheduler(limit: 2, now: { clock.wall }, monotonic: { clock.mono })
    _ = try scheduler.record()
    _ = try scheduler.record()
    XCTAssertFalse(scheduler.canRequest())
    XCTAssertThrowsError(try scheduler.record())
    XCTAssertEqual(scheduler.windowFreesAt(), 60_000)
  }
}
