import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = HomebenchBridgeViewController()
        window?.makeKeyAndVisible()
        if let window = window {
            AppLock.shared.attach(to: window)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        AppLock.shared.sceneDidEnterBackground()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        AppLock.shared.sceneWillEnterForeground()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        AppLock.shared.sceneDidBecomeActive()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
