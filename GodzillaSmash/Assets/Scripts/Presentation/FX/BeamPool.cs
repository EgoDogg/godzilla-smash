// Godzilla.Presentation/FX/BeamPool.cs — pooled beams + the re-fire gate (spec Step 8e, corrections #9,#14).
//
// POOL = 3 (ceil(0.18/0.126)+1). REFIRE_GATE = 0.126s = clamp(0.30*0.42,0.11,0.20) — the animation-DECOUPLED gate
// (the level-triggered re-fire cadence, NOT anim-finish). TryFire returns false while gated; otherwise it arms the
// gate, acquires the first dead beam (else round-robins), and fires. FXSPIKE callers pass explicit muzzle/target px;
// Phase-1 (P1-BEAM-MUZZLE) reads the shared MuzzleSocket so beam-origin == breath-charge emitter by construction.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    public class BeamPool : MonoBehaviour
    {
        public const int POOL = 3;
        public const float REFIRE_GATE = 0.126f;

        [SerializeField] Material rampMaterial; // FXBeamRamp.mat
        [SerializeField] Material softMaterial; // FXSoftAdditive.mat (impact bloom)

        static readonly Color StripTint = Color.white;                              // supernova ramp is pre-colored
        static readonly Color BloomTint = new Color(200f / 255f, 120f / 255f, 1f, 1f); // breathGlow

        BeamQuad[] _beams;
        float _gateT;
        uint _fireIndex;

        void Awake()
        {
            _beams = new BeamQuad[POOL];
            for (int i = 0; i < POOL; i++) _beams[i] = new BeamQuad(transform, rampMaterial, softMaterial);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (_gateT > 0f) _gateT -= dt;
            for (int i = 0; i < POOL; i++) _beams[i].Tick(dt);
        }

        public bool TryFire(in Vector2 muzzlePx, in Vector2 targetPx)
        {
            if (_gateT > 0f) return false;
            _gateT = REFIRE_GATE;
            BeamQuad slot = null;
            for (int i = 0; i < POOL; i++) if (!_beams[i].Alive) { slot = _beams[i]; break; }
            if (slot == null) slot = _beams[_fireIndex % POOL];
            slot.Fire(muzzlePx, targetPx, StripTint, BloomTint, _fireIndex);
            _fireIndex++;
            return true;
        }
    }
}
