import AppIntents
import SwiftUI
import WidgetKit

/// Ti penso (UsThinkWidgetProvider on Android; widget del redesign
/// 26/11/2026): the heart from your colour to theirs, the only place where
/// the two blend, and «Pensa a Bea». Their thought, still unanswered: their
/// character in love and «Bea ti pensa». The medium is you two with the heart
/// between you. On iOS 17+ the heart sends from the widget (App Intent); on
/// iOS 16, or when not linked, the tap opens US on Ti penso. On the lock
/// screen: the heart in a circle, or one line above the clock.
struct UsThinkEntry: TimelineEntry {
    let date: Date
    let model: UsWidgetModels.Think
    var snapshot: [String: Any]?
}

struct UsThinkProvider: TimelineProvider {
    func placeholder(in context: Context) -> UsThinkEntry {
        var model = UsWidgetModels.Think()
        model.canSend = true
        model.line = "Pensa alla tua persona"
        return UsThinkEntry(date: Date(), model: model, snapshot: UsSample.snapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (UsThinkEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        completion(entries(now: Date()).first ?? placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsThinkEntry>) -> Void) {
        let now = Date()
        let list = entries(now: now)
        let faces = [UsWidgetModels.face(list.first?.snapshot, me: true, now: now).next,
                     UsWidgetModels.face(list.first?.snapshot, me: false, now: now).next]
        completion(Timeline(entries: list, policy: .after(usNextChange(faces, now: now))))
    }

    /// Now, then every moment the heart changes by itself ("Inviato" ends, "10 min fa" moves on).
    private func entries(now: Date) -> [UsThinkEntry] {
        let store = UsWidgetStore.shared()
        let owner = store?.owner() ?? ""
        let snapshot = store?.readSnapshot()
        let action = store?.readAction()
        let hasCredential = !owner.isEmpty && !UsWidgetCredentials().readToken(owner).isEmpty
        var result: [UsThinkEntry] = []
        var cursor = now
        while result.count < 8 {
            let model = UsWidgetModels.think(snapshot, action: action, hasCredential: hasCredential, now: cursor)
            result.append(UsThinkEntry(date: cursor, model: model, snapshot: snapshot))
            guard let next = model.nextChange, next > cursor else { break }
            cursor = next
        }
        return result
    }
}

@available(iOS 17.0, *)
struct UsThinkIntent: AppIntent {
    static var title: LocalizedStringResource = "Ti penso"
    static var description = IntentDescription("Manda un Ti penso alla tua persona.")
    static var openAppWhenRun = false
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await UsThinkSender.send()
        return .result()
    }
}

struct UsThinkWidgetView: View {
    let entry: UsThinkEntry
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme

    private var model: UsWidgetModels.Think { entry.model }
    private var partner: String { UsWidgetModels.partnerName(entry.snapshot) }
    /// Their thought is waiting for an answer.
    private var got: Bool { !model.done && model.unanswered }

    var body: some View {
        tappable
            .usLegacyContentPadding()
            .usCard(family)
    }

    @ViewBuilder
    private var tappable: some View {
        if #available(iOS 17.0, *) {
            if model.canSend {
                Button(intent: UsThinkIntent()) { content }
                    .buttonStyle(.plain)
            } else {
                content.widgetURL(UsWidgetShared.openURL("think"))
            }
        } else {
            content.widgetURL(UsWidgetShared.openURL("think"))
        }
    }

