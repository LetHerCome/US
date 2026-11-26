import SwiftUI
import UIKit
import WidgetKit

// Widget del redesign (founder, 26/11/2026; tavola Hkj3ojVe3bwEHfg9XeJf6A,
// «tutte okay»): the seven widgets iPhone did not have yet, the same as
// Android (Us*WidgetProvider.java), and their lock-screen faces. Each reads
// the snapshot the app writes (UsWidgetStore) and never the network.

// MARK: - Entry and provider

struct UsCardEntry: TimelineEntry {
    let date: Date
    let snapshot: [String: Any]?
    /// The pictures US prepared (polaroids, the board's drawing), by slot.
    var images: [String: UIImage] = [:]
}

struct UsCardProvider: TimelineProvider {
    let kind: String

    func placeholder(in context: Context) -> UsCardEntry {
        UsCardEntry(date: Date(), snapshot: UsSample.snapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (UsCardEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        completion(entry(now: Date(), family: context.family))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsCardEntry>) -> Void) {
        let now = Date()
        let entry = entry(now: now, family: context.family)
        completion(Timeline(entries: [entry], policy: .after(UsCards.nextChange(kind, entry.snapshot, now: now))))
    }

    private func entry(now: Date, family: WidgetFamily) -> UsCardEntry {
        let store = UsWidgetStore.shared()
        let snapshot = store?.readSnapshot()
        var images: [String: UIImage] = [:]
        let slots: [String]
        switch kind {
        case "memories": slots = family == .systemSmall ? ["memories"] : ["memories_wide"]
        case "lavagna": slots = ["lavagna", "lavagna_night"]
        default: slots = []
        }
        for slot in slots {
            if let image = UsArt.downsampled(store?.readPortrait(slot), maxPixels: 700) { images[slot] = image }
        }
        return UsCardEntry(date: now, snapshot: snapshot, images: images)
    }
}

enum UsCards {
    /// The moment a widget of this kind changes by itself (a relative time, the faces at 22 and 6, midnight).
    static func nextChange(_ kind: String, _ snapshot: [String: Any]?, now: Date) -> Date {
        let faces = [UsWidgetModels.face(snapshot, me: true, now: now).next, UsWidgetModels.face(snapshot, me: false, now: now).next]
        switch kind {
        case "status": return usNextChange(faces, now: now)
        case "noi": return usNextChange([UsWidgetModels.couple(snapshot, now: now).nextChange] + faces, now: now)
        case "daily": return usNextChange(faces, now: now)
        case "message": return usNextChange([UsWidgetModels.message(snapshot, now: now).nextChange], now: now)
        case "memories": return usNextChange([UsWidgetModels.memories(snapshot, now: now).nextChange], now: now)
        case "lavagna": return usNextChange([UsWidgetModels.lavagna(snapshot, now: now).nextChange] + faces, now: now)
        default: return usNextChange([], now: now)
        }
    }
}

/// The widget's family from the environment; the gallery passes its own.
struct UsFamily<Content: View>: View {
    @Environment(\.widgetFamily) private var family
    let content: (WidgetFamily) -> Content
    var body: some View { content(family) }
}

/// The card under a widget: foglio by day, the warm night in the dark (system
/// families); the system's own soft disc or nothing on the lock screen.
struct UsCard: ViewModifier {
    let family: WidgetFamily
    var board = false
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.usWidgetBackground {
            switch family {
            case .accessoryCircular: AccessoryWidgetBackground()
            case .accessoryRectangular, .accessoryInline: Color.clear
            default: board ? UsPalette.board(scheme) : UsPalette.surface(scheme)
            }
        }
    }
}

extension View {
    func usCard(_ family: WidgetFamily, board: Bool = false) -> some View { modifier(UsCard(family: family, board: board)) }
}

// MARK: - La domanda di oggi

