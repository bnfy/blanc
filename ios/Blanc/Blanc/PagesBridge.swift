import Foundation
import WebKit

/// A minimal, order-preserving JSON value. Object pairs keep insertion order
/// so `serialized` is deterministic (unit-testable) and valid for embedding
/// directly into a `window.__blancResolve(...)` call.
indirect enum JSONValue: Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([(String, JSONValue)])

    static func == (lhs: JSONValue, rhs: JSONValue) -> Bool {
        switch (lhs, rhs) {
        case (.string(let a), .string(let b)): return a == b
        case (.number(let a), .number(let b)): return a == b
        case (.bool(let a), .bool(let b)): return a == b
        case (.null, .null): return true
        case (.array(let a), .array(let b)): return a == b
        case (.object(let a), .object(let b)):
            return a.count == b.count && zip(a, b).allSatisfy { pair in
                pair.0.0 == pair.1.0 && pair.0.1 == pair.1.1
            }
        default: return false
        }
    }

    var serialized: String {
        switch self {
        case .string(let s): return Self.encodeString(s)
        case .number(let n):
            if n == n.rounded() && abs(n) < 1e15 { return String(Int(n)) }
            return String(n)
        case .bool(let b): return b ? "true" : "false"
        case .null: return "null"
        case .array(let items): return "[" + items.map(\.serialized).joined(separator: ",") + "]"
        case .object(let pairs):
            return "{" + pairs.map { "\(Self.encodeString($0.0)):\($0.1.serialized)" }.joined(separator: ",") + "}"
        }
    }

    private static func encodeString(_ s: String) -> String {
        var out = "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}

enum BridgeResult: Equatable {
    case value(JSONValue)
    case reject(String)
}

/// The `window.bowserPages` bridge: a JS shim (injected only into `blanc://`
/// documents) plus a native message handler that answers each call. At M4
/// every reachable page's methods return empty/default data; unknown methods
/// reject.
final class PagesBridge: NSObject, WKScriptMessageHandler {
    static let messageHandlerName = "blancPages"
    private weak var manager: TabsManager?

    init(manager: TabsManager) {
        self.manager = manager
        super.init()
    }

    // MARK: Response shapes (pure — unit-tested)

    static func response(group: String?, method: String, appVersion: String) -> BridgeResult {
        let disabledStatus = JSONValue.object([("enabled", .bool(false))])

        // Switch over a non-optional first element ("" == the null-group,
        // top-level methods) to avoid optional-literal pattern ambiguity.
        switch (group ?? "", method) {
        case ("", "appVersion"): return .value(.string(appVersion))
        case ("", "clearBrowsingData"): return .value(.null)

        case ("bookmarks", "list"): return .value(.array([]))
        case ("bookmarks", "remove"), ("bookmarks", "clearFavicon"): return .value(.null)

        case ("history", "list"): return .value(.array([]))
        case ("history", "remove"), ("history", "clear"): return .value(.null)

        case ("downloads", "list"): return .value(.array([]))
        case ("downloads", "cancel"), ("downloads", "open"),
             ("downloads", "show"), ("downloads", "clearFinished"): return .value(.null)

        case ("settings", "get"): return .value(settingsBootstrap())
        case ("settings", "set"): return .value(.null)
        case ("settings", "syncGet"), ("settings", "syncNow"): return .value(disabledStatus)
        case ("settings", "syncDisable"): return .value(.object([("status", disabledStatus)]))
        case ("settings", "syncEnable"):
            return .value(.object([
                ("ok", .bool(false)),
                ("created", .bool(false)),
                ("message", .string("Sync isn’t available in this build yet.")),
                ("status", disabledStatus),
            ]))
        case ("settings", "activateSupporter"):
            return .value(.object([
                ("ok", .bool(false)),
                ("message", .string("Supporter activation isn’t available in this build yet.")),
            ]))

        case ("permissions", "list"): return .value(.object([]))
        case ("permissions", "remove"): return .value(.null)

        case ("defaultBrowser", "get"), ("defaultBrowser", "set"):
            return .value(.object([("isDefault", .bool(false)), ("canSet", .bool(false))]))

        case ("start", "data"):
            return .value(.object([("groups", .array([])), ("blockedThisWeek", .number(0))]))
        case ("start", "focusGroup"): return .value(.null)

        // `shortcuts` is not linked from any page, but `blanc://shortcuts/` is
        // typeable in the address bar (AddressNormalizer accepts any scheme),
        // so its one read is stubbed rather than left to reject.
        case ("shortcuts", "list"): return .value(.array([]))

        default:
            return .reject("Unknown method: \(group ?? "root").\(method)")
        }
    }

    /// The `{ settings, searchEngines, appIcons, capabilities }`
    /// payload `settings.js` reads on load, built from the generated substrate so
    /// values track `BlancSettingsDefaults`. `theme`/`searchEngine`/`adblockEnabled`
    /// are parameterized so the live store can override the defaults;
    /// `capabilities` lists the features this platform actually implements, so
    /// `settings.js` hides the rest (iOS ships only theme/searchEngine/adblock).
    private static func settingsBootstrap(
        theme: BlancThemePreference = BlancSettingsDefaults.theme,
        searchEngine: BlancSearchEngine = BlancSettingsDefaults.searchEngine,
        adblockEnabled: Bool = BlancSettingsDefaults.adblockEnabled
    ) -> JSONValue {
        let settings = JSONValue.object([
            ("theme", .string(theme.rawValue)),
            ("searchEngine", .string(searchEngine.rawValue)),
            ("adblockEnabled", .bool(adblockEnabled)),
            ("homePage", .string(BlancSettingsDefaults.homePage)),
            ("usagePing", .bool(BlancSettingsDefaults.usagePing)),
            ("appIcon", .string(BlancSettingsDefaults.appIcon.rawValue)),
            ("adblockExceptions", .array([])),
            ("patronActive", .bool(false)),
            ("supporterActive", .bool(false)),
        ])
        let searchEngines = JSONValue.object(
            BlancSearchEngine.allCases.map { ($0.rawValue, .string($0.label)) })
        // Patron unlocks nothing, so every icon is listed (desktop sends the
        // same flat `appIcons` record).
        let appIcons = JSONValue.object(BlancAppIcon.allCases.map { ($0.rawValue, .string($0.label)) })
        return .object([
            ("settings", settings),
            ("searchEngines", searchEngines),
            ("appIcons", appIcons),
            ("capabilities", .array([
                .string("theme"),
                .string("searchEngine"),
                .string("adblockEnabled"),
            ])),
        ])
    }

    /// Live settings for the instance path — overrides the bootstrap defaults with
    /// the manager's current store so `settings.get` reflects real values.
    private func liveSettingsBootstrap() -> JSONValue {
        guard let store = manager?.settingsStore else {
            return Self.settingsBootstrap()
        }
        return Self.settingsBootstrap(
            theme: store.theme,
            searchEngine: store.searchEngine,
            adblockEnabled: store.adblockEnabled
        )
    }

    // MARK: JS shim

    /// One `window.bowserPages` member, as `browser-api/bridges.json` (desktop's
    /// contract, bundled as a resource) declares it.
    struct Member: Equatable {
        let name: String
        let kind: String
        let hosts: [String]
    }

    /// The members in a `bridges.json` document; empty if it doesn't parse.
    static func members(fromBridgesJSON data: Data) -> [Member] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let pages = root["bowserPages"] as? [String: Any],
              let list = pages["members"] as? [[String: Any]] else { return [] }
        return list.compactMap { entry in
            guard let name = entry["name"] as? String,
                  let kind = entry["kind"] as? String,
                  let hosts = entry["hosts"] as? [String] else { return nil }
            return Member(name: name, kind: kind, hosts: hosts)
        }
    }

    static let bundledMembers: [Member] = {
        guard let url = Bundle.main.url(forResource: "bridges", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [] }
        return members(fromBridgesJSON: data)
    }()

    /// Defines `window.bowserPages` at document-start, gated to `blanc://`
    /// documents and, like `tab-preload.js`, to the members the contract grants
    /// this page's host. Every member exists so page scripts never hit a missing
    /// function: an `invoke` posts `{id, group, method, args}` and returns a
    /// promise resolved by `window.__blancResolve` (methods iOS doesn't answer
    /// yet reject); an `event` registers a listener `window.__blancEmit` calls
    /// and returns its unsubscribe.
    static func makeUserScript(members: [Member]) -> String {
        let list = members.map { ["name": $0.name, "kind": $0.kind, "hosts": $0.hosts] as [String: Any] }
        let json = (try? JSONSerialization.data(withJSONObject: list, options: [.sortedKeys]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        return userScriptTemplate.replacingOccurrences(of: "__BLANC_MEMBERS__", with: json)
    }

    static let userScriptSource = makeUserScript(members: bundledMembers)

    private static let userScriptTemplate = #"""
    (function () {
      if (location.protocol !== 'blanc:') return;
      const MEMBERS = __BLANC_MEMBERS__;
      const host = location.host;
      const pending = new Map();
      const listeners = new Map();
      let seq = 0;
      window.__blancResolve = function (id, ok, payload) {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        ok ? p.resolve(payload) : p.reject(new Error(payload));
      };
      window.__blancEmit = function (name, payload) {
        for (const fn of (listeners.get(name) || []).slice()) {
          try { fn(payload); } catch (e) { console.error(e); }
        }
      };
      function call(group, method, args) {
        return new Promise(function (resolve, reject) {
          const id = ++seq;
          pending.set(id, { resolve: resolve, reject: reject });
          window.webkit.messageHandlers.blancPages.postMessage({
            id: id, group: group, method: method, args: args,
          });
        });
      }
      const api = {};
      for (const m of MEMBERS) {
        if (m.hosts.indexOf(host) === -1) continue;
        const parts = m.name.split('.');
        const method = parts.pop();
        const group = parts.length ? parts.join('.') : null;
        let target = api;
        for (const part of parts) target = target[part] || (target[part] = {});
        if (m.kind === 'event') {
          const name = m.name;
          target[method] = function (fn) {
            if (typeof fn !== 'function') return function () {};
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(fn);
            return function () {
              const list = listeners.get(name) || [];
              const i = list.indexOf(fn);
              if (i !== -1) list.splice(i, 1);
            };
          };
        } else {
          target[method] = function () {
            return call(group, method, Array.prototype.slice.call(arguments));
          };
        }
      }
      window.bowserPages = api;
    })();
    """#

    // MARK: Message handling

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        // Re-verify the sender is a blanc:// document (belt-and-suspenders,
        // matching desktop's pages.js re-check).
        guard let webView = message.webView,
              webView.url?.scheme == "blanc",
              let body = message.body as? [String: Any],
              let id = body["id"] as? Int else { return }

        let group = body["group"] as? String
        let method = body["method"] as? String ?? ""
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"

        // settings.get/set need the live store + the manager's dispatch path, so
        // they're handled on the instance; everything else uses the pure static
        // response table.
        let result: BridgeResult
        if group == "settings", method == "get" {
            result = .value(liveSettingsBootstrap())
        } else if group == "settings", method == "set" {
            if let args = body["args"] as? [Any], let patch = args.first as? [String: Any] {
                manager?.applySettingsPatch(patch)
            }
            result = .value(.null)
        } else {
            result = Self.response(group: group, method: method, appVersion: version)
        }

        let payload: String
        let ok: Bool
        switch result {
        case .value(let v): payload = v.serialized; ok = true
        case .reject(let message): payload = JSONValue.string(message).serialized; ok = false
        }

        let js = "window.__blancResolve(\(id), \(ok), \(payload));"
        webView.evaluateJavaScript(js)
    }
}
