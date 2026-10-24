import Foundation
import CryptoKit

nonisolated struct SyncKeys: Sendable {
    let accountId: String
    let contentKey: SymmetricKey
}

nonisolated struct SyncEnvelope: Codable, Equatable, Sendable {
    let v: Int
    let iv: String
    let ct: String
    let tag: String
}

nonisolated enum SyncCrypto {
    enum Failure: Error { case invalidEnvelope }

    static func deriveKeys(handle: String, passphrase: String) throws -> SyncKeys {
        let normalized = lowercaseLikeJavaScript(trim(handle))
        let salt = Array("blanc-sync:v1:\(normalized)".utf8)
        var root = try Scrypt.derive(password: Array(passphrase.utf8), salt: salt,
                                     n: 32768, r: 8, p: 1, length: 64)
        defer { _ = root.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) } }
        let account = hkdf(root, salt: salt, info: "blanc-sync-id/v1")
        let key = hkdf(root, salt: salt, info: "blanc-sync-enc/v1")
        return SyncKeys(accountId: account.map { String(format: "%02x", $0) }.joined(),
                        contentKey: SymmetricKey(data: key))
    }

    static func hkdf(_ root: [UInt8], salt: [UInt8], info: String) -> [UInt8] {
        HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: root), salt: salt,
                              info: Array(info.utf8), outputByteCount: 32)
            .withUnsafeBytes { Array($0) }
    }

    static func seal(_ plaintext: Data, key: SymmetricKey,
                     nonce: AES.GCM.Nonce = AES.GCM.Nonce()) throws -> SyncEnvelope {
        let sealed = try AES.GCM.seal(plaintext, using: key, nonce: nonce)
        return SyncEnvelope(v: 1, iv: Data(nonce).base64EncodedString(),
                            ct: sealed.ciphertext.base64EncodedString(),
                            tag: sealed.tag.base64EncodedString())
    }

    static func open(_ envelope: SyncEnvelope, key: SymmetricKey) throws -> Data {
        guard envelope.v == 1, let iv = Data(base64Encoded: envelope.iv), iv.count == 12,
              let ciphertext = Data(base64Encoded: envelope.ct),
              let tag = Data(base64Encoded: envelope.tag), tag.count == 16 else {
            throw Failure.invalidEnvelope
        }
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                       ciphertext: ciphertext, tag: tag)
        return try AES.GCM.open(box, using: key)
    }

    // ECMAScript String.trim / \s whitespace, including BOM and excluding NEL.
    // Foundation's whitespace character set differs for both of these scalars.
    static func isJSWhitespace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x09...0x0d, 0x20, 0xa0, 0x1680, 0x2000...0x200a,
             0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff: return true
        default: return false
        }
    }

    /// `String.prototype.toLowerCase`: Unicode's default lowercase mapping per
    /// scalar plus its one context rule, Final_Sigma (Σ becomes ς at the end of a
    /// word). Swift's `lowercased()` always gives σ, which would derive a
    /// different account for a handle such as "ΟΔΟΣ".
    static func lowercaseLikeJavaScript(_ text: String) -> String {
        let scalars = Array(text.unicodeScalars)
        var out = String.UnicodeScalarView()
        for (i, scalar) in scalars.enumerated() {
            if scalar == "\u{03A3}", isFinalSigma(scalars, at: i) {
                out.append("\u{03C2}")
            } else {
                out.append(contentsOf: String(scalar).lowercased().unicodeScalars)
            }
        }
        return String(out)
    }

    /// Final_Sigma: a cased scalar before (skipping case-ignorables), and no cased
    /// scalar after (skipping case-ignorables).
    private static func isFinalSigma(_ scalars: [Unicode.Scalar], at index: Int) -> Bool {
        func cased(in range: some Sequence<Int>) -> Bool {
            for j in range {
                let p = scalars[j].properties
                if p.isCaseIgnorable { continue }
                return p.isCased
            }
            return false
        }
        return cased(in: stride(from: index - 1, through: 0, by: -1))
            && !cased(in: (index + 1)..<scalars.count)
    }

    static func trim(_ text: String) -> String {
        let scalars = text.unicodeScalars
        let start = scalars.firstIndex { !isJSWhitespace($0) } ?? scalars.endIndex
        let end = scalars.lastIndex { !isJSWhitespace($0) }.map { scalars.index(after: $0) } ?? start
        return String(scalars[start..<end])
    }

    static func validHandle(_ handle: String) -> Bool {
        trim(handle).utf16.count >= 2
    }

    static func passphraseStrong(_ passphrase: String) -> Bool {
        if passphrase.utf16.count >= 16 { return true }
        guard passphrase.utf16.count >= 10 else { return false }
        let chars = Array(passphrase.utf16)
        return [chars.contains { (97...122).contains($0) },
                chars.contains { (65...90).contains($0) },
                chars.contains { (48...57).contains($0) },
                chars.contains { !(97...122).contains($0) && !(65...90).contains($0)
                    && !(48...57).contains($0) }].filter { $0 }.count >= 2
    }
}
