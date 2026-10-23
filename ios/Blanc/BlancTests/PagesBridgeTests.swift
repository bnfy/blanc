import XCTest
import JavaScriptCore
@testable import Blanc

final class PagesBridgeTests: XCTestCase {
    private func value(_ group: String?, _ method: String) -> JSONValue {
        guard case .value(let v) = PagesBridge.response(group: group, method: method, appVersion: "9.9") else {
            XCTFail("expected a value for \(group ?? "root").\(method)")
            return .null
        }
        return v
    }

    // JSONValue serializes deterministically (ordered object pairs).
    func testJSONValueSerialization() {
        XCTAssertEqual(JSONValue.array([]).serialized, "[]")
        XCTAssertEqual(JSONValue.object([]).serialized, "{}")
        XCTAssertEqual(JSONValue.bool(false).serialized, "false")
        XCTAssertEqual(JSONValue.null.serialized, "null")
        XCTAssertEqual(
            JSONValue.object([("ok", .bool(false)), ("message", .string("x"))]).serialized,
            "{\"ok\":false,\"message\":\"x\"}")
    }

    // appVersion echoes the passed version as a JSON string.
    func testAppVersion() {
        XCTAssertEqual(value(nil, "appVersion"), .string("9.9"))
    }

    // List reads are empty arrays; permissions is a RECORD ({}), not [].
    func testEmptyReads() {
        XCTAssertEqual(value("bookmarks", "list"), .array([]))
        XCTAssertEqual(value("history", "list"), .array([]))
        XCTAssertEqual(value("downloads", "list"), .array([]))
        XCTAssertEqual(value("permissions", "list"), .object([]))
    }

    // No-op writes resolve to null.
    func testNoOpWrites() {
        XCTAssertEqual(value("bookmarks", "clearFavicon"), .null)
        XCTAssertEqual(value("history", "clear"), .null)
        XCTAssertEqual(value("downloads", "clearFinished"), .null)
        XCTAssertEqual(value("settings", "set"), .null)
        XCTAssertEqual(value("start", "focusGroup"), .null)
    }

    func testBookmarksCapabilitiesReadOnlyAndEditsReject() {
        XCTAssertEqual(value("bookmarks", "capabilities"), .object([("editable", .bool(false))]))
        for method in ["remove", "setFolder", "renameFolder", "removeFolder", "import", "importBrowser"] {
            guard case .reject = PagesBridge.response(group: "bookmarks", method: method, appVersion: "test") else {
                XCTFail("read-only Favorites accepted \(method)")
                continue
            }
        }
    }

    // Structured sync/supporter/default-browser shapes match what settings.js reads.
    func testStructuredShapes() {
        XCTAssertEqual(value("settings", "syncGet"), .object([("enabled", .bool(false))]))
        XCTAssertEqual(value("settings", "syncNow"), .object([("enabled", .bool(false))]))
        XCTAssertEqual(value("settings", "syncDisable"),
                       .object([("status", .object([("enabled", .bool(false))]))]))
        XCTAssertEqual(value("settings", "syncEnable"),
                       .object([
                           ("ok", .bool(false)),
                           ("created", .bool(false)),
                           ("message", .string("Sync isn’t available in this build yet.")),
                           ("status", .object([("enabled", .bool(false))])),
                       ]))
        XCTAssertEqual(value("settings", "activateSupporter"),
                       .object([
                           ("ok", .bool(false)),
                           ("message", .string("Supporter activation isn’t available in this build yet.")),
                       ]))
        XCTAssertEqual(value("defaultBrowser", "get"),
                       .object([("isDefault", .bool(false)), ("canSet", .bool(false))]))
        XCTAssertEqual(value("defaultBrowser", "set"),
                       .object([("isDefault", .bool(false)), ("canSet", .bool(false))]))
    }

    // start.data has empty groups and a zero blocked count.
    func testStartData() {
        XCTAssertEqual(value("start", "data"),
                       .object([("groups", .array([])), ("blockedThisWeek", .number(0))]))
    }

    // settings.get returns the full bootstrap payload built from the generated
    // substrate: settings/searchEngines/appIcons/capabilities.
    func testSettingsGetShape() {
        guard case .object(let pairs) = value("settings", "get") else {
            return XCTFail("settings.get should be an object")
        }
        let keys = pairs.map(\.0)
        XCTAssertEqual(keys, ["settings", "searchEngines", "appIcons", "capabilities"])

        let dict = Dictionary(uniqueKeysWithValues: pairs)
        // Every engine and icon in the generated substrate, keyed by the
        // stored id (`sunrise-dark`, not the Swift case name).
        if case .object(let engines)? = dict["searchEngines"] {
            XCTAssertEqual(engines.map(\.0), BlancSearchEngine.allCases.map(\.rawValue))
        } else { XCTFail("searchEngines must be a record") }
        if case .object(let icons)? = dict["appIcons"] {
            XCTAssertEqual(icons.map(\.0), ["sunrise", "sunrise-dark", "sunrise-gold"])
        } else { XCTFail("appIcons must be a record") }

        // usagePing comes from BlancSettingsDefaults, not a hardcode.
        if case .object(let s)? = dict["settings"] {
            let sd = Dictionary(uniqueKeysWithValues: s)
            XCTAssertEqual(sd["usagePing"], JSONValue.bool(BlancSettingsDefaults.usagePing))
            XCTAssertEqual(sd["searchEngine"], JSONValue.string(BlancSettingsDefaults.searchEngine.rawValue))
            XCTAssertEqual(sd["patronActive"], JSONValue.bool(false))
            XCTAssertEqual(sd["appIcon"], JSONValue.string("sunrise"))
        } else { XCTFail("settings must be an object") }
    }

