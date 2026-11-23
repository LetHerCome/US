import CoreText
import ImageIO
import SwiftUI
import UIKit
import WidgetKit

/// Pastello (light) and Midnight (dark), the colours of the Android widgets
/// (values/colors.xml, values-night/colors.xml), picked by the phone's theme.
enum UsPalette {
    static let rosa = Color(red: 1, green: 124 / 255, blue: 150 / 255)
    static let lilla = Color(red: 169 / 255, green: 139 / 255, blue: 1)
    static let latte = Color(red: 247 / 255, green: 239 / 255, blue: 233 / 255)
    static let pastelInk = Color(red: 26 / 255, green: 16 / 255, blue: 32 / 255)
    static let pastelSub = Color(red: 91 / 255, green: 74 / 255, blue: 99 / 255)
    static let cream = Color(red: 251 / 255, green: 243 / 255, blue: 236 / 255)
    static let night = Color(red: 20 / 255, green: 12 / 255, blue: 20 / 255)

    static func ink(_ scheme: ColorScheme) -> Color { scheme == .dark ? latte : pastelInk }
    static func sub(_ scheme: ColorScheme) -> Color { scheme == .dark ? latte.opacity(0.78) : pastelSub }
    /// Foto & Noi (founder, 02/11, choice B): the photo fades into the cream, or into the night.
    static func fade(_ scheme: ColorScheme) -> LinearGradient {
        let end = scheme == .dark ? night.opacity(0.9) : cream.opacity(0.92)
        return LinearGradient(stops: [.init(color: end.opacity(0), location: 0.45), .init(color: end, location: 1)],
                              startPoint: .top, endPoint: .bottom)
    }
}

/// Fraunces (titles and numbers) and Figtree (small text), the app's fonts,
/// bundled in the extension (UIAppFonts) with the axes Android pins
/// (res/font/us_fraunces.xml: opsz 72, wght 400; us_figtree.xml: wght 500/700).
enum UsFonts {
    private static let wght: UInt32 = 0x7767_6874
    private static let opsz: UInt32 = 0x6F70_737A

    static func fraunces(_ size: CGFloat, italic: Bool = false) -> Font {
        let name = italic ? "Fraunces-9ptBlackItalic" : "Fraunces-9ptBlack"
        guard let font = variable(name, size: size, axes: [wght: 400, opsz: 72]) else {
            let serif = Font.system(size: size, weight: .regular, design: .serif)
            return italic ? serif.italic() : serif
        }
        return Font(font as CTFont)
    }

    static func figtree(_ size: CGFloat, bold: Bool = false) -> Font {
        guard let font = variable("Figtree-Light", size: size, axes: [wght: bold ? 700 : 500]) else {
            return .system(size: size, weight: bold ? .bold : .medium)
        }
        return Font(font as CTFont)
    }

    private static func variable(_ postScriptName: String, size: CGFloat, axes: [UInt32: CGFloat]) -> UIFont? {
        guard let base = UIFont(name: postScriptName, size: size) else { return nil }
        let key = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        var variations: [NSNumber: NSNumber] = [:]
        for (tag, value) in axes { variations[NSNumber(value: tag)] = NSNumber(value: Double(value)) }
        return UIFont(descriptor: base.fontDescriptor.addingAttributes([key: variations]), size: size)
    }
}

/// The illustrations of the Android widgets (drawable-nodpi and drawable-night-nodpi,
/// the same WebP files), bundled in the extension.
enum UsArt {
    static func image(_ name: String, _ scheme: ColorScheme) -> UIImage? {
        let file = scheme == .dark ? name + "_night" : name
        guard let path = Bundle.main.path(forResource: file, ofType: "webp") else { return nil }
        return UIImage(contentsOfFile: path)
    }

    static var grain: UIImage? {
        Bundle.main.path(forResource: "grain_tile", ofType: "png").flatMap { UIImage(contentsOfFile: $0) }
    }

    /// A private photo from the App Group, decoded small: widgets have little memory.
    static func downsampled(_ data: Data?, maxPixels: CGFloat) -> UIImage? {
        guard let data = data, let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}

/// The heart of the Android widgets (us_widget_think_heart_empty.xml,
/// us_widget_pastel_heart.xml): "M12,20.5s-7.5,-4.4 -7.5,-10.1A4.3,4.3 0,0 1,12 7.6
/// a4.3,4.3 0,0 1,7.5 2.8c0,5.7 -7.5,10.1 -7.5,10.1z" on a 24-point box.
struct UsHeartShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 24
        let dx = rect.midX - 12 * scale
        let dy = rect.midY - 12 * scale
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: dx + x * scale, y: dy + y * scale) }
        var path = Path()
        path.move(to: p(12, 20.5))
        path.addCurve(to: p(4.5, 10.4), control1: p(12, 20.5), control2: p(4.5, 16.1))
        // The two lobes: arcs of radius 4.3 (centres worked out from the SVG arc flags).
        arc(&path, center: p(8.7994, 10.4716), radius: 4.3 * scale, from: 180.95, to: 318.11)
        arc(&path, center: p(15.2006, 10.4716), radius: 4.3 * scale, from: 221.89, to: 359.05)
        path.addCurve(to: p(12, 20.5), control1: p(19.5, 16.1), control2: p(12, 20.5))
        path.closeSubpath()
        return path
    }

    /// An arc drawn with cubic curves, angles in degrees growing clockwise on screen.
    private func arc(_ path: inout Path, center: CGPoint, radius: CGFloat, from: Double, to: Double) {
        let segments = 2
        let step = (to - from) / Double(segments) * .pi / 180
        var angle = from * .pi / 180
        let k = CGFloat(4.0 / 3.0 * tan(step / 4)) * radius
        for _ in 0..<segments {
            let next = angle + step
            let start = CGPoint(x: center.x + radius * CGFloat(cos(angle)), y: center.y + radius * CGFloat(sin(angle)))
            let end = CGPoint(x: center.x + radius * CGFloat(cos(next)), y: center.y + radius * CGFloat(sin(next)))
            let c1 = CGPoint(x: start.x - k * CGFloat(sin(angle)), y: start.y + k * CGFloat(cos(angle)))
            let c2 = CGPoint(x: end.x + k * CGFloat(sin(next)), y: end.y - k * CGFloat(cos(next)))
            path.addCurve(to: end, control1: c1, control2: c2)
            angle = next
        }
    }
}

extension View {
    /// The widget's full-bleed background: containerBackground from iOS 17
    /// (required there), a plain background on iOS 16.
    @ViewBuilder
    func usWidgetBackground<Background: View>(@ViewBuilder _ background: () -> Background) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { background() }
        } else {
            self.background(background())
        }
    }
}

extension View {
    /// iOS 17 insets widget content by the system margins; iOS 16 does not, so the same 16 points by hand.
    @ViewBuilder
    func usLegacyContentPadding() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self
        } else {
            padding(16)
        }
    }
}

/// The light grain over the illustrations, as on Android (7%).
struct UsGrain: View {
    var body: some View {
        if let grain = UsArt.grain {
            Image(uiImage: grain).resizable(resizingMode: .tile).opacity(0.07)
        }
    }
}
