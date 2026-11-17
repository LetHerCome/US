import SwiftUI
import WidgetKit

/// The US widgets on iPhone (WidgetKit extension app.uscouple.widgets).
/// W1 (founder, 14/11/2026): Foto & Noi and Ti penso first, so the Scriptable
/// widget on the first tester's iPhone can be retired; the others follow in W2–W4.
@main
struct UsWidgetsBundle: WidgetBundle {
    var body: some Widget {
        UsPhotoWidget()
        UsThinkWidget()
    }
}
