// Composites PNG layers into one image with CoreGraphics, for window
// snapshots taken without Screen Recording (tests/window-snapshot.mjs).
//   swift compose-png.swift out.png width height  layer.png x y w h  [layer.png x y w h ...]
// Sizes and positions are in device pixels; layers draw in order, top-left origin.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 4, (args.count - 4) % 5 == 0,
      let width = Int(args[2]), let height = Int(args[3]) else {
  FileHandle.standardError.write("usage: compose-png.swift out.png width height [layer.png x y w h]...\n".data(using: .utf8)!)
  exit(2)
}
guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
var i = 4
while i < args.count {
  let url = URL(fileURLWithPath: args[i]) as CFURL
  guard let source = CGImageSourceCreateWithURL(url, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
        let x = Double(args[i + 1]), let y = Double(args[i + 2]),
        let w = Double(args[i + 3]), let h = Double(args[i + 4]) else { exit(1) }
  // CoreGraphics' origin is bottom-left.
  context.draw(image, in: CGRect(x: x, y: Double(height) - y - h, width: w, height: h))
  i += 5
}
guard let output = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL,
                                                        UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(destination, output, nil)
exit(CGImageDestinationFinalize(destination) ? 0 : 1)
