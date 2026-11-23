// Host-side checks for the widget core shared by the plugin and the widget
// extension (compiled with swiftc on the macOS CI runner together with the
// Core/*.swift files; no simulator needed). Same cases as the Android JVM tests.
import Foundation

var failures = 0
func check(_ condition: Bool, _ label: String) {
    if condition { print("ok - \(label)") } else { failures += 1; print("not ok - \(label)") }
}

let owner = String(repeating: "a", count: 64)
let other = String(repeating: "b", count: 64)
let key1 = String(repeating: "1", count: 32)
let key2 = String(repeating: "2", count: 32)
let key3 = String(repeating: "3", count: 32)
func date(_ text: String) -> Date { UsWidgetContract.instant(text)! }

// MARK: Contract

check(UsWidgetContract.normalize(nil) == nil, "nil payload refused")
check(UsWidgetContract.normalize(["schemaVersion": 3, "ownerHash": owner]) == nil, "unknown schema refused")
check(UsWidgetContract.normalize(["schemaVersion": 2, "ownerHash": "ABC"]) == nil, "bad owner refused")
let hostile: [String: Any] = [
    "schemaVersion": 2,
    "ownerHash": owner,
    "think": ["partnerName": "Bea\u{0007}\n  ", "lastReceivedAt": "2026-11-14T09:00:00+01:00", "todayCount": 5000] as [String: Any],
    "couple": ["names": ["Francesco", "Bea", "Terzo"], "startedOn": "2026-02-30", "distanceText": "12 km",
               "batteryLevel": 140, "batteryAt": "2026-11-14T08:00:00Z", "colors": ["me": "#FF7C96", "partner": "red"],
               "distanceNear": 1] as [String: Any],
    "photo": ["state": "ready", "key": key1, "hour": "2026-11-14T08:00:00Z", "label": "Lisbona",
              "next": [["key": key2], ["key": "https://evil"], ["key": key3], ["key": key1]]] as [String: Any],
    "daily": ["date": "2026-11-14", "state": "your_turn", "question": "Una domanda?"],
    "left": ["kind": "photo", "at": "2026-11-14T08:00:00Z", "text": "segreto"],
    "postit": ["state": "ready", "text": "cena", "color": "purple", "by": "me"],
    "status": ["me": ["status": "felice", "at": "2026-11-14T08:00:00Z", "until": "2026-11-14T20:00:00Z", "form": "x"]]
]
let clean = UsWidgetContract.normalize(hostile)!
let think = clean["think"] as! [String: Any]
let couple = clean["couple"] as! [String: Any]
let photo = clean["photo"] as! [String: Any]
check(think["partnerName"] as? String == "Bea", "control characters stripped and trimmed")
check(think["todayCount"] as? Int == 999, "count clamped")
check(think["lastReceivedAt"] as? String == "2026-11-14T08:00:00.000Z", "offset instant normalised to UTC")
check((couple["names"] as? [String]) == ["Francesco", "Bea"], "two names at most")
check(couple["startedOn"] as? String == "", "impossible date refused")
check(couple["batteryLevel"] as? Int == -1 && couple["batteryAt"] as? String == "", "battery out of range dropped")
check((couple["colors"] as? [String: String])?["me"] == "#ff7c96", "colour lowercased")
check((couple["colors"] as? [String: String])?["partner"] == "", "bad colour dropped")
check(couple["distanceNear"] as? Bool == false, "a number is not a boolean")
check(((photo["next"] as? [[String: Any]]) ?? []).count == 2, "two next photos at most, bad keys skipped")
check((clean["left"] as? [String: Any])?["text"] == nil, "Lasciato per te never keeps words")
check((clean["postit"] as? [String: Any])?["color"] as? String == "yellow", "unknown paper falls back to yellow")
check(((clean["status"] as? [String: Any])?["me"] as? [String: Any])?["form"] as? String == "", "unknown form dropped")
check(((clean["status"] as? [String: Any])?["partner"] as? [String: Any])?["status"] as? String == "", "missing partner status empty")
check(UsWidgetContract.normalize(["schemaVersion": 1, "ownerHash": owner, "modules": ["think": ["partnerName": "Bea"]]]).flatMap { ($0["think"] as? [String: Any])?["partnerName"] as? String } == "Bea", "v1 think still read")
check(UsWidgetContract.instantText(String(repeating: "9", count: 41)) == "", "overlong instant refused")
check(UsWidgetContract.text(String(repeating: "x", count: 50), 40).count == 40, "text cut")

// MARK: Endpoints

