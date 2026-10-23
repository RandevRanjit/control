import AppKit
import QuartzCore

// Stand-in for the spike's Motion (LampLayer.swift) so this file typechecks alone.
@MainActor enum Motion {
    static var reduced: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }
}

/// Bloom's one clock (motion brief §1). Every loop counts from `epoch`; one-shots never wait for it.
enum Clock {
    static let T: CFTimeInterval = 7
    static let lcm: CFTimeInterval = 14
    /// Host time floored to a 14 s boundary. Host time is shared by every process, so the main window,
    /// the menu-bar panel and any helper land on the same phase grid without talking to each other.
    static let epoch: CFTimeInterval = {
        let now = CACurrentMediaTime()
        return now - now.truncatingRemainder(dividingBy: lcm)
    }()

    /// beginTime for a loop whose cue sits `cue` seconds into its period. One LCM early, so the loop and
    /// every replicator instance are already running when the layer appears: nothing "fills in".
    static func begin(_ layer: CALayer, cue: CFTimeInterval = 0) -> CFTimeInterval {
        layer.convertTime(epoch - lcm + cue, from: nil)
    }
}

/// One-shot durations: the clock's binary subdivisions.
enum Beat {
    static let tap = Clock.T / 64       // 109.4 ms
    static let quick = Clock.T / 32     // 218.8 ms
    static let state = Clock.T / 16     // 437.5 ms
    static let scene = Clock.T / 8      // 875 ms
    static let beat = Clock.T / 4       // 1.75 s, needs-you's loop only
    static let breath = Clock.T / 2     // 3.5 s
}

@MainActor enum Ease {
    static let sine = CAMediaTimingFunction(controlPoints: 0.37, 0, 0.63, 1)
    static let sineOut = CAMediaTimingFunction(controlPoints: 0.61, 1, 0.88, 1)
    static let sineIn = CAMediaTimingFunction(controlPoints: 0.12, 0, 0.39, 0)
    static let settle = CAMediaTimingFunction(controlPoints: 0.25, 1, 0.5, 1)
    static let linear = CAMediaTimingFunction(name: .linear)
}

/// Frame-rate hints. Loops never ask for the screen's top rate; the owner's input does.
enum Pace {
    static let ambient = CAFrameRateRange(minimum: 10, maximum: 30, preferred: 30)
    static let calm = CAFrameRateRange(minimum: 8, maximum: 15, preferred: 15)
    static let hero = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
}

/// A phase-locked loop. `eases` has one entry per segment, or a single entry for all of them.
@MainActor func loop(_ keyPath: String, _ values: [Any], keyTimes: [Double], period: CFTimeInterval,
          eases: [CAMediaTimingFunction], cue: CFTimeInterval = 0, pace: CAFrameRateRange = Pace.ambient,
          on layer: CALayer) -> CAKeyframeAnimation {
    let a = CAKeyframeAnimation(keyPath: keyPath)
    a.values = values
    a.keyTimes = keyTimes.map { NSNumber(value: $0) }
    a.duration = period
    a.repeatCount = .infinity
    a.timingFunctions = eases.count == 1 ? Array(repeating: eases[0], count: values.count - 1) : eases
    a.beginTime = Clock.begin(layer, cue: cue)
    a.isRemovedOnCompletion = false
    a.preferredFrameRateRange = pace
    return a
}

/// Bloom's lamp loops (motion brief §3). Values in points assume an unflipped (y-up) layer.
@MainActor enum BloomLamp {
    static let key = "motion"