struct UsDailyView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let daily = UsWidgetModels.daily(entry.snapshot, now: entry.date)
        let partner = UsWidgetModels.partnerName(entry.snapshot)
        let who = partner.isEmpty ? "L’altra persona" : partner
        let status = UsWidgetModels.dailyStatus(daily.state, who: who)
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        let question = daily.shown ? daily.question : daily.state == "stale" ? "Apri US per la domanda nuova" : "La domanda di oggi vi aspetta in US"
        let wave = daily.state == "your_turn" ? "saluta" : ""
        let face = UsWidgetModels.face(entry.snapshot, me: false, now: entry.date).face
        Group {
            switch family {
            case .accessoryRectangular:
                HStack(spacing: 6) {
                    UsCharacterView(person: them, face: face, reaction: wave, size: 34, mono: true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: "La domanda").font(.headline).lineLimit(1)
                        Text(verbatim: daily.state == "your_turn" ? "Tocca a te" : status.plain + status.bold).font(.caption).lineLimit(2)
                    }
                }
            case .systemMedium:
                VStack(alignment: .leading, spacing: 8) {
                    UsLabel(text: "La domanda di oggi", me: me)
                    Text(verbatim: question).font(UsFonts.fraunces(19)).foregroundColor(UsPalette.ink(scheme)).lineLimit(3).minimumScaleFactor(0.8)
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        UsCharacterView(person: them, face: face, reaction: wave, size: 32)
                        (Text(verbatim: status.plain) + Text(verbatim: status.bold).bold())
                            .font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(2)
                        Spacer(minLength: 4)
                        UsPill(text: UsWidgetModels.dailyButton(daily.state), me: me, them: them)
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 8) {
                    UsLabel(text: "La domanda di oggi", me: me)
                    Text(verbatim: question).font(UsFonts.fraunces(17)).foregroundColor(UsPalette.ink(scheme)).lineLimit(4).minimumScaleFactor(0.75)
                    Spacer(minLength: 0)
                    HStack { Spacer(); UsPill(text: UsWidgetModels.dailyButton(daily.state), me: me, them: them) }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .usLegacyContentPadding()
        .usCard(family)
        .widgetURL(UsWidgetShared.openURL("daily"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("La domanda di oggi. \(question). \(status.plain)\(status.bold)")
    }
}

struct UsDailyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("daily"), provider: UsCardProvider(kind: "daily")) { entry in
            UsFamily { UsDailyView(entry: entry, family: $0) }
        }
        .configurationDisplayName("La domanda di oggi")
        .description("La domanda di oggi e a chi tocca rispondere. Mai le risposte.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// MARK: - Come stai («Voi due»)

struct UsStatusView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let partner = UsWidgetModels.partnerName(entry.snapshot)
        let name = partner.isEmpty ? "La tua persona" : partner
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        let mine = UsWidgetModels.statusPerson(entry.snapshot, me: true, now: entry.date)
        let theirs = UsWidgetModels.statusPerson(entry.snapshot, me: false, now: entry.date)
        let myFace = UsWidgetModels.face(entry.snapshot, me: true, now: entry.date).face
        let theirFace = UsWidgetModels.face(entry.snapshot, me: false, now: entry.date).face
        let theirLine = theirs.shown ? theirs.line : "Nessuno stato"
        Group {
            switch family {
            case .accessoryCircular:
                UsCharacterView(person: them, face: theirFace, size: 46, mono: true)
            case .accessoryRectangular:
                HStack(spacing: 6) {
                    UsDuo(me: me, them: them, myFace: myFace, theirFace: theirFace, size: 30, mono: true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: name).font(.headline).lineLimit(1)
                        Text(verbatim: theirLine).font(.caption).lineLimit(2)
                    }
                }
            case .systemMedium:
                HStack(spacing: 0) {
                    person(me, face: myFace, name: "Tu", line: mine.shown ? mine.line : "Tocca per dirlo", size: 80)
                    Rectangle().fill(UsPalette.line(scheme)).frame(width: 1).padding(.vertical, -16)
                    person(them, face: theirFace, name: name, line: theirLine, size: 76)
                }
            default:
                person(them, face: theirFace, name: name, line: theirLine, size: 86)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .usLegacyContentPadding()
        .usCard(family)
        .widgetURL(UsWidgetShared.openURL("status"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Tu: \(mine.shown ? mine.line : "nessuno stato"). \(name): \(theirLine). Apri Come stai")
    }

    private func person(_ p: UsWidgetModels.Person, face: String, name: String, line: String, size: CGFloat) -> some View {
        VStack(spacing: 2) {
            Spacer(minLength: 0)
            UsCharacterView(person: p, face: face, size: size)
            Text(verbatim: name).font(UsFonts.figtree(14, bold: true)).foregroundColor(UsPalette.ink(scheme)).lineLimit(1)
            Text(verbatim: line).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }
}

struct UsStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("status"), provider: UsCardProvider(kind: "status")) { entry in
            UsFamily { UsStatusView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Come stai")
        .description("Come state tu e la tua persona: i vostri personaggi con la faccia del momento. Dura 12 ore.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Distanza e batteria

struct UsNoiView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let couple = UsWidgetModels.couple(entry.snapshot, now: entry.date)
        let partner = UsWidgetModels.partnerName(entry.snapshot)
        let name = partner.isEmpty ? "La tua persona" : partner
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        let theirFace = UsWidgetModels.face(entry.snapshot, me: false, now: entry.date).face
        let number = couple.distanceNear ? "< 3" : couple.distanceText.split(separator: " ").first.map(String.init) ?? ""
        let unit = couple.distanceNear ? "km" : couple.distanceText.split(separator: " ").dropFirst().joined(separator: " ")
        Group {
            switch family {
            case .accessoryCircular:
                Gauge(value: Double(max(0, couple.batteryLevel)), in: 0...100) {
                    Text(verbatim: "km")
                } currentValueLabel: {
                    Text(verbatim: couple.distanceKnown ? number : "–")
                }
                .gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: couple.distanceKnown ? "\(number) \(unit) tra voi" : "Distanza non nota").font(.headline).lineLimit(1)
                    if couple.batteryShown {
                        HStack(spacing: 6) {
                            ProgressView(value: Double(couple.batteryLevel), total: 100)
                            Text(verbatim: "\(name) \(couple.batteryLevel)%").font(.caption).lineLimit(1)
                        }
                    }
                }
            case .systemMedium:
                VStack(alignment: .leading, spacing: 0) {
                    UsLabel(text: "Tra voi", me: me)
                    Spacer(minLength: 0)
                    HStack(alignment: .bottom, spacing: 8) {
                        VStack(spacing: 2) {
                            UsCharacterView(person: me, face: UsWidgetModels.face(entry.snapshot, me: true, now: entry.date).face, size: 52)
                            Text(verbatim: "Tu").font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme))
                        }
                        VStack(spacing: 6) {
                            distance(number, unit, known: couple.distanceKnown, size: 38)
                            Line().stroke(UsPalette.filo(scheme), style: StrokeStyle(lineWidth: 2, dash: [6, 5])).frame(height: 2)
                            Text(verbatim: couple.distanceAgo).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1)
                        }
                        .padding(.bottom, 22)
                        VStack(spacing: 2) {
                            UsCharacterView(person: them, face: theirFace, size: 50)
                            Text(verbatim: couple.batteryShown ? "\(name) · \(couple.batteryLevel)%" : name)
                                .font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1)
                        }
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 0) {
                    UsLabel(text: "Tra voi", me: me)
                    Spacer(minLength: 0)
                    distance(number, unit, known: couple.distanceKnown, size: 44)
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        UsCharacterView(person: them, face: theirFace, size: 28)
                        Text(verbatim: name).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1)
                        Spacer(minLength: 2)
                        if couple.batteryShown {
                            Text(verbatim: "\(couple.batteryLevel)%").font(UsFonts.figtree(13, bold: true))
                                .foregroundColor(couple.batteryLevel <= UsWidgetModels.batteryLow && !couple.batteryCharging ? UsPalette.ceralacca : UsPalette.ink(scheme))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .usLegacyContentPadding()
        .usCard(family)
        .widgetURL(UsWidgetShared.openURL("noi"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(couple.distanceKnown ? "Distanza tra voi \(number) \(unit)" + (couple.batteryShown ? ". Batteria di \(name) \(couple.batteryLevel)%" : "") : "Distanza non ancora nota")
    }

    @ViewBuilder
    private func distance(_ number: String, _ unit: String, known: Bool, size: CGFloat) -> some View {
        if known {
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(verbatim: number).font(UsFonts.fraunces(size)).foregroundColor(UsPalette.ink(scheme))
                Text(verbatim: unit).font(UsFonts.fraunces(size * 0.42, italic: true)).foregroundColor(UsPalette.ink(scheme))
            }
            .lineLimit(1).minimumScaleFactor(0.6)
        } else {
            Text(verbatim: "Distanza non ancora nota").font(UsFonts.fraunces(15, italic: true)).foregroundColor(UsPalette.sub(scheme))
        }
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return p
        }
    }
}

struct UsNoiWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("noi"), provider: UsCardProvider(kind: "noi")) { entry in
            UsFamily { UsNoiView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Distanza e batteria")
        .description("La distanza tra voi e la batteria della tua persona. Mai dove siete.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Lasciato per te

struct UsMessageView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let message = UsWidgetModels.message(entry.snapshot, now: entry.date)
        let partner = UsWidgetModels.partnerName(entry.snapshot)
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        let who = partner.isEmpty || message.empty ? message.when : message.when.isEmpty ? "da \(partner)" : "da \(partner) · \(message.when)"
        let said = message.empty ? message.text : (partner.isEmpty ? "L’altra persona" : partner) + " " + message.text.lowercased()
        Group {
            switch family {
            case .accessoryInline:
                Text(verbatim: message.empty ? "Nessun Lasciato per te" : said)
            case .accessoryCircular:
                ZStack {
                    RoundedRectangle(cornerRadius: 4).stroke(lineWidth: 3).frame(width: 34, height: 24)
                    Path { p in p.move(to: CGPoint(x: 2, y: 2)); p.addLine(to: CGPoint(x: 17, y: 13)); p.addLine(to: CGPoint(x: 32, y: 2)) }
                        .stroke(style: StrokeStyle(lineWidth: 3, lineJoin: .round)).frame(width: 34, height: 24)
                }
                .opacity(message.empty ? 0.4 : 1)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: partner.isEmpty ? "Lasciato per te" : "Da \(partner)").font(.headline).lineLimit(1)
                    Text(verbatim: message.empty ? "Ancora niente" : UsWidgetModels.leftNoun(UsWidgetContract.string(UsWidgetContract.object(entry.snapshot?["left"])["kind"])).capitalizedFirst + (message.when.isEmpty ? "" : " · \(message.when)"))
                        .font(.caption).lineLimit(2)
                }
            case .systemMedium:
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 6) {
                        UsLabel(text: "Lasciato per te", me: me)
                        Text(verbatim: message.text).font(UsFonts.fraunces(20)).foregroundColor(UsPalette.ink(scheme)).lineLimit(3).minimumScaleFactor(0.8)
                        if !message.hint.isEmpty { Text(verbatim: message.hint).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)) }
                        if !who.isEmpty { Text(verbatim: who).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1) }
                    }
                    Spacer(minLength: 0)
                    UsEnvelope(edge: UsPalette.of(them, scheme)).frame(width: 132, height: 88).rotationEffect(.degrees(-4))
                }
            default:
                ZStack(alignment: .topLeading) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verbatim: message.text).font(UsFonts.fraunces(18)).foregroundColor(UsPalette.ink(scheme)).lineLimit(3).minimumScaleFactor(0.8)
                        if !who.isEmpty { Text(verbatim: who).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1) }
                    }
                    UsEnvelope(edge: UsPalette.of(them, scheme)).frame(width: 118, height: 78).rotationEffect(.degrees(-5))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom).offset(y: 22)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .usLegacyContentPadding()
        .usCard(family)
        .widgetURL(UsWidgetShared.openURL(message.destination))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(message.empty ? message.text : said + (message.when.isEmpty ? "" : ", \(message.when)") + ". Apri US")
    }
}

