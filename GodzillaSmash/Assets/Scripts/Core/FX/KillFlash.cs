// Godzilla.Core/FX/KillFlash.cs — pure C#, NO UnityEngine, double. Bit-faithful port of the web kill-flash _flash.
//
// Web source (gz-v32 entities.js): set to 1.0 on form change (setForm, :893); floor-charged to 0.25+0.35*chargeT
// during a Nova charge (:994); decays each frame `_flash = Math.max(0, _flash - dt*1.8)` UNDER a `> 0` guard (:954,:957);
// visible when `_flash > 0.001` (:1555); rendered alpha `_flash * 0.75` (:1557).
//
// CORRECTION #1 (HIGH): there is NO Floor=0.004 snap-to-zero. That value was mis-lifted from iso.js trauma. The web
// decay floors at 0 NATURALLY via the max(0, ...) and the `> 0` guard. Do not reintroduce it.
// Per-frame order at the call site: Tick(dt) FIRST, then (if charging) FloorCharge(chargeT).

namespace Godzilla.Core.FX
{
    public struct KillFlash
    {
        public double Value;

        public void TriggerFull() { Value = 1.0; }                                       // setForm (entities.js:893)

        public void FloorCharge(double chargeT)                                           // Nova charge (entities.js:994)
        {
            double f = 0.25 + 0.35 * chargeT;
            if (f > Value) Value = f;                                                     // max-wins floor
        }

        public void Tick(double dt)                                                       // decay (entities.js:957)
        {
            if (dt > 0.05) dt = 0.05;                                                     // Kaiju.update clamps dt to 0.05 (entities.js:954) BEFORE the _flash decay 3 lines below; the game.js:113 0.1 clamp is on the outer accumulator, which then feeds update() in fixed 1/60 steps
            if (Value > 0)                                                                // `> 0` guard, no synthetic floor
            {
                Value -= dt * 1.8;
                if (Value < 0) Value = 0;                                                 // floors at 0 naturally
            }
        }

        public bool   Visible => Value > 0.001;                                           // entities.js:1555
        public double Alpha   => Value * 0.75;                                            // entities.js:1557
    }
}
