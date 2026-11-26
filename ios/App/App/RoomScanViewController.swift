import UIKit
import RoomPlan
import simd

/// Measurements from a RoomPlan scan, in feet and square feet.
struct RoomDimensions {
    let lengthFt: Double
    let widthFt: Double
    let ceilingHeightFt: Double
    /// True floor area from the scanned floor outline, so L-shaped and other
    /// non-rectangular rooms are measured correctly. Includes the floor under
    /// cabinets (see cabinetAreaSqFt).
    let floorAreaSqFt: Double
    /// Wall area with doors, windows and open doorways subtracted.
    let wallAreaSqFt: Double
    /// Wall area before subtracting doors, windows and openings.
    let grossWallAreaSqFt: Double
    /// Approximate floor footprint of cabinets and built-ins (cabinets and
    /// shelving, sinks, dishwashers, ovens, stoves, bathtubs).
    let cabinetAreaSqFt: Double
    let wallCount: Int
    let doorCount: Int
    let windowCount: Int
    let openingCount: Int

    func asJSObject() -> [String: Any] {
        [
            "lengthFt": lengthFt,
            "widthFt": widthFt,
            "ceilingHeightFt": ceilingHeightFt,
            "floorAreaSqFt": floorAreaSqFt,
            "wallAreaSqFt": wallAreaSqFt,
            "grossWallAreaSqFt": grossWallAreaSqFt,
            "cabinetAreaSqFt": cabinetAreaSqFt,
            "wallCount": wallCount,
            "doorCount": doorCount,
            "windowCount": windowCount,
            "openingCount": openingCount
        ]
    }

    init?(room: CapturedRoom) {
        let walls = room.walls
        guard !walls.isEmpty else { return nil }

        // Length and width: the wall-to-wall extent along the longest wall's
        // direction (the bounding rectangle for L-shaped rooms).
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

        let axisA = longestDirection
        let axisB = SIMD2<Float>(-longestDirection.y, longestDirection.x)
        let projA = points.map { simd_dot($0, axisA) }
        let projB = points.map { simd_dot($0, axisB) }
        let extentA = (projA.max() ?? 0) - (projA.min() ?? 0)
        let extentB = (projB.max() ?? 0) - (projB.min() ?? 0)

        // Floor: the scanned floor outline, falling back to the bounding rectangle.
        var floorM2 = room.floors.reduce(Float(0)) { $0 + Self.surfaceArea($1) }
        if floorM2 < 0.1 {
            floorM2 = extentA * extentB
        }

        // Walls: gross area, minus doors, windows and open doorways.
        let grossWallM2 = walls.reduce(Float(0)) { $0 + Self.surfaceArea($1) }
        let holes = room.doors + room.windows + room.openings
        let holesM2 = holes.reduce(Float(0)) { $0 + $1.dimensions.x * $1.dimensions.y }
        let netWallM2 = max(0, grossWallM2 - holesM2)

        // Cabinets and built-ins: width x depth of each detected object.
        var cabinetM2: Float = 0
        for object in room.objects {
            switch object.category {
            case .storage, .sink, .dishwasher, .oven, .stove, .bathtub:
                cabinetM2 += object.dimensions.x * object.dimensions.z
            default:
                break
            }
        }
        cabinetM2 = min(cabinetM2, floorM2)

        lengthFt = Self.feet(max(extentA, extentB))
        widthFt = Self.feet(min(extentA, extentB))
        ceilingHeightFt = Self.feet(maxHeight)
        floorAreaSqFt = Self.squareFeet(floorM2)
        wallAreaSqFt = Self.squareFeet(netWallM2)
        grossWallAreaSqFt = Self.squareFeet(grossWallM2)
        cabinetAreaSqFt = Self.squareFeet(cabinetM2)
        wallCount = walls.count
        doorCount = room.doors.count
        windowCount = room.windows.count
        openingCount = room.openings.count
    }

    /// Area of a scanned surface. Uses its outline when RoomPlan provides one
    /// (non-rectangular floors and walls), otherwise its rectangular size.
    private static func surfaceArea(_ surface: CapturedRoom.Surface) -> Float {
        let outline = polygonArea(surface.polygonCorners)
        if outline > 0.01 { return outline }
        let sides = [surface.dimensions.x, surface.dimensions.y, surface.dimensions.z].sorted(by: >)
        return sides[0] * sides[1]
    }

    /// Area of a flat polygon in 3D (Newell's method), whatever its orientation.
    private static func polygonArea(_ corners: [simd_float3]) -> Float {
        guard corners.count >= 3 else { return 0 }
        var normal = simd_float3(0, 0, 0)
        for i in 0..<corners.count {
            normal += simd_cross(corners[i], corners[(i + 1) % corners.count])
        }
        return simd_length(normal) / 2
    }

