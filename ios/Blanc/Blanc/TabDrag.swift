import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Dragging a tab between windows (multiple windows design, W3). Inside
/// Blanc the drag names the tab; another app sees only the page's address.
/// Dropped outside Blanc's windows, it carries a user activity, so iPadOS
/// opens a new window for the tab.
enum TabDrag {
    static let activityType = "me.bnfy.blanc.moveTab"
    static let tabIdKey = "tabId"
    private static let prefix = "blanc-tab:"

    static func itemProvider(for tab: TabModel) -> NSItemProvider {
        // The activity is the drag's own item, visible to the system:
        // dropped at a screen edge, iPadOS opens the window it asks for. With
        // the address first (or the activity hidden), it opened the page in
        // Safari instead.
        let activity = NSUserActivity(activityType: activityType)
        activity.title = TabTitle.display(tab)
        activity.userInfo = [tabIdKey: tab.id.uuidString]
        let provider = UIApplication.shared.supportsMultipleScenes ? NSItemProvider(object: activity) : NSItemProvider()
        let marker = Data((prefix + tab.id.uuidString).utf8)
        provider.registerDataRepresentation(forTypeIdentifier: UTType.plainText.identifier, visibility: .ownProcess) { done in
            done(marker, nil)
            return nil
        }
        if ReaderController.isWebURL(tab.currentURL) {
            provider.registerObject(tab.currentURL as NSURL, visibility: .all)
        }
        provider.suggestedName = TabTitle.display(tab)
        return provider
    }

    /// The tab a drop or an activity names, if it's one of Blanc's.
    static func tabId(from text: String) -> UUID? {
        guard text.hasPrefix(prefix) else { return nil }
        return UUID(uuidString: String(text.dropFirst(prefix.count)))
    }

    static func tabId(from activity: NSUserActivity) -> UUID? {
        guard activity.activityType == activityType, let raw = activity.userInfo?[tabIdKey] as? String else { return nil }
        return UUID(uuidString: raw)
    }

    /// Reads a dropped tab and hands its id over on the main thread.
    static func loadTabId(from providers: [NSItemProvider], _ found: @escaping (UUID) -> Void) -> Bool {
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) else {
            return false
        }
        provider.loadDataRepresentation(forTypeIdentifier: UTType.plainText.identifier) { data, _ in
            guard let data, let text = String(data: data, encoding: .utf8), let id = tabId(from: text) else { return }
            DispatchQueue.main.async { found(id) }
        }
        return true
    }
}

extension View {
    /// Lets a tab be dragged to another window, or out to make one.
    func tabDrag(_ tab: TabModel) -> some View {
        onDrag { TabDrag.itemProvider(for: tab) }
    }

    /// Takes a tab dragged here from another window.
    func tabDrop(into manager: TabsManager) -> some View {
        onDrop(of: [.plainText], isTargeted: nil) { providers in
            TabDrag.loadTabId(from: providers) { id in manager.services.moveTab(id, to: manager) }
        }
    }
}
