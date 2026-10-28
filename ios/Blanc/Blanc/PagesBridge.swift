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
            return .value(startData())
        case ("start", "focusGroup"): return .value(.null)

        // `shortcuts` is not linked from any page, but `blanc://shortcuts/` is
        // typeable in the address bar (AddressNormalizer accepts any scheme),
        // so its one read is stubbed rather than left to reject.
        case ("shortcuts", "list"): return .value(.array([]))

        default:
            return .reject("Unknown method: \(group ?? "root").\(method)")
        }
    }

    static func startData(layout: BlancStartPageLayout = MobileStartPageDefaults.layout,
                          adblockEnabled: Bool = true) -> JSONValue {
        .object([
            ("groups", .array([])), ("blockedThisWeek", .number(0)),
            ("layout", .string(layout.rawValue)), ("topSites", .array([])),
            ("wallpaperVisible", .bool(true)), ("dynamicWallpaperEnabled", .bool(false)),
            ("mobileAdblockEnabled", .bool(adblockEnabled)),
        ])
    }

    /// The `{ settings, searchEngines, appIcons, capabilities }`
    /// payload `settings.js` reads on load, built from the generated substrate so
    /// values track `BlancSettingsDefaults`. `theme`/`searchEngine`/`adblockEnabled`
    /// are parameterized so the live store can override the defaults;
    /// `capabilities` lists the features this platform actually implements, so
    /// `settings.js` hides the rest (iOS ships theme, search engine, blocker, Sync
    /// and Clear cookies, cache & site data).
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
                .string("clearBrowsingData"),
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

    private static let nativeMembers = [Member(name: "start.renderNativeClock", kind: "invoke", hosts: ["newtab"])]
    static let userScriptSource = makeUserScript(members: bundledMembers + nativeMembers)

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
      function projectAppearance(data) {
        const raw = data.appearance || {};
        const settings = raw.settings || {};
        const rules = globalThis.BlancStartRules;
        if (!rules) return data;
        data.clock = rules.clock.clockStyleFromSettings(settings);
        data.dynamicWallpaperEnabled = settings.newtabDynamicWallpaper === true;
        const source = settings.newtabCustomWallpaper && raw.hasImage ? 'custom'
          : settings.newtabColorWallpaper ? 'color' : data.dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise';
        data.wallpaper = {
          source, hasImage: raw.hasImage === true, image: raw.image || null,
          wash: Number.isInteger(settings.newtabWallpaperWash) ? settings.newtabWallpaperWash : 100,
          style: settings.newtabWallpaperStyle || 'auto',
          color: { preset: settings.newtabWallpaperColor || 'sage', followSpace: false, inSpace: false,
            presets: rules.presets, paint: rules.paint.colorWallpaper({
              preset: settings.newtabWallpaperColor, fill: settings.newtabWallpaperFill, followSpace: false,
            }) },
        };
        return data;
      }
      function appearanceCall(method, value) {
        return call('start', method, [value]).then(raw => projectAppearance({ appearance: raw }));
      }
      if (host === 'newtab' && api.start) {
        const rawData = api.start.data;
        api.start.data = () => rawData().then(projectAppearance);
        window.blancNativeClock = { render: value => call('start', 'renderNativeClock', [value]) };
        api.start.setClock = value => appearanceCall('setClock', value).then(data => data.clock);
        for (const method of ['setWallpaper', 'setWallpaperColor', 'setWallpaperFill', 'setWallpaperStyle', 'setWallpaperWash', 'removeWallpaper']) {
          api.start[method] = value => appearanceCall(method, value).then(data => data.wallpaper);
        }
        api.start.setDynamicWallpaper = value => appearanceCall('setDynamicWallpaper', value).then(data => data.dynamicWallpaperEnabled);
        api.start.chooseWallpaper = () => call('start', 'chooseWallpaper', []).then(reply => ({ ...reply,
          wallpaper: projectAppearance({ appearance: reply.appearance }).wallpaper }));
        const onStatus = api.start.onStatus;
        api.start.onStatus = listener => onStatus(data => listener(data.appearance ? projectAppearance(data) : data));
        const onVisibility = api.start.onVisibility;
        api.start.onVisibility = listener => {
          const off = onVisibility(listener);
          if (typeof document === 'undefined') return off;
          const changed = () => listener(!document.hidden);
          document.addEventListener('visibilitychange', changed);
          return () => { off(); document.removeEventListener('visibilitychange', changed); };
        };
      }
      window.bowserPages = api;
      // The utility pages open as ordinary tabs above the Island, not as
      // desktop's card over a scrim. Marked before any page script runs:
      // sheet.js and history.js read the mark, ios-pages.css draws the page.
      if (typeof document !== 'undefined' && ['history', 'bookmarks', 'shortcuts', 'downloads'].indexOf(host) !== -1) {
        const root = document.documentElement;
        root.dataset.platform = 'ios';
        const viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        const style = document.createElement('link');
        style.rel = 'stylesheet'; style.href = 'ios-pages.css';
        root.append(viewport, style);
      }
      if (typeof document !== 'undefined' && location.hostname === 'newtab') {
        document.addEventListener('DOMContentLoaded', function () {
          const viewport = document.createElement('meta');
          viewport.name = 'viewport';
          viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
          document.head.append(viewport);
          document.documentElement.dataset.platform = 'ios';
          const style = document.createElement('link');
          style.rel = 'stylesheet'; style.href = 'ios-start-page.css';
          document.head.append(style);
          const mobile = document.createElement('script');
          mobile.src = 'ios-start-page.js'; document.body.append(mobile);
        }, { once: true });
      }

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
              (Self.bundledMembers + Self.nativeMembers).contains(where: { $0.name == fullMethod && $0.kind == "invoke" && $0.hosts.contains(host) }) else {
            resolve(id, result: .reject("Method not available on this page."), in: webView, host: host)
            return
        }
        let args = body["args"] as? [Any] ?? []
        let documentURL = webView.url
        if group == "start", method == "renderNativeClock" {
            let tab = ((manager?.tabs ?? []) + (manager?.startPreviews ?? [])).first { $0.existingWebView === webView }
            let rendered = tab?.nativeClock.render(args.first as? [String: Any], in: webView) ?? false
            resolve(id, result: .value(.bool(rendered)), in: webView, host: host)
            return
        }
        if group == "start", method == "chooseWallpaper", let manager {
            guard manager.wallpaperSelectionCompletion == nil else {
                resolve(id, result: .reject("An image picker is already open"), in: webView, host: host)
                return
            }
            manager.wallpaperSelectionCompletion = { [weak self, weak webView, weak manager] image in
                guard let self, let webView, let manager else { return }
                var reply: [String: Any] = ["cancelled": image == nil]
                if let image {
                    do { try manager.importWallpaper(image); reply["ok"] = true }
                    catch { reply["error"] = "unreadable" }
                }
                reply["appearance"] = manager.startAppearance.payload
                if webView.url == documentURL { self.resolve(id, result: .value(.from(reply)), in: webView, host: host) }
            }
            manager.isWallpaperPickerPresented = true
            return
        }
        if group == "settings", method.hasPrefix("sync"), let engine = manager?.syncEngine {
            Task { [weak self, weak webView] in
                guard let self, let webView else { return }
                let result = await self.syncResponse(method: method, args: args, engine: engine)
                guard webView.url == documentURL else { return }
                self.resolve(id, result: .value(result), in: webView, host: host)
            }
            return
        }
        if group == nil, method == "clearBrowsingData" {
            Task { [weak self, weak webView] in
                guard let self else { return }
                let result = await self.clearBrowsingData()
                guard let webView, webView.url == documentURL else { return }
                self.resolve(id, result: result, in: webView, host: host)
            }
            return
        }
        var result = liveResponse(group: group, method: method, args: args, appVersion: version)
        if group == "start", method == "data", let layout = manager?.previewLayout(for: webView), case .value(var data) = result {
            data["layout"] = .string(layout.rawValue)
            result = .value(data)
        }
        resolve(id, result: result, in: webView, host: host)
    }

    /// The web Settings page's Clear button, answered once the clearing is done
    /// so the page never says "Cleared." early.
    func clearBrowsingData() async -> BridgeResult {
        await manager?.clearSiteData()
        return .value(.null)
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
            var data = Self.startData(layout: manager?.settingsStore.newtabLayout ?? MobileStartPageDefaults.layout,
                                      adblockEnabled: manager?.settingsStore.adblockEnabled ?? true)
            data["remoteDevices"] = remoteDevicesPayload()
            data["sentItems"] = sentItemsPayload()
            data["bookmarks"] = favoritesPayload()
            data["appearance"] = .from(manager?.startAppearance.payload ?? [:])
            return .value(data)
        case ("start", "renderNativeClock"):
            // The sender validated this native-only capability for newtab.
            return .value(.bool(false))
        case ("start", "setLayout"):
            guard let raw = text(0), let layout = BlancStartPageLayout(rawValue: raw) else { return .reject("Unknown Start Page layout") }
            manager?.setStartLayout(layout)
            return .value(.string(layout.rawValue))
        case ("start", "openIsland"):
            manager?.isPalettePresented = true
            return .value(.null)
        case ("start", "layoutUsed"): return .value(.null)
        case ("start", "topSites"): return .value(.array([]))
        case ("start", "setClock"), ("start", "setDynamicWallpaper"), ("start", "setWallpaper"),
             ("start", "setWallpaperColor"), ("start", "setWallpaperFill"), ("start", "setWallpaperStyle"),
             ("start", "setWallpaperWash"), ("start", "removeWallpaper"):
            do {
                let payload = try manager?.changeStartAppearance(method, value: args.first) ?? [:]
                return .value(.from(payload))
            } catch { return .reject("Could not save Start Page appearance") }
        case ("start", "openSent"), ("start", "dismissSent"):
            return .value(.bool(handleSent(method: method, id: text(0) ?? "")))
        case ("history", "list"):
            let options = args.first as? [String: Any] ?? [:]
            let entries = manager?.historyStore.list(
                query: options["query"] as? String ?? "", limit: (options["limit"] as? NSNumber)?.intValue ?? 500) ?? []
            return .value(.array(entries.map {
                .object([("url", .string($0.url)), ("title", .string($0.title)), ("visitedAt", .number(Double($0.visitedAt))), ("favicon", .null)])
            }))
        case ("history", "remove"):
            guard let url = text(0), args.count > 1, let visitedAt = args[1] as? NSNumber else { return .value(.null) }
            manager?.historyStore.remove(url: url, visitedAt: visitedAt.int64Value)
        case ("history", "clear"):
            manager?.historyStore.clear()
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

    func broadcastAppearance() {
        emit("start.onStatus", payload: .from(["appearance": manager?.startAppearance.payload ?? [:]]), host: "newtab")
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
    /// Send to device (M7b): the start page's Sent to this device list, in
    /// desktop's `SentItem` shape.
    private func sentItemsPayload() -> JSONValue {
        .array((manager?.syncEngine.inbox ?? []).map {
            .object([("id", .string($0.id)), ("url", .string($0.url)), ("title", .string($0.title)), ("sentAt", .number(Double($0.sentAt))), ("fromName", .string($0.fromName))])
        })
    }
    private func handleSent(method: String, id: String) -> Bool {
        guard let manager, let item = manager.syncEngine.inbox.first(where: { $0.id == id }) else { return false }
        if method == "openSent" {
            guard let url = URL(string: item.url), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return false }
            manager.createTab(url: url)
        }
        manager.syncEngine.dismiss(id)
        return true
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
    func emitSettingsChanges() {
        if let engine = manager?.syncEngine {
            emit("settings.onAppearance", payload: .object([
                ("settings", liveSettingsBootstrap()["settings"] ?? .object([])),
                ("syncStatus", engine.status),
            ]), host: "settings")
        }
    }
    func emitSyncChanges() {
        emitSettingsChanges()
        emitRemoteTabs()
        emit("start.onSentItems", payload: sentItemsPayload(), host: "newtab")
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
        for tab in (manager?.tabs ?? []) + (manager?.startPreviews ?? []) where tab.currentURL.scheme == "blanc" && tab.currentURL.host == host {
            var delivered = payload
            if event == "start.onStatus", delivered["layout"] != nil, let layout = manager?.previewLayout(for: tab.webView) {
                delivered["layout"] = .string(layout.rawValue)
            }
            tab.webView.evaluateJavaScript(Self.guardedScript("window.__blancEmit(\(JSONValue.string(event).serialized), \(delivered.serialized));", host: host))
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
        // Settings → Sync's device list, as desktop's sync.listDevices: names
        // and platforms only, never a device id.
        case "syncDevices":
            return .object([
                ("platform", .string("ios")),
                ("devices", .array(engine.sendTargets.map { .object([("name", .string($0.name)), ("platform", .string($0.platform))]) })),
            ])
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
