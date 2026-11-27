import Foundation

/// I personaggi di US for the iPhone widgets (widget del redesign, founder
/// 26/11/2026: «se i personaggi cambiano di forma, in tutte le cose dove sono
/// presenti ci saranno quei personaggi»). iOS twin of UsCharacterShapes.java:
/// the drawing of personaggi.js (character, lookSvg, reactionBack,
/// reactionFront) as steps in the app's coordinates (viewBox -4 6 108 100).
/// Foundation only, so the core checks run it on the CI host; the extension
/// paints the steps with SwiftUI (UsCharacterView). The sparkles of the
/// precious accessories are animated in the app and left out here.
enum UsCharacterShapes {
    static let ink: UInt32 = 0xFF14_120E

    struct Shape {
        let body: String
        let a, b, ey, f0, f1, hx, hy, headX, headY, headW, left, right, earY: Double
    }

    static func shape(_ name: String) -> Shape {
        switch name {
        case "quadrato": return Shape(body: "M36 24 H64 Q86 24 86 46 V72 Q86 94 64 94 H36 Q14 94 14 72 V46 Q14 24 36 24 Z", a: 40, b: 60, ey: 56, f0: 36, f1: 64, hx: 32, hy: 40, headX: 50, headY: 25, headW: 19, left: 14, right: 86, earY: 54)
        case "triangolo": return Shape(body: "M50 16 Q57 16 61 24 L89 81 Q94 94 79 94 H21 Q6 94 11 81 L39 24 Q43 16 50 16 Z", a: 41, b: 59, ey: 66, f0: 34, f1: 66, hx: 45, hy: 38, headX: 50, headY: 21, headW: 11, left: 23, right: 77, earY: 60)
        case "goccia": return Shape(body: "M50 14 C61 30 86 44 86 64 A36 32 0 0 1 14 64 C14 44 39 30 50 14 Z", a: 40, b: 60, ey: 62, f0: 37, f1: 63, hx: 38, hy: 44, headX: 50, headY: 21, headW: 10, left: 16, right: 84, earY: 60)
        case "nuvola": return Shape(body: "M27 52 C17 38 31 24 43 31 C47 18 67 17 71 30 C83 23 97 37 87 51 C97 60 92 93 66 93 H34 C9 93 6 61 27 52 Z", a: 40, b: 60, ey: 64, f0: 37, f1: 63, hx: 52, hy: 30, headX: 56, headY: 22, headW: 15, left: 12, right: 88, earY: 60)
        default: return Shape(body: "M12 60 a38 36 0 1 0 76 0 a38 36 0 1 0 -76 0 Z", a: 40, b: 60, ey: 58, f0: 37, f1: 63, hx: 32, hy: 40, headX: 50, headY: 26, headW: 19, left: 12, right: 88, earY: 56)
        }
    }

    static let shapes = ["palla", "quadrato", "triangolo", "goccia", "nuvola"]
    static let heads = ["cappello", "fiocco", "cuffie", "corona", "coroncina", "festa", "cento"]
    static let faces = ["occhiali", "sole", "sciarpina", "gala", "macchinetta"]

    /// The shape for a role when the person chose none (personaggi.js shapeOf).
    static func shapeOr(_ shape: String, partnerRole: Bool) -> String {
        shapes.contains(shape) ? shape : (partnerRole ? "quadrato" : "palla")
    }

    /// One drawing step. Colours are ARGB; 0 is none.
    struct Op {
        var d = ""
        var fill: UInt32 = 0
        var stroke: UInt32 = 0
        var width: Double = 0
        var round = false
        var dash: [Double]?
        /// Paint only inside this path (the scarf inside the body).
        var clip: String?
        var alpha: Double = 1
        /// rotate(deg cx cy), as the SVG transform.
        var rotate: Double = 0
        var rx: Double = 0
        var ry: Double = 0
        var text: String?
        var tx: Double = 0
        var ty: Double = 0
        var textSize: Double = 0
        var centered = false
    }

    // MARK: - Colours

    /// color-mix(in srgb, colour p%, other).
    static func mix(_ color: UInt32, _ p: Double, _ other: UInt32) -> UInt32 {
        func channel(_ shift: UInt32) -> UInt32 {
            let a = Double((color >> shift) & 255), b = Double((other >> shift) & 255)
            return UInt32((a * p + b * (1 - p)).rounded())
        }
        return 0xFF00_0000 | (channel(16) << 16) | (channel(8) << 8) | channel(0)
    }

