import Foundation

/// The semantic widget snapshot written by the US WebView (iOS twin of
/// UsWidgetContract.java). It carries meaning (dates, names, states), never
/// rendered strings, URLs, media or secrets. Every field is re-validated here
/// so a malformed or hostile payload can only degrade a widget to its empty
/// state. Foundation only: shared by the plugin and the widget extension, and
/// checked with swiftc on the CI host (ios/Tests/CoreCheck).
enum UsWidgetContract {
    static let schemaVersion = 2

    static func validOwner(_ value: String?) -> Bool { matches(value, "^[a-f0-9]{64}$") }
    static func validMediaKey(_ value: String?) -> Bool { matches(value, "^[a-f0-9]{32}$") }

    /// A clean v2 snapshot, or nil when the payload is unusable.
    static func normalize(_ input: [String: Any]?) -> [String: Any]? {
        guard let input = input else { return nil }
        let version = int(input["schemaVersion"], 0)
        guard version == schemaVersion || version == 1 else { return nil }
        let ownerHash = string(input["ownerHash"])
        guard validOwner(ownerHash) else { return nil }

        let thinkIn = version == 1 ? object(object(input["modules"])["think"]) : object(input["think"])
        let think: [String: Any] = [
            "partnerName": text(string(thinkIn["partnerName"]), 40),
            "lastReceivedAt": instantText(string(thinkIn["lastReceivedAt"])),
            "lastSentAt": instantText(string(thinkIn["lastSentAt"])),
            // A reaction to the partner's thought answers it as well as a thought does.
            "lastAnsweredAt": instantText(string(thinkIn["lastAnsweredAt"])),
            "todayCount": max(0, min(999, int(thinkIn["todayCount"], 0))),
            "todayDate": civilDate(string(thinkIn["todayDate"]))
        ]

        let coupleIn = object(input["couple"])
        var names: [String] = []
        for raw in (coupleIn["names"] as? [Any]) ?? [] where names.count < 2 {
            let name = text(string(raw), 40)
            if !name.isEmpty { names.append(name) }
        }
        let frame = string(coupleIn["frame"])
        let distanceText = string(coupleIn["distanceText"])
        var batteryLevel = int(coupleIn["batteryLevel"], -1)
        var batteryAt = instantText(string(coupleIn["batteryAt"]))
        if batteryLevel < 0 || batteryLevel > 100 || batteryAt.isEmpty { batteryLevel = -1; batteryAt = "" }
        let colorsIn = object(coupleIn["colors"])
        let meColor = string(colorsIn["me"])
        let partnerColor = string(colorsIn["partner"])
        let couple: [String: Any] = [
            "names": names,
            "startedOn": civilDate(string(coupleIn["startedOn"])),
            "frame": matches(frame, "^[a-z0-9_]{1,24}$") ? frame : "",
            "distanceText": matches(distanceText, "^[0-9., ]{1,16} ?(km|m|mi|ft)$") ? distanceText : "",
            "distanceState": string(coupleIn["distanceState"]) == "stale" ? "stale" : "ready",
            "distanceNear": bool(coupleIn["distanceNear"]),
            "distanceAt": instantText(string(coupleIn["distanceAt"])),
            "colors": [
                "me": matches(meColor, "^#[0-9a-fA-F]{6}$") ? meColor.lowercased() : "",
                "partner": matches(partnerColor, "^#[0-9a-fA-F]{6}$") ? partnerColor.lowercased() : ""
            ],
            // Widget del redesign (26/11/2026): each person's character, as the app draws it.
            "characters": [
                "me": character(object(object(coupleIn["characters"])["me"])),
                "partner": character(object(object(coupleIn["characters"])["partner"]))
            ],
            "batteryLevel": batteryLevel,
            "batteryCharging": batteryLevel >= 0 && bool(coupleIn["batteryCharging"]),
            "batteryAt": batteryAt
        ]

        let countdownIn = object(input["countdown"])
        var kind = string(countdownIn["kind"])
        var target = string(countdownIn["target"])
        if kind == "together" || kind == "days" { target = civilDate(target) }
        else if kind == "clock" { target = instantText(target) }
        else { kind = ""; target = "" }
        var style = string(countdownIn["style"])
        if !matches(style, "^(editorial|signal|glass|aurora|orbit|chrome)$") { style = "editorial" }
        let active = bool(countdownIn["active"]) && !kind.isEmpty && !target.isEmpty
        let countdown: [String: Any] = [
            "active": active,
            "kind": active ? kind : "",
            "title": active ? text(string(countdownIn["title"]), 60) : "",
            "target": active ? target : "",
            "style": style
        ]

        let photoIn = object(input["photo"])
        var photoState = string(photoIn["state"], "none")
        var key = string(photoIn["key"])
        if photoState != "ready" || !validMediaKey(key) { photoState = "none"; key = "" }
        let ready = photoState == "ready"
        var next: [[String: Any]] = []
        if ready {
            for raw in (photoIn["next"] as? [Any]) ?? [] where next.count < 2 {
                let item = object(raw)
                let nextKey = string(item["key"])
                guard validMediaKey(nextKey) else { continue }
                next.append([
                    "key": nextKey,
                    "takenOn": civilDate(string(item["takenOn"])),
                    "label": text(string(item["label"]), 60)
                ])
            }
        }
        let photo: [String: Any] = [
            "state": photoState,
            "key": key,
            "takenOn": ready ? civilDate(string(photoIn["takenOn"])) : "",
            "label": ready ? text(string(photoIn["label"]), 60) : "",
            "hour": ready ? instantText(string(photoIn["hour"])) : "",
            "next": next
        ]

        // La domanda di oggi: the day, the shared question (never an answer), whose turn.
        let dailyIn = object(input["daily"])
        var dailyDate = civilDate(string(dailyIn["date"]))
        var dailyState = string(dailyIn["state"])
        var question = text(string(dailyIn["question"]), 240)
        if !matches(dailyState, "^(todo|your_turn|waiting|ready)$") || dailyDate.isEmpty || question.isEmpty {
            dailyState = "none"; dailyDate = ""; question = ""
        }
        let daily: [String: Any] = ["date": dailyDate, "question": question, "state": dailyState]

        // Lasciato per te: kind and time only, never its words, photo or link.
        let leftIn = object(input["left"])
        var leftKind = string(leftIn["kind"])
        var leftAt = instantText(string(leftIn["at"]))
        if !matches(leftKind, "^(text|photo|audio|video|music)$") || leftAt.isEmpty { leftKind = ""; leftAt = "" }
        let left: [String: Any] = ["kind": leftKind, "at": leftAt]

        // Ricordi a pila: which memory the stack shows (the pictures are separate files).
        let memoriesIn = object(input["memories"])
        let memoriesDate = civilDate(string(memoriesIn["date"]))
        let memoriesReady = string(memoriesIn["state"]) == "ready" && !memoriesDate.isEmpty
        let memories: [String: Any] = [
            "state": memoriesReady ? "ready" : "none",
            "label": memoriesReady ? text(string(memoriesIn["label"]), 24) : "",
            "anniversary": memoriesReady && bool(memoriesIn["anniversary"]),
            "day": memoriesReady ? civilDate(string(memoriesIn["day"])) : "",
            "date": memoriesReady ? memoriesDate : "",
            "title": memoriesReady ? text(string(memoriesIn["title"]), 60) : "",
            "count": memoriesReady ? max(0, min(9999, int(memoriesIn["count"], 0))) : 0,
            "stack": memoriesReady ? max(1, min(3, int(memoriesIn["stack"], 1))) : 0
        ]

        // Lavagna: drawn or not, who drew last (me or partner) and when.
        let lavagnaIn = object(input["lavagna"])
        var lavagnaState = string(lavagnaIn["state"])
        if lavagnaState != "ready" && lavagnaState != "empty" { lavagnaState = "none" }
        let drawn = lavagnaState == "ready"
        let lavagnaBy = string(lavagnaIn["by"])
        let lavagna: [String: Any] = [
            "state": lavagnaState,
            "by": drawn && (lavagnaBy == "me" || lavagnaBy == "partner") ? lavagnaBy : "",
            "at": drawn ? instantText(string(lavagnaIn["at"])) : ""
        ]

        // Post-it: the newest post-it, its paper, who wrote it and how many others.
        let postitIn = object(input["postit"])
        let postitText = text(string(postitIn["text"]), 120)
        let written = string(postitIn["state"]) == "ready" && !postitText.isEmpty
        let paper = string(postitIn["color"])
        let postitBy = string(postitIn["by"])
        // The one after it, for the medium widget (widget del redesign, 26/11/2026).
        let secondIn = object(postitIn["second"])
        let secondText = written ? text(string(secondIn["text"]), 120) : ""
        let secondPaper = string(secondIn["color"])
        let secondBy = string(secondIn["by"])
        let postit: [String: Any] = [
            "state": written ? "ready" : "none",
            "text": written ? postitText : "",
            "color": written ? (matches(paper, "^(yellow|pink|blue|green)$") ? paper : "yellow") : "",
            "by": written && (postitBy == "me" || postitBy == "partner") ? postitBy : "",
            "more": written ? max(0, min(99, int(postitIn["more"], 0))) : 0,
            "at": written ? instantText(string(postitIn["at"])) : "",
            "second": [
                "text": secondText,
                "color": secondText.isEmpty ? "" : (matches(secondPaper, "^(yellow|pink|blue|green)$") ? secondPaper : "yellow"),
                "by": !secondText.isEmpty && (secondBy == "me" || secondBy == "partner") ? secondBy : ""
            ]
        ]

        let statusIn = object(input["status"])
        return [
            "schemaVersion": schemaVersion,
            "ownerHash": ownerHash,
            "updatedAt": instantText(string(input["updatedAt"])),
            "think": think,
            "couple": couple,
            "countdown": countdown,
            "photo": photo,
            "daily": daily,
            "left": left,
            "memories": memories,
            "lavagna": lavagna,
            "postit": postit,
            "status": [
                "me": statusPerson(object(statusIn["me"])),
                "partner": statusPerson(object(statusIn["partner"]))
            ]
        ]
    }

