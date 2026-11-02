import Foundation

nonisolated protocol SyncTransport: Sendable {
  func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data)
}

nonisolated struct URLSessionSyncTransport: SyncTransport {
  private let session: URLSession
  private let endpoint = URL(string: "https://blanc-sync.bnfy-441.workers.dev")!
  init() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = 20
    session = URLSession(configuration: configuration)
  }
  func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) {
    var request = URLRequest(url: endpoint.appendingPathComponent(path))
    request.httpMethod = method
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Redirecting a credential-bearing locator to another host is never valid.
    let (data, response) = try await session.data(for: request, delegate: NoSyncRedirects())
    guard let response = response as? HTTPURLResponse else { throw SyncError.offline }
    guard data.count <= 768 * 1024 else { throw SyncError.tooLarge }
    return (response.statusCode, data)
  }
}
private nonisolated final class NoSyncRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping @Sendable (URLRequest?) -> Void
  ) { completionHandler(nil) }
}

nonisolated enum SyncStore: String, CaseIterable, Sendable {
  case bookmarks, settings, session, icons, sends
  /// Shared Spaces (M16 §9): the index and the two sidecars; each Space's
  /// own blob is the store `space-<32 lowercase hex>`.
  case spaces, closed, shared
  /// The Worker's store segment for Space `id`, or nil for a bad id.
  static func spaceName(_ id: String) -> String? {
    SharedSpacesModel.isId(id) ? "space-" + id : nil
  }
  static func isValidName(_ name: String) -> Bool {
    if SyncStore(rawValue: name) != nil { return true }
    return name.hasPrefix("space-") && SharedSpacesModel.isId(String(name.dropFirst(6)))
  }
}
nonisolated enum SyncError: Error, Equatable {
  case notFound
  case conflict(version: String?)
  case rateLimited, busy, tooLarge, badPassphrase
  case pairNotFound, pairUnavailable, pairInvalid, offline
  case server(Int)
  case stale, storage, syncOn, syncOff, createOnComputer, wipeUnsupported, accountGone
  /// An older Worker that doesn't serve this store (M7b's `sends`, M16's Spaces stores).
  case unknownStore
  /// A store name the Worker would never serve (not a `SyncStore`, not `space-<id>`).
  case invalidStore
  /// A queued request dropped before it ran (consent off, the pass aborted).
  case cancelled
  var code: String {
    switch self {
    case .notFound: "not-found"
    case .conflict: "conflict"
    case .rateLimited: "rate-limited"
    case .busy: "server-error"
    case .tooLarge: "rejected:413"
    case .badPassphrase: "bad-passphrase"
    case .pairNotFound: "pair-not-found"
    case .pairUnavailable: "pair-unavailable"
    case .pairInvalid: "pair-invalid"
    case .offline: "offline"
    case .server: "server"
    case .stale: "stale"
    case .storage: "credentials-save-failed"
    case .syncOn: "sync-on"
    case .syncOff: "sync-off"
    case .createOnComputer: "create-on-computer"
    case .wipeUnsupported: "wipe-unsupported"
    case .accountGone: "account-gone"
    case .unknownStore: "unknown-store"
    case .invalidStore: "invalid-store"
    case .cancelled: "cancelled"
    }
  }
}