    /// The thin outline in the dark of the character's own colour (Stile unico, 24/11/2026).
    static func edge(_ color: UInt32) -> UInt32 { mix(color, 0.42, 0xFF1A_1020) }

    static func rgba(_ r: UInt32, _ g: UInt32, _ b: UInt32, _ a: Double) -> UInt32 {
        (UInt32((a * 255).rounded()) << 24) | (r << 16) | (g << 8) | b
    }

    /// Come stai → the face (personaggi.js FACE); nothing said: happy. A face name stays itself.
    static func faceOf(_ status: String) -> String {
        switch status {
        case "dorme": return "dorme"
        case "teso": return "teso"
        case "festa", "innamorato": return "innamorato"
        case "giu", "malato": return "giu"
        case "stanco": return "stanco"
        case "nervoso": return "teso"
        default: return "felice"
        }
    }

    /// Come stai che conta (27/11/2026, D8): what they hold or wear (personaggi.js THING); nothing for the others.
    static func thingOf(_ status: String) -> String {
        switch status {
        case "lavoro": return "valigetta"
        case "studio": return "libro"
        case "palestra": return "fascia"
        case "viaggio": return "valigia"
        case "tavola": return "forchetta"
        case "malato": return "termometro"
        default: return ""
        }
    }

    // MARK: - The drawing

    /// - Parameters:
    ///   - face: felice, innamorato, dorme, giu, stanco, teso, or a Come stai key (its face and its thing)
    ///   - reaction: "", cuore, festa, saluta or sera (sera sleeps)
    ///   - zz: the colour of the sleeping z's (the ink of the card)
    ///   - mono: one tint, for the lock screen and the tinted Home: the body
    ///     white, the lines dark, no soft light or blush.
    static func draw(_ shapeName: String, color: UInt32, face: String, reaction: String, head: String, faceItem: String, zz: UInt32, mono: Bool = false) -> [Op] {
        let s = shape(shapeName)
        // Not feeling well never falls asleep at night (D8): the face of the state stays.
        let reactionNow = reaction == "sera" && face == "malato" ? "" : reaction
        let f = reactionNow == "sera" ? "dorme" : !reactionNow.isEmpty ? "felice" : faceOf(face)
        let thingNow = f == "dorme" ? "" : thingOf(face)
        let shut = f == "stanco" || f == "innamorato" || f == "dorme"
        let heartEyes = reactionNow == "cuore"
        let big = heartEyes || reactionNow == "festa"
        let a = s.a, b = s.b, y = s.ey
        let edgeColor = edge(color)
        var out: [Op] = []

        reactionBack(&out, reactionNow, s, color)
        add(&out, ell(s.f0, 97, 9, 5) + " " + ell(s.f1, 97, 9, 5), color, edgeColor, 2.4, false)
        add(&out, s.body, color, edgeColor, 2.6, true)
        add(&out, ell(s.hx, s.hy, 8, 5), rgba(255, 255, 255, 0.5), 0, 0, false)
        var cheeks = Op()
        cheeks.d = ell(a - 8, y + 9, 5, 3) + " " + ell(b + 8, y + 9, 5, 3)
        cheeks.fill = edgeColor
        cheeks.alpha = 0.3
        out.append(cheeks)
        if !shut && !heartEyes {
            add(&out, ell(a, y, 4.4, 5.8) + " " + ell(b, y, 4.4, 5.8), ink, 0, 0, false)
            add(&out, ell(a + 1.5, y - 2.3, 1.5, 1.5) + " " + ell(b + 1.5, y - 2.3, 1.5, 1.5), 0xFFFF_FFFF, 0, 0, false)
        }
        if shut {
            let lids = [a, b].map { x -> String in
                if f == "dorme" { return "M\(n(x - 5)) \(n(y)) Q\(n(x)) \(n(y + 4.5)) \(n(x + 5)) \(n(y))" }
                if f == "innamorato" { return "M\(n(x - 4.5)) \(n(y + 1)) Q\(n(x)) \(n(y - 5)) \(n(x + 4.5)) \(n(y + 1))" }
                return "M\(n(x - 4.5)) \(n(y)) Q\(n(x)) \(n(y + 3.5)) \(n(x + 4.5)) \(n(y))"
            }.joined(separator: " ")
            add(&out, lids, 0, ink, 2.8, true)
        }
        if f == "teso" {
            add(&out, "M\(n(a - 6)) \(n(y - 10)) L\(n(a + 4)) \(n(y - 7)) M\(n(b + 6)) \(n(y - 10)) L\(n(b - 4)) \(n(y - 7))", 0, ink, 2.6, true)
        }
        let mouth: String
        if big { mouth = "M44.5 \(n(y + 9)) Q50 \(n(y + 17)) 55.5 \(n(y + 9)) Z" }
        else if f == "dorme" { mouth = ell(50, y + 12, 2.4, 1.9) }
        else if f == "giu" { mouth = "M46 \(n(y + 14)) Q50 \(n(y + 9.5)) 54 \(n(y + 14))" }
        else if f == "teso" || f == "stanco" { mouth = "M46.5 \(n(y + 11.5)) H53.5" }
        else if f == "innamorato" { mouth = "M44.5 \(n(y + 9)) Q50 \(n(y + 16.5)) 55.5 \(n(y + 9))" }
        else { mouth = "M46 \(n(y + 10)) Q50 \(n(y + 14.5)) 54 \(n(y + 10))" }
        let mouthFill: UInt32 = big ? 0xFF7A_2E3A : f == "dorme" ? ink : 0
        let mouthStroke: UInt32 = f == "dorme" && !big ? 0 : ink
        add(&out, mouth, mouthFill, mouthStroke, 2.6, true)
        if heartEyes { lp(&out, heart(a, y) + " " + heart(b, y), 0xFFFF_4F6F, 1.8) }
        if f == "dorme" {
            out.append(text("z", 84, 36, 19, zz, false))
            out.append(text("z", 97, 22, 13, zz, false))
        }
        if !thingNow.isEmpty { thing(&out, thingNow, s) }
        if !faceItem.isEmpty { look(&out, faceItem, s) }
        if !head.isEmpty { look(&out, head, s) }
        return mono ? monochrome(out) : out
    }

