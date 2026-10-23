import XCTest
import CryptoKit
@testable import Blanc

final class SyncCryptoTests: XCTestCase {
    func testScryptRFC7914Vectors() throws {
        let vectors: [(String, String, Int, Int, Int, String)] = [
            ("", "", 16, 1, 1,
             "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fc" +
             "d0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906"),
            ("password", "NaCl", 1024, 8, 16,
             "fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162" +
             "2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640")
        ]
        for (password, salt, n, r, p, expected) in vectors {
            let bytes = try Scrypt.derive(password: Array(password.utf8), salt: Array(salt.utf8),
                                          n: n, r: r, p: p, length: 64)
            XCTAssertEqual(hex(bytes), expected)
        }
    }

    func testScryptRejectsInvalidParameters() {
        for (n, r, p, length) in [(0,1,1,64),(1,1,1,64),(3,1,1,64),(16,0,1,64),
                                   (16,1,0,64),(16,1,1,0),(Int.max,8,1,64),
                                   (16,Int.max,1,64),(16,1,Int.max,64)] {
            XCTAssertThrowsError(try Scrypt.derive(password: [], salt: [], n: n, r: r, p: p, length: length))
        }
    }

    func testDeriveKeysMatchesDesktopVectors() throws {
        for vector in try SyncVectors.section("deriveKeys") {
            let input = try XCTUnwrap(vector["input"]), expected = try XCTUnwrap(vector["expected"])
            let keys = try SyncCrypto.deriveKeys(handle: try XCTUnwrap(input["handle"]?.string),
                                                 passphrase: try XCTUnwrap(input["passphrase"]?.string))
            XCTAssertEqual(keys.accountId, expected["accountId"]?.string, vector["name"]?.string ?? "")
            XCTAssertEqual(keys.contentKey.withUnsafeBytes { hex(Array($0)) }, expected["contentKey"]?.string)
        }
    }

    func testOpenDesktopEnvelope() throws {
        for vector in try SyncVectors.section("envelopes") {
            let input = try XCTUnwrap(vector["input"])
            let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: Data(try XCTUnwrap(vector["expected"]).jsStringify().utf8))
            let data = try SyncCrypto.open(envelope, key: SymmetricKey(data: unhex(try XCTUnwrap(input["key"]?.string))))
            XCTAssertEqual(String(decoding: data, as: UTF8.self), input["plaintext"]?.string)
        }
    }

    func testSealWithFixedNonceMatchesVector() throws {
        for vector in try SyncVectors.section("envelopes") {
            let input = try XCTUnwrap(vector["input"])
            let actual = try SyncCrypto.seal(Data(try XCTUnwrap(input["plaintext"]?.string).utf8),
                key: SymmetricKey(data: unhex(try XCTUnwrap(input["key"]?.string))),
                nonce: AES.GCM.Nonce(data: unhex(try XCTUnwrap(input["iv"]?.string))))
            let expected = try JSONDecoder().decode(SyncEnvelope.self, from: Data(try XCTUnwrap(vector["expected"]).jsStringify().utf8))
            XCTAssertEqual(actual, expected)
        }
    }

    func testOpenWithWrongKeyThrows() throws {
        let key = SymmetricKey(data: [UInt8](repeating: 1, count: 32))
        let envelope = try SyncCrypto.seal(Data("private".utf8), key: key)
        XCTAssertThrowsError(try SyncCrypto.open(envelope, key: SymmetricKey(data: [UInt8](repeating: 2, count: 32))))
        for bad in [SyncEnvelope(v: 2, iv: envelope.iv, ct: envelope.ct, tag: envelope.tag),
                    SyncEnvelope(v: 1, iv: "AA==", ct: envelope.ct, tag: envelope.tag),
                    SyncEnvelope(v: 1, iv: envelope.iv, ct: "!", tag: envelope.tag),
                    SyncEnvelope(v: 1, iv: envelope.iv, ct: envelope.ct, tag: "AA==")] {
            XCTAssertThrowsError(try SyncCrypto.open(bad, key: key))
        }
    }

    func testPassphraseStrength() {
        XCTAssertTrue(SyncCrypto.passphraseStrong("aaaaaaaaaaaaaaaa"))
        XCTAssertTrue(SyncCrypto.passphraseStrong("Abcdefghij"))
        XCTAssertFalse(SyncCrypto.passphraseStrong("abcdefghij"))
        XCTAssertFalse(SyncCrypto.passphraseStrong("Ab1"))
        XCTAssertTrue(SyncCrypto.passphraseStrong("🦊🦊🦊🦊🦊🦊🦊🦊")) // JS counts UTF-16 units.
    }

    func testHandleRules() {
        XCTAssertFalse(SyncCrypto.validHandle(" a "))
        XCTAssertTrue(SyncCrypto.validHandle("ab"))
        XCTAssertTrue(SyncCrypto.validHandle("🦊"))
        XCTAssertFalse(SyncCrypto.validHandle("\u{feff}a\u{feff}"))
        XCTAssertTrue(SyncCrypto.validHandle("\u{0085}a")) // NEL is not JS trim whitespace.
    }

    private func hex(_ data: [UInt8]) -> String { data.map { String(format: "%02x", $0) }.joined() }
    private func unhex(_ text: String) -> [UInt8] {
        stride(from: 0, to: text.count, by: 2).map {
            let start = text.index(text.startIndex, offsetBy: $0)
            return UInt8(text[start..<text.index(start, offsetBy: 2)], radix: 16)!
        }
    }
}
