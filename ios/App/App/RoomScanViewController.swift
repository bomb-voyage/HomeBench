import UIKit
import RoomPlan
import simd

/// Room dimensions in feet, derived from a RoomPlan scan.
struct RoomDimensions {
    let lengthFt: Double
    let widthFt: Double
    let ceilingHeightFt: Double
    let wallCount: Int
    let doorCount: Int
    let windowCount: Int
    let openingCount: Int

    func asJSObject() -> [String: Any] {
        [
            "lengthFt": lengthFt,
            "widthFt": widthFt,
            "ceilingHeightFt": ceilingHeightFt,
            "wallCount": wallCount,
            "doorCount": doorCount,
            "windowCount": windowCount,
            "openingCount": openingCount
        ]
    }

    /// Length and width are the wall-to-wall extent of the room, measured along
    /// the direction of its longest wall (so a rotated room still reads correctly).
    /// For L-shaped rooms this is the bounding rectangle, matching the rooms
    /// table's length x width model.
    init?(room: CapturedRoom) {
        let walls = room.walls
        guard !walls.isEmpty else { return nil }

        // Wall endpoints on the floor plane (x, z), plus each wall's direction.
        var points: [SIMD2<Float>] = []
        var longestDirection = SIMD2<Float>(1, 0)
        var longestWidth: Float = 0
        var maxHeight: Float = 0

        for wall in walls {
            let t = wall.transform
            let center = SIMD2<Float>(t.columns.3.x, t.columns.3.z)
            var direction = SIMD2<Float>(t.columns.0.x, t.columns.0.z)
            let len = simd_length(direction)
            if len < 1e-4 { continue }
            direction /= len
            let halfWidth = wall.dimensions.x / 2
            points.append(center + direction * halfWidth)
            points.append(center - direction * halfWidth)
            if wall.dimensions.x > longestWidth {
                longestWidth = wall.dimensions.x
                longestDirection = direction
            }
            maxHeight = max(maxHeight, wall.dimensions.y)
        }
        guard points.count >= 4 else { return nil }

        // Rotate into the frame of the longest wall and take the extents.
        let axisA = longestDirection
        let axisB = SIMD2<Float>(-longestDirection.y, longestDirection.x)
        let projA = points.map { simd_dot($0, axisA) }
        let projB = points.map { simd_dot($0, axisB) }
        let extentA = (projA.max() ?? 0) - (projA.min() ?? 0)
        let extentB = (projB.max() ?? 0) - (projB.min() ?? 0)

        let ftPerM = MeasureFormat.feetPerMeter
        func feet(_ meters: Float) -> Double { (Double(meters) * ftPerM * 10).rounded() / 10 }

        lengthFt = feet(max(extentA, extentB))
        widthFt = feet(min(extentA, extentB))
        ceilingHeightFt = feet(maxHeight)
        wallCount = walls.count
        doorCount = room.doors.count
        windowCount = room.windows.count
        openingCount = room.openings.count
    }
}

enum RoomScanResult {
    case success(RoomDimensions)
    case cancelled
    case failure(Error)
}

private struct RoomScanError: LocalizedError {
    let errorDescription: String?
}

/// Full-screen RoomPlan scanner. Calls `onFinish` exactly once, then dismisses itself.
final class RoomScanViewController: UIViewController, RoomCaptureViewDelegate {
    var onFinish: ((RoomScanResult) -> Void)?

    private enum Phase { case scanning, processing, review }

    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var phase: Phase = .scanning
    private var finalRoom: CapturedRoom?
    private var finished = false

    private let cancelButton = UIButton(type: .system)
    private let doneButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        roomCaptureView = RoomCaptureView(frame: view.bounds)
        roomCaptureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        roomCaptureView.delegate = self
        view.addSubview(roomCaptureView)

        configure(cancelButton, title: "Cancel", action: #selector(cancelTapped), prominent: false)
        configure(doneButton, title: "Done", action: #selector(doneTapped), prominent: true)
        spinner.color = .white
        spinner.hidesWhenStopped = true

        let bar = UIStackView(arrangedSubviews: [cancelButton, UIView(), spinner, doneButton])
        bar.axis = .horizontal
        bar.alignment = .center
        bar.spacing = 12
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            bar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if phase == .scanning {
            roomCaptureView.captureSession.run(configuration: sessionConfig)
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if phase == .scanning {
            roomCaptureView.captureSession.stop()
        }
    }

    // MARK: - RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        spinner.stopAnimating()
        if let error = error {
            finish(.failure(error))
            return
        }
        finalRoom = processedResult
        phase = .review
        doneButton.configuration?.title = "Use measurements"
        doneButton.isEnabled = true
    }

    // MARK: - Actions

    @objc private func cancelTapped() {
        finish(.cancelled)
    }

    @objc private func doneTapped() {
        switch phase {
        case .scanning:
            phase = .processing
            doneButton.isEnabled = false
            spinner.startAnimating()
            roomCaptureView.captureSession.stop()
        case .processing:
            break
        case .review:
            if let room = finalRoom, let dimensions = RoomDimensions(room: room) {
                finish(.success(dimensions))
            } else {
                finish(.failure(RoomScanError(
                    errorDescription: "Couldn't find enough walls. Try scanning again and pan across every wall."
                )))
            }
        }
    }

    private func finish(_ result: RoomScanResult) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { [onFinish] in
            onFinish?(result)
        }
    }

    private func configure(_ button: UIButton, title: String, action: Selector, prominent: Bool) {
        var config = prominent ? UIButton.Configuration.filled() : UIButton.Configuration.gray()
        config.title = title
        config.cornerStyle = .capsule
        if prominent {
            config.baseBackgroundColor = .white
            config.baseForegroundColor = .black
        }
        button.configuration = config
        button.addTarget(self, action: action, for: .touchUpInside)
    }
}
