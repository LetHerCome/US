import Foundation
import WidgetKit

/// Widget signals on iPhone (founder, 27/11/2026: «fai fix per ios»). When the other person changes
/// colour, shape or outfit, or leaves the couple, while US is closed, the server sends an APNs
/// background push (native-push-transport.mjs apnsSignalRequest):
/// `{ aps: { content-available: 1 }, us: { v: 3, owner, widget: { s: "look" | "clear", ... } } }`.
/// AppDelegate hands it here. Only for the account whose widgets these are (owner hash), never a
/// banner, nothing but the look in the packet: no name, photo or text.
///
///  - "look": shape, head, face and two colours, validated by UsWidgetContract.character and
///    written as the partner's character in this account's snapshot;
///  - "status" (Come stai che conta, 27/11/2026, D13): their Come stai, one of the twelve keys,
///    the words' form and the server's two instants, validated by UsWidgetContract.statusPerson;
///  - "clear": the same cleanup as logout (credential, snapshot, photos, portraits).
///
/// iOS delivers background pushes when it decides, and never to an app the person closed by hand:
/// the open app still follows over Realtime and when it comes back to the foreground.
public enum UsWidgetSignals {
    static let version = 3

    /// True when the widgets changed and were redrawn.
    @discardableResult
    public static func apply(_ userInfo: [AnyHashable: Any]) -> Bool {
        guard let us = userInfo["us"] as? [String: Any],
              (us["v"] as? NSNumber)?.intValue == version,
              let owner = us["owner"] as? String, UsWidgetContract.validOwner(owner),
              let widget = us["widget"] as? [String: Any],
              let store = UsWidgetStore.shared(), store.owner() == owner else { return false }
        let changed: Bool
        switch widget["s"] as? String {
        case "clear":
            UsWidgetCredentials().clear()
            store.clearAll()
            changed = true
        case "look":
            changed = store.writePartnerLook(ownerHash: owner, look: widget)
        case "status":
            changed = store.writePartnerStatus(ownerHash: owner, status: widget)
        default:
            return false
        }
        if changed { WidgetCenter.shared.reloadAllTimelines() }
        return changed
    }
}
