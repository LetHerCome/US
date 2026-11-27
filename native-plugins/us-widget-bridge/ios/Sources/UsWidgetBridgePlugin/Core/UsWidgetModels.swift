import Foundation

/// Pure presentation models for the widgets (iOS twin of UsWidgetModels.java).
/// They turn the semantic snapshot plus "now" into what a widget shows and
/// when it must next change. Calendar maths always uses Europe/Rome civil
/// days, like the web Countdown and the server, never the phone's time zone.
enum UsWidgetModels {
    static let rome = TimeZone(identifier: "Europe/Rome")!
    /// "Ricambiato · adesso" stays a minute; taps inside the first part are ignored.
    static let sentVisible: TimeInterval = 60
    static let sendCooldown: TimeInterval = 1.8
    static let failedVisible: TimeInterval = 10 * 60
    /// A "sending" older than this was interrupted.
    static let sendingStale: TimeInterval = 45
    static let retrySameAction: TimeInterval = 2 * 60
    /// Ti penso ×N dai widget (founder, 27/11/2026): taps in a row add up; the
    /// Ti penso leaves this long after the last one, with all of them (UsWidgetModels.java BURST_MS).
    static let burst: TimeInterval = 1.5
    /// At most 99 taps in one Ti penso (shared_messages.think_taps): the 99th sends at once.
    static let maxTaps = 99
    static let bubbleVisible: TimeInterval = 7 * 86_400

