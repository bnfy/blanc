import AppKit
import ApplicationServices
let app=NSWorkspace.shared.runningApplications.first{ app in if let pid=ProcessInfo.processInfo.environment["BLANC_TEST_PID"] { return app.processIdentifier == Int32(pid) }; return app.localizedName == "Blanc Prototype" }!
let root=AXUIElementCreateApplication(app.processIdentifier)
func attr(_ e:AXUIElement,_ key:String)->CFTypeRef?{var v:CFTypeRef?;AXUIElementCopyAttributeValue(e,key as CFString,&v);return v}
func rect(_ e:AXUIElement)->CGRect?{guard let p=attr(e,kAXPositionAttribute),let s=attr(e,kAXSizeAttribute) else{return nil};var point=CGPoint.zero;var size=CGSize.zero;AXValueGetValue(p as! AXValue,.cgPoint,&point);AXValueGetValue(s as! AXValue,.cgSize,&size);return CGRect(origin:point,size:size)}
func walk(_ e:AXUIElement,_ depth:Int,_ prefix:String?){if depth>30{return};let role=attr(e,kAXRoleAttribute) as? String ?? "";let title=attr(e,kAXTitleAttribute) as? String ?? "";if role.contains("Button") || role=="AXWindow" {print("\(role) \(title) \(String(describing:rect(e)))")};if let prefix=prefix,role.contains("Button"),title.hasPrefix(prefix),let r=rect(e){click(r.midX,r.midY);print("CLICKED \(title)");exit(0)};for c in attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? []{walk(c,depth+1,prefix)}}
func activate() {
 if NSWorkspace.shared.frontmostApplication?.processIdentifier != app.processIdentifier { app.activate() }
 RunLoop.current.run(until: Date().addingTimeInterval(0.35))
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else { fputs("Prototype did not activate\n",stderr);exit(2) }
}
func click(_ x:Double,_ y:Double){activate();let p=CGPoint(x:x,y:y);CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:p,mouseButton:.left)?.post(tap:.cghidEventTap);CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:p,mouseButton:.left)?.post(tap:.cghidEventTap);usleep(150000)}
let args=Array(CommandLine.arguments.dropFirst())
switch args.first ?? "tree" {
case "key": activate();let key=CGKeyCode(args[1])!;let flags=CGEventFlags(rawValue:UInt64(args.count>2 ? args[2]:"0")!);for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:key,keyDown:down)!;e.flags=flags;e.post(tap:.cghidEventTap)};usleep(150000)
case "text": activate();let chars=Array(args[1].utf16);for down in [true,false]{let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)!;e.flags=[];e.keyboardSetUnicodeString(stringLength:chars.count,unicodeString:chars);e.post(tap:.cghidEventTap)};usleep(150000)
case "click": click(Double(args[1])!,Double(args[2])!)
case "drag":
 activate();let a=CGPoint(x:Double(args[1])!,y:Double(args[2])!);let b=CGPoint(x:Double(args[3])!,y:Double(args[4])!);
 CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:a,mouseButton:.left)?.post(tap:.cghidEventTap);usleep(100000)
 CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:a,mouseButton:.left)?.post(tap:.cghidEventTap);usleep(180000)
 for i in 1...40 {let f=Double(i)/40;let p=CGPoint(x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f);CGEvent(mouseEventSource:nil,mouseType:.leftMouseDragged,mouseCursorPosition:p,mouseButton:.left)?.post(tap:.cghidEventTap);usleep(18000)}
 usleep(100000);CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:b,mouseButton:.left)?.post(tap:.cghidEventTap);usleep(200000)
case "windows": let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? [];for w in windows where w[kCGWindowOwnerPID as String] as? Int == Int(app.processIdentifier){print(w[kCGWindowNumber as String]!,w[kCGWindowBounds as String]!,w[kCGWindowName as String] ?? "")}
default: walk(root,0,args.first=="toolbar" ? args[1] : nil)
}