check(UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/") == UsWidgetEndpoints.production, "production accepted")
check(UsWidgetEndpoints.functionsBase("http://iiakdfsxpywdkxravqjh.supabase.co/functions/v1") == "", "http refused")
check(UsWidgetEndpoints.functionsBase("https://evil.supabase.co/functions/v1") == "", "other project refused")
check(UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co.evil.com/functions/v1") == "", "look-alike host refused")
check(UsWidgetEndpoints.functionsBase("https://u:p@iiakdfsxpywdkxravqjh.supabase.co/functions/v1") == "", "user info refused")
check(UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co:444/functions/v1") == "", "port refused")
check(UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1?x=1") == "", "query refused")
check(UsWidgetEndpoints.thinkSend("") == UsWidgetEndpoints.production + "/widget-think-send", "old credential goes to production")

// MARK: Credential policy

let token = String(repeating: "T", count: 43)
check(UsWidgetCredentialPolicy.payload(ownerHash: owner, token: token, expiresAt: "", functionsUrl: "") != nil, "valid credential")
check(UsWidgetCredentialPolicy.payload(ownerHash: owner, token: "short", expiresAt: "", functionsUrl: "") == nil, "bad token refused")
check(UsWidgetCredentialPolicy.payload(ownerHash: owner, token: token, expiresAt: "", functionsUrl: "https://evil.example/functions/v1") == nil, "foreign address refused")
let now = date("2026-11-14T10:00:00Z")
let fresh = UsWidgetCredentialPolicy.payload(ownerHash: owner, token: token, expiresAt: "2027-02-14T10:00:00Z", functionsUrl: "")
let soon = UsWidgetCredentialPolicy.payload(ownerHash: owner, token: token, expiresAt: "2026-12-01T10:00:00Z", functionsUrl: "")
check(UsWidgetCredentialPolicy.status(fresh, ownerHash: owner, now: now) == "ready", "credential ready")
check(UsWidgetCredentialPolicy.status(soon, ownerHash: owner, now: now) == "renew", "expiring within 30 days renews")
check(UsWidgetCredentialPolicy.status(fresh, ownerHash: other, now: now) == "missing", "other account: missing")
check(UsWidgetCredentialPolicy.validGroup("KW79XL4LBZ.app.uscouple.shared"), "team keychain group")
check(!UsWidgetCredentialPolicy.validGroup(".app.uscouple.shared"), "unsigned build: no group")

// MARK: Models

check(UsWidgetModels.daysTogether("2026-04-21", now: date("2026-11-14T10:00:00Z")) == 207, "days together")
check(UsWidgetModels.daysTogether("2026-11-14", now: date("2026-11-13T23:30:00Z")) == 0, "Rome midnight already passed")
check(UsWidgetModels.daysTogether("2026-12-01", now: now) == -1, "future start unknown")
check(UsWidgetModels.daysUnit(1) == "giorno\ninsieme" && UsWidgetModels.daysUnit(2) == "giorni\ninsieme", "unit")
check(UsWidgetModels.romeToday(date("2026-11-14T23:30:00Z")) == "2026-11-15", "Rome day, not UTC")
check(UsWidgetModels.nextRomeMidnight(date("2026-11-14T10:00:00Z")) == date("2026-11-14T23:00:30Z"), "next Rome midnight + 30 s")

let photoSnapshot = UsWidgetContract.normalize(["schemaVersion": 2, "ownerHash": owner,
    "photo": ["state": "ready", "key": key1, "hour": "2026-11-14T08:00:00Z", "next": [["key": key2], ["key": key3]]] as [String: Any]])
check(UsWidgetModels.photoSlot(photoSnapshot, now: date("2026-11-14T08:30:00Z")).key == key1, "this hour's photo")
check(UsWidgetModels.photoSlot(photoSnapshot, now: date("2026-11-14T09:10:00Z")).key == key2, "next hour's photo")
check(UsWidgetModels.photoSlot(photoSnapshot, now: date("2026-11-14T15:00:00Z")).key == key3, "the last one stays")
check(UsWidgetModels.photoSlot(photoSnapshot, now: date("2026-11-14T08:30:00Z")).nextChange == date("2026-11-14T09:00:00Z"), "changes on the hour")
check(UsWidgetModels.photoTimeline(photoSnapshot, now: date("2026-11-14T08:30:00Z")).count == 4, "now, two photo hours, midnight")

let thinkSnapshot = UsWidgetContract.normalize(["schemaVersion": 2, "ownerHash": owner,
    "think": ["partnerName": "Bea", "lastReceivedAt": "2026-11-14T09:50:00Z", "lastSentAt": "2026-11-14T09:00:00Z"]])
var t = UsWidgetModels.think(nil, action: nil, hasCredential: true, now: now)
check(!t.canSend && t.line == "Apri US per collegarlo", "no snapshot: open US")
t = UsWidgetModels.think(thinkSnapshot, action: nil, hasCredential: false, now: now)
check(!t.canSend, "no credential: open US")
t = UsWidgetModels.think(thinkSnapshot, action: nil, hasCredential: true, now: now)
check(t.canSend && t.unanswered && t.line == "Bea ti ha pensato" && t.when == "10 min fa", "partner thought, unanswered")
let sending: [String: Any] = ["status": "sending", "at": "2026-11-14T09:59:59Z", "reply": true]
t = UsWidgetModels.think(thinkSnapshot, action: sending, hasCredential: true, now: now)
check(t.done && t.busy && t.line == "Ricambiato" && !t.unanswered, "sending: full heart at once")
let sent: [String: Any] = ["status": "sent", "at": "2026-11-14T09:59:30Z", "sentAt": "2026-11-14T09:59:30Z"]
t = UsWidgetModels.think(thinkSnapshot, action: sent, hasCredential: true, now: now)
check(t.done && !t.busy && t.line == "Inviato", "sent: full heart for a minute")
t = UsWidgetModels.think(thinkSnapshot, action: sent, hasCredential: true, now: date("2026-11-14T10:01:00Z"))
check(!t.done && !t.unanswered, "after a minute: empty heart, thought answered by the widget")
let failed: [String: Any] = ["status": "failed", "at": "2026-11-14T09:59:00Z", "actionId": "1b4e28ba-2fa1-11d2-883f-0016d3cca427"]
t = UsWidgetModels.think(thinkSnapshot, action: failed, hasCredential: true, now: now)
check(t.canSend && !t.done && t.line == "Non è partito, riprova", "failed: tap retries")
check(UsWidgetModels.actionId(previous: failed, now: now, make: { "new" }) == "1b4e28ba-2fa1-11d2-883f-0016d3cca427", "retry keeps the action id")
check(UsWidgetModels.actionId(previous: failed, now: date("2026-11-14T10:05:00Z"), make: { "new" }) == "new", "old failure: new id")
check(UsWidgetModels.actionId(previous: sent, now: now, make: { "new" }) == "new", "after a send: new id")
t = UsWidgetModels.think(thinkSnapshot, action: ["status": "unauthorized", "at": "2026-11-14T09:00:00Z"], hasCredential: true, now: now)
check(!t.canSend, "revoked credential: open US")

check(UsWidgetModels.bubbleAgo(date("2026-11-14T09:58:00Z"), now: now) == "proprio ora", "just now")
check(UsWidgetModels.bubbleAgo(date("2026-11-14T08:30:00Z"), now: now) == "1 ora fa", "an hour")
check(UsWidgetModels.bubbleAgo(date("2026-11-06T10:00:00Z"), now: now) == "", "older than a week: nothing")
check(UsWidgetModels.bubbleNextChange(date("2026-11-14T09:50:00Z"), now: now) == date("2026-11-14T10:05:00Z"), "5-minute steps")

// MARK: Store (a temporary folder in place of the App Group)

let folder = FileManager.default.temporaryDirectory.appendingPathComponent("us-widget-check-\(UUID().uuidString)")
let store = UsWidgetStore(directory: folder)
let jpeg = Data([0xFF, 0xD8]) + Data(repeating: 7, count: 100)
check(!store.write(snapshot: ["schemaVersion": 2, "ownerHash": owner]), "no account: snapshot refused")
check(store.activateAccount(owner), "account activated")
check(store.write(snapshot: ["schemaVersion": 2, "ownerHash": owner, "photo": ["state": "ready", "key": key1, "next": [["key": key2]]] as [String: Any]]), "snapshot written")
check(!store.write(snapshot: ["schemaVersion": 2, "ownerHash": other]), "other account's snapshot refused")
check(store.writePhoto(ownerHash: owner, key: key1, bytes: jpeg) && store.writePhoto(ownerHash: owner, key: key2, bytes: jpeg), "photos written")
check(!store.writePhoto(ownerHash: owner, key: key3, bytes: Data(repeating: 1, count: 100)), "not an image: refused")
check(store.photoKey() == key2 && store.readPhoto(key1) == jpeg, "photo cache")
check(store.write(snapshot: ["schemaVersion": 2, "ownerHash": owner, "photo": ["state": "ready", "key": key2]]), "next snapshot")
check(store.readPhoto(key1) == nil && store.readPhoto(key2) == jpeg, "photos the snapshot no longer names are pruned")
check(store.writePortrait(ownerHash: owner, slot: "partner", bytes: jpeg) && store.readPortrait("partner") == jpeg, "portrait")
check(!store.writePortrait(ownerHash: owner, slot: "../../x", bytes: jpeg), "unknown slot refused")
check(store.writeAction(status: "sending", actionId: "id", reply: true), "action written")
check(store.readAction()?["reply"] as? Bool == true, "reply kept")
check(store.writeAction(status: "sent", actionId: "id") && UsWidgetContract.bool(store.readAction()?["reply"]), "reply carried over")
let device = store.deviceId()
check(UUID(uuidString: device) != nil && store.deviceId() == device, "stable device id")
check(store.activateAccount(other), "another account")
check(store.readSnapshot() == nil && store.readPhoto(key2) == nil && store.readPortrait("partner") == nil && store.readAction() == nil, "account change wipes everything")
store.clearAll()
check(store.owner().isEmpty, "logout clears the owner")
try? FileManager.default.removeItem(at: folder)

check(UsWidgetShared.kind(fromWidgetKind: "us.widget.photo") == "photo", "WidgetKit kind maps back")
check(UsWidgetShared.kind(fromWidgetKind: "us.widget.days") == nil, "Giorni insieme is not ported")
check(UsWidgetShared.openURL("think").absoluteString == "us://widget/think", "links widgets.js reads")

if failures > 0 {
    print("\(failures) check(s) failed")
    exit(1)
}
print("all widget core checks passed")