    @ViewBuilder
    private var content: some View {
        let me = UsWidgetModels.person(entry.snapshot, me: true)
        let them = UsWidgetModels.person(entry.snapshot, me: false)
        let dim = !model.canSend || (model.busy && !model.done)
        Group {
            switch family {
            case .accessoryCircular:
                UsPathShape(data: UsPaths.heart).fill(.primary).frame(width: 30, height: 30).opacity(dim ? 0.55 : 1)
            case .accessoryInline:
                Text(verbatim: got ? "\(partner.isEmpty ? "Ti pensa" : partner + " ti pensa")\(model.when.isEmpty ? "" : " · " + model.when)"
                     : model.done ? model.line : (partner.isEmpty ? "Ti penso" : "Pensa a " + partner))
            case .systemMedium:
                HStack(spacing: 8) {
                    ZStack(alignment: .top) {
                        HStack(alignment: .bottom, spacing: 4) {
                            UsCharacterView(person: me, face: UsWidgetModels.face(entry.snapshot, me: true, now: entry.date).face, size: 74)
                            UsCharacterView(person: them, face: got ? "innamorato" : UsWidgetModels.face(entry.snapshot, me: false, now: entry.date).face, size: 68)
                        }
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        UsBlendedHeart(me: me, them: them).frame(width: 30, height: 30).opacity(dim ? 0.55 : 1)
                    }
                    .frame(width: 160)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(verbatim: mediumTitle).font(UsFonts.fraunces(21)).foregroundColor(UsPalette.ink(scheme)).lineLimit(2).minimumScaleFactor(0.8)
                        Text(verbatim: mediumLabel).font(UsFonts.figtree(13)).foregroundColor(UsPalette.sub(scheme)).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                }
            default:
                if got {
                    ZStack(alignment: .topLeading) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(verbatim: partner.isEmpty ? "Ti pensa" : partner + " ti pensa").font(UsFonts.fraunces(19)).foregroundColor(UsPalette.ink(scheme)).lineLimit(2)
                            Text(verbatim: model.when).font(UsFonts.figtree(12)).foregroundColor(UsPalette.sub(scheme))
                        }
                        UsCharacterView(person: them, face: "innamorato", size: 82)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                            .offset(y: 14)
                        UsBlendedHeart(me: me, them: them).frame(width: 24, height: 24)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                            .offset(x: -8, y: -60)
                    }
                } else {
                    VStack(spacing: 12) {
                        UsBlendedHeart(me: me, them: them).frame(width: 68, height: 68).opacity(dim ? 0.55 : 1)
                        Text(verbatim: smallLabel).font(UsFonts.figtree(13, bold: true)).foregroundColor(UsPalette.sub(scheme)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
    }

    private var smallLabel: String {
        if model.done { return model.line + (model.when.isEmpty ? "" : " · " + model.when) }
        if model.canSend { return partner.isEmpty ? "Manda un pensiero" : "Pensa a " + partner }
        return model.line
    }

    private var mediumTitle: String {
        if model.done { return model.line }
        if got { return partner.isEmpty ? "Ti pensa" : partner + " ti pensa" }
        return model.canSend ? "Un pensiero,\nun tocco" : model.line
    }

    private var mediumLabel: String {
        if model.done { return model.when }
        if got { return model.when.isEmpty ? "Tocca per ricambiare" : model.when + " · tocca per ricambiare" }
        return model.canSend ? "Tocca e \(partner.isEmpty ? "la tua persona" : partner) lo sente subito" : "Apri US per collegarlo"
    }

    private var accessibilityText: String {
        let said = model.canSend ? "Tocca per mandare un Ti penso" : "Apri US"
        guard !model.line.isEmpty else { return said }
        return model.line + (model.when.isEmpty ? "" : ", " + model.when) + ". " + said
    }
}

struct UsThinkWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: UsWidgetShared.widgetKind("think"), provider: UsThinkProvider()) { entry in
            UsFamily { UsThinkWidgetView(entry: entry, family: $0) }
        }
        .configurationDisplayName("Ti penso")
        .description("Un pensiero con un tocco, anche con US chiusa.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryInline])
    }
}

/// Il Controllo «Ti penso» (iOS 18; tavola del blocca schermo): on the lock
/// screen in place of the torch, in Control Centre or on the Action button,
/// one press and the heart goes, without opening US.
@available(iOS 18.0, *)
struct UsThinkControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "us.control.think") {
            ControlWidgetButton(action: UsThinkIntent()) {
                Label {
                    Text(verbatim: "Ti penso")
                } icon: {
                    Image(systemName: "heart.fill")
                }
            }
        }
        .displayName("Ti penso")
        .description("Un tocco e la tua persona sente il cuore.")
    }
}