    static var romeCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = rome
        return calendar
    }

    /// The Rome civil day of `now`, as yyyy-MM-dd.
    static func romeToday(_ now: Date) -> String {
        let parts = romeCalendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func nextRomeMidnight(_ now: Date) -> Date {
        let calendar = romeCalendar
        let start = calendar.startOfDay(for: now)
        let next = calendar.date(byAdding: .day, value: 1, to: start) ?? now.addingTimeInterval(86_400)
        return next.addingTimeInterval(30)
    }

    /// Days together on the Rome civil calendar; -1 when unknown or in the future.
    static func daysTogether(_ startedOn: String, now: Date) -> Int {
        let clean = UsWidgetContract.civilDate(startedOn)
        guard !clean.isEmpty else { return -1 }
        let start = clean.split(separator: "-").compactMap { Int($0) }
        let today = romeToday(now).split(separator: "-").compactMap { Int($0) }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard start.count == 3, today.count == 3,
              let from = utc.date(from: DateComponents(year: start[0], month: start[1], day: start[2])),
              let to = utc.date(from: DateComponents(year: today[0], month: today[1], day: today[2])),
              let days = utc.dateComponents([.day], from: from, to: to).day else { return -1 }
        return days >= 0 ? days : -1
    }

    static func daysUnit(_ days: Int) -> String { days == 1 ? "giorno\ninsieme" : "giorni\ninsieme" }

    // MARK: - Foto & Noi

    /// The photo shown now: Oggi's of this hour, then of the next two, with US closed.
    struct PhotoSlot: Equatable {
        var key = ""
        var takenOn = ""
        var label = ""
        var index = 0
        var count = 0
        var nextChange: Date?
        var ready: Bool { !key.isEmpty }
    }

    static func photoSlot(_ snapshot: [String: Any]?, now: Date) -> PhotoSlot {
        var out = PhotoSlot()
        let photo = UsWidgetContract.object(snapshot?["photo"])
        guard UsWidgetContract.string(photo["state"]) == "ready", !UsWidgetContract.string(photo["key"]).isEmpty else { return out }
        let next = (photo["next"] as? [Any]) ?? []
        out.count = 1 + next.count
        let hour = UsWidgetContract.instant(UsWidgetContract.string(photo["hour"]))
        let elapsed = hour.map { Int(floor(now.timeIntervalSince($0) / 3600)) } ?? 0
        out.index = max(0, min(out.count - 1, elapsed))
        let current = out.index == 0 ? photo : UsWidgetContract.object(next[out.index - 1])
        out.key = UsWidgetContract.string(current["key"])
        out.takenOn = UsWidgetContract.string(current["takenOn"])
        out.label = UsWidgetContract.string(current["label"])
        if let hour = hour, out.index < out.count - 1 { out.nextChange = hour.addingTimeInterval(3600 * Double(out.index + 1)) }
        return out
    }

    /// Every moment Foto & Noi changes by itself: the next photo hours and Rome midnight.
    static func photoTimeline(_ snapshot: [String: Any]?, now: Date) -> [Date] {
        var dates = [now]
        var cursor = photoSlot(snapshot, now: now)
        while let change = cursor.nextChange, dates.count < 4 {
            dates.append(change)
            cursor = photoSlot(snapshot, now: change.addingTimeInterval(1))
        }
        let midnight = nextRomeMidnight(now)
        if !dates.contains(midnight) { dates.append(midnight) }
        return dates.sorted()
    }

    // MARK: - Ti penso (founder, 04/11/2026: only a heart)

    struct Think: Equatable {
        /// For VoiceOver only: "Bea ti ha pensato", "Ricambiato", "Apri US".
        var line = ""
        var when = ""
        /// The heart tap sends; otherwise it opens US.
        var canSend = false
        /// A tap right now would be ignored (in flight or just tapped).
        var busy = false
        /// Just tapped: the heart is full.
        var done = false
        /// The partner thought of you and you have not answered (Lock Screen: full heart).
        var unanswered = false
        /// Ti penso ×N: taps are adding up, the send leaves after the last one.
        var counting = false
        /// The taps of the burst being counted, sent or just sent (1..99).
        var taps = 1
        /// The taps of their last Ti penso (1..99): «Bea ti ha pensato 5 volte».
        var receivedTaps = 1
        var nextChange: Date?
    }

    /// "Inviato ×5": the number only when there were several.
    static func times(_ taps: Int) -> String { taps > 1 ? " ×\(taps)" : "" }

    /// action: status (idle|sending|sent|failed|unauthorized|rate_limited), at, sentAt, reply.
    static func think(_ snapshot: [String: Any]?, action: [String: Any]?, hasCredential: Bool, now: Date) -> Think {
        var out = Think()
        guard let snapshot = snapshot else {
            out.line = "Apri US per collegarlo"
            return out
        }
        let t = UsWidgetContract.object(snapshot["think"])
        let partner = UsWidgetContract.string(t["partnerName"]).trimmingCharacters(in: .whitespaces)
        let who = partner.isEmpty ? "L’altra persona" : partner
        let status = action.map { UsWidgetContract.string($0["status"], "idle") } ?? "idle"
        let actionAt = action.flatMap { UsWidgetContract.instant(UsWidgetContract.string($0["at"])) }
        let since = actionAt.map { max(0, now.timeIntervalSince($0)) } ?? .greatestFiniteMagnitude
        out.unanswered = unanswered(t, action: action)

        if !hasCredential || status == "unauthorized" {
            out.line = "Apri US per riattivare l’invio"
            return out
        }
        out.canSend = true
        out.taps = UsWidgetContract.taps(action?["taps"])
        // Ti penso ×N: the taps add up on the heart; another tap adds one more.
        if let at = actionAt, status == "counting", since < retrySameAction {
            out.done = true
            out.counting = true
            out.unanswered = false
            out.line = "×\(out.taps)"
            out.when = "tocca ancora"
            out.nextChange = at.addingTimeInterval(since < burst ? burst + 0.5 : retrySameAction)
            return out
        }
        let sending = status == "sending" && since < sendingStale
        if let at = actionAt, sending || (status == "sent" && since < sentVisible) {
            out.done = true
            out.unanswered = false
            out.line = (UsWidgetContract.bool(action?["reply"]) ? "Ricambiato" : "Inviato") + times(out.taps)
            out.when = "adesso"
            out.busy = sending || since < sendCooldown
            out.nextChange = at.addingTimeInterval(sending ? sendingStale : out.busy ? sendCooldown : sentVisible)
            return out
        }
        let lost = (status == "sending" && since >= sendingStale) || status == "counting"
        if let at = actionAt, (status == "failed" || lost) && since < failedVisible {
            out.line = "Non è partito, riprova"
            out.nextChange = at.addingTimeInterval(failedVisible)
            return out
        }
        if let at = actionAt, status == "rate_limited" && since < failedVisible {
            out.line = "Un attimo di pausa"
            out.nextChange = at.addingTimeInterval(failedVisible)
            return out
        }
        if out.unanswered {
            let received = UsWidgetContract.instant(UsWidgetContract.string(t["lastReceivedAt"]))
            // Ti penso ×N (27/11/2026): «Bea ti ha pensato 5 volte».
            out.receivedTaps = UsWidgetContract.taps(t["lastReceivedTaps"])
            out.line = who + " ti ha pensato" + (out.receivedTaps > 1 ? " \(out.receivedTaps) volte" : "")
            out.when = bubbleAgo(received, now: now)
            if let received = received, !out.when.isEmpty { out.nextChange = bubbleNextChange(received, now: now) }
            return out
        }
        out.line = partner.isEmpty ? "Manda un pensiero" : "Pensa a " + partner
        return out
    }

    /// The partner's thought is the latest one and still unanswered (a thought,
    /// a reaction or a widget send answers it).
    static func unanswered(_ think: [String: Any], action: [String: Any]?) -> Bool {
        guard let received = UsWidgetContract.instant(UsWidgetContract.string(think["lastReceivedAt"])) else { return false }
        var sent = UsWidgetContract.instant(UsWidgetContract.string(think["lastSentAt"]))
        if let native = action.flatMap({ UsWidgetContract.instant(UsWidgetContract.string($0["sentAt"])) }),
           sent == nil || native > sent! { sent = native }
        let answered = UsWidgetContract.instant(UsWidgetContract.string(think["lastAnsweredAt"]))
        return (sent == nil || received > sent!) && (answered == nil || received > answered!)
    }

    /// A retry right after a failed or interrupted send reuses the action id:
    /// the server then answers "duplicate" instead of sending a second thought.
    static func actionId(previous: [String: Any]?, now: Date, make: () -> String = { UUID().uuidString.lowercased() }) -> String {
        if let previous = previous {
            let status = UsWidgetContract.string(previous["status"])
            let id = UsWidgetContract.string(previous["actionId"])
            // A burst still being counted (or owed) keeps its id too: Ti penso ×N.
            if ["failed", "sending", "rate_limited", "counting"].contains(status),
               let at = UsWidgetContract.instant(UsWidgetContract.string(previous["at"])),
               now.timeIntervalSince(at) < retrySameAction,
               let uuid = UUID(uuidString: id), uuid.uuidString.lowercased() == id { return id }
        }
        return make()
    }

    /// Ti penso ×N: what one more tap does to the action state (iOS twin of
    /// UsWidgetModels.Tap). A burst still open (counting, under
    /// retrySameAction) gets one more tap with the same id; otherwise a new
    /// burst of 1 starts (a retry after a failed send keeps the id).
    struct Tap: Equatable {
        var actionId = ""
        var taps = 1
        /// The burst answers their thought («Ricambiato»), fixed at its first tap.
        var reply = false
        /// The 99th tap: the send leaves at once.
        var full = false
    }

    static func tap(previous: [String: Any]?, replyIfNew: Bool, now: Date, make: () -> String = { UUID().uuidString.lowercased() }) -> Tap {
        var out = Tap()
        let status = UsWidgetContract.string(previous?["status"])
        let id = UsWidgetContract.string(previous?["actionId"])
        let at = UsWidgetContract.instant(UsWidgetContract.string(previous?["at"]))
        if status == "counting", let at = at, at <= now, now.timeIntervalSince(at) < retrySameAction,
           let uuid = UUID(uuidString: id), uuid.uuidString.lowercased() == id {
            out.actionId = id
            out.taps = min(maxTaps, UsWidgetContract.taps(previous?["taps"]) + 1)
            out.reply = UsWidgetContract.bool(previous?["reply"])
        } else {
            out.actionId = actionId(previous: previous, now: now, make: make)
            out.reply = replyIfNew
        }
        out.full = out.taps >= maxTaps
        return out
    }

    // MARK: - Relative times

    /// "proprio ora", then 5-minute steps in the first hour; "" after a week.
    static func bubbleAgo(_ at: Date?, now: Date) -> String {
        guard let at = at else { return "" }
        let ms = now.timeIntervalSince(at) * 1000
        // A couple of minutes of clock skew between phone and server is "now".
        if ms < -120_000 || ms >= bubbleVisible * 1000 { return "" }
        let minutes = max(0, Int(ms / 60_000))
        if minutes < 5 { return "proprio ora" }
        if minutes < 60 { return "\(minutes / 5 * 5) min fa" }
        if minutes < 120 { return "1 ora fa" }
        if minutes < 1440 { return "\(minutes / 60) ore fa" }
        if minutes < 2880 { return "ieri" }
        return "\(minutes / 1440) giorni fa"
    }

    /// When bubbleAgo next changes: every 5 minutes, then hourly, then daily.
    static func bubbleNextChange(_ at: Date, now: Date) -> Date {
        let minutes = max(0, Int(now.timeIntervalSince(at) / 60))
        let step = minutes < 60 ? 5 : minutes < 1440 ? 60 : 1440
        return at.addingTimeInterval(Double((minutes / step + 1) * step * 60))
    }
}