    /// personaggi.js thingSvg: the same steps, held at the left or worn.
    static func thing(_ out: inout [Op], _ thing: String, _ s: Shape) {
        let y = s.ey, r = s.right
        switch thing {
        case "valigetta":
            add(&out, "M5 72 V68 Q5 65 8 65 H12 Q15 65 15 68 V72", 0, ink, 2.6, true)
            lp(&out, "M-3 75 Q-3 72 0 72 H20 Q23 72 23 75 V89 Q23 92 20 92 H0 Q-3 92 -3 89 Z", 0xFF9B_6A43, 2.4)
            add(&out, "M-3 79 H23", 0, ink, 1.8, true)
            lp(&out, "M8 76.5 H12 V81.5 H8 Z", 0xFFF3_D27A, 1.2)
        case "valigia":
            add(&out, "M4 66 V56 H12 V66", 0, ink, 2.6, true)
            lp(&out, "M-4 69 Q-4 66 -1 66 H17 Q20 66 20 69 V91 Q20 94 17 94 H-1 Q-4 94 -4 91 Z", 0xFFF3_A64B, 2.4)
            add(&out, "M2 69 V91 M14 69 V91", 0, 0xFFD9_822B, 2.2, true)
            lp(&out, ell(1, 96.5, 2.4, 2.4) + " " + ell(15, 96.5, 2.4, 2.4), 0xFF3A_3446, 1.4)
        case "libro":
            let start = out.count
            lp(&out, "M-3 70 H19 Q22 70 22 73 V93 Q22 96 19 96 H-3 Z", 0xFFA9_8BFF, 2.4)
            add(&out, "M0 93 H19", 0, 0xFFFF_FDF9, 2.6, true)
            add(&out, "M3 76 H15 M3 81 H12", 0, 0xFFFF_FDF9, 2, true)
            for i in start..<out.count { out[i].rotate = -12; out[i].rx = 9; out[i].ry = 83 }
        case "forchetta":
            lp(&out, "M5 66 H11 V93 Q11 96 8 96 Q5 96 5 93 Z", 0xFFD7_DCE3, 2.2)
            add(&out, "M2 49 V60 M8 49 V60 M14 49 V60 M2 58 Q2 66 8 66 Q14 66 14 58", 0, ink, 4.4, true)
            add(&out, "M2 49 V60 M8 49 V60 M14 49 V60 M2 58 Q2 66 8 66 Q14 66 14 58", 0, 0xFFD7_DCE3, 2, true)
        case "fascia":
            let y0 = y - 18
            var band = Op()
            band.d = "M0 \(n(y0)) Q50 \(n(y0 - 4)) 110 \(n(y0)) V\(n(y0 + 7)) Q50 \(n(y0 + 3)) 0 \(n(y0 + 7)) Z"
            band.fill = 0xFFFF_5A7A; band.stroke = ink; band.width = 2.2; band.clip = s.body
            out.append(band)
            var stripe = Op()
            stripe.d = "M0 \(n(y0 + 3.5)) Q50 \(n(y0 - 0.5)) 110 \(n(y0 + 3.5))"
            stripe.stroke = 0xFFFF_FFFF; stripe.width = 1.6; stripe.clip = s.body
            out.append(stripe)
            lp(&out, "M\(n(r - 7)) \(n(y0 + 3)) l9 -6 l2 7 Z", 0xFFFF_5A7A, 1.8)
            lp(&out, "M\(n(r - 7)) \(n(y0 + 4)) l10 3 l-4 6 Z", 0xFFFF_5A7A, 1.8)
        case "termometro":
            add(&out, "M53 \(n(y + 12)) L68 \(n(y + 5))", 0, ink, 5.4, true)
            add(&out, "M53 \(n(y + 12)) L68 \(n(y + 5))", 0, 0xFFFF_FFFF, 3, true)
            add(&out, "M53 \(n(y + 12)) L59 \(n(y + 9.2))", 0, 0xFFE8_484A, 3, true)
            lp(&out, ell(53, y + 12, 2.6, 2.6), 0xFFE8_484A, 1.4)
        default:
            break
        }
    }

