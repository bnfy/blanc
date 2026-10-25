import Foundation
import WebKit
import UIKit

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
        // Favorites edit on the phone; importing (F30) and Start Page pins stay on the computer.
        case ("bookmarks", "capabilities"):
            return .value(.object([("editable", .bool(true)), ("import", .bool(false)), ("pins", .bool(false))]))
        case ("bookmarks", "clearFavicon"): return .value(.null)
        case ("bookmarks", "import"), ("bookmarks", "importBrowser"), ("bookmarks", "browserSources"):
            return .reject(SyncCopy.text("favorites.editOnComputer"))

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
                .string("sync"),
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

        let host = webView.url?.host ?? ""
        let fullMethod = group.map { $0 + "." + method } ?? method
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.scheme == "blanc",
              message.frameInfo.request.url?.host == host,
              Self.bundledMembers.contains(where: { $0.name == fullMethod && $0.kind == "invoke" && $0.hosts.contains(host) }) else {
            resolve(id, result: .reject("Method not available on this page."), in: webView, host: host)
            return
        }
        let args = body["args"] as? [Any] ?? []
        let documentURL = webView.url
        if group == "settings", method.hasPrefix("sync"), let engine = manager?.syncEngine {
            Task { [weak self, weak webView] in
                guard let self, let webView else { return }
                let result = await self.syncResponse(method: method, args: args, engine: engine)
                guard webView.url == documentURL else { return }
                self.resolve(id, result: .value(result), in: webView, host: host)
            }
            return
        }
        resolve(id, result: liveResponse(group: group, method: method, args: args, appVersion: version), in: webView, host: host)
    }

    /// The answer to a call the sender checks above allowed, using live app state.
    func liveResponse(group: String?, method: String, args: [Any], appVersion: String = "0") -> BridgeResult {
        let text = { (index: Int) in args.indices.contains(index) ? args[index] as? String : nil }
        let now = Date().timeIntervalSince1970 * 1000
        switch (group ?? "", method) {
        case ("settings", "get"): return .value(liveSettingsBootstrap())
        case ("settings", "set"):
            if let patch = args.first as? [String: Any] { manager?.applySettingsPatch(patch) }
            return .value(.null)
        case ("bookmarks", "list"): return .value(favoritesPayload())
        case ("start", "data"):
            return .value(.object([("groups", .array([])), ("blockedThisWeek", .number(0)), ("remoteDevices", remoteDevicesPayload()), ("bookmarks", favoritesPayload())]))
        case ("bookmarks", "remove"):
            guard let id = text(0) else { return .value(.null) }
            editFavorites { SyncedFavorites.remove($0, id: id, now: now) }
        case ("bookmarks", "setFolder"):
            guard let id = text(0) else { return .value(.null) }
            editFavorites { SyncedFavorites.setFolder($0, id: id, folder: text(1), now: now) }
        case ("bookmarks", "renameFolder"):
            guard let from = text(0), let to = text(1) else { return .value(.null) }
            editFavorites { SyncedFavorites.renameFolder($0, from: from, to: to, now: now) }
        case ("bookmarks", "removeFolder"):
            guard let name = text(0) else { return .value(.null) }
            editFavorites { SyncedFavorites.removeFolder($0, name: name, now: now) }
        case ("bookmarks", "clearFavicon"):
            guard let url = text(0) else { return .value(.null) }
            editFavorites { store in
                var next = store
                next["items"] = .array((store["items"]?.array ?? []).map { item in
                    guard item["url"]?.string == url, item["favicon"] != .null else { return item }
                    var cleared = item
                    cleared["favicon"] = .null
                    return cleared
                })
                return next
            }
        default: return Self.response(group: group, method: method, appVersion: appVersion)
        }
        return .value(.null)
    }
    private func editFavorites(_ change: (JSONValue) -> JSONValue) {
        manager?.syncEngine.editFavorites(change)
    }

    private func resolve(_ id: Int, result: BridgeResult, in webView: WKWebView, host: String) {
        let payload: String
        let ok: Bool
        switch result {
        case .value(let value): payload = value.serialized; ok = true
        case .reject(let error): payload = JSONValue.string(error).serialized; ok = false
        }
        webView.evaluateJavaScript(Self.guardedScript("window.__blancResolve(\(id), \(ok), \(payload));", host: host))
    }
    private func favoritesPayload() -> JSONValue {
        .array((manager?.syncEngine.favorites ?? []).map {
            .object([("addedAt", .number($0.addedAt)), ("updatedAt", .number($0.updatedAt)), ("id", .string($0.id)), ("url", .string($0.url)), ("title", .string($0.title)), ("favicon", $0.favicon.map(JSONValue.string) ?? .null), ("folder", $0.folder.map(JSONValue.string) ?? .null)])
        })
    }
    private func remoteDevicesPayload() -> JSONValue {
        guard let engine = manager?.syncEngine else { return .array([]) }
        return .array(engine.remoteDevices.map { device in
            .object([("id", .string(device.id)), ("name", .string(device.name)), ("tabs", .array(device.tabs.map { tab in
                .object([("url", .string(tab.url)), ("title", .string(tab.title)), ("favicon", SyncedIcons.icon(for: tab.url, in: engine.icons["devices"] ?? .object([])).map(JSONValue.string) ?? .null)])
            }))])
        })
    }
    // Evaluate the origin guard in the destination document, not only against
    // WKWebView.url: a provisional navigation can outpace native URL observers.
    static func guardedScript(_ script: String, host: String) -> String {
        """
        (() => {
          if (window.location.protocol !== 'blanc:' || window.location.host !== \(JSONValue.string(host).serialized)) return;
          \(script)
        })();
        """
    }
    static func favoritesRefreshScript(previous: JSONValue, current: JSONValue, host: String) -> String? {
        guard previous != current, ["newtab", "bookmarks"].contains(host) else { return nil }
        return guardedScript("window.location.reload();", host: host)
    }
    private var lastFavoritesPayload: JSONValue = .array([])
    func emitSyncChanges() {
        if let engine = manager?.syncEngine {
            emit("settings.onAppearance", payload: .object([
                ("settings", liveSettingsBootstrap()["settings"] ?? .object([])),
                ("syncStatus", engine.status),
            ]), host: "settings")
        }
        emitRemoteTabs()
        let current = favoritesPayload()
        let previous = lastFavoritesPayload
        lastFavoritesPayload = current
        for tab in manager?.tabs ?? [] {
            guard tab.currentURL.scheme == "blanc", let host = tab.currentURL.host,
                  let script = Self.favoritesRefreshScript(previous: previous, current: current, host: host) else { continue }
            tab.webView.evaluateJavaScript(script)
        }
    }
    func emitRemoteTabs() { emit("start.onRemoteTabs", payload: remoteDevicesPayload(), host: "newtab") }
    func emit(_ event: String, payload: JSONValue, host: String) {
        for tab in manager?.tabs ?? [] where tab.currentURL.scheme == "blanc" && tab.currentURL.host == host {
            tab.webView.evaluateJavaScript(Self.guardedScript("window.__blancEmit(\(JSONValue.string(event).serialized), \(payload.serialized));", host: host))
        }
    }
    private func syncResponse(method: String, args: [Any], engine: SyncEngine) async -> JSONValue {
        let options = args.first as? [String: Any] ?? [:]
        switch method {
        case "syncGet": return engine.status
        case "syncNow": await engine.syncNow(); return engine.status
        case "syncPreflight": return await engine.preflight(handle: options["handle"] as? String ?? "", passphrase: options["passphrase"] as? String ?? "")
        case "syncEnable": return await engine.enable(handle: options["handle"] as? String ?? "", passphrase: options["passphrase"] as? String ?? "")
        case "syncDisable": return await engine.disable(wipeRemote: options["wipeRemote"] as? Bool ?? false)
        case "syncTabsSet": await engine.setShareTabs(args.first as? Bool ?? false); return engine.status
        case "syncDeviceNameSet": engine.setDeviceName(args.first as? String ?? ""); return engine.status
        case "syncPairBegin": return await engine.beginPairing()
        case "syncPairCancel": await engine.cancelPairing(); return .object([("ok", .bool(true))])
        case "syncPairState": return engine.pairingStatus()
        case "syncJoinCode": return await engine.joinWithCode(args.first as? String ?? "")
        case "syncSwitchCode": return await engine.switchWithCode(options["code"] as? String ?? "", wipeRemote: options["wipeRemote"] as? Bool ?? false)
        case "syncRecoveryCodeCopy":
            guard await confirmRecoveryCopy(), let code = engine.recoveryCode() else { return .object([("ok", .bool(false)), ("error", .string("cancelled"))]) }
            // Recovery material stays native, device-local, and expires from the clipboard.
            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: code]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
            return .object([("ok", .bool(true))])
        default: return .object([("ok", .bool(false))])
        }
    }
    private func confirmRecoveryCopy() async -> Bool {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
              var presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return false }
        while let presented = presenter.presentedViewController { presenter = presented }
        return await withCheckedContinuation { continuation in
            let alert = UIAlertController(title: SyncCopy.text("settings.sync.recovery.dialogMessage"), message: SyncCopy.text("settings.sync.recovery.dialogDetail"), preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: SyncCopy.text("settings.sync.recovery.cancel"), style: .cancel) { _ in continuation.resume(returning: false) })
            alert.addAction(UIAlertAction(title: SyncCopy.text("settings.sync.recovery.dialogCopy"), style: .default) { _ in continuation.resume(returning: true) })
            presenter.present(alert, animated: true)
        }
    }
}
