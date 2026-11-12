import CryptoKit
import Foundation
import Security

@MainActor protocol SyncSecretStore {
  func readKey() throws -> SymmetricKey?
  func writeKey(_ key: SymmetricKey) throws
  func deleteKey() throws
}
struct KeychainSyncSecretStore: SyncSecretStore {
  private var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "me.bnfy.blanc.sync",
      kSecAttrAccount as String: "content-key",
      kSecAttrSynchronizable as String: false,
    ]
  }
  func readKey() throws -> SymmetricKey? {
    var q = query
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data, data.count == 32 else {
      throw SyncError.storage
    }
    return SymmetricKey(data: data)
  }
  func writeKey(_ key: SymmetricKey) throws {
    let data = key.withUnsafeBytes { Data($0) }
    guard data.count == 32 else { throw SyncError.storage }
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    // Updating first preserves the old account key when Keychain rejects a write.
    let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updated == errSecSuccess { return }
    guard updated == errSecItemNotFound else { throw SyncError.storage }
    var q = query
    attributes.forEach { q[$0.key] = $0.value }
    guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw SyncError.storage }
  }
  func deleteKey() throws {
    let result = SecItemDelete(query as CFDictionary)
    guard result == errSecSuccess || result == errSecItemNotFound else { throw SyncError.storage }
  }
}
