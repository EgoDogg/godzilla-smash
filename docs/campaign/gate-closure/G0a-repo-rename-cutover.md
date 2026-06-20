# G0a — Repo rename cutover: `Godzilla Game` → `godzilla-smash`

**Goal:** rename the repo dir to a **space-free** path so the MCP bridge works (both bridges forbid spaces) and Gradle/Xcode/Unity tooling stops being fragile. Audited to 100% coverage across in-repo, Unity-internals, and machine-level domains.

**Why a "cutover":** a running Claude session can't cleanly rename its own working directory — so in-repo edits land first (already committed `7a2da38`), then **you** run the move + machine-level migration, then you restart Claude at the new path and it finishes the cosmetic fixups.

## Prerequisites
- Clean git tree on `unity-port` (Step 1 of the plan is committed + pushed).
- Unity Editor + Hub **closed** for this project.
- ~10 minutes.

## What's already handled (no action)
- `tools/core-tests/gen-vectors.js` — the only runtime-breaking refs — are now **relative** (`7a2da38`); zero in-repo path edits remain.
- **Inside `GodzillaSmash/`: 100% safe** — all asset refs are GUID-based; `.csproj`/`.sln` are gitignored + regenerated; the only absolute paths are in regenerated `Library`/`.csproj` (recreated on reopen).
- Git history/branches/remote survive `mv` (the `.git` dir moves intact).

## Steps (you run these)

**1 — Pre-flight + back up the campaign memory**
```bash
cd "/Users/MGitk/Projects/Godzilla Game" && git status            # expect: clean, on unity-port
pgrep -lf "Unity.app/Contents/MacOS/Unity" | grep -i godzilla || echo "no unity on this project (good)"
cp -R ~/.claude/projects/-Users-MGitk-Projects-Godzilla-Game /tmp/godzilla-claude-backup   # safety copy
```

**2 — The move** (close any terminal/editor sitting *inside* the folder first)
```bash
cd /Users/MGitk/Projects && mv "Godzilla Game" godzilla-smash && ls -d /Users/MGitk/Projects/godzilla-smash/.git
```

**3 — Carry the Claude campaign memory to the new project key** (the in-repo `docs/campaign/` canon already moved with the repo; this preserves the recall layer + transcripts)
```bash
cp -R ~/.claude/projects/-Users-MGitk-Projects-Godzilla-Game ~/.claude/projects/-Users-MGitk-Projects-godzilla-smash
ls ~/.claude/projects/-Users-MGitk-Projects-godzilla-smash/memory/MEMORY.md   # confirm it copied
```

**4 — Unity: clean caches + re-add at the new path**
```bash
rm -rf /Users/MGitk/Projects/godzilla-smash/GodzillaSmash/Library /Users/MGitk/Projects/godzilla-smash/GodzillaSmash/Temp
```
Then in **Unity Hub → Projects**: remove the old "Godzilla Game" entry, click **Add**, select `/Users/MGitk/Projects/godzilla-smash/GodzillaSmash/`, open it once (Library regenerates — first open is slower; check the Console is clean). *(Hub registry `~/Library/Application Support/UnityHub/projectDir.json` updates when you re-add.)*

**5 — Restart Claude Code at the new path**
```bash
cd /Users/MGitk/Projects/godzilla-smash    # start your next Claude session HERE
```
Tell Claude: *"rename cutover done — finish G0a post-move fixups."*

## Post-move fixups (Claude runs, at the new path)
```bash
cd /Users/MGitk/Projects/godzilla-smash
git status && git log --oneline -3 && git branch -vv && git remote -v && git fsck --full && git worktree prune
node tools/core-tests/gen-vectors.js > /tmp/v.json && diff -q /tmp/v.json tools/core-tests/vectors.json && echo "Leg A loader OK at new path"
```
Then Claude: (a) update the ~16 **cosmetic** path references (`docs/campaign/*.md` resume anchors/examples, `docs/*.md`, `DEPLOY.md`) from `Godzilla Game` → `godzilla-smash`; (b) flip the boot-doc "Canonical anchoring" line to the new path + drop the "RENAME PENDING" note; (c) **re-issue the autonomous ScheduleWakeup** with a new-path resume prompt (the pending one embeds the old path — replace it or the loop wakes in a dead dir); (d) `grep -rI "Projects/Godzilla Game" . ~/.claude/projects/-Users-MGitk-Projects-godzilla-smash 2>/dev/null` should return only intentional history; (e) commit `docs(unity-campaign): post-rename path fixups`.

## You'll know it worked when
`git fsck` is clean + both branches present; Unity reopens with a clean Console; `~/.claude/projects/-Users-MGitk-Projects-godzilla-smash/memory/MEMORY.md` exists; a fresh Claude session at the new path reads the canon and orients correctly.

## Done-when → unblocks
Path is space-free → **G0 (MCP bridge) can install**. Not a ledger unit itself; it's the prerequisite for G0.

## Re-verify-on-the-day
None version-sensitive. Just don't skip the **memory copy** (step 3) or the **wakeup re-issue** (post-move d) — those are the two silent-orphan risks.

## Sources
Unity project relocation (close editor, move, re-add, Library regenerates): gamedevbeginner.com/how-to-move-or-copy-a-unity-project · Claude project keying (slug = cwd path, copy the slug dir to preserve memory): curiouslychase.com + github.com/anthropics/claude-code/issues/7009 · `git mv`/dir-move preserves history: git-scm.com/docs/git-mv. (All accessed 2026-06-20.)
