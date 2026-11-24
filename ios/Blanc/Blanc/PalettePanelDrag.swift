import CoreGraphics

/// Dragging the open panel back toward the Island's edge closes it: 60 pt,
/// or a flick that would carry it 160 pt. A drag away never does.
enum PalettePanelDrag {
    static func closes(translation: CGFloat, predicted: CGFloat, islandAtTop: Bool) -> Bool {
        let direction: CGFloat = islandAtTop ? -1 : 1
        return direction * translation >= 60 || direction * predicted >= 160
    }
}
