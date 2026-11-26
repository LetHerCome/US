// The iPhone widget gallery (widget del redesign, 26/11/2026): every widget
// of the extension, every family, by day and by night, drawn by the real
// views with a sample couple (Bea, a ball and a square) and saved as PNG.
// Built by ios-native.yml with swiftc for the iOS Simulator together with
// the extension's views and the widget core, run with `simctl spawn`; the
// pictures are the job's artifact. Never real data.
//
// Arguments: <output folder> <extension Resources folder> <sample pictures folder>
import CoreText
import SwiftUI
import UIKit
import WidgetKit

let arguments = CommandLine.arguments
let output = URL(fileURLWithPath: arguments.count > 1 ? arguments[1] : NSTemporaryDirectory())
let resources = URL(fileURLWithPath: arguments.count > 2 ? arguments[2] : ".")
let samples = URL(fileURLWithPath: arguments.count > 3 ? arguments[3] : ".")
try? FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for font in ["Fraunces.ttf", "Fraunces-Italic.ttf", "Figtree.ttf"] {
    CTFontManagerRegisterFontsForURL(resources.appendingPathComponent(font) as CFURL, .process, nil)
}
func picture(_ name: String) -> UIImage? { UIImage(contentsOfFile: samples.appendingPathComponent(name).path) }

var snapshot = UsSample.snapshot
snapshot["think"] = ["partnerName": "Bea", "lastReceivedAt": UsWidgetContract.format(Date().addingTimeInterval(-120))]
let images: [String: UIImage] = ["memories": picture("memories.webp"), "memories_wide": picture("memories_wide.webp"),
                                 "lavagna": picture("lavagna.png"), "lavagna_night": picture("lavagna_night.png")].compactMapValues { $0 }
let now = Date()
let entry = UsCardEntry(date: now, snapshot: snapshot, images: images)
var think = UsWidgetModels.Think()
think.canSend = true
think.line = "Pensa a Bea"
var got = UsWidgetModels.think(snapshot, action: nil, hasCredential: true, now: now)
got.canSend = true

struct Size { let name: String; let family: WidgetFamily; let width: CGFloat; let height: CGFloat }
let small = Size(name: "s", family: .systemSmall, width: 170, height: 170)
let medium = Size(name: "m", family: .systemMedium, width: 364, height: 170)
let large = Size(name: "l", family: .systemLarge, width: 364, height: 382)
let circular = Size(name: "circle", family: .accessoryCircular, width: 76, height: 76)
let rectangular = Size(name: "rect", family: .accessoryRectangular, width: 172, height: 76)
let inline = Size(name: "inline", family: .accessoryInline, width: 260, height: 24)

/// The card the system draws behind a widget (containerBackground does nothing outside a widget).
@ViewBuilder
func card(_ kind: String, _ size: Size, _ scheme: ColorScheme) -> some View {
    switch size.family {
    case .accessoryCircular: Circle().fill(Color.white.opacity(0.16))
    case .accessoryRectangular, .accessoryInline: Color.clear
    default:
        if kind == "photo", let photo = picture("photo.jpg") {
            ZStack {
                Color.clear.overlay(Image(uiImage: photo).resizable().aspectRatio(contentMode: .fill)).clipped()
                UsPalette.velo(scheme)
            }
        } else {
            kind == "lavagna" ? UsPalette.board(scheme) : UsPalette.surface(scheme)
        }
    }
}

@ViewBuilder
func widget(_ kind: String, _ size: Size) -> some View {
    switch kind {
    case "photo": UsPhotoWidgetView(entry: UsPhotoEntry(date: now, days: 195, photo: picture("photo.jpg"), snapshot: snapshot), family: size.family)
    case "think": UsThinkWidgetView(entry: UsThinkEntry(date: now, model: think, snapshot: snapshot), family: size.family)
    case "think_got": UsThinkWidgetView(entry: UsThinkEntry(date: now, model: got, snapshot: snapshot), family: size.family)
    case "daily": UsDailyView(entry: entry, family: size.family)
    case "status": UsStatusView(entry: entry, family: size.family)
    case "noi": UsNoiView(entry: entry, family: size.family)
    case "message": UsMessageView(entry: entry, family: size.family)
    case "memories": UsMemoriesView(entry: entry, family: size.family)
    case "lavagna": UsLavagnaView(entry: entry, family: size.family)
    default: UsPostitView(entry: entry, family: size.family)
    }
}

let plan: [(String, [Size])] = [
    ("think", [small, medium, circular, inline]), ("think_got", [small, medium, inline]),
    ("photo", [small, medium, large, circular, inline]), ("daily", [small, medium, rectangular]),
    ("status", [small, medium, circular, rectangular]), ("noi", [small, medium, circular, rectangular]),
    ("message", [small, medium, circular, rectangular, inline]), ("memories", [small, medium]),
    ("lavagna", [small, medium]), ("postit", [small, medium])
]

var written = 0
MainActor.assumeIsolated {
    for (kind, sizes) in plan {
        for size in sizes {
            let lock = [.accessoryCircular, .accessoryRectangular, .accessoryInline].contains(size.family)
            for scheme in lock ? [ColorScheme.dark] : [.light, .dark] {
                let padding: CGFloat = lock ? 0 : 16
                let view = ZStack {
                    card(kind, size, scheme)
                    widget(kind, size).padding(padding)
                }
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: lock ? (size.family == .accessoryCircular ? size.width / 2 : 12) : 22, style: .continuous))
                .foregroundStyle(lock ? Color.white : Color.primary)
                .environment(\.colorScheme, scheme)
                .padding(lock ? 10 : 0)
                .background(lock ? Color(white: 0.22) : Color.clear)
                let renderer = ImageRenderer(content: view)
                renderer.scale = 3
                guard let data = renderer.uiImage?.pngData() else { print("not ok - \(kind) \(size.name)"); continue }
                let name = "\(kind)_\(size.name)_\(scheme == .dark ? "notte" : "giorno").png"
                try? data.write(to: output.appendingPathComponent(name))
                written += 1
            }
        }
    }
}
print("widget gallery: \(written) pictures in \(output.path)")
exit(written > 0 ? 0 : 1)
