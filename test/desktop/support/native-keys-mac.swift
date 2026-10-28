// Real macOS key and mouse input for browser-shortcuts-smoke.mjs, posted as
// HID events (CGEvent), so a key release takes the same native path a
// keyboard's does. Electron's sendInputEvent skips that path. Posting needs
// Accessibility permission for this process or the process responsible for
// it; the first line says "ready" or "untrusted".
// Reads one command per line on stdin: down <key>, up <key>, sleep <ms>,
// click <x> <y> (global display points), done (answers "done").
import ApplicationServices
import CoreGraphics
import Foundation

print(AXIsProcessTrusted() ? "ready" : "untrusted")
fflush(stdout)

let codes: [String: CGKeyCode] = ["ctrl": 59, "shift": 56, "tab": 48, "escape": 53, "w": 13]
let modifierFlags: [String: CGEventFlags] = ["ctrl": .maskControl, "shift": .maskShift]
let source = CGEventSource(stateID: .hidSystemState)
var flags: CGEventFlags = []

while let line = readLine() {
  let parts = line.split(separator: " ").map(String.init)
  guard let op = parts.first else { continue }
  switch op {
  case "down", "up":
    guard parts.count > 1, let code = codes[parts[1]] else { continue }
    let down = op == "down"
    if let flag = modifierFlags[parts[1]] {
      if down { flags.insert(flag) } else { flags.remove(flag) }
    }
    guard let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { continue }
    if modifierFlags[parts[1]] != nil { event.type = .flagsChanged }
    event.flags = flags
    event.post(tap: .cghidEventTap)
  case "sleep":
    usleep(useconds_t((Int(parts.count > 1 ? parts[1] : "0") ?? 0) * 1000))
  case "click":
    guard parts.count > 2, let x = Double(parts[1]), let y = Double(parts[2]) else { continue }
    let point = CGPoint(x: x, y: y)
    for type in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
      CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
      usleep(30_000)
    }
  case "done":
    print("done")
    fflush(stdout)
  default:
    break
  }
}
