import CoreText
import ImageIO
import SwiftUI
import UIKit
import WidgetKit

/// Widget del redesign (founder, 26/11/2026; tavola Hkj3ojVe3bwEHfg9XeJf6A):
/// the Quaderno's paper with the phone's light theme, the warm night of the
/// app with the dark one (giorno.css, colori.css); the couple's colours live
/// in the things, set from the snapshot. The same tokens as the Android
/// widgets (res/values/colors.xml and values-night).
enum UsPalette {
    static let latte = Color(argb: 0xFFF7_EFE9)
    static let inkDay = Color(argb: 0xFF23_1B1D)
    static let ceralacca = Color(argb: 0xFFB8_452F)
    static let paper = Color(argb: 0xFFF3_ECE1)
    static let polaroid = Color(argb: 0xFFFB_F7F0)
    static let paperInk = Color(argb: 0xFF1A_1020)

    static func surface(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(argb: 0xFF12_0D11) : Color(argb: 0xFFFB_F7F0) }
    /// La lavagna: a real blackboard at night, carta by day.
    static func board(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(argb: 0xFF14_1416) : paper }
    static func ink(_ scheme: ColorScheme) -> Color { scheme == .dark ? latte : inkDay }
    static func sub(_ scheme: ColorScheme) -> Color { scheme == .dark ? latte.opacity(0.64) : Color(argb: 0xFF6B_5F5A) }
    static func line(_ scheme: ColorScheme) -> Color { scheme == .dark ? latte.opacity(0.08) : inkDay.opacity(0.10) }
    static func filo(_ scheme: ColorScheme) -> Color { scheme == .dark ? latte.opacity(0.38) : ceralacca }
    /// A widget's label speaks in the page's colour: yours at night, ceralacca on paper.
    static func label(_ scheme: ColorScheme, _ me: UsWidgetModels.Person) -> Color {
        scheme == .dark ? Color(argb: me.night) : ceralacca
    }
    /// The person's colour on this card: bright at night, dusty on paper.
    static func of(_ person: UsWidgetModels.Person, _ scheme: ColorScheme) -> Color {
        Color(argb: scheme == .dark ? person.night : person.day)
    }
    /// The main button and the Ti penso's heart: the two of you at night, ceralacca on paper.
    static func blend(_ me: UsWidgetModels.Person, _ them: UsWidgetModels.Person, _ scheme: ColorScheme, alwaysTwo: Bool = false) -> LinearGradient {
        if scheme == .dark || alwaysTwo {
            return LinearGradient(colors: [of(me, scheme), of(them, scheme)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
        return LinearGradient(colors: [ceralacca, ceralacca], startPoint: .leading, endPoint: .trailing)
    }
    static func onPill(_ scheme: ColorScheme) -> Color { scheme == .dark ? paperInk : polaroid }
    /// The veil at the bottom of the photo, as on Oggi: paper by day, night in the dark, never full.
    static func velo(_ scheme: ColorScheme) -> LinearGradient {
        let end = scheme == .dark ? Color(argb: 0xFF12_0D11) : polaroid
        return LinearGradient(stops: [.init(color: end.opacity(scheme == .dark ? 0.86 : 0.94), location: 0),
                                      .init(color: end.opacity(scheme == .dark ? 0.45 : 0.55), location: 0.32),
                                      .init(color: end.opacity(0), location: 0.62)],
                              startPoint: .bottom, endPoint: .top)
    }
    /// The board's papers (couple-notes.css), the same in both themes.
    static func postit(_ color: String) -> Color {
        switch color {
        case "pink": return Color(argb: 0xFFFF_C2CF)
        case "blue": return Color(argb: 0xFFBF_E3F5)
        case "green": return Color(argb: 0xFFC9_ECC0)
        default: return Color(argb: 0xFFF6_E27A)
        }
    }
}

extension Color {
    init(argb: UInt32) {
        self.init(.sRGB, red: Double((argb >> 16) & 255) / 255, green: Double((argb >> 8) & 255) / 255,
                  blue: Double(argb & 255) / 255, opacity: Double((argb >> 24) & 255) / 255)
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

enum UsArt {
    /// A private picture from the App Group, decoded small: widgets have little memory.
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

/// SVG path data drawn as a SwiftUI path (UsCharacterShapes.parse), scaled from its own units.
struct UsPathShape: Shape {
    let data: String
    /// The units of the drawing (the Phosphor icons are 256).
    var units: CGFloat = 256

    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / units
        let dx = rect.midX - units * scale / 2, dy = rect.midY - units * scale / 2
        return UsPaths.path(data, transform: CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: dx, ty: dy))
    }
}

enum UsPaths {
    /// Phosphor heart (fill), the Ti penso's heart (founder, 24/11/2026).
    static let heart = "M128 224 C128 224 24 168 24 102 A54 54 0 0 1 128 81.4 A54 54 0 0 1 232 102 C232 168 128 224 128 224 Z"
    /// Phosphor pencil-simple (fill), the Lavagna's pencil.
    static let pencil = "M227.31 73.37 L182.63 28.68 A16 16 0 0 0 160 28.68 L36.69 152 A15.86 15.86 0 0 0 32 163.31 V208 A16 16 0 0 0 48 224 H92.69 A15.86 15.86 0 0 0 104 219.31 L227.31 96 A16 16 0 0 0 227.31 73.37 Z M92.69 208 H48 V163.31 L136 75.31 L180.69 120 Z M192 108.68 L147.31 64 L171.31 40 L216 84.68 Z"

    static func path(_ data: String, transform: CGAffineTransform = .identity) -> Path {
        var path = Path()
        for segment in UsCharacterShapes.parse(data) {
            switch segment {
            case let .move(x, y): path.move(to: CGPoint(x: x, y: y))
            case let .line(x, y): path.addLine(to: CGPoint(x: x, y: y))
            case let .quad(x1, y1, x, y): path.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: x1, y: y1))
            case let .cubic(x1, y1, x2, y2, x, y):
                path.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: x1, y: y1), control2: CGPoint(x: x2, y: y2))
            case let .arc(cx, cy, rx, ry, start, sweep):
                path.addRelativeArc(center: .zero, radius: 1, startAngle: .degrees(start), delta: .degrees(sweep),
                                    transform: CGAffineTransform(a: rx, b: 0, c: 0, d: ry, tx: cx, ty: cy))
            case .close: path.closeSubpath()
            }
        }
        return transform.isIdentity ? path : path.applying(transform)
    }
}

