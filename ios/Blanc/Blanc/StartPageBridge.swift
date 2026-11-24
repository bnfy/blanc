import Foundation
import WebKit
import UIKit

/// The desktop fork's Start Page asks native code over
/// `chrome.send('blancNewTab', [id, method, args])` and hears back through
/// `window.blancNewTabReply(id, ok, value)` and `window.blancNewTabEvent(kind)`
/// (`newtab-adapter.js`). Android answers it in `blanc_pages_ui.cc`'s
/// `OnStartCall`; this answers it on the iPhone, from the iPhone's stores.
/// Only `blanc://newtab` documents, main frame, get the channel.
@MainActor
final class StartPageBridge: NSObject, WKScriptMessageHandler {
    static let messageHandlerName = "blancNewTab"
    private weak var manager: TabsManager?

    init(manager: TabsManager) {
        self.manager = manager
        super.init()
    }

    /// At document start, before the page's scripts: `chrome.send` for the
    /// adapter, `blancNativeClock` for the Liquid Glass clock (`newtab.js`
    /// hands it a Glass clock to draw), and `blancIos.send` for the phone layer.
    static let userScriptSource = #"""
    (function () {
      if (location.protocol !== 'blanc:' || location.host !== 'newtab') return;
      const post = message => window.webkit.messageHandlers.blancNewTab.postMessage(message);
      window.chrome = window.chrome || {};
      window.chrome.send = function (name, args) {
        if (name !== 'blancNewTab' || !Array.isArray(args) || args.length !== 3) return;
        post({ id: String(args[0]), method: String(args[1]), args: Array.isArray(args[2]) ? args[2] : [] });
      };
      const clocks = new Map();
      let nextClock = 0;
      window.__blancIosClockReply = function (id, rendered) {
        const resolve = clocks.get(id);
        if (!resolve) return;
        clocks.delete(id);
        resolve(rendered === true);
      };
      window.blancNativeClock = {
        render: value => new Promise(resolve => {
          const id = ++nextClock;
          clocks.set(id, resolve);
          post({ clock: id, value: value ?? null });
        }),
      };
      window.blancIos = { send: (kind, value) => post({ ios: String(kind), value: value ?? null }) };
    })();
    """#

    // MARK: The phone layer's state

    /// `ios-start-state.js`: what the phone layer needs before the page's first
    /// paint: where the Island sits, the one-time carry-over of the choices made
    /// before the fork's page, and the regular page's wallpaper choices for a
    /// private page, whose storage starts empty.
    nonisolated static func stateScript(islandTop: Bool, migration: [String: Any]?, preferences: String?) -> String {
        var state: [String: Any] = ["island": islandTop ? "top" : "bottom"]
        if let migration { state["migration"] = migration }
        if let preferences { state["preferences"] = preferences }
        let json = (try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return "window.__blancIosStart=" + json + ";\n"
    }

    // MARK: Messages

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let webView = message.webView, Self.isStartPage(webView.url),
              message.frameInfo.isMainFrame, Self.isStartPage(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let manager else { return }
        let tab = manager.tabs.first { $0.existingWebView === webView }
        let isPrivate = tab?.isPrivate ?? (webView.url?.query?.contains("private") == true)
        if let clock = body["clock"] as? Int {
            let rendered = tab?.nativeClock.render(body["value"] as? [String: Any], in: webView) ?? false
            evaluate("window.__blancIosClockReply(\(clock), \(rendered));", in: webView)
            return
        }
        if let kind = body["ios"] as? String {
            phoneLayer(kind, value: body["value"], isPrivate: isPrivate)
            return
        }
        guard let id = body["id"] as? String, id.count <= 32, let method = body["method"] as? String else { return }
        let args = body["args"] as? [Any] ?? []
        let result = answer(method, args: args, isPrivate: isPrivate, tab: tab)
        reply(id, result, in: webView)
        if case .value = result, let kind = Self.changeEvent(method) {
            manager.services.broadcastStartPage(kind, except: webView)
        }
    }

    nonisolated static func isStartPage(_ url: URL?) -> Bool { url?.scheme == "blanc" && url?.host == "newtab" }

    /// Which other Start Pages hear of a change this call made.
    static func changeEvent(_ method: String) -> String? {
        switch method {
        case "clockWrite": return "clock"
        case "widgetsWrite", "widgetsShortcuts", "widgetsSize", "widgetsPlace": return "widgets"
        case "pinsPin", "pinsUnpin": return "pins"
        case "dismissSent", "openSent": return "sentItems"
        default: return nil
        }
    }

    private func phoneLayer(_ kind: String, value: Any?, isPrivate: Bool) {
        guard let services = manager?.services, !isPrivate else { return }
        switch kind {
        // The regular page's wallpaper record, handed to private pages later.
        case "preferences":
            if let text = value as? String, text.utf8.count <= 64 * 1024 { services.startPage.preferences = text }
        // The page stored what the first run after the update handed it.
        case "migrated":
            try? services.startAppearance.finishForkMigration()
        default: break
        }
    }

    /// The answer to `method`, following `OnStartCall`.
    func answer(_ method: String, args: [Any], isPrivate: Bool, tab: TabModel?) -> BridgeResult {
        guard let manager else { return .reject("Not the Start Page") }
        let services = manager.services
        let text = { (index: Int) in args.indices.contains(index) ? args[index] as? String : nil }
        switch method {
        case "clockRead" where args.isEmpty:
            return .value(.from(services.startAppearance.clock))
        case "clockWrite" where args.count == 1:
            guard let update = args[0] as? [String: Any],
                  let clock = try? services.startAppearance.writeClock(update) else { return .reject("Could not save the clock") }
            return .value(.from(clock))
        // Billboard is the one layout (V24).
        case "layoutRead" where args.isEmpty, "layoutWrite" where args.count == 1, "layoutInitialize" where args.count == 1:
            return .value(.string("billboard"))
        case _ where method.hasPrefix("widgets"):
            do { return .value(.from(try services.startPage.changeWidgets(method, args: args))) }
            catch StartPageStore.WidgetError.invalid(let reason) { return .reject(reason) }
            catch { return .reject("not-yet") }
        case "bookmarks" where args.isEmpty:
            return .value(manager.favoritesPayload(fetchingIcons: !isPrivate))
        case "topSites":
            if isPrivate { return .value(.array([])) }
            #if DEBUG
            // The App Store images' Start Page is the clock alone: the seed's
            // history would leave a single stray shortcut (owner, 2026-11-21).
            if UITestSeed.appStore { return .value(.array([])) }
            #endif
            var offset = 0, limit = 48
            if !args.isEmpty {
                guard args.count == 2, let o = StartPageStore.int(args[0]), let l = StartPageStore.int(args[1]),
                      (0...5000).contains(o), (1...48).contains(l) else { return .reject("Invalid Top Sites page") }
                offset = o; limit = l
            }
            let sites = StartPageStore.topSites(services.historyStore.entries,
                                                now: Int64(Date().timeIntervalSince1970 * 1000), offset: offset, limit: limit)
            return .value(.from(withIcons(sites, isPrivate: isPrivate)))
        case "pinsList" where args.isEmpty:
            return .value(.from(["max": StartPageStore.maxPins, "pins": withIcons(services.startPage.pins, isPrivate: isPrivate)]))
        case "pinsPin" where args.count == 2, "pinsUnpin" where args.count == 1:
            guard let url = text(0), method == "pinsUnpin" || text(1) != nil else { return .reject("Unsupported start-page request") }
            if isPrivate { return .value(method == "pinsPin" ? .object([("ok", .bool(false)), ("reason", .string("private"))]) : .bool(false)) }
            return .value(.from(services.startPage.changePin(pin: method == "pinsPin", url: url, title: text(1) ?? "")))
        // The iPhone has no tab groups on the Start Page yet, as on Android.
        case "groupsRead": return .value(.array([]))
        case "focusGroup": return .value(.bool(false))
        // A private Start Page gets nothing from other devices, as on desktop.
        case "remoteDevices": return .value(isPrivate ? .array([]) : manager.remoteDevicesPayload())
        case "sentItems":
            #if DEBUG
            // The App Store images' Start Page is the clock alone; the seed's
            // sent pages show in the palette's shot instead.
            if UITestSeed.appStore { return .value(.array([])) }
            #endif
            return .value(isPrivate ? .array([]) : manager.sentItemsPayload())
        case "openSent" where args.count == 1, "dismissSent" where args.count == 1:
            guard !isPrivate, let id = text(0) else { return .value(.bool(false)) }
            return .value(.bool(manager.handleSent(method: method, id: id)))
        // iOS content blockers can't count what they block: no line under the clock.
        case "blockedWeek": return .value(.null)
        case "openMahjong":
            manager.createTab(url: URL(string: isPrivate ? "blanc://mahjong/?private=1" : "blanc://mahjong/")!, isPrivate: isPrivate,
                              quiet: args.first as? Bool == true)
            return .value(.bool(true))
        // The Favorites heading opens the Favorites page, in this tab.
        case "openSheet" where text(0) == "bookmarks":
            tab?.webView.load(URLRequest(url: URL(string: "blanc://bookmarks/")!))
            return .value(.bool(true))
        case "openIsland":
            manager.openPalette(text: text(0) ?? "")
            return .value(.bool(true))
        case "openSettings":
            manager.showSettings(text(0) == "sync" ? .sync : text(0) == "privacy" ? .privacy : .root)
            return .value(.bool(true))
        // Desktop's installed browser themes, the Island's band, Patron, the
        // moving-in checklist and What's New have no iPhone counterpart.
        case "installedTheme" where args.count == 1 && args[0] is String:
            return .value(text(0)!.isEmpty ? .null : .object([]))
        case "islandBackdrop": return .value(.object([("band", .number(0)), ("rail", .number(0))]))
        case "firstRun", "patronCallout", "checklist", "whatsNew", "patronCalloutDismiss", "checklistDismiss",
             "whatsNewDismiss", "layoutUsed":
            return .value(.null)
        case "launchSunrise": return .value(.bool(false))
        // The walkthrough, default browser and imports are native on the iPhone.
        default: return .reject("not-yet")
        }
    }

    /// Each item with its site's icon, as Android's `WithIcons` adds them; a
    /// private Start Page shows none (the page draws letters there anyway).
    private func withIcons(_ items: [[String: String]], isPrivate: Bool) -> [[String: String]] {
        guard !isPrivate, let icons = manager?.services.siteIcons else { return items }
        var missing: [String] = []
        let out = items.map { item in
            var item = item
            if let url = item["url"] {
                if let icon = icons.icon(for: url) { item["favicon"] = icon } else { missing.append(url) }
            }
            return item
        }
        // Those without one are fetched now; open Start Pages redraw as they arrive.
        icons.backfill(missing)
        return out
    }

    private func reply(_ id: String, _ result: BridgeResult, in webView: WKWebView) {
        let (ok, payload): (Bool, String)
        switch result {
        case .value(let value): (ok, payload) = (true, value.serialized)
        case .reject(let error): (ok, payload) = (false, JSONValue.string(error).serialized)
        }
        evaluate("window.blancNewTabReply(\(JSONValue.string(id).serialized), \(ok), \(payload));", in: webView)
    }

    private func evaluate(_ script: String, in webView: WKWebView) {
        webView.evaluateJavaScript(PagesBridge.guardedScript(script, host: "newtab"))
    }

    /// Tells every Start Page in `tabs` (except `except`) that `kind` changed.
    static func broadcast(_ kind: String, to tabs: [TabModel], except: WKWebView? = nil) {
        for tab in tabs where isStartPage(tab.currentURL) {
            guard let webView = tab.existingWebView, webView !== except else { continue }
            webView.evaluateJavaScript(PagesBridge.guardedScript(
                "window.blancNewTabEvent?.(\(JSONValue.string(kind).serialized));", host: "newtab"))
        }
    }
}

/// What the Start Page and the Favorites page both read from Sync.
extension TabsManager {
    func favoritesPayload(fetchingIcons: Bool = true) -> JSONValue {
        // A Favorite saved without an icon (the phone saves none) shows its site's,
        // fetched now if the phone has none yet.
        let favorites = syncEngine.favorites
        if fetchingIcons { services.siteIcons.backfill(favorites.filter { $0.favicon == nil && services.siteIcons.icon(for: $0.url) == nil }.map(\.url)) }
        return .array(favorites.map {
            let favicon = $0.favicon ?? services.siteIcons.icon(for: $0.url)
            return .object([("addedAt", .number($0.addedAt)), ("updatedAt", .number($0.updatedAt)), ("id", .string($0.id)), ("url", .string($0.url)), ("title", .string($0.title)), ("favicon", favicon.map(JSONValue.string) ?? .null), ("folder", $0.folder.map(JSONValue.string) ?? .null)])
        })
    }
    /// Send to device (M7b): the Start Page's Sent to this device list, in
    /// desktop's `SentItem` shape.
    func sentItemsPayload() -> JSONValue {
        .array(syncEngine.inbox.map {
            .object([("id", .string($0.id)), ("url", .string($0.url)), ("title", .string($0.title)), ("sentAt", .number(Double($0.sentAt))), ("fromName", .string($0.fromName))])
        })
    }
    func handleSent(method: String, id: String) -> Bool {
        guard let item = syncEngine.inbox.first(where: { $0.id == id }) else { return false }
        if method == "openSent" {
            guard let url = URL(string: item.url), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return false }
            createTab(url: url)
        }
        syncEngine.dismiss(id)
        return true
    }
    func remoteDevicesPayload() -> JSONValue {
        let engine = syncEngine
        return .array(engine.remoteDevices.map { device in
            .object([("id", .string(device.id)), ("name", .string(device.name)), ("tabs", .array(device.tabs.map { tab in
                .object([("url", .string(tab.url)), ("title", .string(tab.title)), ("favicon", SyncedIcons.icon(for: tab.url, in: engine.icons["devices"] ?? .object([])).map(JSONValue.string) ?? .null)])
            }))])
        })
    }
}