    /// Needs you: the body beats, the halo ripples past the lamp's edge. 1.75 s, cue 0.
    static func needs(body: CALayer, halo: CALayer) {
        body.add(loop("transform.scale", [1, 1.16, 1], keyTimes: [0, 0.25, 1], period: Beat.beat,
                      eases: [Ease.sineOut, Ease.sine], pace: Pace.hero, on: body), forKey: key)
        let grow = CABasicAnimation(keyPath: "transform.scale")
        grow.fromValue = 1
        grow.toValue = 2.2
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.5
        fade.toValue = 0
        for a in [grow, fade] { a.duration = Beat.beat }
        let g = CAAnimationGroup()
        g.animations = [grow, fade]
        g.duration = Beat.beat
        g.repeatCount = .infinity
        g.timingFunction = Ease.sineOut
        g.beginTime = Clock.begin(halo)
        g.isRemovedOnCompletion = false
        g.preferredFrameRateRange = Pace.hero
        halo.add(g, forKey: key)
    }

    /// Working (7 s) and housekeeping's core (14 s): the chrome-safe ramp rises through the bead,
    /// linear. `ramp` holds the ramp twice (stops at 0...0.5 and again at 0.5...1) and clips itself
    /// (cornerRadius = width / 2, masksToBounds, no sublayers). The visible 0...1 always lies inside
    /// startPoint...endPoint, and the shift is exactly one copy, so the wrap is seamless.
    static func flow(_ ramp: CAGradientLayer, period: CFTimeInterval = Clock.T, pace: CAFrameRateRange = Pace.ambient) {
        let s = CABasicAnimation(keyPath: "startPoint")
        s.fromValue = NSValue(point: CGPoint(x: 0.5, y: -2))
        s.toValue = NSValue(point: CGPoint(x: 0.5, y: 0))
        let e = CABasicAnimation(keyPath: "endPoint")
        e.fromValue = NSValue(point: CGPoint(x: 0.5, y: 2))
        e.toValue = NSValue(point: CGPoint(x: 0.5, y: 4))
        for a in [s, e] { a.duration = period }
        let g = CAAnimationGroup()
        g.animations = [s, e]
        g.duration = period
        g.repeatCount = .infinity
        g.timingFunction = Ease.linear
        g.beginTime = Clock.begin(ramp)
        g.isRemovedOnCompletion = false
        g.preferredFrameRateRange = pace
        ramp.add(g, forKey: key)
    }

    /// Background{n}: a highlight crosses the chain of n beads (cap 7) once per 7 s.
    static func wave(chain: CAReplicatorLayer, bead: CALayer, base: CGColor, highlight: CGColor) {
        chain.instanceDelay = Clock.T / Double(max(chain.instanceCount, 1))
        bead.add(loop("backgroundColor", [base, highlight, base, base], keyTimes: [0, 0.08, 0.16, 1],
                      period: Clock.T, eases: [Ease.sine], on: bead), forKey: key)
    }

    /// Done, unseen: the core swells fast and settles slowly. 3.5 s, cue 0.875 s.
    static func beckon(core: CALayer) {
        core.add(loop("transform.scale", [0.6, 1, 0.6], keyTimes: [0, 0.125, 1], period: Beat.breath,
                      eases: [Ease.sineOut, Ease.sine], cue: 0.875, on: core), forKey: key)
    }

    /// Failed: two soft dips, then rest. 3.5 s, cue 2.625 s.
    static func stumble(body: CALayer) {
        body.add(loop("opacity", [1, 0.45, 1, 0.45, 1, 1], keyTimes: [0, 0.0625, 0.125, 0.1875, 0.25, 1],
                      period: Beat.breath, eases: [Ease.sine], cue: 2.625, on: body), forKey: key)
    }

    /// Choose on return: the half fill rises and falls by 15 % of the lamp. 7 s.
    static func tide(fill: CALayer, lamp d: CGFloat) {
        fill.add(loop("transform.translation.y", [-0.15 * d, 0.15 * d, -0.15 * d], keyTimes: [0, 0.5, 1],
                      period: Clock.T, eases: [Ease.sine], on: fill), forKey: key)
    }

    /// Outside: holds, then one soft dip at the end of every 7 s.
    static func far(body: CALayer) {
        body.add(loop("opacity", [0.8, 0.8, 0.4, 0.8], keyTimes: [0, 0.875, 0.9375, 1],
                      period: Clock.T, eases: [Ease.sine], on: body), forKey: key)
    }

