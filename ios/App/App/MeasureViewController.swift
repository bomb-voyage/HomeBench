import UIKit
import ARKit
import SceneKit
import simd

/// Full-screen point-to-point AR tape measure.
///
/// Aim the center crosshair, tap + to drop a start point, aim at the end and
/// tap + again to finish a measurement. Repeat for more. Done returns every
/// measurement in meters (most recent last); Cancel returns nil.
final class MeasureViewController: UIViewController, ARSessionDelegate {
    var onFinish: (([Float]?) -> Void)?

    private struct Segment {
        let meters: Float
        let nodes: [SCNNode]
    }

    private let sceneView = ARSCNView()
    private let coachingOverlay = ARCoachingOverlayView()
    private let reticle = ReticleView()
    private let distanceLabel = PaddedLabel()
    private let hintLabel = PaddedLabel()
    private let historyLabel = UILabel()

    private let addButton = UIButton(type: .system)
    private let undoButton = UIButton(type: .system)
    private let doneButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    private var currentPoint: simd_float3?
    private var startPoint: simd_float3?
    private var startNode: SCNNode?
    private var liveLine: SCNNode?
    private var segments: [Segment] = []
    private var finished = false

    private let accent = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1)  // #f4efe6

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        sceneView.frame = view.bounds
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        sceneView.session.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        view.addSubview(sceneView)

        coachingOverlay.session = sceneView.session
        coachingOverlay.goal = .anyPlane
        coachingOverlay.activatesAutomatically = true
        coachingOverlay.frame = view.bounds
        coachingOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Directly above the camera view, so Cancel stays tappable while coaching shows.
        view.addSubview(coachingOverlay)

        reticle.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(reticle)

        distanceLabel.font = .monospacedDigitSystemFont(ofSize: 28, weight: .semibold)
        distanceLabel.textColor = .black
        distanceLabel.backgroundColor = accent
        distanceLabel.isHidden = true

        hintLabel.font = .systemFont(ofSize: 15, weight: .medium)
        hintLabel.textColor = .white
        hintLabel.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        hintLabel.numberOfLines = 0
        hintLabel.textAlignment = .center

        historyLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .regular)
        historyLabel.textColor = .white
        historyLabel.numberOfLines = 0
        historyLabel.textAlignment = .right
        historyLabel.shadowColor = .black
        historyLabel.shadowOffset = CGSize(width: 0, height: 1)

        configureTextButton(cancelButton, title: "Cancel", prominent: false, action: #selector(cancelTapped))
        configureTextButton(doneButton, title: "Done", prominent: true, action: #selector(doneTapped))
        configureIconButton(addButton, systemName: "plus", size: 34, diameter: 76, action: #selector(addTapped))
        configureIconButton(undoButton, systemName: "arrow.uturn.backward", size: 18, diameter: 48, action: #selector(undoTapped))

        let topBar = UIStackView(arrangedSubviews: [cancelButton, UIView(), doneButton])
        topBar.axis = .horizontal
        topBar.alignment = .center

        [topBar, distanceLabel, hintLabel, historyLabel, addButton, undoButton].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview($0)
        }

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            reticle.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            reticle.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            reticle.widthAnchor.constraint(equalToConstant: 44),
            reticle.heightAnchor.constraint(equalToConstant: 44),

            topBar.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            topBar.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            topBar.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),

            historyLabel.topAnchor.constraint(equalTo: topBar.bottomAnchor, constant: 12),
            historyLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            historyLabel.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 16),

            distanceLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            distanceLabel.bottomAnchor.constraint(equalTo: reticle.topAnchor, constant: -24),

            addButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            addButton.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -24),
            addButton.widthAnchor.constraint(equalToConstant: 76),
            addButton.heightAnchor.constraint(equalToConstant: 76),

            undoButton.centerYAnchor.constraint(equalTo: addButton.centerYAnchor),
            undoButton.leadingAnchor.constraint(equalTo: addButton.trailingAnchor, constant: 32),
            undoButton.widthAnchor.constraint(equalToConstant: 48),
            undoButton.heightAnchor.constraint(equalToConstant: 48),

            hintLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintLabel.bottomAnchor.constraint(equalTo: addButton.topAnchor, constant: -20),
            hintLabel.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 24),
            hintLabel.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -24)
        ])

        refreshControls()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        // On LiDAR iPhones this makes surface hits faster and more accurate.
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        UIApplication.shared.isIdleTimerDisabled = true
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: - Per-frame update

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let center = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
        var hit: simd_float3?
        if case .normal = frame.camera.trackingState,
           let query = sceneView.raycastQuery(from: center, allowing: .estimatedPlane, alignment: .any),
           let result = session.raycast(query).first {
            let t = result.worldTransform.columns.3
            hit = simd_float3(t.x, t.y, t.z)
        }
        currentPoint = hit
        reticle.isLocked = hit != nil

        liveLine?.removeFromParentNode()
        liveLine = nil
        if let start = startPoint, let end = hit {
            let line = makeLine(from: start, to: end)
            sceneView.scene.rootNode.addChildNode(line)
            liveLine = line
            distanceLabel.text = MeasureFormat.feetAndInches(meters: simd_distance(start, end))
            distanceLabel.isHidden = false
        } else {
            distanceLabel.isHidden = true
        }
        refreshControls(trackingState: frame.camera.trackingState)
    }

    // MARK: - Actions

    @objc private func addTapped() {
        guard let point = currentPoint else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        if let start = startPoint, let startNode = startNode {
            // Finish this measurement.
            liveLine?.removeFromParentNode()
            liveLine = nil
            let endNode = makeDot(at: point)
            let line = makeLine(from: start, to: point)
            sceneView.scene.rootNode.addChildNode(endNode)
            sceneView.scene.rootNode.addChildNode(line)
            segments.append(Segment(meters: simd_distance(start, point), nodes: [startNode, endNode, line]))
            startPoint = nil
            self.startNode = nil
            updateHistory()
        } else {
            // Start a new measurement.
            let node = makeDot(at: point)
            sceneView.scene.rootNode.addChildNode(node)
            startPoint = point
            startNode = node
        }
        refreshControls()
    }

    @objc private func undoTapped() {
        if let node = startNode {
            node.removeFromParentNode()
            startNode = nil
            startPoint = nil
            liveLine?.removeFromParentNode()
            liveLine = nil
        } else if let last = segments.popLast() {
            last.nodes.forEach { $0.removeFromParentNode() }
            updateHistory()
        }
        refreshControls()
    }

    @objc private func doneTapped() {
        finish(segments.map(\.meters))
    }

    @objc private func cancelTapped() {
        finish(nil)
    }

    private func finish(_ result: [Float]?) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { [onFinish] in
            onFinish?(result)
        }
    }

    // MARK: - UI state

    private func refreshControls(trackingState: ARCamera.TrackingState? = nil) {
        addButton.isEnabled = currentPoint != nil
        addButton.alpha = currentPoint != nil ? 1 : 0.5
        undoButton.isHidden = startPoint == nil && segments.isEmpty
        doneButton.isEnabled = !segments.isEmpty

        if case .limited(let reason)? = trackingState {
            switch reason {
            case .excessiveMotion: hintLabel.text = "Slow down"
            case .insufficientFeatures: hintLabel.text = "Point at a surface with more detail or light"
            default: hintLabel.text = "Move your iPhone slowly to scan the area"
            }
        } else if currentPoint == nil {
            hintLabel.text = "Aim the crosshair at a floor, wall or object"
        } else if startPoint == nil {
            hintLabel.text = segments.isEmpty ? "Tap + to set the start point" : "Tap + to measure again, or Done"
        } else {
            hintLabel.text = "Aim at the end point and tap +"
        }
    }

    private func updateHistory() {
        historyLabel.text = segments.enumerated()
            .map { "\($0.offset + 1).  \(MeasureFormat.feetAndInches(meters: $0.element.meters))" }
            .joined(separator: "\n")
    }

    // MARK: - Scene geometry

    private func makeDot(at point: simd_float3) -> SCNNode {
        let sphere = SCNSphere(radius: 0.006)
        sphere.firstMaterial?.diffuse.contents = UIColor.white
        sphere.firstMaterial?.lightingModel = .constant
        let node = SCNNode(geometry: sphere)
        node.simdPosition = point
        return node
    }

    private func makeLine(from a: simd_float3, to b: simd_float3) -> SCNNode {
        let length = simd_distance(a, b)
        let cylinder = SCNCylinder(radius: 0.0025, height: CGFloat(length))
        cylinder.firstMaterial?.diffuse.contents = accent
        cylinder.firstMaterial?.lightingModel = .constant
        let node = SCNNode(geometry: cylinder)
        node.simdPosition = (a + b) / 2
        guard length > 1e-4 else { return node }
        // Point the cylinder's local Y axis from a to b.
        let direction = simd_normalize(b - a)
        let yAxis = simd_float3(0, 1, 0)
        let dot = simd_dot(yAxis, direction)
        if dot < -0.9999 {
            node.simdOrientation = simd_quatf(angle: .pi, axis: simd_float3(1, 0, 0))
        } else {
            node.simdOrientation = simd_quatf(from: yAxis, to: direction)
        }
        return node
    }

    // MARK: - Button styling

    private func configureTextButton(_ button: UIButton, title: String, prominent: Bool, action: Selector) {
        var config = prominent ? UIButton.Configuration.filled() : UIButton.Configuration.gray()
        config.title = title
        config.cornerStyle = .capsule
        if prominent {
            config.baseBackgroundColor = accent
            config.baseForegroundColor = .black
        }
        button.configuration = config
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func configureIconButton(_ button: UIButton, systemName: String, size: CGFloat, diameter: CGFloat, action: Selector) {
        let symbol = UIImage(systemName: systemName, withConfiguration: UIImage.SymbolConfiguration(pointSize: size, weight: .semibold))
        button.setImage(symbol, for: .normal)
        button.tintColor = .black
        button.backgroundColor = accent
        button.layer.cornerRadius = diameter / 2
        button.addTarget(self, action: action, for: .touchUpInside)
    }
}

/// Center crosshair; turns solid when it's on a surface.
private final class ReticleView: UIView {
    var isLocked = false {
        didSet { if oldValue != isLocked { setNeedsDisplay() } }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        isUserInteractionEnabled = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draw(_ rect: CGRect) {
        let ring = UIBezierPath(ovalIn: rect.insetBy(dx: 4, dy: 4))
        ring.lineWidth = 2
        UIColor.white.withAlphaComponent(isLocked ? 1 : 0.5).setStroke()
        ring.stroke()
        let dotRadius: CGFloat = isLocked ? 4 : 2
        let dot = UIBezierPath(ovalIn: CGRect(x: rect.midX - dotRadius, y: rect.midY - dotRadius, width: dotRadius * 2, height: dotRadius * 2))
        UIColor.white.setFill()
        dot.fill()
    }
}

/// UILabel with rounded background and padding.
private final class PaddedLabel: UILabel {
    private let insets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)

    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerRadius = 12
        layer.masksToBounds = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + insets.left + insets.right, height: size.height + insets.top + insets.bottom)
    }
}
