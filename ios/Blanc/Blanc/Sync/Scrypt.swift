import Foundation
import CommonCrypto

/// RFC 7914 scrypt. The protocol parameters require 32 MiB of ROMix memory.
/// Kept independent of actors so callers can derive on a detached task.
nonisolated enum Scrypt {
    enum Failure: Error { case invalidParameters, derivationFailed }

    static func derive(password: [UInt8], salt: [UInt8], n: Int, r: Int, p: Int,
                       length: Int) throws -> [UInt8] {
        guard n > 1, n & (n - 1) == 0, r > 0, p > 0, length > 0,
              r <= Int.max / 128, p <= Int.max / (128 * r),
              n <= Int.max / (128 * r), n * 128 * r <= 256 * 1024 * 1024,
              p * 128 * r <= 256 * 1024 * 1024,
              length <= 256 * 1024 * 1024 else { throw Failure.invalidParameters }
        var bytes = try pbkdf(password: password, salt: salt, length: p * 128 * r)
        defer { _ = bytes.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) } }
        let wordsPerBlock = 32 * r
        var block = [UInt32](repeating: 0, count: wordsPerBlock)
        defer { block.withUnsafeMutableBufferPointer { $0.initialize(repeating: 0) } }
        for lane in 0..<p {
            let offset = lane * 128 * r
            for i in 0..<wordsPerBlock {
                let j = offset + i * 4
                block[i] = UInt32(bytes[j]) | UInt32(bytes[j + 1]) << 8
                    | UInt32(bytes[j + 2]) << 16 | UInt32(bytes[j + 3]) << 24
            }
            romix(&block, n: n, r: r)
            for i in 0..<wordsPerBlock {
                let j = offset + i * 4, word = block[i]
                bytes[j] = UInt8(truncatingIfNeeded: word)
                bytes[j + 1] = UInt8(truncatingIfNeeded: word >> 8)
                bytes[j + 2] = UInt8(truncatingIfNeeded: word >> 16)
                bytes[j + 3] = UInt8(truncatingIfNeeded: word >> 24)
            }
        }
        return try pbkdf(password: password, salt: bytes, length: length)
    }

    private static func pbkdf(password: [UInt8], salt: [UInt8], length: Int) throws -> [UInt8] {
        var result = [UInt8](repeating: 0, count: length)
        let status = password.withUnsafeBytes { pass in
            salt.withUnsafeBytes { saltBytes in
                result.withUnsafeMutableBytes { output in
                    CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
                        pass.baseAddress?.assumingMemoryBound(to: Int8.self), password.count,
                        saltBytes.baseAddress?.assumingMemoryBound(to: UInt8.self), salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 1,
                        output.baseAddress!.assumingMemoryBound(to: UInt8.self), length)
                }
            }
        }
        guard status == kCCSuccess else { throw Failure.derivationFailed }
        return result
    }

    // Optimize this bounded, CPU-intensive core even in Debug. A debug build must
    // not turn pairing into a multi-minute main-thread-looking stall.
    @_optimize(speed)
    private static func romix(_ block: inout [UInt32], n: Int, r: Int) {
        let count = block.count
        var memory = [UInt32](repeating: 0, count: n * count)
        var scratch = [UInt32](repeating: 0, count: count)
        var state = [UInt32](repeating: 0, count: 16)
        defer {
            memory.withUnsafeMutableBufferPointer { $0.initialize(repeating: 0) }
            scratch.withUnsafeMutableBufferPointer { $0.initialize(repeating: 0) }
            state.withUnsafeMutableBufferPointer { $0.initialize(repeating: 0) }
        }
        block.withUnsafeMutableBufferPointer { x in
            memory.withUnsafeMutableBufferPointer { v in
                scratch.withUnsafeMutableBufferPointer { y in
                    state.withUnsafeMutableBufferPointer { t in
                        for i in 0..<n {
                            v.baseAddress!.advanced(by: i * count).update(from: x.baseAddress!, count: count)
                            blockMix(x, y, t, r: r)
                        }
                        for _ in 0..<n {
                            // N is a power of two: the low word of Integerify is
                            // sufficient for all supported memory sizes.
                            let j = Int(x[(2 * r - 1) * 16]) & (n - 1)
                            let offset = j * count
                            for k in 0..<count { x[k] ^= v[offset + k] }
                            blockMix(x, y, t, r: r)
                        }
                    }
                }
            }
        }
    }

    @_optimize(speed)
    private static func blockMix(_ block: UnsafeMutableBufferPointer<UInt32>,
                                 _ scratch: UnsafeMutableBufferPointer<UInt32>,
                                 _ state: UnsafeMutableBufferPointer<UInt32>, r: Int) {
        for k in 0..<16 { state[k] = block[(2 * r - 1) * 16 + k] }
        for i in 0..<(2 * r) {
            for k in 0..<16 { state[k] ^= block[i * 16 + k] }
            salsa(state)
            let destination = (i / 2 + (i % 2) * r) * 16
            for k in 0..<16 { scratch[destination + k] = state[k] }
        }
        block.baseAddress!.update(from: scratch.baseAddress!, count: block.count)
    }

    @inline(__always) private static func rotate(_ value: UInt32, _ bits: UInt32) -> UInt32 {
        (value << bits) | (value >> (32 - bits))
    }

    @_optimize(speed)
    private static func salsa(_ b: UnsafeMutableBufferPointer<UInt32>) {
        var x0 = b[0], x1 = b[1], x2 = b[2], x3 = b[3]
        var x4 = b[4], x5 = b[5], x6 = b[6], x7 = b[7]
        var x8 = b[8], x9 = b[9], x10 = b[10], x11 = b[11]
        var x12 = b[12], x13 = b[13], x14 = b[14], x15 = b[15]
        for _ in 0..<4 {
            x4 ^= rotate(x0 &+ x12, 7); x8 ^= rotate(x4 &+ x0, 9)
            x12 ^= rotate(x8 &+ x4, 13); x0 ^= rotate(x12 &+ x8, 18)
            x9 ^= rotate(x5 &+ x1, 7); x13 ^= rotate(x9 &+ x5, 9)
            x1 ^= rotate(x13 &+ x9, 13); x5 ^= rotate(x1 &+ x13, 18)
            x14 ^= rotate(x10 &+ x6, 7); x2 ^= rotate(x14 &+ x10, 9)
            x6 ^= rotate(x2 &+ x14, 13); x10 ^= rotate(x6 &+ x2, 18)
            x3 ^= rotate(x15 &+ x11, 7); x7 ^= rotate(x3 &+ x15, 9)
            x11 ^= rotate(x7 &+ x3, 13); x15 ^= rotate(x11 &+ x7, 18)
            x1 ^= rotate(x0 &+ x3, 7); x2 ^= rotate(x1 &+ x0, 9)
            x3 ^= rotate(x2 &+ x1, 13); x0 ^= rotate(x3 &+ x2, 18)
            x6 ^= rotate(x5 &+ x4, 7); x7 ^= rotate(x6 &+ x5, 9)
            x4 ^= rotate(x7 &+ x6, 13); x5 ^= rotate(x4 &+ x7, 18)
            x11 ^= rotate(x10 &+ x9, 7); x8 ^= rotate(x11 &+ x10, 9)
            x9 ^= rotate(x8 &+ x11, 13); x10 ^= rotate(x9 &+ x8, 18)
            x12 ^= rotate(x15 &+ x14, 7); x13 ^= rotate(x12 &+ x15, 9)
            x14 ^= rotate(x13 &+ x12, 13); x15 ^= rotate(x14 &+ x13, 18)
        }
        b[0] &+= x0; b[1] &+= x1; b[2] &+= x2; b[3] &+= x3
        b[4] &+= x4; b[5] &+= x5; b[6] &+= x6; b[7] &+= x7
        b[8] &+= x8; b[9] &+= x9; b[10] &+= x10; b[11] &+= x11
        b[12] &+= x12; b[13] &+= x13; b[14] &+= x14; b[15] &+= x15
    }
}