    /// One character (personaggi.js): an unknown shape, head, face or colour is left empty.
    static func character(_ input: [String: Any]) -> [String: Any] {
        let shape = string(input["shape"])
        let head = string(input["head"])
        let face = string(input["face"])
        let color = string(input["color"])
        let day = string(input["day"])
        return [
            "shape": matches(shape, "^(palla|quadrato|triangolo|goccia|nuvola)$") ? shape : "",
            "head": matches(head, "^(cappello|fiocco|cuffie|corona|coroncina|festa|cento)$") ? head : "",
            "face": matches(face, "^(occhiali|sole|sciarpina|gala|macchinetta)$") ? face : "",
            "color": matches(color, "^#[0-9a-fA-F]{6}$") ? color.lowercased() : "",
            "day": matches(day, "^#[0-9a-fA-F]{6}$") ? day.lowercased() : ""
        ]
    }

    /// Come stai: one of the twelve keys, the words' form and the server's times. Never free text.
    static func statusPerson(_ input: [String: Any]) -> [String: Any] {
        let status = string(input["status"])
        let at = instantText(string(input["at"]))
        let until = instantText(string(input["until"]))
        let shown = matches(status, "^(innamorato|felice|stanco|giu|nervoso|malato|festa|lavoro|studio|palestra|viaggio|tavola)$")
            && !at.isEmpty && !until.isEmpty
        let form = string(input["form"])
        return [
            "status": shown ? status : "",
            "form": form == "m" || form == "f" ? form : "",
            "at": shown ? at : "",
            "until": shown ? until : ""
        ]
    }