// MARK: - Widget del redesign (26/11/2026): the other seven widgets, twins of UsWidgetModels.java

extension UsWidgetModels {
    static let months = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
                         "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]

    /// "21 aprile"; "" for anything that is not a civil date.
    static func italianDay(_ civil: String) -> String {
        let parts = UsWidgetContract.civilDate(civil).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return "" }
        return "\(parts[2]) \(months[parts[1] - 1])"
    }

    /// The other person's name, as the app shows it; "" when not known.
    static func partnerName(_ snapshot: [String: Any]?) -> String {
        UsWidgetContract.string(UsWidgetContract.object(snapshot?["think"])["partnerName"]).trimmingCharacters(in: .whitespaces)
    }

    // MARK: La domanda di oggi

    struct Daily: Equatable {
        var question = ""
        /// none, stale, todo, your_turn, waiting, ready.
        var state = "none"
        var shown: Bool { !question.isEmpty }
    }

    /// The question of the day while it is still the same day in Rome.
    static func daily(_ snapshot: [String: Any]?, now: Date) -> Daily {
        let input = UsWidgetContract.object(snapshot?["daily"])
        let state = UsWidgetContract.string(input["state"], "none")
        let date = UsWidgetContract.string(input["date"])
        let question = UsWidgetContract.string(input["question"])
        if state == "none" || date.isEmpty || question.isEmpty { return Daily() }
        if date != romeToday(now) { return Daily(question: "", state: "stale") }
        return Daily(question: question, state: state)
    }

    /// The pill: «Rispondi» while you can answer, «Leggi» once both have, «Apri» otherwise.
    static func dailyButton(_ state: String) -> String {
        switch state {
        case "todo", "your_turn": return "Rispondi"
        case "ready": return "Leggi"
        default: return "Apri"
        }
    }

    /// "Bea ha risposto · tocca a te": the plain part and the part that asks something.
    static func dailyStatus(_ state: String, who: String) -> (plain: String, bold: String) {
        switch state {
        case "todo": return ("", "Rispondi quando vuoi")
        case "your_turn": return ("\(who) ha risposto · ", "tocca a te")
        case "waiting": return ("Hai risposto · ", "aspettiamo \(who)")
        case "ready": return ("", "Le vostre risposte sono pronte")
        default: return ("", "Apri US per la domanda nuova")
        }
    }

    // MARK: Distanza e batteria

    static let batteryFresh: TimeInterval = 60 * 60
    static let batteryVisible: TimeInterval = 24 * 60 * 60
    static let batteryLow = 20

    struct Couple: Equatable {
        var distanceText = ""
        var distanceNear = false
        /// "aggiornato 10 min fa"; "" when unknown or a week old.
        var distanceAgo = ""
        /// The partner's battery, -1 when unknown or older than a day.
        var batteryLevel = -1
        var batteryCharging = false
        var batteryOld = false
        var nextChange: Date?
        var batteryShown: Bool { batteryLevel >= 0 }
        var distanceKnown: Bool { distanceNear || !distanceText.isEmpty }
    }

    static func couple(_ snapshot: [String: Any]?, now: Date) -> Couple {
        var out = Couple()
        let c = UsWidgetContract.object(snapshot?["couple"])
        out.distanceText = UsWidgetContract.string(c["distanceText"])
        out.distanceNear = UsWidgetContract.bool(c["distanceNear"])
        let distanceAt = UsWidgetContract.instant(UsWidgetContract.string(c["distanceAt"]))
        let ago = bubbleAgo(distanceAt, now: now)
        out.distanceAgo = ago.isEmpty ? "" : ago == "proprio ora" ? "aggiornato ora" : "aggiornato " + ago
        var changes: [Date] = [nextRomeMidnight(now)]
        if !ago.isEmpty, let at = distanceAt { changes.append(bubbleNextChange(at, now: now)) }
        let level = UsWidgetContract.int(c["batteryLevel"], -1)
        if level >= 0, level <= 100, let at = UsWidgetContract.instant(UsWidgetContract.string(c["batteryAt"])) {
            let age = max(0, now.timeIntervalSince(at))
            if age < batteryVisible {
                out.batteryLevel = level
                out.batteryCharging = UsWidgetContract.bool(c["batteryCharging"])
                out.batteryOld = age >= batteryFresh
                changes.append(at.addingTimeInterval(out.batteryOld ? batteryVisible : batteryFresh))
            }
        }
        out.nextChange = changes.min()
        return out
    }

    // MARK: Come stai

    /// The founder's twelve (02/11/2026): key, emoji, masculine, feminine, undeclined. Same as member-status.js.
    static let statuses: [(key: String, emoji: String, m: String, f: String, neutral: String)] = [
        ("innamorato", "🥰", "innamorato", "innamorata", "col cuore pieno"),
        ("felice", "😊", "felice", "felice", "felice"),
        ("stanco", "😴", "stanco", "stanca", "senza energie"),
        ("giu", "😔", "giù", "giù", "giù"),
        ("nervoso", "😤", "nervoso", "nervosa", "nervi tesi"),
        ("malato", "🤒", "non sto bene", "non sto bene", "non sto bene"),
        ("festa", "🥳", "in festa", "in festa", "in festa"),
        ("lavoro", "💼", "al lavoro", "al lavoro", "al lavoro"),
        ("studio", "📚", "sui libri", "sui libri", "sui libri"),
        ("palestra", "🏋️", "in palestra", "in palestra", "in palestra"),
        ("viaggio", "🚗", "in viaggio", "in viaggio", "in viaggio"),
        ("tavola", "🍝", "a tavola", "a tavola", "a tavola")
    ]

    struct StatusPerson: Equatable {
        var shown = false
        var key = ""
        /// "Innamorata · da 1 ora".
        var line = ""
        var nextChange: Date?
    }

    /// One member's state, while its twelve hours last.
    static func statusPerson(_ snapshot: [String: Any]?, me: Bool, now: Date) -> StatusPerson {
        var out = StatusPerson()
        let input = UsWidgetContract.object(UsWidgetContract.object(snapshot?["status"])[me ? "me" : "partner"])
        let key = UsWidgetContract.string(input["status"])
        guard let at = UsWidgetContract.instant(UsWidgetContract.string(input["at"])),
              let until = UsWidgetContract.instant(UsWidgetContract.string(input["until"])), now < until,
              let status = statuses.first(where: { $0.key == key }) else { return out }
        let form = UsWidgetContract.string(input["form"])
        let word = form == "m" ? status.m : form == "f" ? status.f : status.neutral
        out.shown = true
        out.key = key
        out.line = String(word.prefix(1)).uppercased() + String(word.dropFirst()) + " · " + statusSince(at, now: now)
        let step = bubbleNextChange(at, now: now)
        out.nextChange = step < until ? step : until
        return out
    }

    /// "proprio ora", "da 10 min", "da 1 ora", "da 3 ore".
    static func statusSince(_ at: Date, now: Date) -> String {
        let minutes = max(0, Int(now.timeIntervalSince(at) / 60))
        if minutes < 5 { return "proprio ora" }
        if minutes < 60 { return "da \(minutes / 5 * 5) min" }
        if minutes < 120 { return "da 1 ora" }
        return "da \(minutes / 60) ore"
    }

    /// The mood of the moment (personaggi.js reactionOf, FACE and THING): asleep
    /// from 22 to 6 on the phone's clock, else their Come stai (its face and
    /// what they hold, D8 of 27/11/2026), else happy; not feeling well never
    /// falls asleep. UsCharacterShapes.draw turns a Come stai key into its
    /// face and thing. And when it next changes.
    static func face(_ snapshot: [String: Any]?, me: Bool, now: Date, calendar: Calendar = .current) -> (face: String, next: Date?) {
        let hour = calendar.component(.hour, from: now)
        let today = calendar.startOfDay(for: now)
        let six = calendar.date(byAdding: .hour, value: 6, to: today) ?? now
        let ten = calendar.date(byAdding: .hour, value: 22, to: today) ?? now
        let edge = hour >= 22 ? (calendar.date(byAdding: .day, value: 1, to: six) ?? now) : hour < 6 ? six : ten
        let person = statusPerson(snapshot, me: me, now: now)
        let next = person.shown ? [edge, person.nextChange].compactMap { $0 }.min() : edge
        if hour >= 22 || hour < 6 { return (person.shown && person.key == "malato" ? "malato" : "dorme", next) }
        guard person.shown else { return ("felice", edge) }
        return (person.key, next)
    }

    // MARK: Lasciato per te

    struct Message: Equatable {
        var empty = true
        var text = ""
        /// "la scopri solo dentro US".
        var hint = ""
        /// "10 min fa"; empty when it would be older than a week.
        var when = ""
        var destination = "message"
        var nextChange: Date?
    }

    /// The envelope still closed for me: only its kind and how long ago (founder, 31/10/2026).
    static func message(_ snapshot: [String: Any]?, now: Date) -> Message {
        var out = Message()
        guard let snapshot = snapshot else {
            out.text = "Apri US per collegarlo"
            return out
        }
        let left = UsWidgetContract.object(snapshot["left"])
        let kind = UsWidgetContract.string(left["kind"])
        guard !kind.isEmpty, let at = UsWidgetContract.instant(UsWidgetContract.string(left["at"])) else {
            out.text = "Il prossimo Lasciato per te arriverà qui"
            return out
        }
        out.empty = false
        let noun = leftNoun(kind)
        out.text = "Ti ha lasciato " + noun
        out.hint = (noun.hasPrefix("una ") ? "la" : "lo") + " scopri solo dentro US"
        out.destination = "message/left"
        out.when = bubbleAgo(at, now: now)
        if !out.when.isEmpty { out.nextChange = bubbleNextChange(at, now: now) }
        return out
    }

    static func leftNoun(_ kind: String) -> String {
        switch kind {
        case "photo": return "una foto"
        case "audio": return "un vocale"
        case "video": return "un video"
        case "music": return "una canzone"
        default: return "un messaggio"
        }
    }

    // MARK: Ricordi

    struct Memories: Equatable {
        var shown = false
        /// "Un anno fa" on the very day, "I più recenti"; "" once that day is over.
        var pill = ""
        /// The place or the caption; the day when there is neither.
        var title = ""
        /// "12 ottobre · 8 foto".
        var line = ""
        var nextChange: Date?
    }

    static func memories(_ snapshot: [String: Any]?, now: Date) -> Memories {
        var out = Memories()
        let input = UsWidgetContract.object(snapshot?["memories"])
        let date = UsWidgetContract.civilDate(UsWidgetContract.string(input["date"]))
        guard UsWidgetContract.string(input["state"]) == "ready", !date.isEmpty else { return out }
        out.shown = true
        let label = UsWidgetContract.string(input["label"])
        if UsWidgetContract.bool(input["anniversary"]) {
            let today = UsWidgetContract.string(input["day"]) == romeToday(now)
            out.pill = today ? label : ""
            if today { out.nextChange = nextRomeMidnight(now) }
        } else {
            out.pill = label
        }
        let day = italianDay(date)
        let title = UsWidgetContract.string(input["title"]).trimmingCharacters(in: .whitespaces)
        let count = UsWidgetContract.int(input["count"], 0)
        let photos = count <= 0 ? "" : "\(count) foto"
        out.title = title.isEmpty ? day : title
        out.line = title.isEmpty ? photos : photos.isEmpty ? day : day + " · " + photos
        return out
    }

    // MARK: Lavagna

    struct Lavagna: Equatable {
        var shown = false
        /// me, partner or "".
        var by = ""
        /// "Bea · 5 min fa".
        var line = ""
        var nextChange: Date?
    }

    static func lavagna(_ snapshot: [String: Any]?, now: Date) -> Lavagna {
        var out = Lavagna()
        let input = UsWidgetContract.object(snapshot?["lavagna"])
        guard snapshot != nil, UsWidgetContract.string(input["state"]) == "ready" else { return out }
        out.shown = true
        out.by = UsWidgetContract.string(input["by"])
        let partner = partnerName(snapshot)
        let who = out.by == "me" ? "Tu" : out.by == "partner" ? (partner.isEmpty ? "La tua persona" : partner) : ""
        let at = UsWidgetContract.instant(UsWidgetContract.string(input["at"]))
        let when = bubbleAgo(at, now: now)
        out.line = who.isEmpty ? when : when.isEmpty ? who : who + " · " + when
        if !when.isEmpty, let at = at { out.nextChange = bubbleNextChange(at, now: now) }
        return out
    }

    // MARK: Post-it

    struct Note: Equatable {
        var text = ""
        /// yellow, pink, blue, green.
        var color = "yellow"
        var by = ""
    }

    struct Postit: Equatable {
        var written = false
        var first = Note()
        var second: Note?
        var more = 0
    }

    static func postit(_ snapshot: [String: Any]?) -> Postit {
        var out = Postit()
        let input = UsWidgetContract.object(snapshot?["postit"])
        let text = UsWidgetContract.string(input["text"])
        out.written = UsWidgetContract.string(input["state"]) == "ready" && !text.isEmpty
        guard out.written else {
            out.first.text = snapshot == nil ? "Apri US per collegarlo" : "Scrivi il primo post-it"
            return out
        }
        out.first = Note(text: text, color: UsWidgetContract.string(input["color"], "yellow"), by: UsWidgetContract.string(input["by"]))
        out.more = UsWidgetContract.int(input["more"], 0)
        let second = UsWidgetContract.object(input["second"])
        let secondText = UsWidgetContract.string(second["text"])
        if !secondText.isEmpty {
            out.second = Note(text: secondText, color: UsWidgetContract.string(second["color"], "yellow"), by: UsWidgetContract.string(second["by"]))
        }
        return out
    }

    // MARK: I personaggi

    struct Person: Equatable {
        var shape = "palla"
        /// ARGB at night and on paper.
        var night: UInt32 = 0xFFFF_7C96
        var day: UInt32 = 0xFFE7_A1AB
        var head = ""
        var face = ""
    }

    /// me or partner from the snapshot; without a choice, the role's shape and rosa/lilla.
    static func person(_ snapshot: [String: Any]?, me: Bool) -> Person {
        let input = UsWidgetContract.object(UsWidgetContract.object(UsWidgetContract.object(snapshot?["couple"])["characters"])[me ? "me" : "partner"])
        func color(_ hex: String, _ fallback: UInt32) -> UInt32 {
            guard hex.count == 7, hex.hasPrefix("#"), let value = UInt32(hex.dropFirst(), radix: 16) else { return fallback }
            return 0xFF00_0000 | value
        }
        return Person(shape: UsCharacterShapes.shapeOr(UsWidgetContract.string(input["shape"]), partnerRole: !me),
                      night: color(UsWidgetContract.string(input["color"]), me ? 0xFFFF_7C96 : 0xFFA9_8BFF),
                      day: color(UsWidgetContract.string(input["day"]), me ? 0xFFE7_A1AB : 0xFFAB_9DDB),
                      head: UsWidgetContract.string(input["head"]),
                      face: UsWidgetContract.string(input["face"]))
    }
}