extension String {
    var capitalizedFirst: String { String(prefix(1)).uppercased() + String(dropFirst()) }
}

struct UsMessageWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("message"), provider: UsCardProvider(kind: "message")) { entry in
            UsFamily { UsMessageView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Lasciato per te")
        .description("Il Lasciato per te ancora chiuso: solo che cosa è e quando.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Ricordi

struct UsMemoriesView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let model = UsWidgetModels.memories(entry.snapshot, now: entry.date)
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let picture = entry.images[family == .systemSmall ? "memories" : "memories_wide"]
        let empty = entry.snapshot == nil ? "Apri US per collegarlo" : "I vostri ricordi appariranno qui"
        Group {
            if let picture = picture, model.shown {
                if family == .systemMedium {
                    HStack(spacing: 8) {
                        Image(uiImage: picture).resizable().aspectRatio(contentMode: .fit).frame(maxHeight: .infinity)
                        VStack(alignment: .leading, spacing: 6) {
                            UsLabel(text: "Ricordi", me: me)
                            Text(verbatim: model.pill.isEmpty ? model.title : model.pill).font(UsFonts.fraunces(21)).foregroundColor(UsPalette.ink(scheme)).lineLimit(2)
                            Text(verbatim: model.pill.isEmpty ? model.line : [model.title, model.line].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(2)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, -8)
                } else {
                    Image(uiImage: picture).resizable().aspectRatio(contentMode: .fit).padding(-8)
                }
            } else {
                Text(verbatim: empty).font(UsFonts.fraunces(16, italic: true)).foregroundColor(UsPalette.sub(scheme))
                    .multilineTextAlignment(.center).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .usLegacyContentPadding()
        .usCard(family)
        .widgetURL(UsWidgetShared.openURL("memories"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.shown ? "\(model.pill.isEmpty ? "Ricordi" : model.pill): \(model.title). Apri Ricordi" : empty)
    }
}

struct UsMemoriesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("memories"), provider: UsCardProvider(kind: "memories")) { entry in
            UsFamily { UsMemoriesView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Ricordi")
        .description("Le vostre foto di questo giorno, un anno fa. Altrimenti le più recenti.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Lavagna

struct UsLavagnaView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let model = UsWidgetModels.lavagna(entry.snapshot, now: entry.date)
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        let drawing = entry.images[scheme == .dark ? "lavagna_night" : "lavagna"]
        let empty = entry.snapshot == nil ? "Apri US per collegarlo" : "Disegnate qualcosa sulla lavagna"
        VStack(alignment: .leading, spacing: 6) {
            if family == .systemMedium { UsLabel(text: "Lavagna", me: me) }
            Group {
                if let drawing = drawing, model.shown {
                    Image(uiImage: drawing).resizable().aspectRatio(contentMode: .fit)
                } else {
                    Text(verbatim: empty).font(UsFonts.fraunces(16, italic: true)).foregroundColor(UsPalette.sub(scheme)).multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack(spacing: 6) {
                if family == .systemMedium, model.by == "me" || model.by == "partner" {
                    UsCharacterView(person: model.by == "me" ? me : them,
                                    face: UsWidgetModels.face(entry.snapshot, me: model.by == "me", now: entry.date).face, size: 28)
                }
                Text(verbatim: model.line).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1)
                Spacer(minLength: 4)
                if family == .systemMedium {
                    UsPill(text: "Disegna", me: me, them: them, icon: UsPaths.pencil)
                } else {
                    ZStack {
                        Circle().fill(UsPalette.blend(me, them, scheme))
                        UsPathShape(data: UsPaths.pencil).fill(UsPalette.onPill(scheme)).frame(width: 17, height: 17)
                    }
                    .frame(width: 36, height: 36)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .usLegacyContentPadding()
        .usCard(family, board: true)
        .widgetURL(UsWidgetShared.openURL("lavagna"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.shown ? "Lavagna, ultimo tratto: \(model.line). Apri la lavagna" : "Lavagna: \(empty)")
    }
}

struct UsLavagnaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("lavagna"), provider: UsCardProvider(kind: "lavagna")) { entry in
            UsFamily { UsLavagnaView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Lavagna")
        .description("L’ultimo disegno sulla vostra lavagna. Toccalo per disegnare.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Post-it

struct UsPostitView: View {
    let entry: UsCardEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let model = UsWidgetModels.postit(entry.snapshot)
        let more = family == .systemMedium && model.second != nil ? model.more - 1 : model.more
        ZStack(alignment: .bottomTrailing) {
            HStack(spacing: 14) {
                note(model.first, turn: family == .systemMedium ? -2 : 2)
                if family == .systemMedium {
                    if let second = model.second { note(second, turn: 2.5) } else { Color.clear }
                }
            }
            if more > 0 {
                Text(verbatim: "+\(more)").font(UsFonts.figtree(11, bold: true)).foregroundColor(UsPalette.sub(scheme)).offset(x: 8, y: 10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .usLegacyContentPadding()
        .usCard(family)
        .widgetURL(UsWidgetShared.openURL("postit"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Post-it: \(model.first.text)" + (model.more > 0 ? ". Altri \(model.more) sulla bacheca" : "") + ". Apri la bacheca")
    }

    private func note(_ note: UsWidgetModels.Note, turn: Double) -> some View {
        let by: UsWidgetModels.Person? = note.by == "me" ? UsWidgetModels.person(entry.snapshot, me: true)
            : note.by == "partner" ? UsWidgetModels.person(entry.snapshot, me: false) : nil
        return ZStack(alignment: .top) {
            Text(verbatim: note.text).font(UsFonts.fraunces(16, italic: true)).foregroundColor(UsPalette.paperInk)
                .lineLimit(4).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(EdgeInsets(top: 18, leading: 12, bottom: 10, trailing: 10))
                .background(UnevenRoundedPostit().fill(UsPalette.postit(note.color)))
                .shadow(color: .black.opacity(0.25), radius: 5, y: 3)
            if let by = by { UsTape(color: UsPalette.of(by, scheme)).offset(y: -8).rotationEffect(.degrees(turn * 1.5)) }
        }
        .rotationEffect(.degrees(turn))
    }

    /// The post-it's corners: 4, 4, 14 bottom right, 4 (couple-notes.css).
    private struct UnevenRoundedPostit: Shape {
        func path(in r: CGRect) -> Path {
            var p = Path()
            let small: CGFloat = 4, big: CGFloat = 14
            p.move(to: CGPoint(x: r.minX + small, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX - small, y: r.minY))
            p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + small), control: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - big))
            p.addQuadCurve(to: CGPoint(x: r.maxX - big, y: r.maxY), control: CGPoint(x: r.maxX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX + small, y: r.maxY))
            p.addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - small), control: CGPoint(x: r.minX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX, y: r.minY + small))
            p.addQuadCurve(to: CGPoint(x: r.minX + small, y: r.minY), control: CGPoint(x: r.minX, y: r.minY))
            p.closeSubpath()
            return p
        }
    }
}

struct UsPostitWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("postit"), provider: UsCardProvider(kind: "postit")) { entry in
            UsFamily { UsPostitView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Post-it")
        .description("L’ultimo post-it della vostra bacheca. Toccalo per aprirla.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - A sample couple for the widget gallery of iOS (placeholder and previews)

enum UsSample {
    /// Generic: no real name (the widgets say «La tua persona»), a ball and a square.
    static var snapshot: [String: Any] {
        let now = Date()
        func at(_ minutes: Double) -> String { UsWidgetContract.format(now.addingTimeInterval(minutes * 60)) }
        let today = UsWidgetModels.romeToday(now)
        return [
            "schemaVersion": 2,
            "think": ["partnerName": ""],
            "couple": [
                "startedOn": "2026-05-15", "distanceText": "12 km", "distanceAt": at(-10), "batteryLevel": 78, "batteryAt": at(-10),
                "characters": ["me": ["shape": "palla", "face": "occhiali", "color": "#ff7c96", "day": "#e7a1ab"],
                               "partner": ["shape": "quadrato", "head": "fiocco", "color": "#a98bff", "day": "#ab9ddb"]]
            ] as [String: Any],
            "daily": ["date": today, "state": "your_turn", "question": "Quale piccolo momento vorresti rivivere insieme?"],
            "left": ["kind": "photo", "at": at(-10)],
            "lavagna": ["state": "ready", "by": "partner", "at": at(-60)],
            "postit": ["state": "ready", "text": "prenotare la cena di sabato", "color": "yellow", "by": "partner", "more": 2,
                       "second": ["text": "comprare le lucine per il balcone", "color": "pink", "by": "me"]] as [String: Any],
            "status": ["me": ["status": "felice", "form": "m", "at": at(-60), "until": at(660)],
                       "partner": ["status": "innamorato", "form": "f", "at": at(-120), "until": at(600)]]
        ]
    }
}
