import SwiftUI
import UIKit
import WidgetKit

/// Foto di Oggi (UsPhotoWidgetProvider on Android; widget del redesign
/// 26/11/2026): Oggi's photo, which changes every hour with US closed, the
/// veil at the bottom as on Oggi, «195 giorni insieme» in Fraunces and, from
/// the medium, you two peeking in the corner. The large adds the day. On the
/// lock screen: the days in a circle, or one line above the clock.
struct UsPhotoEntry: TimelineEntry {
    let date: Date
    let days: Int
    let photo: UIImage?
    var snapshot: [String: Any]?
}

struct UsPhotoProvider: TimelineProvider {
    func placeholder(in context: Context) -> UsPhotoEntry {
        UsPhotoEntry(date: Date(), days: 195, photo: nil, snapshot: UsSample.snapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (UsPhotoEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        completion(entries(now: Date(), family: context.family).first ?? placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsPhotoEntry>) -> Void) {
        let now = Date()
        let entries = entries(now: now, family: context.family)
        // The app reloads every widget when it writes; the faces change at 22 and 6.
        let faces = [UsWidgetModels.face(entries.first?.snapshot, me: true, now: now).next,
                     UsWidgetModels.face(entries.first?.snapshot, me: false, now: now).next]
        completion(Timeline(entries: entries, policy: .after(usNextChange(faces, now: now))))
    }

    private func entries(now: Date, family: WidgetFamily) -> [UsPhotoEntry] {
        let store = UsWidgetStore.shared()
        let snapshot = store?.readSnapshot()
        let started = UsWidgetContract.string(UsWidgetContract.object(snapshot?["couple"])["startedOn"])
        let lockScreen = family == .accessoryCircular || family == .accessoryInline
        let pixels: CGFloat = family == .systemLarge ? 1100 : family == .systemMedium ? 1000 : 520
        var images: [String: UIImage] = [:]
        return UsWidgetModels.photoTimeline(snapshot, now: now).map { date in
            let slot = UsWidgetModels.photoSlot(snapshot, now: date)
            var image: UIImage?
            if slot.ready && !lockScreen {
                image = images[slot.key] ?? UsArt.downsampled(store?.readPhoto(slot.key), maxPixels: pixels)
                images[slot.key] = image
            }
            return UsPhotoEntry(date: date, days: UsWidgetModels.daysTogether(started, now: date), photo: image, snapshot: snapshot)
        }
    }
}

struct UsPhotoWidgetView: View {
    let entry: UsPhotoEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetRenderingMode) private var renderingMode

    private var numberSize: CGFloat { family == .systemLarge ? 58 : family == .systemMedium ? 46 : 40 }
    private var unitSize: CGFloat { family == .systemLarge ? 19 : family == .systemMedium ? 17 : 15 }

    var body: some View {
        switch family {
        case .accessoryCircular:
            VStack(spacing: 2) {
                Text(verbatim: entry.days >= 0 ? String(entry.days) : "–").font(.system(size: 22, weight: .bold, design: .rounded)).minimumScaleFactor(0.6)
                UsPathShape(data: UsPaths.heart).fill(.primary).frame(width: 12, height: 12)
            }
            .usCard(family)
            .widgetURL(UsWidgetShared.openURL("photo"))
            .accessibilityLabel(entry.days >= 0 ? "\(entry.days) giorni insieme" : "Foto & Noi")
        case .accessoryInline:
            Text(verbatim: inlineText)
                .usCard(family)
                .widgetURL(UsWidgetShared.openURL("photo"))
        default:
            content
                .usLegacyContentPadding()
                .usWidgetBackground { background }
                .widgetURL(UsWidgetShared.openURL("photo"))
        }
    }

    /// "195 giorni con Bea", above the clock.
    private var inlineText: String {
        guard entry.days >= 0 else { return "US" }
        let partner = UsWidgetModels.partnerName(entry.snapshot)
        let days = entry.days == 1 ? "1 giorno" : "\(entry.days) giorni"
        return partner.isEmpty ? days + " insieme" : days + " con " + partner
    }

    private var content: some View {
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        return ZStack(alignment: .bottomLeading) {
            // iOS 18 "tinted" Home: the system drops the background, so the photo
            // comes forward in full colour (founder-approved board).
            if renderingMode != .fullColor, let photo = entry.photo {
                tintedPhoto(photo)
            }
            Color.clear
            VStack(alignment: .leading, spacing: 4) {
                if family == .systemLarge {
                    Text(verbatim: Self.today(entry.date)).font(UsFonts.figtree(12, bold: true)).foregroundColor(UsPalette.sub(scheme))
                }
                if entry.days >= 0 {
                    HStack(alignment: .lastTextBaseline, spacing: family == .systemSmall ? 6 : 8) {
                        Text(verbatim: String(entry.days))
                            .font(UsFonts.fraunces(numberSize))
                            .foregroundColor(UsPalette.ink(scheme))
                            .widgetAccentable()
                        Text(verbatim: UsWidgetModels.daysUnit(entry.days))
                            .font(UsFonts.fraunces(unitSize, italic: true))
                            .foregroundColor(UsPalette.ink(scheme))
                            .lineSpacing(-2)
                            .fixedSize()
                    }
                    .minimumScaleFactor(0.6)
                    .lineLimit(2)
                } else if entry.photo == nil {
                    Text(verbatim: "La foto di Oggi apparirà qui").font(UsFonts.figtree(13)).foregroundColor(UsPalette.sub(scheme))
                }
            }
            if family != .systemSmall {
                UsDuo(me: me, them: them,
                      myFace: UsWidgetModels.face(entry.snapshot, me: true, now: entry.date).face,
                      theirFace: UsWidgetModels.face(entry.snapshot, me: false, now: entry.date).face,
                      size: family == .systemLarge ? 54 : 40)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .offset(x: 6, y: 8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(entry.days >= 0 ? "La vostra foto di Oggi, \(entry.days) \(entry.days == 1 ? "giorno" : "giorni") insieme" : "Foto & Noi")
    }

    /// "Giovedì 26 novembre", on the large.
    static func today(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.timeZone = UsWidgetModels.rome
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: date).capitalizedFirst
    }

    @ViewBuilder
    private func tintedPhoto(_ photo: UIImage) -> some View {
        let image = Image(uiImage: photo).resizable()
        Group {
            if #available(iOS 18.0, *) {
                image.widgetAccentedRenderingMode(.fullColor)
            } else {
                image
            }
        }
        .aspectRatio(contentMode: .fill)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .opacity(0.9)
    }

    private var background: some View {
        ZStack {
            UsPalette.surface(scheme)
            if let photo = entry.photo {
                // A filled photo never grows past the card (it would push the words out).
                Color.clear.overlay(Image(uiImage: photo).resizable().aspectRatio(contentMode: .fill)).clipped()
                UsPalette.velo(scheme)
            }
        }
    }
}

struct UsPhotoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("photo"), provider: UsPhotoProvider()) { entry in
            UsFamily { UsPhotoWidgetView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Foto & Noi")
        .description("La foto di Oggi, che cambia ogni ora, con i giorni insieme.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryInline])
        // StandBy keeps the photo: the background is the content.
        .containerBackgroundRemovable(false)
    }
}