    /// One tint: soft light, blush and glass go; fills turn white, ink stays dark.
    static func monochrome(_ ops: [Op]) -> [Op] {
        ops.compactMap { op in
            var o = op
            if o.text != nil { o.fill = 0xFFFF_FFFF; return o }
            let soft = (o.fill >> 24) < 255 && o.fill != 0
            if soft && o.stroke == 0 { return nil }
            if o.alpha < 1 && o.stroke == 0 { return nil }
            o.alpha = 1
            if o.fill != 0 { o.fill = o.fill == ink ? 0xFF1C_1A1B : (soft ? 0 : 0xFFFF_FFFF) }
            if o.stroke != 0 { o.stroke = o.stroke == ink ? 0xFF1C_1A1B : 0xFFFF_FFFF }
            return o
        }
    }

    private static func heart(_ x: Double, _ y: Double) -> String {
        "M\(n(x)) \(n(y + 5)) C\(n(x - 9)) \(n(y - 1)) \(n(x - 6)) \(n(y - 9)) \(n(x)) \(n(y - 4)) C\(n(x + 6)) \(n(y - 9)) \(n(x + 9)) \(n(y - 1)) \(n(x)) \(n(y + 5)) Z"
    }

    private static func reactionBack(_ out: inout [Op], _ reaction: String, _ s: Shape, _ color: UInt32) {
        if reaction == "festa" {
            let bits: [(Double, Double, UInt32, Double)] = [(6, 30, 0xFFFF_5A7A, 20), (94, 26, 0xFF6F_9BFF, -25), (2, 70, 0xFFF3_D27A, 40),
                                                             (98, 66, 0xFF8F_D49B, -10), (20, 12, 0xFFA9_8BFF, 15), (82, 10, 0xFFFF_9F6E, -30)]
            for (cx, cy, c, r) in bits {
                var op = Op()
                op.d = "M\(n(cx - 3)) \(n(cy - 1.6)) H\(n(cx + 3)) V\(n(cy + 1.6)) H\(n(cx - 3)) Z"
                op.fill = c
                op.rotate = r; op.rx = cx; op.ry = cy
                out.append(op)
            }
        } else if reaction == "saluta" {
            let er = s.right, ey = s.earY
            let arm = "M\(n(er - 3)) \(n(ey + 14)) Q\(n(er + 8)) \(n(ey + 6)) \(n(er + 11)) \(n(ey - 6))"
            add(&out, arm, 0, ink, 8.5, true)
            add(&out, arm, 0, color, 4.2, true)
            add(&out, ell(er + 12, ey - 9, 6, 6), color, ink, 2.8, false)
        }
    }