nonisolated struct SyncWorkerClient: Sendable {
  let transport: any SyncTransport
  init(transport: any SyncTransport = URLSessionSyncTransport()) { self.transport = transport }
  private func request(_ method: String, _ path: String, _ body: Data? = nil) async throws -> (
    Int, Data
  ) {
    do {
      let result = try await transport.send(method: method, path: path, body: body)
      switch result.status {
      case 200...299, 404: return (result.status, result.body)
      case 409:
        let version =
          (try? JSONSerialization.jsonObject(with: result.body) as? [String: Any])?["version"]
          as? String
        throw SyncError.conflict(version: version)
      case 413: throw SyncError.tooLarge
      case 429: throw SyncError.rateLimited
      case 503: throw SyncError.busy
      default: throw SyncError.server(result.status)
      }
    } catch let error as SyncError { throw error } catch { throw SyncError.offline }
  }
  private func locator(_ id: String) throws -> String {
    guard id.utf8.count == 64,
      id.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) })
    else { throw SyncError.pairInvalid }
    return id
  }
  private func storePath(_ accountId: String, _ name: String) throws -> String {
    guard SyncStore.isValidName(name) else { throw SyncError.invalidStore }
    return "v1/blob/\(try locator(accountId))/\(name)"
  }
  func get(_ accountId: String, _ store: SyncStore) async throws -> (
    version: String, blob: SyncEnvelope
  )? { try await get(accountId, storeName: store.rawValue) }
  /// GET a fixed store or `space-<id>`. A blob not yet written is nil; `404
  /// unknown store` (an older Worker) throws `unknownStore`.
  func get(_ accountId: String, storeName: String) async throws -> (
    version: String, blob: SyncEnvelope
  )? {
    let (status, body) = try await request("GET", try storePath(accountId, storeName))
    if status == 404 {
      if String(decoding: body, as: UTF8.self) == "unknown store" { throw SyncError.unknownStore }
      return nil
    }
    struct Response: Decodable {
      let version: String
      let blob: SyncEnvelope
    }
    guard let response = try? JSONDecoder().decode(Response.self, from: body) else {
      throw SyncError.server(200)
    }
    return (response.version, response.blob)
  }
  func put(_ accountId: String, _ store: SyncStore, ifVersion: String?, blob: SyncEnvelope)
    async throws -> String
  { try await put(accountId, storeName: store.rawValue, ifVersion: ifVersion, blob: blob) }
  func put(_ accountId: String, storeName: String, ifVersion: String?, blob: SyncEnvelope)
    async throws -> String
  {
    let path = try storePath(accountId, storeName)
    struct Body: Encodable {
      let ifVersion: String?
      let blob: SyncEnvelope
      enum CodingKeys: String, CodingKey { case ifVersion, blob }
      func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let ifVersion {
          try c.encode(ifVersion, forKey: .ifVersion)
        } else {
          try c.encodeNil(forKey: .ifVersion)
        }
        try c.encode(blob, forKey: .blob)
      }
    }
    let (status, data) = try await request(
      "PUT", path, JSONEncoder().encode(Body(ifVersion: ifVersion, blob: blob)))
    if status == 404, String(decoding: data, as: UTF8.self) == "unknown store" {
      throw SyncError.unknownStore
    }
    guard status != 404,
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let version = object["version"] as? String
    else { throw SyncError.notFound }
    return version
  }
  func deleteAccount(_ accountId: String) async throws {
    let (status, _) = try await request("DELETE", "v1/blob/\(locator(accountId))")
    guard status != 404 else { throw SyncError.notFound }
  }
  func postPair(_ pairId: String, blob: SyncEnvelope) async throws {
    struct Body: Encodable { let blob: SyncEnvelope }
    let (status, _) = try await request(
      "POST", "v1/pair/\(locator(pairId))", JSONEncoder().encode(Body(blob: blob)))
    guard status != 404 else { throw SyncError.pairUnavailable }
  }
  func takePair(_ pairId: String) async throws -> SyncEnvelope {
    let (status, data) = try await request("GET", "v1/pair/\(locator(pairId))")
    if status == 404 {
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      throw object?["error"] as? String == "not-found"
        ? SyncError.pairNotFound : SyncError.pairUnavailable
    }
    struct Body: Decodable { let blob: SyncEnvelope }
    guard let response = try? JSONDecoder().decode(Body.self, from: data) else {
      throw SyncError.pairInvalid
    }
    return response.blob
  }
  func deletePair(_ pairId: String) async throws {
    _ = try await request("DELETE", "v1/pair/\(locator(pairId))")
  }
}
