import Foundation
import CryptoKit
import Security

nonisolated struct PairPayload: Codable, Equatable, Sendable {
    let v: Int
    let handle: String
    let accountId: String
    let key: String
}

nonisolated enum SyncPairing {
    static let alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
    private static let recoveryPrefix = "blanc-sync:1:"
    enum Failure: Error { case invalid }

    static func generateCode() -> String {
        let symbols = Array(alphabet.utf8)
        let bound = 256 - 256 % symbols.count
        var output = [UInt8]()
        while output.count < 8 {
            var bytes = [UInt8](repeating: 0, count: 16)
            let status = bytes.withUnsafeMutableBytes {
                SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
            }
            // Security's random generator is expected to be available on every
            // supported device. Never substitute a predictable pairing code.
            precondition(status == errSecSuccess, "Secure random source unavailable")
            for byte in bytes where Int(byte) < bound {
                output.append(symbols[Int(byte) % symbols.count])
                if output.count == 8 { break }
            }
        }
        return String(decoding: output, as: UTF8.self)
    }

    static func normalize(_ input: String) -> String? {
        let text = String(String.UnicodeScalarView(input.uppercased().unicodeScalars.filter { $0 != "-" && !SyncCrypto.isJSWhitespace($0) }))
        guard text.utf8.count == 8, text.allSatisfy({ alphabet.contains($0) }) else { return nil }
        return text
    }

    static func format(_ code: String) -> String {
        String(code.prefix(4)) + "-" + String(code.dropFirst(4))
    }

    static func material(code: String) throws -> (pairId: String, wrapKey: SymmetricKey) {
        guard normalize(code) == code else { throw Failure.invalid }
        let salt = Array("blanc-pair:v1".utf8)
        var root = try Scrypt.derive(password: Array(code.utf8), salt: salt,
                                     n: 32768, r: 8, p: 1, length: 64)
        defer { _ = root.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) } }
        let id = SyncCrypto.hkdf(root, salt: salt, info: "blanc-pair-id/v1")
        return (id.map { String(format: "%02x", $0) }.joined(),
                SymmetricKey(data: SyncCrypto.hkdf(root, salt: salt, info: "blanc-pair-key/v1")))
    }

    static func wrap(_ payload: PairPayload, wrapKey: SymmetricKey,
                     nonce: AES.GCM.Nonce = AES.GCM.Nonce()) throws -> SyncEnvelope {
        try validate(payload)
        return try SyncCrypto.seal(encoded(payload), key: wrapKey, nonce: nonce)
    }

    static func unwrap(_ envelope: SyncEnvelope, wrapKey: SymmetricKey) throws -> PairPayload {
        do { return try decoded(SyncCrypto.open(envelope, key: wrapKey)) }
        catch { throw Failure.invalid }
    }

    static func isRecoveryCode(_ s: String) -> Bool {
        SyncCrypto.trim(s).hasPrefix("blanc-sync:")
    }

    static func encodeRecovery(_ payload: PairPayload) throws -> String {
        try validate(payload)
        return recoveryPrefix + (try encoded(payload)).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func decodeRecovery(_ s: String) throws -> PairPayload {
        let text = SyncCrypto.trim(s)
        guard text.hasPrefix(recoveryPrefix) else { throw Failure.invalid }
        let code = String(text.dropFirst(recoveryPrefix.count))
        guard !code.isEmpty, code.utf8.allSatisfy({
            (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0)
                || $0 == 45 || $0 == 95
        }), code.count % 4 != 1 else { throw Failure.invalid }
        var base64 = code.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64) else { throw Failure.invalid }
        return try decoded(data)
    }

    private static func validate(_ payload: PairPayload) throws {
        guard payload.v == 1, payload.handle.utf16.count >= 2,
              payload.accountId.utf8.count == 64,
              payload.accountId.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              let key = Data(base64Encoded: payload.key), key.count == 32 else { throw Failure.invalid }
    }

    private static func decoded(_ data: Data) throws -> PairPayload {
        do {
            let payload = try JSONDecoder().decode(PairPayload.self, from: data)
            try validate(payload)
            return payload
        } catch { throw Failure.invalid }
    }

    /// JSONEncoder does not preserve member order. Desktop recovery codes encode
    /// exactly v, handle, accountId, key; individually encode strings for escaping.
    private static func encoded(_ payload: PairPayload) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        func string(_ value: String) throws -> String {
            String(decoding: try encoder.encode(value), as: UTF8.self)
        }
        return Data(try "{\"v\":1,\"handle\":\(string(payload.handle)),\"accountId\":\(string(payload.accountId)),\"key\":\(string(payload.key))}".utf8)
    }
}
