import UIKit
import WebKit
import Capacitor

/// US root view controller. Keeps product logic in the shared web app and
/// only adds the iOS equivalents of what Android gets from the system:
/// a Back gesture routed into the same in-app history that Android Back uses.
class UsBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {

    /// Left-edge swipe = Android Back. It calls the same
    /// `window.UsNavigation.handleNativeBack()` the Android backButton
    /// listener calls (close the top layer, then step back through pages).
    /// Unlike Android it never exits the app when nothing is left to close.
    private lazy var backEdgeGesture: UIScreenEdgePanGestureRecognizer = {
        let gesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleBackEdgeGesture(_:)))
        gesture.edges = .left
        gesture.delegate = self
        return gesture
    }()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // `view` is the WKWebView itself (CAPBridgeViewController.loadView).
        webView?.isOpaque = false
        webView?.backgroundColor = UsAppConfiguration.launchBackground
        webView?.scrollView.backgroundColor = UsAppConfiguration.launchBackground
        // Swipe-to-go-back on WKWebView would also enable forward swipes and
        // replay history snapshots; the in-app history owns navigation instead.
        webView?.allowsBackForwardNavigationGestures = false
        view.addGestureRecognizer(backEdgeGesture)
    }

    @objc private func handleBackEdgeGesture(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended else { return }
        let translation = gesture.translation(in: view).x
        let velocity = gesture.velocity(in: view).x
        guard translation > UsAppConfiguration.backGestureMinimumTranslation
            || velocity > UsAppConfiguration.backGestureMinimumVelocity else { return }
        webView?.evaluateJavaScript(UsAppConfiguration.nativeBackScript, completionHandler: nil)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        return gestureRecognizer === backEdgeGesture
    }
}
