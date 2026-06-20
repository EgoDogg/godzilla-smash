// Godzilla.Presentation/FX/FxDirector.cs — the ONE shared FX clock + spike FSM/facing state (spec Step 9c).
//
// Owns the single `_glowPhase += Time.deltaTime` (entities.js:961) that aura / plate-glow / eye / motes / halo /
// breath-charge ALL read, so every effect is phase-locked (correction #9c). For the FXSPIKE this MonoBehaviour also
// carries the minimal FSM/facing signals the breath-charge and eye effects gate on; Phase-1 (P1-KAIJUSIM-SPLIT)
// drives these from the ported KaijuSim instead of the spike defaults.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    public enum FxFsm { Idle, Attack }

    // Which silhouette the body is showing. Breath-charge shows unless Back (back34 still shows, spec Step 6).
    public enum FacingShow { Side, Back34, Back }

    public class FxDirector : MonoBehaviour
    {
        double _glowPhase;
        public double GlowPhase => _glowPhase;

        [Header("Spike FSM/facing (Phase-1 drives these from KaijuSim)")]
        public FxFsm Fsm = FxFsm.Idle;
        public int AttackFrame = 0;                    // 0..5, entities.js:1068
        [Range(0, 4)] public int FacingBaseIndex = 2;  // 0..4 = the SINGLE facing source of truth

        // Derived so eye + breath suppression can never desync: web fg.show -> eye hides on back||back34 (base 3,4),
        // breath hides only on back (base 4). entities.js:1606,1616.
        public FacingShow Facing =>
            FacingBaseIndex == 4 ? FacingShow.Back :
            FacingBaseIndex == 3 ? FacingShow.Back34 : FacingShow.Side;

        void Update()
        {
            _glowPhase += Time.deltaTime;           // the one shared clock
        }
    }
}
