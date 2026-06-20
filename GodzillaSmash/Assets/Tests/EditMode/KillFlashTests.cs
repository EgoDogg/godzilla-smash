// Godzilla.Tests.EditMode/KillFlashTests.cs — headless NUnit gate for the Core kill-flash decay (spec Step 9a).
// References Core ONLY (no UnityEngine in the system under test). Proves correction #1: NO synthetic Floor=0.004 —
// the web decay floors at 0 naturally, and a long frame is clamped to 0.05s.

using NUnit.Framework;
using Godzilla.Core.FX;

namespace Godzilla.Tests.EditMode
{
    public class KillFlashTests
    {
        [Test]
        public void Decay_matches_web_rate_after_ten_frames()
        {
            var f = new KillFlash();
            f.TriggerFull();                                  // 1.0
            for (int i = 0; i < 10; i++) f.Tick(1.0 / 60.0);  // -1.8/s for 10/60 s
            Assert.That(f.Value, Is.EqualTo(1.0 - 10.0 * (1.0 / 60.0) * 1.8).Within(1e-12));
        }

        [Test]
        public void Decay_floors_at_zero_not_negative()
        {
            var f = new KillFlash { Value = 0.01 };
            f.Tick(0.05);                                     // 0.01 - 0.09 would be negative
            Assert.That(f.Value, Is.EqualTo(0.0));            // exactly 0, never below
            Assert.That(f.Visible, Is.False);                 // 0 <= 0.001
        }

        [Test]
        public void Long_frame_is_clamped_to_fifty_ms()
        {
            var f = new KillFlash();
            f.TriggerFull();
            f.Tick(0.2);                                      // dt clamped to 0.05 (entities.js:954) -> 1.0 - 0.09
            Assert.That(f.Value, Is.EqualTo(1.0 - 0.05 * 1.8).Within(1e-12));
        }

        [Test]
        public void FloorCharge_is_max_wins_and_alpha_is_three_quarter()
        {
            var f = new KillFlash { Value = 0.2 };
            f.FloorCharge(1.0);                               // 0.25 + 0.35 = 0.6 > 0.2 -> raises
            Assert.That(f.Value, Is.EqualTo(0.6).Within(1e-12));
            f.FloorCharge(0.0);                               // 0.25 < 0.6 -> no change (max-wins)
            Assert.That(f.Value, Is.EqualTo(0.6).Within(1e-12));
            Assert.That(f.Alpha, Is.EqualTo(0.6 * 0.75).Within(1e-12));
            Assert.That(f.Visible, Is.True);
        }
    }
}
