import AppIntents
import SwiftUI
import WidgetKit

/// Ti penso (UsThinkWidgetProvider on Android; founder, 04/11/2026: only a
/// heart). Empty while it waits; full for a minute after the tap; faded while
/// it sends or when it is not linked (then the tap opens US). On iOS 17+ the
/// heart sends from the widget (App Intent) and beats inside it, since a
/// widget cannot open a window over the Home screen (founder, 14/11/2026).
/// On iOS 16 the tap opens US on Ti penso.
struct UsThinkEntry: TimelineEntry {
    let date: Date
    let model: UsWidgetModels.Think
}

struct UsThinkProvider: TimelineProvider {
    func placeholder(in context: Context) -> UsThinkEntry {
        var model = UsWidgetModels.Think()
        model.canSend = true
        model.line = "Pensa alla tua persona"
        return UsThinkEntry(date: Date(), model: model)
    }

    func getSnapshot(in context: Context, completion: @escaping (UsThinkEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        completion(entries(now: Date()).first ?? placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsThinkEntry>) -> Void) {
        let now = Date()
        completion(Timeline(entries: entries(now: now), policy: .after(UsWidgetModels.nextRomeMidnight(now))))
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
            result.append(UsThinkEntry(date: cursor, model: model))
            guard let next = model.nextChange, next > cursor else { break }
            cursor = next
        }
        return result
    }
}

@available(iOSApplicationExtension 17.0, *)
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
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family

    private var model: UsWidgetModels.Think { entry.model }
    private var heartSize: CGFloat { family == .systemMedium ? 64 : 60 }

    var body: some View {
        tappable
            .usWidgetBackground {
                ZStack {
                    if let art = UsArt.image(family == .systemMedium ? "art_think_m" : "art_think_s", scheme) {
                        Image(uiImage: art).resizable().aspectRatio(contentMode: .fill)
                    } else {
                        UsPalette.cream
                    }
                    UsGrain()
                }
            }
    }

    @ViewBuilder
    private var tappable: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            if model.canSend {
                Button(intent: UsThinkIntent()) { heart }
                    .buttonStyle(.plain)
            } else {
                heart.widgetURL(UsWidgetShared.openURL("think"))
            }
        } else {
            heart.widgetURL(UsWidgetShared.openURL("think"))
        }
    }

    private var heart: some View {
        ZStack {
            Color.clear
            Group {
                if model.done {
                    UsHeartShape().fill(UsPalette.rosa)
                        .transition(.scale(scale: 1.3).combined(with: .opacity))
                } else {
                    UsHeartShape().stroke(UsPalette.rosa, style: StrokeStyle(lineWidth: heartSize * 1.5 / 24, lineJoin: .round))
                        .transition(.opacity)
                }
            }
            .frame(width: heartSize, height: heartSize)
            .opacity(!model.canSend || (model.busy && !model.done) ? 0.55 : 1)
            .widgetAccentable()
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
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
            UsThinkWidgetView(entry: entry)
        }
        .configurationDisplayName("Ti penso")
        .description("Un pensiero con un tocco, anche con US chiusa.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
