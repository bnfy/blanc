import AppKit
import ApplicationServices
let pid=Int32(try String(contentsOfFile:"/private/tmp/blanc-task0/test.pid",encoding:.utf8).trimmingCharacters(in:.whitespacesAndNewlines))!
let app=NSRunningApplication(processIdentifier:pid)!
if let data=app.icon?.tiffRepresentation,let rep=NSBitmapImageRep(data:data),let png=rep.representation(using:.png,properties:[:]){try png.write(to:URL(fileURLWithPath:"/private/tmp/blanc-task0/native-application-icon.png"))}
func attr(_ e:AXUIElement,_ key:String)->CFTypeRef?{var v:CFTypeRef?;AXUIElementCopyAttributeValue(e,key as CFString,&v);return v}
let dock=NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.dock").first!
func walk(_ e:AXUIElement,_ depth:Int){if depth>5{return};let title=attr(e,kAXTitleAttribute) as? String ?? "";if title.contains("Blanc"){print(title,attr(e,kAXURLAttribute) ?? "" as CFString,attr(e,kAXPositionAttribute) ?? "" as CFString,attr(e,kAXSizeAttribute) ?? "" as CFString)};for c in attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? []{walk(c,depth+1)}}
walk(AXUIElementCreateApplication(dock.processIdentifier),0)
