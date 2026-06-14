# Save System Plan — Backend-Free, Multi-Slot, Export/Import (2026-06-14)

Scope locked with Mike (AskUserQuestion): **backend-free** (static GitHub Pages PWA stays
static — no server, no auth, no third-party); goals = **backup/anti-loss + multiple save slots
+ shareable identity**; build **multiple slots now**; design the schema so a future **NG+/
prestige** loop layers on without another migration.

> **"Account / shareable identity" backend-free** = a **named slot** + its **exportable
> save-code string**. The code IS the identity you can back up, move to another device, or
> share — no login, no server, no personal data.

## Current state
`localStorage['godzilla-save-v3']` — a single object (money, clawsLevel, atk/moveSpeedLevel,
finisherOwned, ownedFormIds, activeFormId, maxReachedRow, world2Unlocked, muted, finaleSeen,
maxPowerSeen, formAxisSeen, peakCombo). `economy.js` save() (dirty-flag batched, flush on 2s +
pagehide) / load() (validates + clamps + sanitizes). Vulnerable to eviction (Safari ITP clears
localStorage after ~7 days idle; private mode; quota) — warns ONCE on a failed write, but no
backup, no portability, one slot.

---

## Architecture (all client-side)

### 1. Schema v4 — a slot container
```js
localStorage['godzilla-save-v4'] = {
  v: 4,
  activeSlot: <slotId>,
  slots: [
    { id, name: 'Save 1', createdAt, lastPlayed,
      prestige: 0,                 // RESERVED for a future NG+ loop (no migration needed)
      game: { /* exactly today's v3 state shape */ } },
    ...
  ]
}
```
- **One container key** = atomic writes; the blob is a few KB even with 3 slots. The game
  reads/writes `slots[activeSlot].game` — same shape economy.js already uses, just slot-keyed.
- **Migration v3→v4** (on load): if v4 is absent but `godzilla-save-v3` exists → wrap it as
  `slots:[{name:'Save 1', game:<v3>}]`, `activeSlot=that`. Keep the v3 key one version as a
  safety net (delete after a confirmed v4 write). A brand-new player starts with one empty slot.
- **Headroom:** `prestige` (per slot) reserved now so NG+ is a pure feature-add later.

### 2. Multiple slots (build now)
- Default **3 slots** (`Cfg.SAVE.SLOTS`, easy to raise). API in economy.js: `listSlots()`,
  `switchSlot(id)`, `newSlot(name)`, `renameSlot(id,name)`, `deleteSlot(id)`, `activeSlotId()`.
- Each slot shows a **summary**: name · forms X/20 · ⚡ power · last played. Switching reloads
  the game from that slot (re-`syncForm`, re-render, recompute collectionMult).

### 3. Export / import codes (backup + portability + shareable identity)
- **Export** the active slot → `'GZS1:' + base64(JSON.stringify(slot))` (+ a short checksum so
  import can reject corruption). Copy to clipboard (`navigator.clipboard`, with a select-the-
  textarea fallback). ~1KB string — fine to paste. *(Optional: LZ-string compression for a
  shorter code; base64 is the simple default.)*
- **Import** a pasted code → strip prefix → `atob` → `JSON.parse` → **validate + sanitize**
  (below) → load into a **new slot** (or overwrite a chosen one). This single feature delivers
  backup, cross-device portability (paste on the other device), AND shareable identity.

### 4. Anti-loss (backend-free durability)
- **IndexedDB mirror:** on every save, also write the container to IndexedDB. IndexedDB
  survives several eviction scenarios localStorage doesn't. On load, if localStorage is
  empty/older but IndexedDB has data → restore. Belt-and-suspenders, zero infra.
- **Backup nudge:** a contextual "Back up your save" banner in the Saves panel + a one-time
  prompt after the finale (Export button right there). Can't *prevent* eviction without a
  backend, so the export code is the user's guaranteed recovery path.

### 5. Validation / security
- Imported + loaded saves run the **existing load() sanitization, extended**: reject non-v4 /
  malformed / oversized strings; clamp `clawsLevel 0..64`; validate `ownedFormIds` against
  `Cfg.FORMS` (drop unknown — already done); force `gz2014` owned; valid `activeFormId`; clamp
  `maxReachedRow`; coerce numbers (no NaN/Infinity — the boot assert + clamps already guard).
- Single-player, no leaderboard → a user editing their own code to "cheat" is harmless and
  accepted. (If a leaderboard is ever added, that needs server-side validation — out of scope.)

### 6. UI — a "Saves" panel
A new shop tab **"Saves"** (or a dedicated modal): the slot list (summary + active marker) with
**Switch · New · Rename · Delete**, and **Export (copy code) · Import (paste code)** actions +
the backup banner. Reuses the existing shop chrome/CSS.

---

## Files touched
- `js/economy.js` — the slot container + migration + the slot API + export/import serialize/
  validate; save()/load() operate on the active slot; IndexedDB mirror.
- `js/ui.js` + `index.html` — the Saves panel (tab + list + buttons + paste textarea + banner).
- `js/config.js` — `Cfg.SAVE = { SLOTS: 3, KEY_V4: 'godzilla-save-v4', EXPORT_PREFIX: 'GZS1:' }`
  + `CACHE_VERSION` bump on ship.

## Rollout (phased, each verified)
1. **v4 container + migration** (no UI yet): v3→v4 wrap; verify an existing save loads intact.
2. **Slot core API** (economy): list/switch/new/rename/delete; active-slot read/write.
3. **Saves UI** (panel + slot CRUD).
4. **Export/import** (serialize + clipboard + paste + validate; round-trip + reject-malformed).
5. **Anti-loss** (IndexedDB mirror + restore + backup nudge).
6. Ship (cache bump + live poll). `prestige` reserved for NG+.

## Verification
Migration (v3 save → slot 1, progress intact + the gz-v26 rebalance toast still fires once);
slot CRUD; export→import round-trip preserves state + rejects a corrupted/old code; IndexedDB
restore (clear localStorage → game restores from IDB); no regression to the live loop, the
forms-axis multiplier, or the finale. Fresh-origin port per verify cycle.

## Open decisions (sensible defaults chosen; flag any)
- **Slot count:** default **3** — raise/lower?
- **Export format:** base64 (simple) vs LZ-string (shorter codes). Default base64.
- **IndexedDB mirror:** include it (recommended for real anti-loss) vs export-only. Default include.
- **Where the Saves UI lives:** a 5th shop tab vs a dedicated gear/profile modal. Default: shop tab.
- **Build now vs after the fidelity phase:** this is independent of Stream A/B — can slot in anytime.