    // settings.get advertises the platform capabilities settings.js gates on.
    func testSettingsGetCapabilities() {
        guard case .object(let pairs) = value("settings", "get") else {
            return XCTFail("settings.get should be an object")
        }
        let dict = Dictionary(uniqueKeysWithValues: pairs)
        guard case .array(let caps)? = dict["capabilities"] else {
            return XCTFail("capabilities must be an array")
        }
        let capStrings = caps.compactMap { val -> String? in
            if case .string(let s) = val { return s }
            return nil
        }
        XCTAssertEqual(Set(capStrings), Set(["theme", "searchEngine", "adblockEnabled", "sync"]))
    }

    // shortcuts.list is stubbed (typeable via the address bar), not rejected.
    func testShortcutsListStubbed() {
        XCTAssertEqual(value("shortcuts", "list"), .array([]))
    }

    // A genuinely unknown group/method rejects rather than resolving.
    func testUnknownRejects() {
        switch PagesBridge.response(group: "bogus", method: "nope", appVersion: "9.9") {
        case .reject: break
        case .value: XCTFail("unknown method should reject")
        }
        switch PagesBridge.response(group: "settings", method: "teleport", appVersion: "9.9") {
        case .reject: break  // unknown method on a known group still rejects
        case .value: XCTFail("settings.teleport should reject")
        }
    }

    // The shim's member list comes from desktop's bridges.json, bundled as a
    // resource, so the methods newtab.js calls unguarded exist on iOS too.
    func testBundledMembersFollowTheDesktopContract() {
        let names = Set(PagesBridge.bundledMembers.map(\.name))
        for name in ["start.data", "start.onVisibility", "start.onRemoteTabs", "surface.close", "settings.get"] {
            XCTAssertTrue(names.contains(name), "missing \(name)")
        }
        XCTAssertTrue(PagesBridge.userScriptSource.contains("\"start.onVisibility\""))
        XCTAssertFalse(PagesBridge.userScriptSource.contains("__BLANC_MEMBERS__"))
    }

    func testMembersParseFromBridgesJSON() {
        let json = #"{"bowserPages":{"members":[{"name":"start.data","kind":"invoke","hosts":["newtab"]},{"name":"broken"}]}}"#
        XCTAssertEqual(PagesBridge.members(fromBridgesJSON: Data(json.utf8)),
                       [PagesBridge.Member(name: "start.data", kind: "invoke", hosts: ["newtab"])])
        XCTAssertEqual(PagesBridge.members(fromBridgesJSON: Data("nope".utf8)), [])
    }
    func testGuardedScriptChecksLiveDocumentOriginBeforeDelivery() throws {
        for (scheme, host, expected) in [("blanc:", "newtab", 1), ("https:", "example.com", 0), ("blanc:", "bookmarks", 0)] {
            let context = try XCTUnwrap(JSContext())
            context.evaluateScript("var window = { location: { protocol: '\(scheme)', host: '\(host)' }, deliveries: 0 };")
            context.evaluateScript(PagesBridge.guardedScript("window.deliveries += 1;", host: "newtab"))
            XCTAssertNil(context.exception)
            XCTAssertEqual(context.evaluateScript("window.deliveries")?.toInt32(), Int32(expected))
        }
    }
    func testFavoritesRefreshOnlyChangesInternalFavoritesSurfaces() throws {
        let before: JSONValue = .array([])
        let after: JSONValue = .array([.object([("id", .string("favorite"))])])
        XCTAssertNil(PagesBridge.favoritesRefreshScript(previous: before, current: before, host: "newtab"))
        for host in ["settings", "history", "example.com"] {
            XCTAssertNil(PagesBridge.favoritesRefreshScript(previous: before, current: after, host: host))
        }
        for host in ["newtab", "bookmarks"] {
            let script = try XCTUnwrap(PagesBridge.favoritesRefreshScript(previous: before, current: after, host: host))
            let context = try XCTUnwrap(JSContext())
            context.evaluateScript("var reloads = 0; var window = { location: { protocol: 'blanc:', host: '\(host)', reload: function () { reloads += 1; } } };")
            context.evaluateScript(script)
            XCTAssertEqual(context.evaluateScript("reloads")?.toInt32(), 1)
            context.evaluateScript("window.location.protocol = 'https:'; window.location.host = 'example.com';")
            context.evaluateScript(script)
            XCTAssertEqual(context.evaluateScript("reloads")?.toInt32(), 1)
        }
        XCTAssertNotNil(PagesBridge.favoritesRefreshScript(previous: after, current: before, host: "bookmarks"), "Disabling or switching away must clear rendered Favorites")
    }

}