    private static func feet(_ meters: Float) -> Double {
        (Double(meters) * MeasureFormat.feetPerMeter * 10).rounded() / 10
    }

    private static func squareFeet(_ squareMeters: Float) -> Double {
        let sqFtPerSqM = MeasureFormat.feetPerMeter * MeasureFormat.feetPerMeter
        return (Double(squareMeters) * sqFtPerSqM * 10).rounded() / 10
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
    enum Mode {
        case room
        case closet

        var introTitle: String {
            switch self {
            case .room: return "Scan the room"
            case .closet: return "Scan the closet"
            }
        }

        var introSteps: String {
            switch self {
            case .room:
                return """
                Keep closet doors closed. You can scan closets separately afterwards.

                Walk slowly around the edge of the room, pointing at the walls, floor and ceiling until the outline is complete. Then tap Done.
                """
            case .closet:
                return """
                Open the closet door all the way, and clear anything blocking the floor if you can.

                Stand in the doorway and slowly point at the inside walls, floor and ceiling. Step inside if it's a walk-in. Then tap Done.
                """
            }
        }

        var startTitle: String {
            switch self {
            case .room: return "Start scanning"
            case .closet: return "The closet is open, start"
            }
        }
    }

    var onFinish: ((RoomScanResult) -> Void)?

    private enum Phase { case intro, scanning, processing, review }

    private let mode: Mode
    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var phase: Phase = .intro
    private var finalRoom: CapturedRoom?
    private var finished = false

    private let cancelButton = UIButton(type: .system)
    private let doneButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let introCard = UIView()

    init(mode: Mode) {
        self.mode = mode
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        roomCaptureView = RoomCaptureView(frame: view.bounds)
        roomCaptureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        roomCaptureView.delegate = self
        view.addSubview(roomCaptureView)

        configure(cancelButton, title: "Cancel", action: #selector(cancelTapped), prominent: false)
        configure(doneButton, title: "Done", action: #selector(doneTapped), prominent: true)
        doneButton.isHidden = true
        spinner.color = .white
        spinner.hidesWhenStopped = true

        let bar = UIStackView(arrangedSubviews: [cancelButton, UIView(), spinner, doneButton])
        bar.axis = .horizontal
        bar.alignment = .center
        bar.spacing = 12
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        buildIntroCard()
        introCard.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(introCard)

        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            bar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),

            introCard.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            introCard.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            introCard.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
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

    @objc private func startTapped() {
        guard phase == .intro else { return }
        phase = .scanning
        UIView.animate(withDuration: 0.25, animations: { self.introCard.alpha = 0 }, completion: { _ in
            self.introCard.removeFromSuperview()
        })
        doneButton.isHidden = false
        roomCaptureView.captureSession.run(configuration: sessionConfig)
    }

    @objc private func cancelTapped() {
        finish(.cancelled)
    }

    @objc private func doneTapped() {
        switch phase {
        case .intro, .processing:
            break
        case .scanning:
            phase = .processing
            doneButton.isEnabled = false
            spinner.startAnimating()
            roomCaptureView.captureSession.stop()
        case .review:
            if let room = finalRoom, let dimensions = RoomDimensions(room: room) {
                finish(.success(dimensions))
            } else {
                let what = mode == .closet ? "the closet's" : "enough"
                finish(.failure(RoomScanError(
                    errorDescription: "Couldn't find \(what) walls. Try scanning again and point at every wall."
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

    // MARK: - UI

    private func buildIntroCard() {
        introCard.backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1)  // #f4efe6
        introCard.layer.cornerRadius = 20
        let ink = UIColor(red: 0.12, green: 0.11, blue: 0.09, alpha: 1)

        let title = UILabel()
        title.text = mode.introTitle
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.textColor = ink

        let body = UILabel()
        body.text = mode.introSteps
        body.font = .systemFont(ofSize: 16)
        body.textColor = ink
        body.numberOfLines = 0

        var config = UIButton.Configuration.filled()
        config.title = mode.startTitle
        config.cornerStyle = .capsule
        config.baseBackgroundColor = ink
        config.baseForegroundColor = introCard.backgroundColor
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
        let start = UIButton(configuration: config)
        start.addTarget(self, action: #selector(startTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, body, start])
        stack.axis = .vertical
        stack.spacing = 14
        stack.setCustomSpacing(22, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        introCard.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: introCard.leadingAnchor, constant: 22),
            stack.trailingAnchor.constraint(equalTo: introCard.trailingAnchor, constant: -22),
            stack.topAnchor.constraint(equalTo: introCard.topAnchor, constant: 22),
            stack.bottomAnchor.constraint(equalTo: introCard.bottomAnchor, constant: -22)
        ])
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
