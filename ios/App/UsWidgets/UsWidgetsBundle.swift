import SwiftUI
import WidgetKit

/// The US widgets on iPhone (WidgetKit extension app.uscouple.widgets).
/// W1 (founder, 14/11/2026): Foto & Noi and Ti penso first. Widget del
/// redesign (26/11/2026, «tutte okay»): the same nine as Android, with their
/// lock-screen faces, and the «Ti penso» control of iOS 18.
@main
struct UsWidgetsBundle: WidgetBundle {
    var body: some Widget {
        UsPhotoWidget()
        UsThinkWidget()
        UsDailyWidget()
        UsStatusWidget()
        UsNoiWidget()
        UsMessageWidget()
        UsMemoriesWidget()
        UsLavagnaWidget()
        UsPostitWidget()
        if #available(iOS 18.0, *) {
            UsThinkControl()
        }
    }
}
