import Foundation

nonisolated func utf16Less(_ a: String, _ b: String) -> Bool {
  a.utf16.lexicographicallyPrecedes(b.utf16)
}

/// JSON objects retain wire order, including when unknown future settings pass through iOS.
nonisolated indirect enum JSONValue: Equatable, Sendable, Codable {
  case string(String)
  case utf16String([UInt16])
  case number(Double)
  case bool(Bool)
  case null
  case array([JSONValue])
  case object([(String, JSONValue)])
  static func == (a: Self, b: Self) -> Bool { a.jsStringify() == b.jsStringify() }
  subscript(_ key: String) -> JSONValue? {
    get {
      if case .object(let p) = self { return p.first { $0.0 == key }?.1 }
      return nil
    }
    set {
      guard case .object(var p) = self else { return }
      if let i = p.firstIndex(where: { $0.0 == key }) {
        if let newValue { p[i].1 = newValue } else { p.remove(at: i) }
      } else if let newValue {
        p.append((key, newValue))
      }
      self = .object(p)
    }
  }
  var string: String? {
    switch self {
    case .string(let s): return s
    case .utf16String(let units): return String(decoding: units, as: UTF16.self)
    default: return nil
    }
  }
  var utf16Units: [UInt16]? {
    switch self {
    case .string(let s): return Array(s.utf16)
    case .utf16String(let u): return u
    default: return nil
    }
  }
  static func stringFromUTF16(_ units: [UInt16]) -> JSONValue {
    let string = String(decoding: units, as: UTF16.self)
    return Array(string.utf16) == units ? .string(string) : .utf16String(units)
  }
  var number: Double? {
    if case .number(let n) = self { return n }
    return nil
  }
  var bool: Bool? {
    if case .bool(let b) = self { return b }
    return nil
  }
  var array: [JSONValue] {
    if case .array(let a) = self { return a }
    return []
  }
  var pairs: [(String, JSONValue)] {
    if case .object(let p) = self { return p }
    return []
  }
  var stringValue: String? { string }
  var boolValue: Bool? { bool }
  var intValue: Int64? {
    guard let n = number, n.isFinite, n >= Double(Int64.min), n < Double(Int64.max) else {
      return nil
    }
    return Int64(n)
  }
  static func from(any: Any) -> JSONValue {
    if let data = try? JSONSerialization.data(withJSONObject: any, options: [.fragmentsAllowed]),
      let value = try? JSONValue(data: data)
    {
      return value
    }
    return .null
  }
  var isTruthy: Bool {
    switch self {
    case .null: return false
    case .bool(let value): return value
    case .number(let value): return value != 0 && !value.isNaN
    case .string(let value): return !value.isEmpty
    case .utf16String(let value): return !value.isEmpty
    case .array, .object: return true
    }
  }
  var serialized: String { jsStringify() }
  func canonical() -> String { render(sorted: true) }
  func jsStringify() -> String { render(sorted: false) }
  private func render(sorted: Bool) -> String {
    switch self {
    case .null: return "null"
    case .bool(let b): return b ? "true" : "false"
    case .string(let s): return Self.quote(s)
    case .utf16String(let units): return Self.quoteUnits(units)
    case .number(let n):
      guard n.isFinite else { return "null" }
      if n == 0 { return "0" }
      var s = String(n).replacingOccurrences(of: ".0e", with: "e")
      if s.hasSuffix(".0") { s.removeLast(2) }
      if let e = s.firstIndex(of: "e"), let exp = Int(s[s.index(after: e)...]) {
        let mantissa = String(s[..<e])
        if exp >= -6 && exp < 21 {
          let negative = mantissa.hasPrefix("-")
          let digits = mantissa.filter { $0.isNumber }
          let before =
            (mantissa.split(separator: ".").first?.filter { $0.isNumber }.count ?? 1) + exp
          s =
            (negative ? "-" : "")
            + (before <= 0
              ? "0." + String(repeating: "0", count: -before) + digits
              : before >= digits.count
                ? digits + String(repeating: "0", count: before - digits.count)
                : String(digits.prefix(before)) + "." + String(digits.dropFirst(before)))
        } else {
          s = mantissa + "e" + (exp >= 0 ? "+" : "-") + String(abs(exp))
        }
      }
      return s
    case .array(let a):
      return "[" + a.map { $0.render(sorted: sorted) }.joined(separator: ",") + "]"
    case .object(let p):
      let keys =
        sorted
        ? p.sorted { utf16Less($0.0, $1.0) }
        : p.enumerated().sorted { a, b in
          let ai = Self.index(a.element.0)
          let bi = Self.index(b.element.0)
          if let ai, let bi { return ai < bi }
          if ai != nil { return true }
          if bi != nil { return false }
          return a.offset < b.offset
        }.map(\.element)
      return "{"
        + keys.map { Self.quote($0.0) + ":" + $0.1.render(sorted: sorted) }.joined(separator: ",")
        + "}"
    }
  }
  private static func index(_ s: String) -> UInt32? {
    guard let n = UInt32(s), n < UInt32.max, String(n) == s else { return nil }
    return n
  }
  private static func quoteUnits(_ units: [UInt16]) -> String {
    var out = "\""
    var i = 0
    while i < units.count {
      let unit = units[i]
      if (0xD800...0xDBFF).contains(unit), i + 1 < units.count,
        (0xDC00...0xDFFF).contains(units[i + 1])
      {
        out += String(decoding: units[i...i + 1], as: UTF16.self)
        i += 2
        continue
      }
      if (0xD800...0xDFFF).contains(unit) {
        out += String(format: "\\u%04x", unit)
      } else if let scalar = UnicodeScalar(Int(unit)) {
        let quoted = quote(String(scalar))
        out += quoted.dropFirst().dropLast()
      }
      i += 1
    }
    return out + "\""
  }
  private static func quote(_ s: String) -> String {
    var out = "\""
    for c in s.unicodeScalars {
      switch c.value {
      case 34: out += "\\\""
      case 92: out += "\\\\"
      case 8: out += "\\b"
      case 9: out += "\\t"
      case 10: out += "\\n"
      case 12: out += "\\f"
      case 13: out += "\\r"
      case 0..<32: out += String(format: "\\u%04x", c.value)
      default: out.unicodeScalars.append(c)
      }
    }
    return out + "\""
  }
  init(data: Data) throws {
    var p = Parser(bytes: Array(data))
    self = try p.value()
    p.space()
    guard p.i == p.bytes.count else { throw ParseError.invalid }
  }
  enum ParseError: Error { case invalid }
  private struct Parser {
    let bytes: [UInt8]
    var i = 0
    var depth = 0
    mutating func space() {
      while i < bytes.count && [9, 10, 13, 32].contains(bytes[i]) { i += 1 }
    }
    mutating func consume(_ c: UInt8) throws {
      space()
      guard i < bytes.count, bytes[i] == c else { throw ParseError.invalid }
      i += 1
    }
    mutating func textValue() throws -> JSONValue {
      try consume(34)
      var units: [UInt16] = []
      while i < bytes.count {
        let c = bytes[i]
        i += 1
        if c == 34 { return JSONValue.stringFromUTF16(units) }
        guard c >= 32 else { throw ParseError.invalid }
        if c == 92 {
          guard i < bytes.count else { throw ParseError.invalid }
          let e = bytes[i]
          i += 1
          switch e {
          case 34, 47, 92: units.append(UInt16(e))
          case 98: units.append(8)
          case 102: units.append(12)
          case 110: units.append(10)
          case 114: units.append(13)
          case 116: units.append(9)
          case 117:
            guard i + 4 <= bytes.count,
              bytes[i..<i + 4].allSatisfy({
                (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
              }),
              let h = String(bytes: bytes[i..<i + 4], encoding: .ascii),
              let unit = UInt16(h, radix: 16)
            else { throw ParseError.invalid }
            units.append(unit)
            i += 4
          default: throw ParseError.invalid
          }
        } else if c < 128 {
          units.append(UInt16(c))
        } else {
          let count = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : 2
          guard i - 1 + count <= bytes.count,
            let string = String(bytes: bytes[i - 1..<i - 1 + count], encoding: .utf8)
          else { throw ParseError.invalid }
          units.append(contentsOf: string.utf16)
          i += count - 1
        }
      }
      throw ParseError.invalid
    }
    mutating func text() throws -> String {
      let value = try textValue()
      guard case .string(let string) = value else { throw ParseError.invalid }
      return string
    }
    mutating func value() throws -> JSONValue {
      guard depth < 256 else { throw ParseError.invalid }
      depth += 1
      defer { depth -= 1 }
      space()
      guard i < bytes.count else { throw ParseError.invalid }
      switch bytes[i] {
      case 34: return try textValue()
      case 123:
        i += 1
        space()
        var pairs: [(String, JSONValue)] = []
        if i < bytes.count && bytes[i] == 125 {
          i += 1
          return .object(pairs)
        }
        while true {
          let k = try text()
          try consume(58)
          let v = try value()
          if let n = pairs.firstIndex(where: { $0.0 == k }) {
            pairs[n].1 = v
          } else {
            pairs.append((k, v))
          }
          space()
          guard i < bytes.count else { throw ParseError.invalid }
          if bytes[i] == 125 {
            i += 1
            return .object(pairs)
          }
          try consume(44)
        }
      case 91:
        i += 1
        space()
        var a: [JSONValue] = []
        if i < bytes.count && bytes[i] == 93 {
          i += 1
          return .array(a)
        }
        while true {
          a.append(try value())
          space()
          guard i < bytes.count else { throw ParseError.invalid }
          if bytes[i] == 93 {
            i += 1
            return .array(a)
          }
          try consume(44)
        }
      default:
        let start = i
        while i < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[i]) { i += 1 }
        let token = String(decoding: bytes[start..<i], as: UTF8.self)
        if token == "true" { return .bool(true) }
        if token == "false" { return .bool(false) }
        if token == "null" { return .null }
        guard let n = try? JSONDecoder().decode(Double.self, from: Data(token.utf8)), n.isFinite
        else { throw ParseError.invalid }
        return .number(n)
      }
    }
  }
  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let v = try? c.decode(Bool.self) {
      self = .bool(v)
    } else if let v = try? c.decode(Double.self) {
      self = .number(v)
    } else if let v = try? c.decode(String.self) {
      self = .string(v)
    } else if let v = try? c.decode([JSONValue].self) {
      self = .array(v)
    } else {
      self = .object(
        try c.decode([String: JSONValue].self).sorted { utf16Less($0.key, $1.key) }.map {
          ($0.key, $0.value)
        })
    }
  }
  func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let v): try c.encode(v)
    case .number(let v): try c.encode(v)
    case .string(let v): try c.encode(v)
    case .utf16String:
      throw EncodingError.invalidValue(
        self,
        .init(
          codingPath: encoder.codingPath,
          debugDescription: "Use jsStringify to preserve unpaired UTF-16 surrogates"))
    case .array(let v): try c.encode(v)
    case .object(let v): try c.encode(Dictionary(v, uniquingKeysWith: { _, b in b }))
    }
  }
}
