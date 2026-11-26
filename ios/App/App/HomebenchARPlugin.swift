import UIKit
import AVFoundation
import ARKit
import RoomPlan
import Capacitor

/// Native camera features exposed to the website as `HomebenchAR`.
///
/// JS usage (see src/lib/native-ar.ts):
///   HomebenchAR.getSupport()                   -> { measure, roomScan, lidar }
///   HomebenchAR.scanRoom({ mode })             -> RoomDimensions.asJSObject() (mode: "room" | "closet")
///   HomebenchAR.measure({ instructions })      -> { measurements: [{ meters, feet, label }] }
///   HomebenchAR.getAppLock()                   -> { enabled, available, biometry }
///   HomebenchAR.setAppLock({ enabled })        -> same as getAppLock
/// scanRoom and measure reject with code "CANCELLED" when the user backs out.
@objc(HomebenchARPlugin)
public class HomebenchARPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HomebenchARPlugin"
    public let jsName = "HomebenchAR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSupport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanRoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "measure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppLock", returnType: CAPPluginReturnPromise)
    ]

    @objc func getSupport(_ call: CAPPluginCall) {
        call.resolve([
            "measure": ARWorldTrackingConfiguration.isSupported,
            "roomScan": RoomCaptureSession.isSupported,
            "lidar": ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        ])
    }

    @objc func scanRoom(_ call: CAPPluginCall) {
        guard RoomCaptureSession.isSupported else {
            call.reject("Room scanning needs an iPhone with LiDAR (Pro models).", "UNSUPPORTED")
            return
        }
        let mode: RoomScanViewController.Mode = call.getString("mode") == "closet" ? .closet : .room
        withCameraAccess(call) { [weak self] in
            let scanner = RoomScanViewController(mode: mode)
            scanner.onFinish = { result in
                switch result {
                case .success(let dimensions):
                    call.resolve(dimensions.asJSObject())
                case .cancelled:
                    call.reject("Scan cancelled", "CANCELLED")
                case .failure(let error):
                    call.reject("Room scan failed: \(error.localizedDescription)", "SCAN_FAILED", error)
                }
            }
            self?.present(scanner, for: call)
        }
    }

    @objc func measure(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.reject("This device doesn't support AR measuring.", "UNSUPPORTED")
            return
        }
        let instructions = call.getString("instructions")
        withCameraAccess(call) { [weak self] in
            let measurer = MeasureViewController()
            measurer.instructions = instructions
            measurer.onFinish = { meters in
                guard let meters = meters else {
                    call.reject("Measuring cancelled", "CANCELLED")
                    return
                }
                let items: [[String: Any]] = meters.map { value in
                    [
                        "meters": Double(value),
                        "feet": Double(value) * MeasureFormat.feetPerMeter,
                        "label": MeasureFormat.feetAndInches(meters: value)
                    ]
                }
                call.resolve(["measurements": items])
            }
            self?.present(measurer, for: call)
        }
    }

    @objc func getAppLock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(Self.appLockState())
        }
    }

    @objc func setAppLock(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else {
            call.reject("Missing 'enabled'", "BAD_ARGUMENT")
            return
        }
        DispatchQueue.main.async {
            AppLock.shared.isEnabled = enabled
            call.resolve(Self.appLockState())
        }
    }

    private static func appLockState() -> [String: Any] {
        [
            "enabled": AppLock.shared.isEnabled,
            "available": AppLock.shared.isAvailable,
            "biometry": AppLock.shared.biometryName
        ]
    }

    // MARK: - Helpers

    private func present(_ controller: UIViewController, for call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let host = self?.bridge?.viewController else {
                call.reject("No view to present from", "NO_VIEW")
                return
            }
            controller.modalPresentationStyle = .fullScreen
            host.present(controller, animated: true)
        }
    }

    /// Runs `body` on the main thread once camera access is granted, or rejects the call.
    private func withCameraAccess(_ call: CAPPluginCall, _ body: @escaping () -> Void) {
        let denied = {
            call.reject(
                "Camera access is off for Homebench. Turn it on in Settings > Homebench > Camera.",
                "CAMERA_DENIED"
            )
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            DispatchQueue.main.async(execute: body)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted {
                    DispatchQueue.main.async(execute: body)
                } else {
                    denied()
                }
            }
        default:
            denied()
        }
    }
}

enum MeasureFormat {
    static let feetPerMeter = 3.280839895

    /// 3.15 m -> 10' 4"
    static func feetAndInches(meters: Float) -> String {
        let totalInches = Int((Double(meters) * feetPerMeter * 12).rounded())
        let feet = totalInches / 12
        let inches = totalInches % 12
        if feet == 0 { return "\(inches)\"" }
        return "\(feet)' \(inches)\""
    }
}