/// The Ti penso's heart, from your colour to theirs (the only place where the two blend).
struct UsBlendedHeart: View {
    let me: UsWidgetModels.Person
    let them: UsWidgetModels.Person
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        UsPathShape(data: UsPaths.heart)
            .fill(UsPalette.blend(me, them, scheme, alwaysTwo: true))
            .widgetAccentable()
    }
}

/// «Rispondi», «Disegna»: the two of you blended at night, ceralacca on paper.
struct UsPill: View {
    let text: String
    let me: UsWidgetModels.Person
    let them: UsWidgetModels.Person
    var icon: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 6) {
            if let icon = icon { UsPathShape(data: icon).fill(UsPalette.onPill(scheme)).frame(width: 14, height: 14) }
            Text(verbatim: text).font(UsFonts.figtree(13, bold: true)).foregroundColor(UsPalette.onPill(scheme))
        }
        .padding(.horizontal, 16)
        .frame(height: 34)
        .background(Capsule().fill(UsPalette.blend(me, them, scheme)))
    }
}

/// A widget's small label in the page's colour.
struct UsLabel: View {
    let text: String
    let me: UsWidgetModels.Person
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text(verbatim: text).font(UsFonts.figtree(12, bold: true)).foregroundColor(UsPalette.label(scheme, me)).lineLimit(1)
    }
}

/// A strip of tape in the colour of whoever left the thing.
struct UsTape: View {
    let color: Color
    var body: some View {
        RoundedRectangle(cornerRadius: 2).fill(color).opacity(0.8).frame(width: 46, height: 16)
    }
}

/// Lasciato per te: a paper envelope with the ceralacca seal, its edge in the colour of whoever wrote.
struct UsEnvelope: View {
    let edge: Color

    var body: some View {
        GeometryReader { box in
            let w = box.size.width, h = box.size.height
            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 4).fill(UsPalette.paper)
                RoundedRectangle(cornerRadius: 4).stroke(UsPalette.inkDay.opacity(0.18), lineWidth: 1)
                Path { p in
                    p.move(to: CGPoint(x: 2, y: 3))
                    p.addLine(to: CGPoint(x: w / 2, y: h * 0.56))
                    p.addLine(to: CGPoint(x: w - 2, y: 3))
                }
                .stroke(UsPalette.inkDay.opacity(0.22), lineWidth: 1.4)
                Rectangle().fill(edge).frame(height: max(4, h * 0.06))
                Circle().fill(UsPalette.ceralacca).frame(width: h * 0.32, height: h * 0.32).offset(y: h * 0.56 - h * 0.16)
                UsPathShape(data: UsPaths.heart).fill(UsPalette.paper).frame(width: h * 0.17, height: h * 0.17).offset(y: h * 0.56 - h * 0.085)
            }
        }
        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
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

/// When a widget changes by itself next: the earliest of the moments given, else Rome's midnight.
func usNextChange(_ dates: [Date?], now: Date) -> Date {
    ([UsWidgetModels.nextRomeMidnight(now)] + dates.compactMap { $0 }.filter { $0 > now }).min() ?? UsWidgetModels.nextRomeMidnight(now)
}
