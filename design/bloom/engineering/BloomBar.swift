import QuartzCore

/// The state bar (BRIEF-2 §4, round 3): one smooth ramp per state, travelling left through a fixed track.
@MainActor enum BloomBar {
    static let key = "bar"

    /// `ramp` holds the state's stops repeated over the track plus one tile (twice, for a bar no wider
    /// than its tile); the track clips it. It slides left by exactly one tile per period, linear, so the
    /// wrap is invisible. beginTime comes from the shared epoch, so every bar of one state is in one
    /// phase on every row: no chasers. Reduce motion: no animation, k = 0.
    static func flow(_ ramp: CAGradientLayer, tile: CGFloat, period: CFTimeInterval,
                     pace: CAFrameRateRange = Pace.ambient) {
        let a = CABasicAnimation(keyPath: "transform.translation.x")
        a.fromValue = 0
        a.toValue = -tile
        a.duration = period
        a.repeatCount = .infinity
        a.timingFunction = Ease.linear
        a.beginTime = Clock.begin(ramp)
        a.isRemovedOnCompletion = false
        a.preferredFrameRateRange = pace
        ramp.add(a, forKey: key)
    }

    /// A row's bead bar: the same ramp seen through whole beads. The mask is a replicator of one circle
    /// (diameter `d`, pitch `p`), and it never moves: only the ramp under it does, so the colour travels
    /// through still beads. The track is a whole number of pitches wide, so the end beads sit flush.
    /// One small offscreen pass per bar (about 90 x 5 pt); the mask is built once, never animated.
    static func beads(_ ramp: CAGradientLayer, in track: CALayer, diameter d: CGFloat = 5, pitch p: CGFloat = 8) {
        let dot = CALayer()
        dot.frame = CGRect(x: (p - d) / 2, y: (track.bounds.height - d) / 2, width: d, height: d)
        dot.cornerRadius = d / 2
        dot.backgroundColor = CGColor(gray: 0, alpha: 1)
        dot.contentsScale = track.contentsScale
        let rep = CAReplicatorLayer()
        rep.frame = track.bounds
        rep.instanceCount = max(1, Int(track.bounds.width / p))
        rep.instanceTransform = CATransform3DMakeTranslation(p, 0, 0)
        rep.addSublayer(dot)
        track.mask = rep
        track.masksToBounds = true
        if ramp.superlayer !== track { track.addSublayer(ramp) }
    }
}

// A row's needs-you bead bar:  BloomBar.beads(ramp, in: track); BloomBar.flow(ramp, tile: 240 * 0.5, period: Beat.beat)
// The working head bar:        BloomBar.flow(ramp, tile: 360, period: Clock.T)   (a pill track, no mask)
@MainActor func barExamples(_ r: CAGradientLayer, _ track: CALayer) {
    BloomBar.beads(r, in: track)
    BloomBar.flow(r, tile: 240 * 0.5, period: Beat.beat)
    BloomBar.flow(r, tile: 360, period: Clock.T)
}
