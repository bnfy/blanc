import Foundation
import Observation
import UIKit

struct HistoryEntry: Codable, Equatable {
  let url: String
  var title: String
  var visitedAt: Int64
}

/// The phone's own History, as on desktop (history.js): newest first, web pages
/// only, capped, never synced. Saved to history.json like the session.
@MainActor @Observable final class HistoryStore {
  static let maxEntries = 5000
  private(set) var entries: [HistoryEntry] = []
  @ObservationIgnored private let fileURL: URL
  @ObservationIgnored private let clock: () -> Int64
  @ObservationIgnored private var saveWork: DispatchWorkItem?
  @ObservationIgnored private var backgroundObserver: Any?

  init(
    directory: URL? = nil,
    clock: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
  ) {
    let dir =
      directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    fileURL = dir.appendingPathComponent("history.json")
    self.clock = clock
    struct File: Decodable { let entries: [HistoryEntry] }
    if let data = try? Data(contentsOf: fileURL),
      let file = try? JSONDecoder().decode(File.self, from: data)
    {
      entries = Array(file.entries.prefix(Self.maxEntries))
    }
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.flush() }
    }
  }

  isolated deinit {
    if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
  }

  /// A reload or redirect back to the newest page updates it instead of adding a visit.
  func addVisit(url: URL, title: String) {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return }
    let address = url.absoluteString
    if entries.first?.url == address {
      entries[0].visitedAt = clock()
      if !title.isEmpty { entries[0].title = title }
    } else {
      entries.insert(
        HistoryEntry(url: address, title: title.isEmpty ? address : title, visitedAt: clock()),
        at: 0)
      if entries.count > Self.maxEntries { entries.removeLast(entries.count - Self.maxEntries) }
    }
    scheduleSave()
  }

  /// Pages report their title after the visit is recorded.
  func updateTitle(url: URL, title: String) {
    let address = url.absoluteString
    guard !title.isEmpty, let index = entries.firstIndex(where: { $0.url == address }),
      entries[index].title != title
    else { return }
    entries[index].title = title
    scheduleSave()
  }

  func list(query: String, limit: Int = 500) -> [HistoryEntry] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let matches =
      q.isEmpty
      ? entries
      : entries.filter { $0.url.lowercased().contains(q) || $0.title.lowercased().contains(q) }
    return Array(matches.prefix(max(0, limit)))
  }

  func remove(url: String, visitedAt: Int64) {
    let before = entries.count
    entries.removeAll { $0.url == url && $0.visitedAt == visitedAt }
    if entries.count != before { scheduleSave() }
  }

  func clear() {
    entries = []
    scheduleSave()
  }

  func flush() {
    saveWork?.cancel()
    saveWork = nil
    write()
  }

  private func scheduleSave() {
    saveWork?.cancel()
    let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.write() } }
    saveWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
  }

  private func write() {
    struct File: Encodable { let entries: [HistoryEntry] }
    guard let data = try? JSONEncoder().encode(File(entries: entries)) else { return }
    try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
}
