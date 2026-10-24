import XCTest
import CryptoKit
@testable import Blanc

final class SyncPairingTests: XCTestCase {
    func testNormalize() {
        XCTAssertEqual(SyncPairing.normalize("k7mr-4px2"), "K7MR4PX2")
        XCTAssertEqual(SyncPairing.normalize("K7MR 4PX2"), "K7MR4PX2")
        XCTAssertEqual(SyncPairing.normalize("\u{feff}K7MR\t4PX2\n"), "K7MR4PX2")
        XCTAssertNil(SyncPairing.normalize("K7MR4PX"))
        XCTAssertNil(SyncPairing.normalize("K7MR4PX0"))
        XCTAssertNil(SyncPairing.normalize("K7MR\u{0085}4PX2"))
        XCTAssertEqual(SyncPairing.format("K7MR4PX2"), "K7MR-4PX2")
    }

    func testMaterialMatchesVectors() throws {
        for vector in try SyncVectors.section("pairing") {
            let input = try XCTUnwrap(vector["input"]), expected = try XCTUnwrap(vector["expected"])
            let normalized = try XCTUnwrap(SyncPairing.normalize(try XCTUnwrap(input["code"]?.string)))
            XCTAssertEqual(normalized, expected["normalized"]?.string)
            let material = try SyncPairing.material(code: normalized)
            XCTAssertEqual(material.pairId, expected["pairId"]?.string)
            XCTAssertEqual(material.wrapKey.withUnsafeBytes { hex(Array($0)) }, expected["wrapKey"]?.string)
        }
        XCTAssertThrowsError(try SyncPairing.material(code: "k7mr-4px2"))
    }

    func testUnwrapDesktopBlob() throws {
        for vector in try SyncVectors.section("pairing") {
            let input = try XCTUnwrap(vector["input"]), expected = try XCTUnwrap(vector["expected"])
            let key = SymmetricKey(data: unhex(try XCTUnwrap(expected["wrapKey"]?.string)))
            let envelope = try decode(SyncEnvelope.self, expected["blob"])
            let payload = try decode(PairPayload.self, input["payload"])
            XCTAssertEqual(try SyncPairing.unwrap(envelope, wrapKey: key), payload)
            XCTAssertEqual(try SyncPairing.wrap(payload, wrapKey: key,
                nonce: AES.GCM.Nonce(data: unhex(try XCTUnwrap(input["iv"]?.string)))), envelope)
        }
    }

    func testRecoveryRoundTripMatchesVector() throws {
        for vector in try SyncVectors.section("recovery") {
            let payload = try decode(PairPayload.self, vector["input"])
            let code = try XCTUnwrap(vector["expected"]?.string)
            XCTAssertEqual(try SyncPairing.encodeRecovery(payload), code)
            XCTAssertEqual(try SyncPairing.decodeRecovery(" \n" + code + "\n"), payload)
            XCTAssertTrue(SyncPairing.isRecoveryCode(code))
        }
        XCTAssertThrowsError(try SyncPairing.decodeRecovery("blanc-sync:2:e30"))
        XCTAssertThrowsError(try SyncPairing.decodeRecovery("blanc-sync:1:!"))
        XCTAssertThrowsError(try SyncPairing.decodeRecovery("blanc-sync:1:e30="))
        XCTAssertFalse(SyncPairing.isRecoveryCode("K7MR4PX2"))
    }

    func testUnwrapRejectsMalformedOrMissingFields() throws {
        let key = SymmetricKey(data: [UInt8](repeating: 1, count: 32))
        let account = String(repeating: "a", count: 64)
        let contentKey = Data(repeating: 2, count: 32).base64EncodedString()
        for invalid in [
            "{\"v\":1,\"handle\":\"Anthony\",\"key\":\"\(contentKey)\"}",
            "{\"v\":1,\"handle\":\"Anthony\",\"accountId\":\"\(account.dropLast())\",\"key\":\"\(contentKey)\"}",
            "{\"v\":2,\"handle\":\"Anthony\",\"accountId\":\"\(account)\",\"key\":\"\(contentKey)\"}",
            "{\"v\":1,\"handle\":\"Anthony\",\"accountId\":\"\(account)\",\"key\":\"AA==\"}",
            "{\"v\":1,\"handle\":\"a\",\"accountId\":\"\(account)\",\"key\":\"\(contentKey)\"}"
        ] {
            let envelope = try SyncCrypto.seal(Data(invalid.utf8), key: key)
            XCTAssertThrowsError(try SyncPairing.unwrap(envelope, wrapKey: key))
        }
        // Like desktop, newer senders may add fields: only the four protocol
        // fields survive decoding; unrelated data never reaches the account.
        let extra = "{\"v\":1,\"handle\":\"Anthony\",\"accountId\":\"\(account)\",\"key\":\"\(contentKey)\",\"future\":true}"
        let envelope = try SyncCrypto.seal(Data(extra.utf8), key: key)
        XCTAssertEqual(try SyncPairing.unwrap(envelope, wrapKey: key),
                       PairPayload(v: 1, handle: "Anthony", accountId: account, key: contentKey))
    }

    func testGenerateCodeUsesAlphabet() {
        var codes = Set<String>()
        for _ in 0..<1000 {
            let code = SyncPairing.generateCode()
            XCTAssertEqual(code.count, 8)
            XCTAssertTrue(code.allSatisfy { SyncPairing.alphabet.contains($0) })
            codes.insert(code)
        }
        XCTAssertEqual(codes.count, 1000)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ value: JSONValue?) throws -> T {
        try JSONDecoder().decode(type, from: Data(try XCTUnwrap(value).jsStringify().utf8))
    }
    private func hex(_ data: [UInt8]) -> String { data.map { String(format: "%02x", $0) }.joined() }
    private func unhex(_ text: String) -> [UInt8] {
        stride(from: 0, to: text.count, by: 2).map {
            let start = text.index(text.startIndex, offsetBy: $0)
            return UInt8(text[start..<text.index(start, offsetBy: 2)], radix: 16)!
        }
    }
}
