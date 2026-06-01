# MonsterVerse Godzilla — Evolution Ladder (art reference)

> Source: Haiku research workflow `monsterverse-evolution` (2026-06-01). Reference only — fully procedural canvas art, no external/copyrighted assets are shipped.
> **Tier 5 (Supernova 2027) is SPECULATIVE** — that film's Godzilla design is not public; it's an artistic extrapolation of the 2014 → 2024 trend toward a radiant/cosmic form.

| Tier | Form (Film/Year) | Skin Palette (Hex) | Dorsal Plates | Atomic Breath | Glow/FX | What Changed at a Glance |
|------|------------------|--------------------|---------------|---------------|---------|--------------------------|
| 1 | Godzilla (2014) | #3A3A3A–#4D4D4D | Tall, flat-topped fronds; dark charcoal-gray | Brilliant cerulean-blue, narrow beam | Faint blue glow during stress | Heavyset, quadrupedal-leaning stance. Brutalist, grounded. Deep crevices in hide. |
| 2 | Burning/Fire (2019) | #2A2A2A + #FF6600 heat cracks | Crystalline, serrated; glow bright cerulean | Deep blue (#0066FF), thicker concentric rings | Molten orange-red dorsal blaze; heat shimmer; cracks glow #FF6600–#FFAA00 | More upright. Leaner torso, longer neck. Dorsal spikes blaze. Furnace-form. |
| 3 | GvK (2021) | #3D3D3D + blue undertones | Sleeker blades; sharp edges, more numerous | Brilliant blue, thin precision laser-beam | Subtle blue glow; ridge fades silvery-blue at edges | Fully upright, humanoid posture. Less weathered. Breath gains laser focus. |
| 4 | Evolved/New Empire (2024) | #2B2B2B + pink iridescence (#FF1493–#FF69B4) | Short dense blade-line; dark slate w/ blue highlight | Deep cerulean, narrow precision | Pink bioluminescent striping; eyes glow pink-white; magenta-pink vortex breath; energy distortion aura | Peak physique, hyper-musculature. Forward-set eyes. Neon supernova-pink powered form. |
| 5 | Space/Supernova (2027) *(speculative)* | #1A0033 indigo + #9D4EDD violet + #FF006E magenta extremities | Crystalline geometric shards descending in size; photonic glow between plates | Stellar white-hot plasma w/ violet corona; spherical shockwave | Aurora pulse synced to heartbeat; photonic plate glow; cosmic dust trail; supernova corona | Slimmer, predatory. Breath shifts atomic → stellar fusion. Crown-sharp ridge. Galactic predator. |

## Procedural canvas rendering notes (cheapest → most expensive to animate)

1. **Skin base fill + crevice shadows** — fill ellipse/quad with tier hex; overlay vertical dark gradient for muscle/crevice depth. Cheapest.
2. **Dorsal plates (static silhouette)** — polygonal spike ridge via `beginPath()`+`lineTo`. Reuse shape; only swap fill/glow per tier.
3. **Glow aura** — `radialGradient` + `globalAlpha`, or canvas glow. Cost: blue < pink < cosmic (more layers).
4. **Eyes** — iris circle + pupil; scale/glow per tier. Moderate.
5. **Atomic breath beam** — T1–3: narrow rect + radial gradient. T4: add 2–3 pulsing concentric circles. T5: expanding spherical shockwave (radial gradient blue→violet→white). Priciest beam.
6. **Heat shimmer / bioluminescence (T2,4,5)** — animated sine-wave displacement or noise overlay via `globalCompositeOperation:'screen'`. High per-frame cost.
7. **Powered-form transition (→T4 pink, →T5 cosmic)** — cross-fade skin color over ~60 frames + ramp plate glow. Moderate.
8. **Supernova pulse (T5 only)** — plate bioluminescence 0–100% on a 2–3 Hz heartbeat; overdraw glow per pulse. Most expensive.

**Strategy:** cache static shapes (plate geometry, eye masks) to an off-screen canvas; per frame animate only color, glow intensity, and distortion layers. Target 60 fps via `requestAnimationFrame`; batch fills by color.
