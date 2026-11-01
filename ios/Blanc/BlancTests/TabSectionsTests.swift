import XCTest
@testable import Blanc

/// Groups on the phone are laid out and named by desktop's own rules
/// (`src/renderer/tab-sections.js`, `src/main/group-name-case.js`).
final class TabSectionsTests: XCTestCase {
    private func list(_ value: JSONValue?) -> [TabSections.Item] {
        guard case .array(let items) = value else { return [] }
        return items.map { TabSections.Item(id: $0["id"]?.text ?? "", groupId: $0["groupId"]?.text, pinned: $0["pinned"]?.boolean ?? false) }
    }

    func testSectionsMatchDesktop() throws {
        for vector in try SyncVectors.section("tabSections") {
            let items = list(vector["input"]?["list"])
            let expected: [TabSections.Section] = {
                guard case .array(let sections) = vector["expected"]?["sections"] else { return [] }
                return sections.map { section in
                    let ids: [String] = { if case .array(let a) = section["tabIds"] { return a.compactMap(\.text) }; return [] }()
                    return TabSections.Section(groupId: section["groupId"]?.text, tabIds: ids)
                }
            }()
            XCTAssertEqual(TabSections.sections(items), expected, vector["name"]?.text ?? "")
            let order: [String] = { if case .array(let a) = vector["expected"]?["order"] { return a.compactMap(\.text) }; return [] }()
            XCTAssertEqual(TabSections.normalizeOrder(items), order, vector["name"]?.text ?? "")
        }
    }

    func testPlaceInGroupMatchesDesktop() throws {
        for vector in try SyncVectors.section("tabPlaceInGroup") {
            let input = vector["input"]
            let order: [String] = { if case .array(let a) = input?["order"] { return a.compactMap(\.text) }; return [] }()
            let expected: [String] = { if case .array(let a) = vector["expected"] { return a.compactMap(\.text) }; return [] }()
            XCTAssertEqual(TabSections.placeInGroup(order: order, items: list(input?["list"]),
                                                    id: input?["id"]?.text ?? "", groupId: input?["groupId"]?.text ?? ""),
                           expected, vector["name"]?.text ?? "")
        }
    }

    func testGroupNamesMatchDesktop() throws {
        for vector in try SyncVectors.section("groupNames") {
            let raw = vector["input"]?["raw"]?.text ?? ""
            XCTAssertEqual(GroupNames.normalize(raw), vector["expected"]?["normalized"]?.text, raw)
            XCTAssertEqual(GroupNames.key(raw), vector["expected"]?["key"]?.text, raw)
        }
    }
}
