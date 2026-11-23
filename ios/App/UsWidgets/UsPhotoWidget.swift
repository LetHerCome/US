import SwiftUI
import UIKit
import WidgetKit

/// Foto & Noi (UsPhotoWidgetProvider on Android): Oggi's photo, which changes
/// every hour with US closed, and the days together. Without a photo, the
/// illustration. The tap opens Oggi's photo. Small, medium and large.
struct UsPhotoEntry: TimelineEntry {
    let date: Date
    let days: Int
    let photo: UIImage?
}

struct UsPhotoProvider: TimelineProvider {
    func placeholder(in context: Context) -> UsPhotoEntry {
        UsPhotoEntry(date: Date(), days: 195, photo: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (UsPhotoEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        completion(entries(now: Date(), family: context.family).first ?? placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsPhotoEntry>) -> Void) {
        let now = Date()
        let entries = entries(now: now, family: context.family)
        // The app reloads every widget when it writes; the last entry is Rome's midnight.
        completion(Timeline(entries: entries, policy: .after(UsWidgetModels.nextRomeMidnight(now))))
    }

    private func entries(now: Date, family: WidgetFamily) -> [UsPhotoEntry] {
        let store = UsWidgetStore.shared()
        let snapshot = store?.readSnapshot()
        let started = UsWidgetContract.string(UsWidgetContract.object(snapshot?["couple"])["startedOn"])
        let pixels: CGFloat = family == .systemLarge ? 1100 : family == .systemMedium ? 1000 : 520
        var images: [String: UIImage] = [:]
        return UsWidgetModels.photoTimeline(snapshot, now: now).map { date in
            let slot = UsWidgetModels.photoSlot(snapshot, now: date)
            var image: UIImage?
            if slot.ready {
                image = images[slot.key] ?? UsArt.downsampled(store?.readPhoto(slot.key), maxPixels: pixels)
                images[slot.key] = image
            }
            return UsPhotoEntry(date: date, days: UsWidgetModels.daysTogether(started, now: date), photo: image)
        }
    }
}

struct UsPhotoWidgetView: View {
    let entry: UsPhotoEntry
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode

    private var numberSize: CGFloat { family == .systemLarge ? 64 : family == .systemMedium ? 48 : 44 }
    private var unitSize: CGFloat { family == .systemLarge ? 17 : family == .systemMedium ? 14 : 13 }

    var body: some View {
        content
            .usLegacyContentPadding()
            .usWidgetBackground { background }
            .widgetURL(UsWidgetShared.openURL("photo"))
    }

    private var content: some View {
        ZStack(alignment: .bottomLeading) {
            // iOS 18 "tinted" Home: the system drops the background, so the photo
            // comes forward in full colour (founder-approved board).
            if renderingMode != .fullColor, let photo = entry.photo {
                tintedPhoto(photo)
            }
            Color.clear
            if entry.days >= 0 {
                HStack(alignment: .lastTextBaseline, spacing: family == .systemLarge ? 8 : 6) {
                    Text(verbatim: String(entry.days))
                        .font(UsFonts.fraunces(numberSize))
                        .foregroundColor(UsPalette.ink(scheme))
                        .widgetAccentable()
                    Text(verbatim: UsWidgetModels.daysUnit(entry.days))
                        .font(UsFonts.fraunces(unitSize, italic: true))
                        .foregroundColor(UsPalette.sub(scheme))
                        .lineSpacing(-2)
                        .fixedSize()
                }
                .minimumScaleFactor(0.6)
                .lineLimit(2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(entry.days >= 0 ? "Foto & Noi, \(entry.days) \(entry.days == 1 ? "giorno" : "giorni") insieme" : "Foto & Noi")
    }

    @ViewBuilder
    private func tintedPhoto(_ photo: UIImage) -> some View {
        let image = Image(uiImage: photo).resizable()
        Group {
            if #available(iOSApplicationExtension 18.0, *) {
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
            if let photo = entry.photo {
                Image(uiImage: photo).resizable().aspectRatio(contentMode: .fill)
            } else if let art = UsArt.image("art_photo", scheme) {
                Image(uiImage: art).resizable().aspectRatio(contentMode: .fill)
            } else {
                UsPalette.cream
            }
            UsPalette.fade(scheme)
            UsGrain()
        }
    }
}

struct UsPhotoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("photo"), provider: UsPhotoProvider()) { entry in
            UsPhotoWidgetView(entry: entry)
        }
        .configurationDisplayName("Foto & Noi")
        .description("La foto di Oggi, che cambia ogni ora, con i giorni insieme.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        // StandBy keeps the photo: the background is the content.
        .containerBackgroundRemovable(false)
    }
}
