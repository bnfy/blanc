import SwiftUI

struct IslandDotsView: View {
    let row: IslandDots.Row
    let ink: Color
    let isLoading: Bool
    let swipeProgress: CGFloat
    let reduceMotion: Bool

    var body: some View {
        HStack(spacing: 8) {
            ZStack(alignment: .leading) {
                HStack(spacing: 8) {
                    ForEach(row.dots, id: \.id) { dot in
                        shape(dot).opacity(0.22)
                    }
                }
                if let index = row.dots.firstIndex(where: \.isActive) {
                    let place = min(max(CGFloat(index) + (reduceMotion ? 0 : swipeProgress), 0), CGFloat(row.dots.count - 1))
                    Group {
                        if isLoading && !reduceMotion {
                            shape(row.dots[index])
                                .phaseAnimator([false, true]) { dot, faded in
                                    dot.opacity(faded ? 0.35 : 1)
                                } animation: { _ in .easeInOut(duration: 0.9) }
                        } else {
                            shape(row.dots[index])
                        }
                    }
                    .offset(x: place * 14)
                }
            }
            if row.overflow > 0 {
                Text(row.overflow, format: .number.sign(strategy: .always()))
                    .font(BrowserStyle.font(11))
                    .foregroundStyle(ink.opacity(0.55))
            }
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("island.dots")
    }

    private func shape(_ dot: IslandDots.Dot) -> some View {
        Group {
            if dot.isPrivate { Circle().strokeBorder(ink, lineWidth: 1) }
            else { Circle().fill(ink) }
        }
        .frame(width: 6, height: 6)
    }
}