    /// Idle: a 14 s breath, barely there.
    static func rest(body: CALayer) {
        body.add(loop("opacity", [1, 0.82, 1], keyTimes: [0, 0.5, 1], period: 2 * Clock.T,
                      eases: [Ease.sine], pace: Pace.calm, on: body), forKey: key)
    }

    /// Ring <-> filled is one CAShapeLayer: a filled bead is its circle stroked at the bead's radius.
    /// Retargets from the presentation value, so a change mid-transition never jumps.
    static func morph(_ body: CAShapeLayer, to path: CGPath, lineWidth: CGFloat, duration: CFTimeInterval) {
        let now = body.presentation() ?? body
        let p = CABasicAnimation(keyPath: "path")
        p.fromValue = now.path
        p.toValue = path
        let w = CABasicAnimation(keyPath: "lineWidth")
        w.fromValue = now.lineWidth
        w.toValue = lineWidth
        for a in [p, w] { a.duration = duration }
        let g = CAAnimationGroup()
        g.animations = [p, w]
        g.duration = duration
        g.timingFunction = Ease.sine
        body.path = path
        body.lineWidth = lineWidth
        body.add(g, forKey: "morph")
    }

    /// Rest -> stripes -> settle (§4.1). `sweep` is a gradient 3 lamps tall, bottom-aligned, clipped to
    /// the lamp, coloured bottom-to-top [bridge..., old]. It rides up for half the time, so the old hue
    /// leaves through its bridge, then dissolves onto the new state, whose loop is already in phase.
    static func sweep(_ sweep: CAGradientLayer, lamp d: CGFloat, duration: CFTimeInterval, done: @escaping () -> Void) {
        let rise = CABasicAnimation(keyPath: "transform.translation.y")
        rise.fromValue = -2 * d
        rise.toValue = 0
        rise.duration = duration / 2
        rise.timingFunction = Ease.sine
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = 0
        fade.beginTime = duration / 2
        fade.duration = duration / 2
        fade.timingFunction = Ease.sine
        fade.fillMode = .both
        let g = CAAnimationGroup()
        g.animations = [rise, fade]
        g.duration = duration
        g.fillMode = .forwards
        g.isRemovedOnCompletion = false
        CATransaction.begin()
        CATransaction.setCompletionBlock(done)
        sweep.add(g, forKey: "sweep")
        CATransaction.commit()
    }

    /// Needs you, arriving: one wide bloom, then the beat (already in phase) carries on.
    static func arrive(halo: CALayer) {
        let grow = CABasicAnimation(keyPath: "transform.scale")
        grow.fromValue = 1
        grow.toValue = 2.8
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.6
        fade.toValue = 0
        for a in [grow, fade] { a.duration = Beat.scene }
        let g = CAAnimationGroup()
        g.animations = [grow, fade]
        g.duration = Beat.scene
        g.timingFunction = Ease.sineOut
        g.preferredFrameRateRange = Pace.hero
        halo.add(g, forKey: "arrive")
    }
}

/// The bead-ring loader (§5.1): 15 beads that never move; colour travels round them once per 7 s.
@MainActor func beadRing(radius: CGFloat, bead: CGFloat, colors: [CGColor], stops: [Double], scale: CGFloat) -> CAReplicatorLayer {
    let ring = CAReplicatorLayer()
    ring.bounds = CGRect(x: 0, y: 0, width: 2 * radius + bead, height: 2 * radius + bead)
    ring.instanceCount = 15
    ring.instanceTransform = CATransform3DMakeRotation(-2 * .pi / 15, 0, 0, 1)   // clockwise when y is up
    ring.instanceDelay = Clock.T / 15
    let b = CALayer()
    b.bounds = CGRect(x: 0, y: 0, width: bead, height: bead)
    b.cornerRadius = bead / 2
    b.position = CGPoint(x: ring.bounds.midX, y: ring.bounds.midY + radius)
    b.backgroundColor = colors[0]
    b.contentsScale = scale
    ring.addSublayer(b)
    b.add(loop("backgroundColor", colors, keyTimes: stops, period: Clock.T, eases: [Ease.linear], on: b), forKey: "hue")
    b.add(loop("transform.scale", [1, 0.92, 1], keyTimes: [0, 0.5, 1], period: Beat.breath, eases: [Ease.sine], on: b),
          forKey: "breathe")
    return ring
}

