import Observation
import Foundation

@Observable
final class TabsManager {
    private(set) var tabs: [TabModel] = []
    var activeTabId: UUID?

    let normalizer = AddressNormalizer(searchEngine: BlancSettingsDefaults.searchEngine)

    var activeTab: TabModel? {
        guard let activeTabId else { return nil }
        return tabs.first { $0.id == activeTabId }
    }

    init() {
        createTab()
    }

    @discardableResult
    func createTab(url: URL = URL(string: "https://example.com")!) -> UUID {
        let tab = TabModel(url: url)
        tabs.append(tab)
        activeTabId = tab.id
        return tab.id
    }

    func closeTab(_ id: UUID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let wasActive = id == activeTabId
        tabs.remove(at: index)

        if tabs.isEmpty {
            createTab()
            return
        }

        if wasActive {
            let nextIndex = min(index, tabs.count - 1)
            activeTabId = tabs[nextIndex].id
        }
    }

    func setActive(_ id: UUID) {
        guard tabs.contains(where: { $0.id == id }) else { return }
        activeTabId = id
    }

    func submitActiveTabAddress() {
        activeTab?.submitAddress(using: normalizer)
    }
}
