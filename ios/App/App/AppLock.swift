import UIKit
import LocalAuthentication

/// Face ID (or Touch ID / passcode) lock for the whole app.
///
/// The app locks when it launches and when it returns after more than
/// `graceSeconds` in the background. While it's in the background, a cover
/// hides the screen from the app switcher. Users can turn the lock off from
/// the Account page (HomebenchAR.setAppLock).
final class AppLock {
    static let shared = AppLock()

    private let enabledKey = "homebench.appLock.enabled"
    private let graceSeconds: TimeInterval = 120

    private var lockWindow: UIWindow?
    private weak var mainWindow: UIWindow?
    private var backgroundedAt: Date?
    private var needsUnlock = false
    private var isAuthenticating = false
    /// After a cancelled or failed prompt, wait for the Unlock button instead of
    /// re-prompting every time the app becomes active (the prompt itself makes
    /// the app inactive, which would loop).
    private var autoPromptSuppressed = false

    private init() {}

    // MARK: - Settings

    var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }
        set {
            UserDefaults.standard.set(newValue, forKey: enabledKey)
            if !newValue { unlock() }
        }
    }

    /// False when the device has no passcode set, so there's nothing to unlock with.
    var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// "faceID", "touchID", "opticID" or "passcode".
    var biometryName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "faceID"
        case .touchID: return "touchID"
        case .opticID: return "opticID"
        default: return "passcode"
        }
    }

    private var shouldLock: Bool { isEnabled && isAvailable }

    // MARK: - Scene lifecycle (called from SceneDelegate)

    func attach(to window: UIWindow) {
        mainWindow = window
        if shouldLock { lock() }
    }

    func sceneDidEnterBackground() {
        backgroundedAt = Date()
        autoPromptSuppressed = false
        if shouldLock { showCover() }
    }

    func sceneWillEnterForeground() {
        defer { backgroundedAt = nil }
        guard shouldLock else {
            unlock()
            return
        }
        if needsUnlock { return }
        if let since = backgroundedAt, Date().timeIntervalSince(since) < graceSeconds {
            hideCover()
        } else {
            needsUnlock = true
        }
    }

    func sceneDidBecomeActive() {
        if needsUnlock && !autoPromptSuppressed {
            authenticate()
        }
    }

    // MARK: - Locking

    private func lock() {
        needsUnlock = true
        showCover()
    }

    fileprivate func authenticate() {
        guard needsUnlock, !isAuthenticating else { return }
        isAuthenticating = true
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock Homebench") { [weak self] success, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isAuthenticating = false
                if success {
                    self.unlock()
                } else {
                    self.autoPromptSuppressed = true
                }
            }
        }
    }

    private func unlock() {
        needsUnlock = false
        autoPromptSuppressed = false
        hideCover()
    }

    private func showCover() {
        if lockWindow == nil, let scene = mainWindow?.windowScene {
            let window = UIWindow(windowScene: scene)
            window.windowLevel = .alert + 1
            window.rootViewController = LockViewController()
            lockWindow = window
        }
        lockWindow?.isHidden = false
    }

    private func hideCover() {
        lockWindow?.isHidden = true
        mainWindow?.makeKey()
    }
}

/// The screen shown while the app is locked.
private final class LockViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1)  // #f4efe6
        let ink = UIColor(red: 0.12, green: 0.11, blue: 0.09, alpha: 1)

        let symbolName = AppLock.shared.biometryName == "touchID" ? "touchid" : "faceid"
        let icon = UIImageView(image: UIImage(systemName: symbolName, withConfiguration: UIImage.SymbolConfiguration(pointSize: 44, weight: .regular)))
        icon.tintColor = ink

        let title = UILabel()
        title.text = "Homebench is locked"
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.textColor = ink

        var config = UIButton.Configuration.filled()
        config.title = "Unlock"
        config.cornerStyle = .capsule
        config.baseBackgroundColor = ink
        config.baseForegroundColor = view.backgroundColor
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 28, bottom: 12, trailing: 28)
        let button = UIButton(configuration: config)
        button.addTarget(self, action: #selector(unlockTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [icon, title, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 18
        stack.setCustomSpacing(28, after: title)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    @objc private func unlockTapped() {
        AppLock.shared.authenticate()
    }
}