/// A usage chain (§5.3): empty beads under filled beads; the filled replicator is masked to the value.
@MainActor final class UsageChain {
    let layer = CALayer()
    private let fill = CAReplicatorLayer()
    private let mask = CALayer()
    private let pitch: CGFloat

    init(count: Int, bead: CGFloat, gap: CGFloat, empty: CGColor, filled: CGColor) {
        pitch = bead + gap
        let width = CGFloat(count) * pitch - gap
        layer.bounds = CGRect(x: 0, y: 0, width: width, height: bead)
        for (rep, color) in [(CAReplicatorLayer(), empty), (fill, filled)] {
            rep.frame = layer.bounds
            rep.instanceCount = count
            rep.instanceTransform = CATransform3DMakeTranslation(pitch, 0, 0)
            let b = CALayer()
            b.frame = CGRect(x: 0, y: 0, width: bead, height: bead)
            b.cornerRadius = bead / 2
            b.backgroundColor = color
            rep.addSublayer(b)
            layer.addSublayer(rep)
        }
        mask.anchorPoint = .zero
        mask.bounds = CGRect(x: 0, y: 0, width: 0, height: bead)
        mask.backgroundColor = NSColor.black.cgColor
        fill.mask = mask
    }

    /// A new reading tweens over 437.5 ms; under Reduce motion it lands at once.
    @MainActor func set(_ value: Double) {
        CATransaction.begin()
        CATransaction.setDisableActions(Motion.reduced)
        CATransaction.setAnimationDuration(Beat.state)
        CATransaction.setAnimationTimingFunction(Ease.sineOut)
        mask.bounds.size.width = layer.bounds.width * CGFloat(min(max(value, 0), 1))
        CATransaction.commit()
    }
}

/// The inflated press (§5.4): scale .96 down in 109 ms, back in 219 ms, never past 1.
final class PuffyButton: NSButton {
    private let puff = CALayer()
    override var wantsUpdateLayer: Bool { true }

    override func makeBackingLayer() -> CALayer {
        let host = super.makeBackingLayer()
        host.addSublayer(puff)
        return host
    }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        puff.frame = bounds                       // a standalone sublayer: anchor at its centre
        puff.cornerRadius = 10
        puff.cornerCurve = .continuous
        CATransaction.commit()
    }

    override func updateLayer() {
        let down = isHighlighted && !Motion.reduced
        CATransaction.begin()
        CATransaction.setAnimationDuration(down ? Beat.tap : Beat.quick)
        CATransaction.setAnimationTimingFunction(down ? Ease.settle : Ease.sine)
        puff.transform = down ? CATransform3DMakeScale(0.96, 0.96, 1) : CATransform3DIdentity
        CATransaction.commit()
    }
}

