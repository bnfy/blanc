// CI only: switch a hosted macOS runner's main display to its tallest mode.
//
// Desktop acceptance scenarios resize Blanc's window to sizes such as
// 1440x840 and wait for the content to reach that size, but macOS clamps a
// window to the screen's visible height. GitHub's macOS runners boot with a
// short display (content stopped at 684 px tall), so those scenarios could
// never pass there. This prints the available modes, picks the tallest one
// (widest on a tie) and applies it for this login session only.
//
//   swift scripts/ci-macos-tall-display.swift
import CoreGraphics
import Foundation

let display = CGMainDisplayID()
let options = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
guard let modes = CGDisplayCopyAllDisplayModes(display, options) as? [CGDisplayMode], !modes.isEmpty else {
  print("no display modes reported; leaving the display unchanged")
  exit(0)
}
func describe(_ mode: CGDisplayMode) -> String { "\(mode.width)x\(mode.height) (pixels \(mode.pixelWidth)x\(mode.pixelHeight))" }
if let current = CGDisplayCopyDisplayMode(display) { print("current: \(describe(current))") }
for mode in modes { print("available: \(describe(mode))") }
let tallest = modes.max { ($0.height, $0.width) < ($1.height, $1.width) }!
var config: CGDisplayConfigRef?
guard CGBeginDisplayConfiguration(&config) == .success else { print("could not begin display configuration"); exit(1) }
CGConfigureDisplayWithDisplayMode(config, display, tallest, nil)
let result = CGCompleteDisplayConfiguration(config, .forSession)
guard result == .success else { print("could not apply \(describe(tallest)): \(result)"); exit(1) }
if let now = CGDisplayCopyDisplayMode(display) { print("applied: \(describe(now))") }