    // MARK: - Field helpers (lenient like org.json's opt*)

    static func object(_ value: Any?) -> [String: Any] { (value as? [String: Any]) ?? [:] }

    static func string(_ value: Any?, _ fallback: String = "") -> String {
        if let text = value as? String { return text }
        if let number = value as? NSNumber, !isBool(number) { return number.stringValue }
        return fallback
    }

    static func int(_ value: Any?, _ fallback: Int) -> Int {
        if let number = value as? NSNumber, !isBool(number) {
            let double = number.doubleValue
            return double.isFinite && abs(double) < 1e9 ? Int(double) : fallback
        }
        if let text = value as? String, let parsed = Int(text.trimmingCharacters(in: .whitespaces)) { return parsed }
        return fallback
    }

    static func bool(_ value: Any?) -> Bool {
        // Only a real boolean (or "true"): a number 1 is not true, like org.json.
        if let number = value as? NSNumber { return isBool(number) && number.boolValue }
        if let text = value as? String { return text.lowercased() == "true" }
        return false
    }

    private static func isBool(_ number: NSNumber) -> Bool {
        CFGetTypeID(number) == CFBooleanGetTypeID()
    }

    static func text(_ value: String, _ maxLength: Int) -> String {
        let scalars = value.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined()
        let clean = scalars.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.count <= maxLength ? clean : String(clean.prefix(maxLength))
    }

    static func civilDate(_ value: String) -> String {
        guard matches(value, "^\\d{4}-\\d{2}-\\d{2}$") else { return "" }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return "" }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard components.isValidDate(in: calendar) else { return "" }
        return value
    }

    static func instantText(_ value: String) -> String {
        guard value.count <= 40, let date = instant(value) else { return "" }
        return format(date)
    }

    /// ISO instants with "Z" or a numeric offset (Postgres timestamptz), with or without fractions.
    static func instant(_ value: String?) -> Date? {
        guard let value = value, !value.isEmpty, value.count <= 40 else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }

    static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    static func matches(_ value: String?, _ pattern: String) -> Bool {
        guard let value = value, !value.isEmpty else { return false }
        return value.range(of: pattern, options: .regularExpression) != nil
    }
}