/// Night <-> Field (§4.6): a scrim of the bridge colour blooms out from the toggle, the appearance
/// swaps under it with actions off, and the scrim dissolves. Lightness only ever moves one way.
@MainActor func swapTheme(in window: NSWindow, to appearance: NSAppearance, bridge: CGColor, from origin: CGPoint,
                          recolour: @escaping () -> Void) {
    guard let host = window.contentView?.layer else { return }
    let reduced = Motion.reduced
    let scrim = CALayer()
    scrim.frame = host.bounds
    scrim.backgroundColor = bridge            // resolved before the swap, so the swap can't recolour it
    scrim.opacity = 0.94
    scrim.zPosition = 1_000
    let r = hypot(max(origin.x, host.bounds.width - origin.x), max(origin.y, host.bounds.height - origin.y)) + 64
    let mask = CAGradientLayer()
    mask.type = .radial
    mask.colors = [NSColor.black.cgColor, NSColor.black.cgColor, NSColor.clear.cgColor]
    mask.locations = [0, 0.9, 1]
    mask.startPoint = CGPoint(x: 0.5, y: 0.5)
    mask.endPoint = CGPoint(x: 1, y: 1)
    mask.bounds = CGRect(x: 0, y: 0, width: 2 * r, height: 2 * r)
    mask.position = origin
    scrim.mask = mask
    host.addSublayer(scrim)

    let up: CABasicAnimation
    if reduced {
        up = CABasicAnimation(keyPath: "opacity")
        up.fromValue = 0
        up.toValue = 0.94
        up.duration = Beat.quick
        up.timingFunction = Ease.sine
        CATransaction.begin()
        CATransaction.setCompletionBlock { finish() }
        scrim.add(up, forKey: "up")
        CATransaction.commit()
    } else {
        up = CABasicAnimation(keyPath: "transform.scale")
        up.fromValue = 0.001
        up.toValue = 1
        up.duration = Beat.state
        up.timingFunction = Ease.sine
        CATransaction.begin()
        CATransaction.setCompletionBlock { finish() }
        mask.add(up, forKey: "up")
        CATransaction.commit()
    }

    func finish() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)  // hundreds of colour changes, none of them animated
        window.appearance = appearance
        recolour()                             // CALayer colours don't follow the appearance; re-resolve them
        CATransaction.commit()
        let down = CABasicAnimation(keyPath: "opacity")
        down.fromValue = 0.94
        down.toValue = 0
        down.duration = reduced ? Beat.quick : Beat.state
        down.timingFunction = Ease.sine
        CATransaction.begin()
        CATransaction.setCompletionBlock { scrim.removeFromSuperlayer() }
        scrim.opacity = 0
        scrim.add(down, forKey: "down")
        CATransaction.commit()
    }
}

/// When loops run (§1.4): occluded windows still everything; Low Power and hot machines drop the
/// frame-rate hint and still idle; Reduce motion stills everything. Un-key changes nothing here.
@MainActor final class AmbientGate {
    private(set) var occluded = false
    private(set) var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    var still: Bool { occluded || Motion.reduced }
    var pace: CAFrameRateRange { lowPower ? Pace.calm : Pace.ambient }
    /// Called whenever `still` or `pace` may have changed: re-configure the visible rows. Loops re-added
    /// with Clock.begin land in step, so nothing needs to remember a phase.
    var changed: () -> Void = {}
    private var tokens: [NSObjectProtocol] = []

    init(window: NSWindow) {
        let nc = NotificationCenter.default
        tokens.append(nc.addObserver(forName: NSWindow.didChangeOcclusionStateNotification, object: window,
                                     queue: .main) { [weak self, weak window] _ in
            MainActor.assumeIsolated {
                guard let self, let window else { return }
                self.occluded = !window.occlusionState.contains(.visible)
                self.changed()
            }
        })
        tokens.append(NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.changed() }
        })
        for name in [Notification.Name.NSProcessInfoPowerStateDidChange, ProcessInfo.thermalStateDidChangeNotification] {
            tokens.append(nc.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    let info = ProcessInfo.processInfo
                    self.lowPower = info.isLowPowerModeEnabled || info.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
                    self.changed()
                }
            })
        }
    }
}

/// Row insert, remove and re-sort (§4.3). NSOutlineView takes its row animation timing from the
/// enclosing NSAnimationContext (verify in the spike); never during live resize.
@MainActor func animateRows(_ outline: NSOutlineView, _ body: () -> Void, inserting: Bool) {
    guard !outline.inLiveResize, !Motion.reduced else { return body() }
    NSAnimationContext.runAnimationGroup { ctx in
        ctx.duration = inserting ? Beat.state : Beat.quick
        ctx.timingFunction = inserting ? Ease.sineOut : Ease.sineIn
        ctx.allowsImplicitAnimation = true
        body()
    }
}
