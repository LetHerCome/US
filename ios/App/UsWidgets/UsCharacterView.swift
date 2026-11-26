import SwiftUI
import WidgetKit

/// A character of US in a widget (widget del redesign, 26/11/2026): the steps
/// of UsCharacterShapes painted with a SwiftUI Canvas, the person's colour
/// bright at night and dusty on paper. In the tinted Home and on the lock
/// screen iOS paints in one tint, so the character turns into its outline:
/// a white body with dark eyes, mouth and lines (mono).
struct UsCharacterView: View {
    let person: UsWidgetModels.Person
    var face: String = "felice"
    var reaction: String = ""
    /// The width of the app's 108 units; the frame is a little larger for what sticks out.
    var size: CGFloat = 60
    var mono: Bool = false

    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetRenderingMode) private var renderingMode

    /// The app's viewBox with room for hats, hands and confetti: x -10..114, y -14..106.
    static let box = CGRect(x: -10, y: -14, width: 124, height: 120)

    var body: some View {
        let scale = size / 108
        let oneTint = mono || renderingMode != .fullColor
        let ops = UsCharacterShapes.draw(person.shape, color: scheme == .dark ? person.night : person.day, face: face,
                                         reaction: reaction, head: person.head, faceItem: person.face,
                                         zz: scheme == .dark ? 0xFFF7_EFE9 : 0xFF23_1B1D, mono: oneTint)
        return Canvas { context, _ in
            context.scaleBy(x: scale, y: scale)
            context.translateBy(x: -Self.box.minX, y: -Self.box.minY)
            for op in ops { Self.paint(op, in: context) }
        }
        .frame(width: Self.box.width * scale, height: Self.box.height * scale)
        .accessibilityHidden(true)
    }

    static func paint(_ op: UsCharacterShapes.Op, in base: GraphicsContext) {
        var context = base
        if op.rotate != 0 {
            context.translateBy(x: op.rx, y: op.ry)
            context.rotate(by: .degrees(op.rotate))
            context.translateBy(x: -op.rx, y: -op.ry)
        }
        if let clip = op.clip { context.clip(to: UsPaths.path(clip)) }
        if op.alpha < 1 { context.opacity = op.alpha }
        if let text = op.text {
            let shown = Text(verbatim: text).font(.system(size: op.textSize, weight: .heavy, design: .rounded)).foregroundColor(Color(argb: op.fill))
            context.draw(shown, at: CGPoint(x: op.tx, y: op.ty), anchor: op.centered ? .bottom : .bottomLeading)
            return
        }
        let path = UsPaths.path(op.d)
        if op.fill != 0 { context.fill(path, with: .color(Color(argb: op.fill))) }
        if op.stroke != 0 && op.width > 0 {
            let style = StrokeStyle(lineWidth: op.width, lineCap: op.round ? .round : .butt, lineJoin: op.round ? .round : .miter,
                                    dash: (op.dash ?? []).map { CGFloat($0) })
            context.stroke(path, with: .color(Color(argb: op.stroke)), style: style)
        }
    }
}

/// You two, side by side, the second a little behind (Foto di Oggi, Come stai).
struct UsDuo: View {
    let me: UsWidgetModels.Person
    let them: UsWidgetModels.Person
    var myFace = "felice"
    var theirFace = "felice"
    var size: CGFloat = 40
    var mono = false

    var body: some View {
        HStack(alignment: .bottom, spacing: -size * 0.2) {
            UsCharacterView(person: me, face: myFace, size: size, mono: mono)
            UsCharacterView(person: them, face: theirFace, size: size * 0.92, mono: mono)
        }
    }
}