    // swiftlint:disable:next function_body_length
    private static func look(_ out: inout [Op], _ item: String, _ s: Shape) {
        let x = s.headX, y = s.headY, w0 = s.headW, l = s.left, r = s.right, ey = s.earY, a = s.a, b = s.b, fy = s.ey, neck = s.ey + 21
        switch item {
        case "cappello":
            lp(&out, "M\(n(x - w0 - 3)) \(n(y + 3)) Q\(n(x - w0 - 3)) \(n(y - 19)) \(n(x)) \(n(y - 21)) Q\(n(x + w0 + 3)) \(n(y - 19)) \(n(x + w0 + 3)) \(n(y + 3)) Z", 0xFFF7_B58E, 2.6)
            lp(&out, "M\(n(x - w0 - 5)) \(n(y - 1)) H\(n(x + w0 + 5)) Q\(n(x + w0 + 8)) \(n(y + 3)) \(n(x + w0 + 5)) \(n(y + 7)) H\(n(x - w0 - 5)) Q\(n(x - w0 - 8)) \(n(y + 3)) \(n(x - w0 - 5)) \(n(y - 1)) Z", 0xFFE8_875C, 2.6)
            lp(&out, ell(x, y - 24, 5.5, 5.5), 0xFFFF_F4E6, 2.6)
        case "fiocco":
            let fx = x + w0 * 0.85, f = y + 3
            lp(&out, "M\(n(fx)) \(n(f)) L\(n(fx - 13)) \(n(f - 10)) Q\(n(fx - 17)) \(n(f)) \(n(fx - 13)) \(n(f + 10)) Z", 0xFFFF_5A7A, 2.6)
            lp(&out, "M\(n(fx)) \(n(f)) L\(n(fx + 13)) \(n(f - 10)) Q\(n(fx + 17)) \(n(f)) \(n(fx + 13)) \(n(f + 10)) Z", 0xFFFF_5A7A, 2.6)
            lp(&out, ell(fx, f, 4.2, 4.2), 0xFFFF_8DA2, 2.6)
        case "cuffie":
            let top = y - 9
            let band = "M\(n(l + 1)) \(n(ey - 6)) C\(n(l - 2)) \(n(top - 4)) \(n(r + 2)) \(n(top - 4)) \(n(r - 1)) \(n(ey - 6))"
            add(&out, band, 0, ink, 7.5, true)
            add(&out, band, 0, 0xFF3A_3446, 3.6, true)
            lp(&out, "M\(n(l - 7)) \(n(ey - 10)) h12 v22 h-12 q-4 -11 0 -22 Z", 0xFF6F_D6C8, 2.6)
            lp(&out, "M\(n(r + 7)) \(n(ey - 10)) h-12 v22 h12 q4 -11 0 -22 Z", 0xFF6F_D6C8, 2.6)
            note(&out, r + 10, ey - 12)
            note(&out, r + 14, ey - 4)
        case "corona":
            let k = max(w0, 14) + 2
            lp(&out, "M\(n(x - k)) \(n(y + 4)) L\(n(x - k - 2)) \(n(y - 16)) L\(n(x - k / 2)) \(n(y - 6)) L\(n(x)) \(n(y - 22)) L\(n(x + k / 2)) \(n(y - 6)) L\(n(x + k + 2)) \(n(y - 16)) L\(n(x + k)) \(n(y + 4)) Z", 0xFFF3_D27A, 2.6)
            add(&out, "M\(n(x - k + 2)) \(n(y)) H\(n(x + k - 2))", 0, 0xFFD9_A93F, 2.4, false)
            lp(&out, ell(x, y - 4, 3.2, 3.2), 0xFFFF_5A7A, 1.6)
            lp(&out, ell(x - k / 2 - 1, y - 1, 2.5, 2.5), 0xFF6F_9BFF, 1.4)
            lp(&out, ell(x + k / 2 + 1, y - 1, 2.5, 2.5), 0xFF6F_9BFF, 1.4)
            lp(&out, ell(x - k - 2, y - 16, 2, 2), 0xFFFF_F4C8, 1.2)
            lp(&out, ell(x, y - 22, 2.2, 2.2), 0xFFFF_F4C8, 1.2)
            lp(&out, ell(x + k + 2, y - 16, 2, 2), 0xFFFF_F4C8, 1.2)
        case "coroncina":
            let k = w0 + 6
            let ts: [Double] = [-1, -0.5, 0, 0.5, 1]
            let cols: [UInt32] = [0xFFFF_9FB5, 0xFFFF_E07A, 0xFFFF_FFFF, 0xFFFF_E07A, 0xFFFF_9FB5]
            let pts = ts.map { (x + $0 * k, y + 2 - (1 - $0 * $0) * 8) }
            add(&out, "M\(n(pts[0].0)) \(n(pts[0].1)) Q\(n(x)) \(n(y - 11)) \(n(pts[4].0)) \(n(pts[4].1))", 0, 0xFF5E_9E6E, 3.2, true)
            for (t, sg) in [(-0.75, 1.0), (0.25, -1.0), (0.8, 1.0)] {
                add(&out, "M\(n(x + t * k)) \(n(y - 3 - (1 - t * t) * 6)) q\(n(4 * sg)) -6 \(n(9 * sg)) -3 q\(n(-4 * sg)) 5 \(n(-9 * sg)) 3 Z", 0xFF7D_BE86, ink, 1.2, false)
            }
            for i in 0..<5 {
                let rr = i == 2 ? 7.5 : 6.5, px = pts[i].0, py = pts[i].1
                for p in 0..<5 {
                    let an = Double(p * 72 - 90) * .pi / 180
                    add(&out, ell(px + cos(an) * rr * 0.62, py + sin(an) * rr * 0.62, rr * 0.5, rr * 0.5), cols[i], ink, 1.4, false)
                }
                add(&out, ell(px, py, rr * 0.34, rr * 0.34), 0xFFF2_B33D, ink, 1.2, false)
            }
        case "festa":
            let k = max(w0 * 0.75, 9)
            let start = out.count
            lp(&out, "M\(n(x - k)) \(n(y + 3)) L\(n(x)) \(n(y - 25)) L\(n(x + k)) \(n(y + 3)) Z", 0xFFA9_8BFF, 2.6)
            add(&out, "M\(n(x - k * 0.62)) \(n(y - 6)) L\(n(x + k * 0.35)) \(n(y - 2)) M\(n(x - k * 0.3)) \(n(y - 15)) L\(n(x + k * 0.15)) \(n(y - 13))", 0, 0xFFFF_E07A, 2.6, true)
            lp(&out, ell(x, y - 26, 4, 4), 0xFFFF_5A7A, 2.6)
            for i in start..<out.count { out[i].rotate = -12; out[i].rx = x; out[i].ry = y }
        case "cento":
            let k = max(w0, 13) + 3
            let arc = "M\(n(x - k)) \(n(y + 3)) Q\(n(x)) \(n(y - 7)) \(n(x + k)) \(n(y + 3))"
            add(&out, arc, 0, ink, 6.5, true)
            add(&out, arc, 0, 0xFFF3_D27A, 3, true)
            lp(&out, ell(x, y - 7, 10, 8), 0xFFFF_FDF9, 2.2)
            out.append(text("100", x, y - 4.3, 8.5, ink, true))
        case "occhiali":
            lp(&out, ell(a, fy, 10, 9) + " " + ell(b, fy, 10, 9), rgba(190, 225, 255, 0.3), 2.8)
            add(&out, "M\(n(a + 10)) \(n(fy - 1)) Q50 \(n(fy - 5)) \(n(b - 10)) \(n(fy - 1))", 0, ink, 2.8, true)
            add(&out, "M\(n(a - 5)) \(n(fy - 3)) l4 -3 M\(n(b - 5)) \(n(fy - 3)) l4 -3", 0, rgba(255, 255, 255, 0.85), 1.8, true)
        case "sole":
            lp(&out, "M\(n(a - 10)) \(n(fy - 6)) H\(n(a + 9)) Q\(n(a + 9)) \(n(fy + 8)) \(n(a - 1)) \(n(fy + 8)) Q\(n(a - 10)) \(n(fy + 8)) \(n(a - 10)) \(n(fy - 6)) Z"
                + " M\(n(b - 9)) \(n(fy - 6)) H\(n(b + 10)) Q\(n(b + 10)) \(n(fy + 8)) \(n(b + 1)) \(n(fy + 8)) Q\(n(b - 9)) \(n(fy + 8)) \(n(b - 9)) \(n(fy - 6)) Z"
                + " M\(n(a + 9)) \(n(fy - 3)) H\(n(b - 9))", 0xFF23_1E2C, 2.6)
            add(&out, "M\(n(a - 6)) \(n(fy - 2)) l4 -2.5 M\(n(b - 5)) \(n(fy - 2)) l4 -2.5", 0, rgba(255, 255, 255, 0.7), 1.6, true)
        case "sciarpina":
            var band = Op()
            band.d = "M0 \(n(neck - 7)) Q50 \(n(neck + 3)) 110 \(n(neck - 7)) V\(n(neck + 5)) Q50 \(n(neck + 15)) 0 \(n(neck + 5)) Z"
            band.fill = 0xFFE8_604C; band.stroke = ink; band.width = 2.4; band.clip = s.body
            out.append(band)
            var stitch = Op()
            stitch.d = "M6 \(n(neck)) Q50 \(n(neck + 9)) 104 \(n(neck))"
            stitch.stroke = 0xFFFF_E07A; stitch.width = 2.2; stitch.dash = [5, 5]; stitch.clip = s.body
            out.append(stitch)
            lp(&out, "M60 \(n(neck + 4)) q6 2 8 9 l-3 14 q-4 2 -7 0 l1 -13 Z", 0xFFE8_604C, 2.2)
            lp(&out, "M57 \(n(neck + 5)) q-2 7 -8 18 q3 3 7 1 l5 -16 Z", 0xFFD9_503D, 2.2)
            lp(&out, ell(59, neck + 4, 5, 4), 0xFFF0_7A62, 2.2)
        case "gala":
            let g = neck + 2
            lp(&out, "M38 \(n(g - 6)) L50 \(n(g + 4)) L44 \(n(g + 10)) Z", 0xFFFF_FDF9, 2)
            lp(&out, "M62 \(n(g - 6)) L50 \(n(g + 4)) L56 \(n(g + 10)) Z", 0xFFFF_FDF9, 2)
            lp(&out, "M50 \(n(g + 2)) L33 \(n(g - 8)) Q30 \(n(g + 2)) 33 \(n(g + 12)) Z M50 \(n(g + 2)) L67 \(n(g - 8)) Q70 \(n(g + 2)) 67 \(n(g + 12)) Z", 0xFF2B_2433, 2.4)
            lp(&out, ell(50, g + 2, 4.6, 4.2), 0xFF4A_3F57, 2.2)
            add(&out, "M36 \(n(g - 3)) l5 3", 0, rgba(255, 255, 255, 0.55), 1.6, true)
        case "macchinetta":
            let m = neck - 2
            var strap = Op()
            strap.d = "M42 \(n(m - 4)) L\(n(l + 10)) \(n(fy + 12)) M58 \(n(m - 4)) L\(n(r - 10)) \(n(fy + 12))"
            strap.stroke = ink; strap.width = 2.2; strap.round = true; strap.alpha = 0.85
            out.append(strap)
            lp(&out, "M39 \(n(m - 6)) H61 Q63 \(n(m - 6)) 63 \(n(m - 4)) V\(n(m + 8)) Q63 \(n(m + 10)) 61 \(n(m + 10)) H39 Q37 \(n(m + 10)) 37 \(n(m + 8)) V\(n(m - 4)) Q37 \(n(m - 6)) 39 \(n(m - 6)) Z", 0xFFFF_FDF9, 2.2)
            lp(&out, ell(50, m + 2, 4.6, 4.6), 0xFF3A_3446, 1.8)
            lp(&out, ell(58, m - 2.5, 1.6, 1.6), 0xFFFF_5A7A, 1)
        default:
            break
        }
    }

