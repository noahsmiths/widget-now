import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let output = URL(fileURLWithPath: CommandLine.arguments[1])
let size = 1024
let scale = CGFloat(size) / 32
let colorSpace = CGColorSpaceCreateDeviceRGB()
let bitmapInfo = CGBitmapInfo.byteOrder32Big.union(
    CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)
)
guard let context = CGContext(
    data: nil,
    width: size,
    height: size,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: bitmapInfo.rawValue
) else {
    fatalError("Could not create app icon context.")
}

context.setFillColor(CGColor(red: 17 / 255, green: 17 / 255, blue: 17 / 255, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: size, height: size))
context.setStrokeColor(CGColor(gray: 1, alpha: 1))
context.setLineWidth(1.6 * scale)
context.setLineCap(.round)
context.setLineJoin(.round)

let gridRect = CGRect(x: 9 * scale, y: 9 * scale, width: 14 * scale, height: 14 * scale)
context.addPath(
    CGPath(
        roundedRect: gridRect,
        cornerWidth: 1.6 * scale,
        cornerHeight: 1.6 * scale,
        transform: nil
    )
)
context.strokePath()

context.move(to: CGPoint(x: 16 * scale, y: 9 * scale))
context.addLine(to: CGPoint(x: 16 * scale, y: 23 * scale))
context.move(to: CGPoint(x: 9 * scale, y: 16 * scale))
context.addLine(to: CGPoint(x: 23 * scale, y: 16 * scale))
context.strokePath()

guard
    let image = context.makeImage(),
    let destination = CGImageDestinationCreateWithURL(
        output as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    )
else {
    fatalError("Could not create app icon image.")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    fatalError("Could not write app icon image.")
}
