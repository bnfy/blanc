import CoreGraphics

enum PalettePanelDrag {
    static func closes(translation: CGFloat, predicted: CGFloat, islandAtTop: Bool) -> Bool {
        let direction: CGFloat = islandAtTop ? -1 : 1
        return direction * translation >= 60 || direction * predicted >= 160
    }
}