    private static func note(_ out: inout [Op], _ nx: Double, _ ny: Double) {
        add(&out, "M\(n(nx)) \(n(ny)) v-11 l7 -2 v10", 0, ink, 1.8, true)
        add(&out, ell(nx - 2, ny, 2.6, 2.1) + " " + ell(nx + 5, ny - 2, 2.6, 2.1), ink, 0, 0, false)
    }

    // MARK: - Helpers

    /// An ellipse as personaggi.js writes it (two arcs).
    static func ell(_ x: Double, _ y: Double, _ rx: Double, _ ry: Double) -> String {
        "M\(n(x - rx)) \(n(y)) a\(n(rx)) \(n(ry)) 0 1 0 \(n(2 * rx)) 0 a\(n(rx)) \(n(ry)) 0 1 0 \(n(-2 * rx)) 0 Z"
    }

    static func n(_ v: Double) -> String {
        if abs(v - v.rounded()) < 1e-9 { return String(Int(v.rounded())) }
        var text = String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), v)
        while text.hasSuffix("0") { text.removeLast() }
        return text
    }

    private static func add(_ out: inout [Op], _ d: String, _ fill: UInt32, _ stroke: UInt32, _ width: Double, _ round: Bool) {
        var op = Op()
        op.d = d; op.fill = fill; op.stroke = stroke; op.width = width; op.round = round
        out.append(op)
    }

    /// personaggi.js lp: filled, inked outline, round joins and caps.
    private static func lp(_ out: inout [Op], _ d: String, _ fill: UInt32, _ width: Double) {
        add(&out, d, fill, ink, width, true)
    }

    private static func text(_ value: String, _ x: Double, _ y: Double, _ size: Double, _ color: UInt32, _ centered: Bool) -> Op {
        var op = Op()
        op.text = value; op.tx = x; op.ty = y; op.textSize = size; op.fill = color; op.centered = centered
        return op
    }

    // MARK: - Path data

    /// A parsed segment in absolute coordinates. arc: the oval's centre and radii, start and sweep in degrees (y down).
    enum Segment: Equatable {
        case move(Double, Double)
        case line(Double, Double)
        case quad(Double, Double, Double, Double)
        case cubic(Double, Double, Double, Double, Double, Double)
        case arc(cx: Double, cy: Double, rx: Double, ry: Double, start: Double, sweep: Double)
        case close
    }

    /// SVG path data (M L H V Q C A Z, absolute and relative) → segments; arcs without rotation, as the app draws them.
    static func parse(_ d: String) -> [Segment] {
        let tokens = tokenize(d)
        var out: [Segment] = []
        var i = 0
        var cmd: Character = "M"
        var x = 0.0, y = 0.0, sx = 0.0, sy = 0.0
        func num() -> Double { defer { i += 1 }; return i < tokens.count ? Double(tokens[i]) ?? 0 : 0 }
        while i < tokens.count {
            let t = tokens[i]
            if let c = t.first, c.isLetter {
                cmd = c; i += 1
                if c == "Z" || c == "z" { out.append(.close); x = sx; y = sy }
                continue
            }
            let rel = cmd.isLowercase
            let ox = rel ? x : 0, oy = rel ? y : 0
            switch cmd.uppercased() {
            case "M":
                x = ox + num(); y = oy + num(); sx = x; sy = y
                out.append(.move(x, y)); cmd = rel ? "l" : "L"
            case "L":
                x = ox + num(); y = oy + num(); out.append(.line(x, y))
            case "H":
                x = (rel ? x : 0) + num(); out.append(.line(x, y))
            case "V":
                y = (rel ? y : 0) + num(); out.append(.line(x, y))
            case "Q":
                let x1 = ox + num(), y1 = oy + num()
                x = ox + num(); y = oy + num()
                out.append(.quad(x1, y1, x, y))
            case "C":
                let x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num()
                x = ox + num(); y = oy + num()
                out.append(.cubic(x1, y1, x2, y2, x, y))
            case "A":
                let rx = abs(num()), ry = abs(num())
                _ = num()
                let large = num() != 0, sweep = num() != 0
                let x2 = ox + num(), y2 = oy + num()
                out.append(arc(x, y, x2, y2, rx, ry, large, sweep))
                x = x2; y = y2
            default:
                i += 1
            }
        }
        return out
    }

    /// The endpoint arc (SVG F.6.5) as centre, radii, start angle and sweep.
    private static func arc(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ rxIn: Double, _ ryIn: Double, _ large: Bool, _ sweep: Bool) -> Segment {
        var rx = rxIn, ry = ryIn
        if rx == 0 || ry == 0 { return .line(x2, y2) }
        let dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
        let lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
        if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
        let numerator = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx
        let denominator = rx * rx * dy * dy + ry * ry * dx * dx
        let coef = (large == sweep ? -1.0 : 1.0) * max(0, numerator / denominator).squareRoot()
        let cxp = coef * (rx * dy / ry), cyp = coef * (-ry * dx / rx)
        let cx = cxp + (x1 + x2) / 2, cy = cyp + (y1 + y2) / 2
        let start = atan2((dy - cyp) / ry, (dx - cxp) / rx) * 180 / .pi
        let end = atan2((-dy - cyp) / ry, (-dx - cxp) / rx) * 180 / .pi
        var delta = end - start
        if sweep && delta < 0 { delta += 360 }
        if !sweep && delta > 0 { delta -= 360 }
        return .arc(cx: cx, cy: cy, rx: rx, ry: ry, start: start, sweep: delta)
    }

    private static func tokenize(_ d: String) -> [String] {
        var out: [String] = []
        var current = ""
        var seenDot = false
        func flush() { if !current.isEmpty { out.append(current); current = ""; seenDot = false } }
        for c in d {
            if c.isWhitespace || c == "," { flush(); continue }
            if c.isLetter && c != "e" && c != "E" { flush(); out.append(String(c)); continue }
            if c == "-" || c == "+" {
                if let last = current.last, last == "e" || last == "E" { current.append(c); continue }
                flush(); current.append(c); continue
            }
            if c == "." {
                if seenDot { flush() }
                seenDot = true
                current.append(c); continue
            }
            current.append(c)
        }
        flush()
        return out
    }
}
