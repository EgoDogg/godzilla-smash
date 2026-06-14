# Save System — Implementation-Ready Spec (backend-free, multi-slot)

Scope (Mike): **backend-free** (PWA stays static); **multiple named slots** (build now, default 3);
**export/import save-codes** = backup + portability + shareable identity (no login); IndexedDB
anti-loss; v3→v4 migration; reserved `prestige` per slot for a future **NG+** (don't build NG+ now).
Hardened by a 7-agent prep fleet (storage · durability+research · export · slots · migration · adversarial → synth). Full raw: `save-system-prep-raw.json`.

## ⚠️ The honest durability truth (corrects the first draft)
The IndexedDB mirror does **NOT** survive Safari/WebKit **ITP 7-day eviction** — WebKit deletes
localStorage, IndexedDB *and* Service-Worker registrations **together** after 7 days of no
interaction. So the layers are:
- **Tier 1 — reduce loss probability (best-effort):** localStorage (source of truth) + an
  IndexedDB *mirror* (covers an LS-only quota error / clear / corruption — **intra-origin only**)
  + `navigator.storage.persist()` (exempts the origin where granted) + a **PWA "Add to Home
  Screen"** nudge (installed PWAs have their own use-counter, exempt from the 7-day idle rule).
- **Tier 2 — the ONLY true guarantee:** the **export code** — it leaves the storage sandbox
  entirely (clipboard/notes/email). The UI must never say "saved" without "**on this device**".

## Architecture
- **One localStorage key** `godzilla-save-v4` = the whole container, written as a single atomic
  `setItem` (slots can't cross-corrupt; quota is all-or-nothing). Synchronous **source of truth**,
  read once at boot (`game.js:58`) — as cheap as today.
- **IndexedDB** db `godzilla` / store `saves` / record `{k:'container', rev, blob}` = a
  fire-and-forget **secondary mirror** (debounced ~5s, forced on pagehide/purchase). Read at boot
  **only** as a post-paint recovery fallback (async, never blocks).
- **Conflict authority = a monotonic container-level `rev` integer** (++ each persist) — immune to
  clock skew; `lastPlayed` is a human tiebreak only. Restore from IDB **only** when LS was
  absent/invalid/fresh AND `IDB.rev` is strictly higher (never clobbers a live session; any
  restore is visible: "Restored your save from device backup.").
- **All new logic folds into `js/economy.js`** (+ `U.crc32`/`U.b64u*` in `utils.js`) — no new
  file, so `sw.js` ASSETS + script load order are untouched (dodges the cache gotcha).
- **Slots keyed by STRING id** (`'s'+base36ts+'-'+rand`), never array index; `activeSlot` stores
  an id; delete/switch self-heal a dangling id.

### Schema v4
```js
localStorage['godzilla-save-v4'] = {
  v: 4, rev: <int>, activeSlot: <slotId>, migratedFrom?: 'v3',
  slots: [{
    id, name, createdAt, lastPlayed, lastBackupAt: 0, backupPromptSeen: false,
    prestige: 0,                       // RESERVED for NG+ (never read by current gameplay)
    game: { /* EXACTLY today's flat v3 shape minus the `v` field — 15 fields */ }
  }]   // 1..Cfg.SAVE.SLOTS
}
```

## The one required refactor (highest leverage)
Lift the body of `load()` (`economy.js:452-497`) **verbatim** into one pure
**`sanitizeGame(raw)→cleanGame`** — an **allowlist build** (emit a fresh object reading only the
15 known fields by name; never spread raw → prototype-pollution-proof; clamp every field). `load()`,
`switchSlot()`, and `importSlotCode()` all call it → an imported/migrated save can never carry a
state a normal load couldn't.

## economy.js API (key fns)
`sanitizeGame(raw)` · `applySlotToState(game)` (sanitize→assign→recompute collMult/moveMult→formAxis
toast) · `load()` (slot-aware, sync) · `save()` (writes the container, bumps rev, mirrors) ·
`listSlots()` (id/name/active/summary{forms X/20, ⚡power, lastPlayed}) · `switchSlot(id)` (flush→swap→
applySlotToState→spawnCity→rebuildPlayer→refresh) · `newSlot(name)` · `renameSlot(id,name)` ·
`deleteSlot(id)` (last→reseed+reset; active→switch to most-recent; +`_lastDeleted` undo) ·
`exportSlotCode(id)` · `parseSlotCode(raw)` · `importSlotCode(raw,target)` · `isPersisted()` ·
`durabilityStatus()→'green'|'amber'|'red'`.

## Migration v3→v4 (crash-safe, idempotent)
At boot, if `godzilla-save-v4` absent: wrap `godzilla-save-v3` as slot 1 (or `freshContainer()` for a
new player). **Keep the v3 key as a safety net**; only `removeItem('godzilla-save-v3')` on a
*subsequent* boot that re-parsed a well-formed v4 with `migratedFrom:'v3'` (read-back-verified — never
delete the only good copy after a failed v4 write). The gz-v26 "power rebalanced" toast still fires
once (preserve `_formAxisWasAbsent`).

## Export / import codes
`'GZS1:' + base64url(TextEncoder→UTF-8 JSON of {fmt,v,exportedAt,slot}) + '.' + crc32hex`. ~810 chars
for a maxed slot — pasteable. **base64 not LZ-string** (lz-string = a 3.4KB offline dep for ~250 chars
saved — loses; `GZS2:` is the escape hatch). **Unicode-safe** (TextEncoder/TextDecoder, never
`btoa(JSON)` — emoji slot names). Import: reject `len>20000` → charset regex → CRC32 → JSON.parse →
`sanitizeGame` → new slot (or confirm-gated overwrite). CRC = corruption-detection only; self-cheating
a single-player code is **accepted** (no leaderboard).

## Saves UI — a 5th shop tab
`<button data-tab="saves">Saves</button>` after Worlds (auto-wired by the generic `data-tab`
delegation; the shop already auto-pauses — ideal for destructive ops). `buildSaves(body)` reuses
`itemRow()`/`.shop-item`/`.buy`/`.tag` (no new CSS for MVP): a conditional **backup banner**
(+ red "won't keep your progress" variant when `durabilityStatus()==='red'`), the slot list
(summary + active marker), **Switch/New/Rename/Delete** (two-step *inline* confirm, never
`window.confirm`) + **Export (copy)/Import (paste)**, a durability chip, and a capacity footer.

## Rollout (6 phases, each verified on a fresh origin)
1. **v4 container + migration + the shared `sanitizeGame`** (no UI). 2. **Slot core API**. 3. **Saves
UI** (the tab). 4. **Export/import** (`crc32`/`b64u` + serialize + clipboard/paste + live pre-validate).
5. **Anti-loss** (IDB mirror + `asyncIdbRecover` + `persist()` gated on first engagement + the backup
nudge). 6. **Ship** (bump `sw.js` CACHE + `CACHE_VERSION` together).

## Test matrix (24 cases) — highlights
v3→v4 migration preserves progress + fires the rebalance toast once · corrupt-v3 → fresh, v3 kept ·
export→import round-trips + rejects a truncated/old/oversized code · IDB restore only when LS
fresh/absent & IDB.rev higher (never clobbers a live session) · delete-active switches to most-recent ·
delete-last resets · two concurrent tabs → slot-granular last-writer-wins, no field merge · quota
mid-write → sticky "NOT SAVING — Export now" · private-mode (IDB blocked) → silent LS-only.

## Risk register — the 6 highs (all mitigated)
1. *Mistaking the IDB mirror for eviction-proofing* → persist()+install+export are the PRIMARY layer.
2. *Restoring a stale IDB backup over good progress* → same-rev mirror + strict higher-rev-only restore.
3. *Malformed import corrupts memory* → the one shared allowlist `sanitizeGame`.
4. *Deleting the v3 safety-net after a failed v4 write* → read-back-verified reap on a later boot.
5. *`switchSlot` missing a re-sync step* → codified ordered sequence shared with `load()`.
6. *Accidental destructive op* → two-step inline confirm + a session undo for delete.

## Open decisions for Mike (all with a fleet recommendation)
1. **`persist()` / install-nudge timing** — cold boot vs gated on first engagement. **Rec: gate it**
   (a cold first-visit request is usually silently denied, burning the signal; re-attempt at milestones).
2. **Overwrite-on-import** — new-slot only vs new-default + confirm-gated per-slot overwrite. **Rec: both**
   (overwrite is the only sane behavior at 3/3 slots + "restore onto this device").
3. **Delete undo** — none vs a one-tap session-only undo (`_lastDeleted`, in-memory). **Rec: yes** (cheap;
   turns a mis-tap into a non-event).
4. **Backup-nudge aggressiveness** — passive banner only vs banner + contextual prompts (after first
   progress, at the finale, red on private-mode) + a 5-day staleness re-nudge. **Rec: the fuller set**
   (eviction is silent and ~7 days out; the 5-day cadence sits under the cap; never modal).

`Cfg.SAVE = { SLOTS:3, KEY_V4:'godzilla-save-v4', CODE_VERSION:1, EXPORT_PREFIX:'GZS1:', MAX_CODE_LEN:20000, BACKUP_NUDGE_MS:~5d, PRESTIGE_MAX:… }`.
