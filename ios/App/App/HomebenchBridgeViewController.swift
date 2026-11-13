import UIKit
import Capacitor

/// The app's root view controller. It is Capacitor's standard web view host,
/// plus registration of the app's own native plugins.
class HomebenchBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HomebenchARPlugin())
    }
}
