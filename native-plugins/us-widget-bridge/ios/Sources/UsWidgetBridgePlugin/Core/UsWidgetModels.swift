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
        var nextChange: Date?
    }

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
        let sending = status == "sending" && since < sendingStale
        if let at = actionAt, sending || (status == "sent" && since < sentVisible) {
            out.done = true
            out.unanswered = false
            out.line = UsWidgetContract.bool(action?["reply"]) ? "Ricambiato" : "Inviato"
            out.when = "adesso"
            out.busy = sending || since < sendCooldown
            out.nextChange = at.addingTimeInterval(sending ? sendingStale : out.busy ? sendCooldown : sentVisible)
            return out
        }
        if let at = actionAt, (status == "failed" || (status == "sending" && since >= sendingStale)) && since < failedVisible {
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
            out.line = who + " ti ha pensato"
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
            if ["failed", "sending", "rate_limited"].contains(status),
               let at = UsWidgetContract.instant(UsWidgetContract.string(previous["at"])),
               now.timeIntervalSince(at) < retrySameAction,
               let uuid = UUID(uuidString: id), uuid.uuidString.lowercased() == id { return id }
        }
        return make()
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
