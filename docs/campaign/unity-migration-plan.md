# Godzilla Smash → Unity — Migration Plan & Research

> **Generated 2026-06-15** by a 21-agent dynamic research fleet (wf_2d9b1ec7-6e9: 8 recon lanes → adversarial dimension/art decide → 5 synthesis sections; ~1.5M tokens, web-researched + repo-grounded).
> **This round = research + PLAN ONLY** — no Unity code/scaffolding yet (Mike's scope choice).
> **Migration strategy:** keep the web PWA (gz-v32) **live**; build Unity **in parallel** to parity; nothing thrown away mid-flight.
> **Mike's drivers:** native iOS + Android app stores (Apple Team ID 83T4PJ5UV6) · cross-platform tooling/iteration · learning Unity. *(3D was explicitly NOT a driver.)*
>
> **The two delegated calls, adversarially verified and LOCKED:**
> - **Dimension → 2.5D sprites in a 3D scene** (orthographic iso camera + billboards + a ported `depthKey` sort). Confidence 88%.
> - **Art → bake the existing JS generators to Unity sprite atlases** (pixel-identical, zero runtime cost); keep the JS generator as an offline authoring tool; the live additive-glow FX layer is the real risk → a dedicated Phase-0 spike. Confidence 88%.
> - **The one load-bearing gate:** a one-form vertical-slice spike (one kaiju + one building + the `'screen'`-blend glow re-authored as URP additive, screenshot-diffed vs the live build, profiled on a low-end Android) decides hard-GO vs re-scope. Because the PWA stays live, a NO-GO costs only the spike, not the product.

---

## 1. Executive summary & recommended path

**Recommendation.** Port Godzilla Smash to Unity 6 LTS as a **2.5D sprite game in an orthographic 3D scene** (textured billboards on an XZ plane, depth driven by a custom per-entity sort key ported from `iso.js`'s `depthKey` — not Unity's default center-pivot sort), with art shipped as **pre-baked sprite atlases exported from the existing JS procedural generator** (the generator stays alive as an offline authoring tool; a native C#/Painter2D port is demoted to an optional, post-ship R&D spike that never blocks the critical path). The signature live additive-FX layer (`screen`-blend glow/beams/motes) is re-authored as **URP 2D additive sprites/particles** — its own first-class track, independent of the body-art pipeline. Keep the web PWA **live and shipping in parallel**, build Unity to parity, and migrate once — nothing thrown away mid-flight — gated by a mandatory **one-form vertical-slice spike** (walk + attack + one beam + live glow + damage text, atlas-baked, under the ported sort key, screenshot-diffed against the live build) **before** committing to the full parallel build. The web `GZS1:` export code remains byte-compatible so it doubles as the "bring your save to the app" bridge; there is otherwise no automatic web→app data migration (separate storage sandboxes, confirmed).

### Decisions

| Decision | Choice | Confidence | Why (one line) |
|---|---|---|---|
| **Dimension / renderer** | 2.5D sprites in a 3D scene — orthographic iso cam, custom `depthKey` sort | **88%** (choice); ~65% (clean-1:1-port cost) | Only target that reproduces the `y=(wx+wy)·HH−wz·WZ` look by construction; preserves the procedural sprite *output*; serves app-stores + tooling + learning without buying 3D scope Mike declined. |
| **Art pipeline** | Export JS bakers → Unity sprite atlases (B); keep JS generator as offline tool; native C# port (A) is a deferred, off-critical-path spike | **88%** | B satisfies every one of Mike's drivers; the "Canvas2D≈Painter2D 1:1" premise is false here (no blend-mode control, `ellipse()`, 60 animated `globalAlpha` sites); pre-baked atlas is the cheapest per-frame cost on low-end Android. |
| **Live FX layer** | Dedicated Phase-0 spike → URP 2D additive sprites/particles | high | The `screen`-blended glow/beam/mote layer is ~40% of the look, has no native sprite-pipeline equivalent, and is the same risk regardless of A vs B — name it as its own track or the build looks dead. |
| **Migration strategy** | Build Unity in parallel; keep PWA live; migrate once at parity; gate on a one-form spike first | high | Mike's stated default; the spike is the cheapest place to learn whether C# can hit Canvas2D fidelity before committing real time. |
| **Unity version / license** | Unity 6 LTS, **Personal** (free, no splash, no runtime fee) | high | Game has no real-money revenue → far under the $200k Personal cap; ships free to both stores indefinitely. |
| **MCP / Claude integration** | Two-channel: Claude Code on the repo (generate C# to disk) **+** one MCP bridge for in-Editor verify. Primary **IvanMurzak/Unity-MCP** (auto-generates Claude Skills, 70+ tools, Apache-2.0); fallback **CoplayDev/unity-mcp** (MIT, 10.8k★). | med (servers churn weekly — pin & re-verify) | MCP is for *verification + scaffolding*, not writing the game; generation budget goes to the logic-heavy C# the codebase is already 80% made of. |
| **Architecture** | `.asmdef`-layered core (`Core` pure-C#, no `UnityEngine` → `Data` SO → `App` MonoBehaviour adapters); logic out of MonoBehaviours | high | Matches Mike's existing MVVM discipline; makes the ~1,100 lines of pure economy/world/entity logic headlessly NUnit-testable and the port mechanical, not a redesign. |
| **Data / save** | FORMS → 20 ScriptableObjects + `FormDatabase`; balance → `balance.json`; save → one atomic JSON file in `persistentDataPath` (**not** PlayerPrefs, **not** JsonUtility — use System.Text.Json/Newtonsoft); `double`/`long` money (never `float`/`int`); port `sanitizeGame` + `rev` + slot API verbatim | high | Values exceed int/float range (ROW_HP 1e9, WORLD2 12e9); JsonUtility can't hold the FORM_BONUS dict or the absence-sensitive migration flags. |
| **Cloud save** | Native iCloud KVS + Play Games Saved Games via a single wrapper (gilzoide/unity-cloud-save); `rev` = newer-wins; `GZS1:` code as universal manual fallback. Skip UGS unless other UGS modules earn their place. | med | Lowest-cost, no-server, store-native for a solo dev; the `rev` conflict field was already designed for exactly this. |
| **Feel-system gotcha** | Keep the C# **trauma-shake scalar math** verbatim, drive Cinemachine noise amplitude with it (don't adopt Impulse's model wholesale) | high | The anti-compounding clamp + exponential decay was specifically engineered to fix a quake bug; Cinemachine's default signal model will feel wrong until tuned — preserve by construction. |
| **Audio** | Bake SFX to clips + parametric pitch/lowpass scaling; **delete the entire iOS WebAudio keepalive apparatus** | high | Unity's native audio engine has no idle-suspension problem; only ~5 lines of `OnApplicationFocus` interruption handling remain. Add haptics (Nice Vibrations) as a pure mobile upgrade. |
| **Monetization (v1)** | Ship with **no real-money IAP**; document Unity-IAP hooks (cosmetics/remove-ads only) for later | high | Sidesteps App Review 3.1.1 / StoreKit / Play Billing entirely; the bounded economy *forbids* selling the power track (it ends the game faster). |

### Effort & timeline shape (solo dev + Claude)

The work splits into three cost classes, and the order matters:

1. **Phase 0 — de-risk (spike-or-die, ~1–2 weeks).** The one-form vertical slice + the FX-layer additive spike on a real low-end Android device. This is a true gate: if C# can't hit Canvas2D fidelity or the glow re-author doesn't hold, the whole cost story changes — and this is where the ~65% confidence on "clean 1:1 port" actually gets resolved. **Do not commit the parallel build until this passes.**
2. **The dominant cost — the engine port to parity (the bulk; weeks→a few months of part-time solo work).** Ported as first-class, *tested* tasks (not footnotes): the `depthKey` sort, atlas/material strategy, an on-device overdraw/fill-rate budget, the FX re-author, the `wz·WZ`-as-screen-Y flyer-constant-size invariant, per-form bake-fidelity verification. The logic-heavy two-thirds (config→SO/JSON, economy/combo/power, world FSM + single-damage-entry, entities locomotion/targeting/attacks, save container) ports *well* and is exactly where Claude's generate-to-disk mode is strongest — these are pure, deterministic, NUnit-testable classes. The genuine rewrites are the renderer, input (Input System), shop DOM (Unity UI), and audio. "Parity" is defined against the tested invariants above, **not** against "sprites render in an iso scene."
3. **The store-delivery leg (~5–8 working days of effort over ~2–3 calendar weeks, mostly Apple/Google review waits).** Accounts (~$124 yr-1: Apple $99/yr + Google $25 one-time; Unity $0; CI $0 on Mike's own Mac), Player Settings/signing/keystore, two store listings + age questionnaire + "Data Not Collected" privacy. Claude owns the automation end-to-end: `BuildScript.cs` (batchmode) + Fastlane + a GitHub Actions self-hosted-runner on the Mac. **One live-spike caveat (per Mike's own lesson): activate the Unity license headlessly with a real token by hand once before trusting any CI YAML** — it's the #1 silent CI failure.

The realistic shape: a short, decisive de-risk spike → a long logic-port-plus-renderer-rebuild that Claude can carry most of → a short bureaucratic delivery tail. Money cost is trivial; **time is the only real cost**, and it lives almost entirely in the engine port, not in tooling or distribution.

### Open questions for Mike

1. **Unity license tier for headless CI** — confirm Personal supports headless activation on the self-hosted runner before wiring GameCI (the activation step differs Personal vs Pro).
2. **Apple date gates** — (a) the Jan 31 2026 age-rating questionnaire (the *new* app answers it at submission, but your *existing* iOS apps under Team 83T4PJ5UV6 may need a 2-minute check); (b) the **Apr 28 2026 Xcode 26 / iOS 26 SDK build floor** — install a Unity 6 minor whose iOS toolchain is Xcode-26-compatible before submitting after that date (the exact Unity↔Xcode-26 version mapping was not pinnable in mid-2026 sources — verify at port time).
3. **Spike acceptance bar** — how close to pixel-identical must the one-form slice be to count as "fidelity passed"? Define the screenshot-diff threshold now so Phase 0 has a clear pass/fail.
4. **MCP server choice** — comfortable starting on IvanMurzak/Unity-MCP (richest + Claude-Skills auto-gen) with CoplayDev as fallback, or prefer the more-tutorialed CoplayDev as primary? (Both install side-by-side, zero conflict.)
5. **Cloud save scope for v1** — ship native iCloud/Play-Games cloud save at launch, or launch with local-file + `GZS1:` manual codes only and add cloud as a fast-follow?
6. **Monetization intent** — confirm v1 ships with zero real-money IAP (recommended). If there's any near-term plan to sell cosmetics/remove-ads, it changes the privacy declaration and adds StoreKit/Play-Billing work to the delivery leg.

## 2. Unity MCP & Claude integration — setup + workflow

This is the "everything MCP-able" deliverable. It covers the ranked MCP-server pick, concrete macOS setup + Claude Code wiring you can run today, the security model, the division of labor between Claude and you, the complementary Unity-side AI tooling, and a Day-1 toolchain checklist.

**Verification note (mid-2026):** versions below were pulled live from the GitHub release pages on 2026-06-20. The Unity-AI / Unity-MCP ecosystem ships weekly — treat exact version numbers as "as-of-this-week" snapshots and pin-check the day you install. Architecture and capability claims are stable.

---

### 2.1 The MCP picture in one paragraph

Connecting Claude to Unity is a **two-channel** setup, and you want both channels for different jobs:

1. **Generate-to-disk** — Claude Code operates on the checked-out Unity repo like any code project, editing C# files directly. This is where the bulk of the port happens (logic, ScriptableObjects, editor scripts, shaders, CI) and where Claude is strongest.
2. **Drive-the-Editor over MCP** — one MCP bridge lets Claude *observe and verify inside the live Editor*: read the console, enter Play Mode, screenshot, run tests, execute menu items, manipulate assets/GameObjects.

> **Key mental model:** MCP is **not** the thing that writes your game — it's the thing that lets Claude *see whether the C# it wrote on disk actually works*. Spend the MCP budget on verification + scaffolding; spend Claude's generation budget on the logic-heavy C# your codebase is already 80% made of. This is the Unity analog of the fresh-port-preview + composite-screenshot verify loop you already run on the web build.

One structural fact that trips everyone up: the original, most-starred **justinpbarnett/unity-mcp was sold to Coplay (~Aug 2025)** and now lives as **CoplayDev/unity-mcp**. Any 2025-era tutorial pointing at the old repo is stale-by-redirect. And there are three different "Coplay" things people conflate — the paid in-editor assistant (**Coplay**), the paid external bridge to its 86 tools (**Coplay MCP**), and the free MIT open-source bridge (**CoplayDev/unity-mcp**). Only the last one matters here.

---

### 2.2 Ranked recommendation (open-source, free, Mac, solo dev)

| Rank | Server | License | Maturity (2026-06-20) | Why this rank |
|---|---|---|---|---|
| **#1** | **IvanMurzak/Unity-MCP** ("AI Game Developer") | Apache-2.0 | 3.2k★ · **v0.81.1, Jun 19 2026** · 167 releases, ships ~daily | Best fit for *your* goals — see below |
| **#2** | **CoplayDev/unity-mcp** ("MCP for Unity") | MIT | **10.8k★ · v9.7.3, Jun 15 2026** | The safe mainstream pick / best fallback |
| skip-as-primary | CoderGamester/mcp-unity | MIT | 1.8k★ · v1.3.0, Apr 2026 | Solid, but its "Allow Remote Connections" binds `0.0.0.0` — a footgun on shared Wi-Fi |
| reference-only | AnkleBreaker-Studio/unity-mcp-server | **non-OSI** (no resale) | ~281★ · v2.30, Jun 2026 | Widest tool surface (~280), but the non-standard license is a poor base for a project you may ship commercially |
| revisit later | Unity **official** MCP (`com.unity.ai.assistant`) | Unity | pre-release/beta | Best security model (human-approval gate), but **gated behind a Unity subscription** — revisit once you're paying Unity anyway |

**Primary — IvanMurzak/Unity-MCP**, for five concrete reasons that map to your stated drivers (app-stores · tooling · learning · "everything MCP-able"):

- It **auto-generates Claude Code Skills** tailored to your Unity version + installed packages — this *is* the "deep Claude/Unity integration" goal, made literal.
- **70+ tools** including profiling and **call-any-C#-method** (`[AiTool]` turns any method into an MCP tool in one line) — the most capable OSS option without a license asterisk.
- The **only OSS server with a documented auth model** (bearer token, `none`/`required` modes) — matters the day you expose the HTTP transport.
- Clean `claude mcp add` CLI wiring, no Unity subscription, truly free.
- Ships daily, so it tracks Unity changes fast.

**Secondary — CoplayDev/unity-mcp.** Install it alongside (zero conflict). 10.8k★ means the most tutorials and the smoothest one-click Claude Code setup; it's the stable rock if #1's daily churn ever bites. Roslyn script validation + Test Runner are first-class. With both installed you can A/B which one handles a given task better.

---

### 2.3 Concrete macOS setup (~10 min, do this)

**Assumes:** Apple-Silicon Mac, Unity 6 LTS project checked out and git-clean, Claude Code on the PATH.

**Primary — IvanMurzak/Unity-MCP**
1. In your Unity project, install via OpenUPM:
   ```bash
   npm i -g openupm-cli            # if not already installed
   openupm add com.ivanmurzak.unity.mcp
   ```
   (Or import the `.unitypackage`, or `npm i -g unity-mcp-cli && unity-mcp-cli install-plugin ./GodzillaSmash`.)
2. In Unity: open **`Window → AI Game Developer`**, click **Auto-generate Skills** (writes Claude Code Skills scoped to your Unity version + packages). CLI equivalent: `unity-mcp-cli setup-skills claude-code ./GodzillaSmash`.
3. In a terminal at the project dir, wire Claude Code to the prebuilt server binary (Apple-Silicon path — swap `osx-x64` if Intel):
   ```bash
   claude mcp add ai-game-developer \
     "<unityProjectPath>/Library/mcp-server/osx-arm64/gamedev-mcp-server" \
     port=8080 client-transport=stdio
   ```
4. Keep auth `none` for localhost-only. If you ever switch to `streamableHttp` beyond your machine, pass `--token`.
5. **Smoke test from Claude Code:** ask *"list the GameObjects in the open scene"* → a real answer confirms the bridge is live.

**Secondary — CoplayDev/unity-mcp** (install alongside, zero conflict)
1. Unity → Package Manager → `+` → **Add package from git URL**:
   ```
   https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main
   ```
   (use `#beta` for the beta channel)
2. Unity → **`Window → MCP for Unity → Configure All Detected Clients`** — this auto-writes the Claude Code config for you (no hand-edited JSON).
3. Restart Claude Code; both servers are now available.

**Per-project hygiene file:** add a short `CLAUDE.md` at the Unity project root documenting the asmdef layout and the rule *"logic lives in `Godzilla.Gameplay`, MonoBehaviours are thin adapters, MCP is for verification."* Same project-gotchas pattern you already maintain on the web build.

---

### 2.4 Security & permission caveats (read before the first agent session)

Every open-source server here can **edit scripts and assets with no per-action confirmation** — treat them as full write access to the project. (Unity's official server is the lone exception: it has a real "Pending Connection → Accept" consent gate, which is its main selling point and the reason to revisit it later.)

Non-negotiable hygiene:
- **Git is your safety net.** Run MCP only against a **git-clean** Unity project, and **commit before every agent session**. A bad batch of edits is then one `git reset` away.
- **Never enable any "remote / 0.0.0.0" binding** on a laptop on shared Wi-Fi (this is the specific reason CoderGamester is not the primary pick). Keep transports localhost-only; if you must go HTTP, set a bearer token (`--token`, IvanMurzak supports this).
- **`Library/` stays gitignored** (cached, not committed) so `Packages/manifest.json` changes from MCP `add_package` calls show up as reviewable diffs and `Library/` churn doesn't.
- **Don't let MCP author binary `.asset` files blind.** Prefer the text-first authoring path in §2.6 (Claude edits JSON → a deterministic Editor command regenerates the SOs) so every change is a reviewable git diff, not an opaque binary write.

---

### 2.5 The Claude-centric dev loop — what Claude drives vs. what stays human

**The 3-level verify gate Claude runs itself between tasks** (the Unity analog of your web composite-screenshot verify):
- **L1 — compile check:** scan the Editor console for compile errors via MCP (fast, catches most regressions).
- **L2 — runtime check:** briefly enter Play Mode, watch for runtime exceptions.
- **L3 — visual check:** screenshot for visual confirmation of actual behavior.

**Claude drives (generation + verification):**
- **C# gameplay logic** — porting `entities.js` locomotion/targeting, `world.js` building FSM, `economy.js` money/upgrade/combo/save. Pure, deterministic, testable — Claude's strongest mode.
- **ScriptableObject schema + importer** — turning `config.js` (FORMS, ROW_HP, balance) into SOs + a JSON-ingesting Editor command.
- **Editor scripts** — `[MenuItem]` tools, custom inspectors, build hooks, data validators.
- **Refactors & shaders** — large mechanical refactors; the URP 2D additive material/particles for the `screen`-blend glow layer (the Phase-0 FX spike).
- **EditMode unit tests** — especially the bounded-economy invariant (`clawsCost === CLAWS_MULT × attackPower`) and the `FORM_BONUS`-sums-to-63 assertion, both ported from the web boot checks.
- **CI/build glue** — `BuildScript.cs`, GameCI workflow YAML, the `Fastfile`, version bumping.
- **L1/L2/L3 verification** over MCP between every task.

**Stays human (taste + first-time setup):**
- **Scene composition / level layout / camera framing** — Claude can scaffold GameObjects via MCP, but final spatial composition is yours.
- **Physics/feel tuning** — drag, gravity, collider sizing, hit-stop timing, and above all the **trauma-shake re-author** (the one feel system that doesn't port mechanically). Claude proposes values; you feel-test side-by-side against the live PWA. This is exactly the "is this too complex?" iteration-discipline gate — subjective feel calls don't converge by delegation.
- **Apple/Google first-time signing, provisioning, and store-listing creative.**
- **The one-form vertical-slice spike's go/no-go fidelity call** (per the locked dimension decision).

---

### 2.6 How Claude authors your data (the part you specifically asked to document)

Two layered paths — **do path 1 by default, add path 2 when you want live-Editor manipulation:**

1. **Text-first (deterministic, no running Editor — ideal for autonomous/headless runs).** Claude edits `balance.json` and a `forms.json` manifest as plain text (diff-friendly, what it's good at). Ship a one-click Editor command **`Godzilla → Rebuild Form Assets`** that reads the manifest and emits the 20 `FormDefinition` `.asset` files via `ScriptableObject.CreateInstance → AssetDatabase.CreateAsset → SaveAssets`. The **JSON is the editable source; the SO is a build artifact** — this sidesteps SO YAML-merge pain entirely and keeps every change reviewable. Run it from CI too: `Unity -batchmode -quit -executeMethod FormAssetBuilder.Rebuild`.
2. **Live-Editor (interactive).** With IvanMurzak or CoplayDev connected, Claude can create/modify ScriptableObject assets *in a running Editor* through MCP asset-management tools. Use this when you want Claude to drive the live Editor interactively; keep path 1 as the source of truth for anything that must be deterministic and reviewable.

---

### 2.7 Complementary Unity-side AI tooling (current state)

**Verify against your training: Unity Muse is retired.** Unity 6.2 (Aug 2025) folded Muse + Sentis into **"Unity AI"**, in open beta for Unity 6 developers as of 2026.

| New (Unity 6.2+) | What it does | Relevance to you | Cost |
|---|---|---|---|
| **AI Assistant** (`com.unity.ai.assistant`) | In-editor agentic assistant; **hosts the official MCP server** | Adopt mainly as the *host* for the official MCP server once you're on a paid tier | Needs a Unity subscription; MCP via external client does **not** burn AI credits |
| **Generators** (`com.unity.ai.generators`) | Prompt-to-sprite / spritesheet, pixel-art style models | Secondary — your art is procedural; keep this for one-off icons/props | Meters on Unity Points |
| **Inference Engine** (ex-Sentis) | On-device neural nets | Not needed for this game | Runtime feature |
| **Unity Behavior** | Node-based behavior trees | Skip — your targeting is data-driven C# that ports better as plain C# | Free package |

**Recommendation:** treat Unity AI Assistant primarily as your eventual MCP host; don't pay for behavior-tree assets (NodeCanvas/Behavior Designer) — your logic is plain C# and that's the Claude-friendly form; keep Generators in your back pocket for one-off textures, not as the core art pipeline.

---

### 2.8 Day-1 toolchain checklist

- [ ] Create the Unity 6 LTS project; commit it git-clean; add `Library/` to `.gitignore`.
- [ ] Add a project-root `CLAUDE.md`: asmdef layout (`Godzilla.Core` / `.Gameplay` / `.Presentation` / `.Editor` / `.Tests`) + "logic out of MonoBehaviours, MCP is for verification."
- [ ] Install **IvanMurzak/Unity-MCP** via OpenUPM → **Auto-generate Skills** → `claude mcp add ai-game-developer …` → smoke-test *"list the GameObjects in the open scene."*
- [ ] Install **CoplayDev/unity-mcp** alongside → **Configure All Detected Clients** → restart Claude Code. Now A/B-able.
- [ ] Confirm the security posture: localhost-only transports, **no `0.0.0.0`**, commit-before-session habit.
- [ ] Scaffold the **text-first data path**: `balance.json` + `forms.json` + a `Godzilla → Rebuild Form Assets` Editor command (also runnable in batchmode).
- [ ] Stand up one **EditMode test** (the `clawsCost === CLAWS_MULT × attackPower` invariant + `FORM_BONUS`-sums-to-63) so the L1 gate has teeth from day one.
- [ ] Have Claude run a first **L1/L2/L3 verify** on a trivial change to prove the loop works end-to-end.
- [ ] (Defer) Revisit Unity's **official MCP server** for its human-approval consent gate once you're on a paid Unity tier and would be paying anyway.

**Pin-check before relying on anything:** IvanMurzak **v0.81.1 (Jun 19 2026)** and CoplayDev **v9.7.3 (Jun 15 2026)** were current on 2026-06-20; both bridges ship weekly, so re-verify the version the day you install.

**Sources:** [IvanMurzak/Unity-MCP releases](https://github.com/IvanMurzak/Unity-MCP/releases) (v0.81.1, Jun 19 2026) · [CoplayDev/unity-mcp releases](https://github.com/CoplayDev/unity-mcp/releases) (v9.7.3, Jun 15 2026; 10.8k★) · [Unity blog — Unity MCP Server: connect Claude Code & other agents](https://unity.com/blog/unity-ai-mcp-how-to-get-started) · [Unity docs — Unity MCP overview (`com.unity.ai.assistant`)](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.7/manual/integration/unity-mcp-get-started.html) · [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity) · [Claude Lab — Claude Code × unity-mcp game-dev workflow](https://claudelab.net/en/articles/claude-code/claude-code-unity-mcp-game-dev-workflow) · [CG Channel — Unity AI in Unity 6.2 (Muse/Sentis retired)](https://www.cgchannel.com/2025/08/unity-rolls-out-unity-ai-in-unity-6-2/) · [PocketGamer.biz — Coplay takes over Unity MCP](https://www.pocketgamer.biz/coplay-takes-over-unity-mcp-as-it-reaches-key-milestones-with-public-beta-launch/).

## 3. Target Unity architecture & system-by-system migration map

This section is the engineering backbone of the migration. It defines the Unity project skeleton, the assembly-definition (`.asmdef`) layering that keeps game logic out of `MonoBehaviour`s, and a subsystem-by-subsystem map from each of the 15 web modules to its concrete Unity target — package, type/API, whether it **carries as design/data** or is **rebuilt**, and the risk that lives in that cell. It closes with the procedural-art port treated as its own engineering track, because it is the single largest risk in the plan.

**Target platform baseline (locked from research):** Unity **6.3 LTS** (6000.3, released Dec 2025), **URP 2D Renderer**, **Input System 1.14+**, **Cinemachine 3.1.x**, IL2CPP + ARM64 for both stores, **Unity Personal** (free, no splash, under the $200k cap). Unity 6.3 specifically is the floor because it ships the **"Sort 3D As 2D" Sorting-Group option + Transparency Sort Axis** — which is exactly the mechanism that makes the locked 2.5D-sprite/iso depth model native instead of hand-rolled (this was the dimension decision's flagged-unconfirmed risk; **confirmed resolved** as of Unity 6.3, Dec 2025 — see sources).

### 3.1 Guiding architectural principle — *logic out of MonoBehaviours*

The web codebase is already in the right shape for this: every module is a pure IIFE closure with a private state object and a public API, with rendering/DOM as the only Unity-incompatible surface. The port preserves that seam. The rule for the entire migration:

> **`Godzilla.Core` and `Godzilla.Gameplay` contain zero `using UnityEngine`.** All economy math, save container, combo, locomotion, targeting, world-gen, and the FSM are plain C# classes runnable headless under NUnit. `MonoBehaviour`s are thin *adapters* in `Godzilla.Presentation`/`Godzilla.App` that pump those classes from `FixedUpdate`/`Update`, raise C# events, and own all engine I/O (rendering, input devices, files, audio).

This mirrors Mike's existing Swift/Flutter MVVM discipline, keeps the verify-loop compile-tight (only the touched assembly recompiles), enforces dependency direction, and makes the future KMP-style portable-core real in C#. It is also what makes the project *Claude-friendly*: the bulk of the port is logic-in-plain-C#, which Claude generates and headlessly tests far better than scene/feel work.

### 3.2 Recommended Unity project layout

```
GodzillaSmash/                         (Unity 6.3 LTS project root, git)
├─ Assets/
│  ├─ Scripts/
│  │  ├─ Core/                Godzilla.Core.asmdef        — NO UnityEngine ref
│  │  │   ├─ Math/            Fmt, Clamp, Lerp, Shade, Mulberry32, Hash32, Crc32, B64u
│  │  │   ├─ Economy/         PowerCalculator, EconomyService, ComboTracker
│  │  │   ├─ Save/            SaveContainer, SaveSlot, GameData, SaveContainerService, SaveCodec, Sanitizer
│  │  │   ├─ World/           CityGenerator, BuildingFsm, DamageRouter (hitBuilding), RareSpawnTable
│  │  │   ├─ Entities/        KaijuSim, Locomotion, TargetAcquisition, AttackKinds, Finisher, DoT
│  │  │   └─ Iso/             IsoMath (worldToScreen/screenToWorld/depthKey), TraumaModel
│  │  ├─ Data/                Godzilla.Data.asmdef        — UnityEngine, data only
│  │  │   ├─ FormDefinition.cs, FormDatabase.cs (ScriptableObjects)
│  │  │   ├─ BalanceConfig.cs (POCO loaded from balance.json)
│  │  │   └─ SoToCoreAdapter.cs
│  │  ├─ Presentation/        Godzilla.Presentation.asmdef — UnityEngine + URP + Cinemachine
│  │  │   ├─ KaijuView.cs, BuildingView.cs, FlyerView.cs (MonoBehaviour adapters)
│  │  │   ├─ Camera/          IsoCameraRig (Cinemachine + ported trauma scalar)
│  │  │   ├─ Fx/              FxDirector (ParticleSystems, beams, kill-flash)
│  │  │   ├─ Hud/             ComboPip, BossBar, FinaleBeacon, ShopView (UI Toolkit / UGUI)
│  │  │   └─ Input/           InputReader (Input System → Intent struct)
│  │  ├─ App/                 Godzilla.App.asmdef
│  │  │   ├─ GameBootstrap.cs (boot asserts, scene wiring)
│  │  │   ├─ Persistence/     FileSaveStore, CloudSaveMirror (iCloud KVS / Play Games)
│  │  │   └─ Audio/           AudioDirector (AudioMixer + pooled AudioSources), Haptics
│  │  └─ Editor/              Godzilla.Editor.asmdef
│  │      ├─ FormAssetRebuilder.cs (forms.json → FormDefinition .assets, MenuItem + batchmode)
│  │      ├─ AtlasBaker.cs (offline procedural-bake → sprite atlas; see §3.5)
│  │      └─ BuildScript.cs (PerformiOSBuild / PerformAndroidBuild, [MenuItem]-mirrored)
│  ├─ Data/Forms/             20 × FormDefinition .asset + FormDatabase.asset
│  ├─ Data/balance.json       scalar balance (source of truth, diffable)
│  ├─ Art/Atlases/            baked sprite atlases (Git LFS)
│  ├─ Settings/               URP 2D Renderer asset, Input Actions, AudioMixer
│  └─ Tests/
│      ├─ EditMode/           Godzilla.Tests.EditMode.asmdef → refs Core only (headless)
│      └─ PlayMode/           Godzilla.Tests.PlayMode.asmdef
├─ Packages/manifest.json     (committed — MCP add-package diffs reviewable)
├─ ProjectSettings/
├─ CLAUDE.md                  (asmdef map + "logic lives in Core/Gameplay" rule)
└─ .gitignore                 (Library/, Temp/, Build/ excluded; LFS for art/atlases)
```

**Assembly dependency direction (one-way, enforced by `.asmdef` references):**
`Core` ← `Data` ← `Presentation` ← `App`; `Editor` → (`Data`, `Core`); `Tests.EditMode` → `Core` only. `Core` references nothing Unity. Anything that needs `UnityEngine.Object` lives in `Data` or above. This is the single most important convention — it is what keeps the formula/save/sim layer testable in CI in seconds and prevents the "one giant global namespace" that the JS build is (defensibly) today.

### 3.3 System-by-system migration map

Verdict legend: **DATA** = authored asset, no logic change · **DESIGN** = logic/algorithm carries, rebuilt in C#/engine idioms · **REBUILD** = no code carries, only the behavior contract · **DROP** = removed, replaced by native packaging. "Bit-exact" flags ports where the C# must reproduce the JS byte-for-byte (same-city determinism or save-code cross-compatibility).

| # | Web module (LOC) | Unity target — package · type/API | Verdict | Notes / risk |
|---|---|---|---|---|
| 1 | **config.js** (308) — FORMS×20, ROW_HP, balance, SPECIALS | **`FormDefinition`/`FormDatabase` ScriptableObjects** (20 `.asset`) for forms; **`balance.json` → `BalanceConfig` POCO** for scalars | **DATA** | Forms are SOs (hold future Sprite/Material refs — the data↔asset seam); scalars stay JSON (UnityEngine-free Core + clean git diffs on weekly retunes). **Risk: numeric type — use `double`/`long`, never `float`/`int`** (ROW_HP→1e9, WORLD2_COST 12e9 overflow int32; float corrupts payouts >16.7M). Claude edits `forms.json`→Editor regen, no running Editor needed. |
| 2 | **utils.js** (117) — fmt/clamp/shade/rng/hash/crc32/b64u | **`Godzilla.Core/Math/`** static classes; `System.IO.Hashing.Crc32` optional | **DESIGN** (trivial) | `fmt/clamp/lerp/shade` = one-liners. **Bit-exact required:** `mulberry32` + integer `hash` (same-city determinism, §6) and `crc32`+`b64u` (GZS1 cross-compat, §7). Port the JS crc32 table verbatim; UTF-8 via `Encoding.UTF8` so emoji survive. |
| 3 | **iso.js** (273) — projection, camera, trauma-shake, cull | **`IsoMath`** (Core, pure) + **Cinemachine 3.1** vcam for follow/confine | **DESIGN** | Keep the 2:1 algebra and `depthKey` as C# (drives the sort key, §9). Follow/clamp → Cinemachine `PositionComposer` + `CinemachineConfiner2D` (deletes ~60 LOC). **Risk: trauma-shake is a re-author, not a port** — keep the trauma scalar (clamp-on-add + exp-decay, the anti-quake bug fix) in C# and feed it to `CinemachineBasicMultiChannelPerlin` amplitude; do NOT use raw Impulse defaults (different feel). |
| 4 | **art engine** — assets.js (559) + archetypes.js (1755) + sprites_special.js (811) | **Offline bake → sprite atlas** (Editor `AtlasBaker`) consumed by `SpriteRenderer`; **live FX → URP 2D additive sprites/particles** | **REBUILD** (the central track) | See **§3.5**. Body art bakes once to atlas (B, locked art decision); the live `drawGlow`/mote/`_flash` `screen`-blend layer (~40% of the look) re-authors as URP additive material — **independent of A/B and the true risk**. Preserve §1.6 bake guardrails + the authored-5-mirror-3 facing scheme as port constraints. Data (palette/shape/BANDS) carries. |
| 5 | **entities.js** (1672) — locomotion, AI targeting, 5 attack kinds, finisher, DoT, FX pool | **`KaijuSim`** (Core, pure) + **`KaijuView`** adapter; FX pool → **`ParticleSystem`** + pooled prefabs | **DESIGN** | Locomotion/collision/targeting-priority/attacks/finisher/DoT/jump-vs-hover are clean logic → Core. **Don't port the Canvas2D draw or the 320-particle pool** — Shuriken pools itself; per-kind VFX prefabs (LineRenderer beams, projectile prefabs). Preserve: muzzle-must-match-glow coupling, level-triggered re-fire gate decoupled from anim, `spawnRewardText` firing from `destroy()`. ParticleSystem over VFX Graph (mobile fill-rate). |
| 6 | **world.js** (864) — city gen, lifecycle FSM, single damage entry, off-screen respawn | **`CityGenerator` + `BuildingFsm` + `DamageRouter`** (Core); **`BuildingView`** adapters; picking → **`Physics2D.OverlapPoint`** on silhouette colliders | **DESIGN** | FSM (standing→crumbling→rubble→respawning), **single-damage-entry discipline (`hitBuilding`)**, off-screen-respawn gate, rare-spawn table all carry. **Bit-exact** mulberry32+hash for identical city (else algorithm carries, layout differs — acceptable). **Risk: sprite-hitbox picking must use silhouette Collider2D + OverlapPoint, NOT pick-by-cell** (loses "tap the tower's crown"). `Math.floor` not bitwise (big HP). |
| 7 | **economy.js** (1563) — power/combo + v4 save + GZS1 codes + shop DOM | **`PowerCalculator`/`EconomyService`/`ComboTracker` + `SaveContainerService`/`SaveCodec`/`Sanitizer`** (Core); **shop → UI Toolkit/UGUI** | **SPLIT: DESIGN+DATA / REBUILD** | ~1,100 LOC pure logic → Core, port 1:1; the **cancel-invariant `clawsCost === CLAWS_MULT × attackPower`** becomes an NUnit test, and **Σ FORM_BONUS === 63** a test + boot assert. Save: **`System.Text.Json`/Newtonsoft, NOT `JsonUtility`** (needs Dict + absence-detection for the one-time toast/v3-reap). Port `sanitizeGame` verbatim (security boundary). **The ~450-LOC shop DOM is the only true UI rewrite.** Drop the v3→v4 migration branch (web-history-only) — ship the v4 reader + GZS1 importer. |
| 8 | **input.js** (742) — multi-thumb touch + desktop | **Input System 1.14+** — `InputReader` MonoBehaviour → same `Intent` struct | **REBUILD** | Zero code carries (all DOM Pointer Events); the *design* carries: floating joystick w/ deadzone-rescale, 3 discs, hold-to-autofire, NOVA hold-charge/release, tap-to-target priority, the screen→world **relabel** (`screenDirToWorld` — a design choice, port verbatim; don't substitute the camera basis). **Risk: multi-thumb On-Screen controls** historically funnel one virtual pointer — verify stick+SMASH+JUMP on-device week 1; **EnhancedTouch + manual `touchId` routing is the proven fallback** (near-1:1 to `pointerId`). `Screen.safeArea` replaces the `env()` hack. This is the rewrite that *justifies* the move (native touch + gamepad free). |
| 9 | **render.js** (1036) — painter loop, sky/parallax, depth-sort, HUD, depth-bias | **URP 2D Renderer** + **Sorting Groups "Sort 3D As 2D" + Transparency Sort Axis**; HUD → UI; sky → layered sprites + global light | **REBUILD** | Manual painter loop/cull/insertion-sort deleted — Unity sorts via the **custom Transparency Sort Axis** (the documented iso mechanism, **native as of Unity 6.3**). **Risk now LOW (was the flagged-unconfirmed dimension risk; confirmed resolved Dec 2025).** Preserve the **flyer altitude depth-bias** (`pushPlayer` `z·WZ/HH` → sorting-order/Z offset, re-derived) and the `wz·WZ`-as-screen-Y flyer-constant-size invariant as a **tested property**. Kill-flash → URP fullscreen pass / UI image. |
| 10 | **audio.js** (265) — procedural WebAudio + iOS keepalive | **AudioMixer + pooled `AudioSource`**; bake SFX → clips; **`OnApplicationFocus`** for interruptions | **REBUILD** (biggest simplification) | **Delete the entire iOS keepalive apparatus — confirmed unnecessary** (Unity native audio has no idle-suspension). Keep the *design*: per-hit ±pitch/±level jitter (`Random.Range`), tier-scaled `crumble` via pitch + `AudioLowPassFilter`. Recommend bake-to-clips + parametric modulate (hybrid) over runtime synth. Mute source-of-truth stays `Economy.muted` → mixer param. **New capability: haptics** (Nice Vibrations) — pure upgrade. |
| 11 | **ui.js** (478) + **world_events.js** (217, Env) — DOM HUD, boss-bar, power meter, day/night | **UI Toolkit / UGUI** + a global URP 2D Light driven by `Env` curve | **REBUILD** (DOM) — design carries | All DOM → Unity UI. Carry as design: dirty-flag refresh → **C# events** (`OnMoneyChanged`, `OnHudDirty` — replace the poll flag), boss-bar chip-ghost feel, the **"⚡ Power N/19"** meter formula, pause-ownership model. `Env.phase()` interpolation → drives a global 2D Light + sky tint (clean logic port). `announce()` toast → UI element. |
| 12 | **PWA** — sw.js (45) + manifest.json + index.html shell | Native iOS/Android packaging (IL2CPP+ARM64, AAB / Xcode→IPA) | **DROP** | Service worker / cache-versioning / manifest gone — replaced by store binaries. HTML/CSS is reference-only for the UI rebuild. **The web PWA stays live in parallel** (default migration strategy) until Unity reaches parity; nothing thrown away mid-flight. |
| 13 | **game.js** (156) — fixed-step loop, hit-stop, boot asserts | **`FixedUpdate`** (sim) + **`Update`** (render); `GameBootstrap` for asserts | **DESIGN** | Delete the hand-rolled accumulator/substep/spiral guard — `FixedUpdate` + **Maximum Allowed Timestep** is the engine equivalent. **Preserve hit-stop game-feel** (kill-freeze) → `Time.timeScale=0` for ~50ms via unscaled coroutine, max-wins, no-op under reduced-motion. **Risk: the deliberate ms-vs-s split** (`STEP_MS` for combo/lifecycle, `STEP` for locomotion) — audit every timer when porting to `Time.fixedDeltaTime` (seconds) so a ms-timer isn't fed seconds (combo `WINDOW_MS:3250`). Boot asserts (FORM_BONUS sum, cache-drift→drop) carry. |

**Cross-cutting invariants nothing may lose** (carry each as an explicit task + a test): single-damage-entry-point (`hitBuilding`/`DamageRouter`) · bounded-economy cancel-invariant (`clawsCost === CLAWS_MULT × attackPower` — NUnit-tested across every collection-mult) · trauma-clamp shake · off-screen respawn gate · fixed-timestep + hit-stop · v4 atomic single-key save container + allowlist sanitize · GZS1 export-code byte format (web→Unity save bridge) · 8-way authored-5-mirror-3 facing · FORM_BONUS-sums-to-63 boot assert · the muzzle-matches-glow coupling.

### 3.4 Save & numeric-type port rules (load-bearing, called out)

- **Storage:** one JSON file in `Application.persistentDataPath`, written temp-file-then-`File.Replace` for true atomicity (the property `localStorage` gave for free). **Never `PlayerPrefs`** (no atomicity, ~1 MB iOS cap, can't hold the multi-slot container).
- **Serializer: `System.Text.Json` or Newtonsoft, never `JsonUtility`** — `JsonUtility` drops `Dictionary` (FORM_BONUS) and can't distinguish missing-vs-default (breaks the one-time-rebalance toast and v3-reap absence checks).
- **Cadence:** 2s dirty-flush coroutine + immediate-on-purchase, flushed on **`OnApplicationPause(true)`/`OnApplicationFocus(false)`** (mobile-reliable; `OnApplicationQuit` is not).
- **Numbers:** `double` (or `long` for integer money) throughout Core. This is a correctness requirement, not a preference.
- **Cloud (app-store payoff):** layer over the local file keyed on the existing `rev` field — **iCloud KVS + Play Games Saved Games** via one wrapper (gilzoide/unity-cloud-save); skip UGS unless other UGS modules earn their place. GZS1 code stays the universal manual backup *and* the only web→app migration path (separate installs, no shared sandbox).

### 3.5 The procedural-art port — its own engineering track

This is the central risk and gets first-class treatment, per the locked decisions (**dimension: 2.5D sprites in an orthographic-iso 3D scene; art: "B-as-destination, A-as-deferred-spike"**). The art splits along the exact seam the web build already uses:

**Track A — static bodies → offline bake to sprite atlas (the shipping pipeline, "B").**
The web build never needs runtime palette generation (forms are fixed in `config.js`), so the procedural generator is demoted to an **offline authoring tool**. Two viable bake hosts, recommend keeping the JS generator alive:

1. **Keep the existing JS bakers as the art tool** — run `archetypes.js`/`assets.js` headless (node-canvas or a headless-Chrome capture) over every `(form × facing × frame × damage-stage)`, emit PNGs, pack into a Unity **Sprite Atlas** (one atlas, critical for iso sort + draw-call count). An Editor `AtlasBaker`/importer slices + configures. This is an "add a `FORMS` row → re-export atlas" CI step — the procedural system *fully survives* as the generator, nothing is thrown away.
2. *(Deferred spike, never on critical path)* port the bakers to C# `Texture2D`/Painter2D only if runtime generation is ever needed — it is not, and the adversarial pass found the "1:1 mechanical port" premise false (no Painter2D blend-mode control, `ellipse()`→`Arc`-only, `ReadPixels` main-thread stall). Budget-gated R&D only.

Port constraints to carry verbatim into the bake: the **§1.6 bake guardrails** (no `shadowBlur`/`filter`/`globalCompositeOperation` in a baker; idle bakes frame-0; fixed `SPR_W=150 SPR_H=168` anchor 75,144.5), the **authored-5-mirror-3 facing scheme** (bake S/SE/E/NE/N; mirror-X 5/6/7 at runtime via `SpriteRenderer.flipX` — halves atlas size), and the 4-archetype dispatch (wyrm/flyer/hydra/mecha) as the bake matrix. **Verification: screenshot-diff each baked `(form,facing,frame)` cell against the live web build** (the campaign's composite-screenshot pattern, now cross-engine).

**Track B — the live additive-FX layer → URP 2D additive sprites/particles (the real risk, Phase-0 spike).**
The signature glow/beam/aura/mote/`_flash` layer (`drawGlow` + `MOTE_FX` per-frame in entities.js, ~16 animated `globalAlpha` pulses in render.js) is `'screen'`-blended **live every frame** and is ~40% of the gz-v27→v32 look. It **cannot be baked into a static atlas** and has **no native equivalent in either body pipeline** — so it is independent of the A/B body decision and is *the* de-risking task. Re-author as **URP 2D Renderer additive sprites / a custom additive material / particles**, and **spike it in Phase 0 on a real low-end Android device before committing to any body pipeline** — get it wrong and the build looks dead even with pixel-perfect bodies. The eyes/plate-shimmer/breath-charge animation drives material params or particle emission per-form, sourced from the same `FORMS` palette data.

**Buildings:** the generic iso prism (`drawPrismBuilding`, 5 style BANDS, 3 damage stages, window knockout) bakes the same way — per-style × per-damage-stage atlas frames. The **ground plane** is the one place a Unity **Isometric Tilemap** earns its keep (one chunk-batched renderer, the documented mobile win); buildings/kaiju stay billboard `SpriteRenderer`s — *not* Tilemap tiles — so they keep stateful roaming behavior and silhouette picking.

**Why the depth model is now low-risk:** the locked dimension required a custom per-entity sort key (`iso.depthKey`) because center-pivot sprite sort foreshortens the flat silhouette. Unity **6.3's Transparency Sort Axis + "Sort 3D As 2D" Sorting Groups** is the documented, native mechanism for exactly this (iso tile + billboard sorting along a custom axis) — so the ported `depthKey` becomes a sort-axis config + per-entity sorting-order offset rather than a hand-rolled insertion sort. The flyer altitude depth-bias re-derives as a sorting-order/Z offset. This was the dimension decision's one flagged-unconfirmed condition-to-revisit; **it is confirmed resolved** (Unity 6.3 LTS, Dec 2025).

**Phase-0 vertical slice (the go/no-go gate before committing the parallel build):** one kaiju + one building — walk + attack + one `screen`-blend beam + the live glow layer + floating damage text, bodies from a baked atlas, under an orthographic cam with the ported sort axis, on a low-end Android device — then **screenshot-diff against the live web build**. Parity is defined against *this list* (ported sort axis · atlas+tint strategy · on-device overdraw budget · re-authored glow/mote/flash FX · the flyer-constant-size invariant as a tested property · per-form bake fidelity), **not** against "sprites render in an iso scene." If the glow re-author can't match the additive layer within budget, that is the documented fallback trigger to reconsider the FX idiom — not the whole migration.

**Sources:** [Unity Manual — New in Unity 6.3 (Sort 3D As 2D, 2D+3D in one URP scene)](https://docs.unity3d.com/6000.3/Documentation/Manual/WhatsNewUnity63.html) · [Unity Manual — 2D renderer sorting / Transparency Sort Axis](https://docs.unity3d.com/6000.1/Documentation/Manual/2d-renderer-sorting.html) · [CG Channel — Unity 6.3 LTS is out (Dec 2025)](https://www.cgchannel.com/2025/12/unity-6-3-lts-is-out-see-5-key-features-for-cg-artists/) · [Cinemachine 3.1 package docs](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/) · [Unity — What's new with Cinemachine 3](https://unity.com/blog/engine-platform/see-whats-new-with-cinemachine-3)

## 4. Phased migration roadmap

A **vertical-slice-first, parallel-to-the-live-PWA** plan. The web build (`gz-v32`, deployed at `egodogg.github.io/godzilla-smash/`) stays live and untouched through every phase — Unity is built alongside it and the cutover happens **once, at parity** (Mike's locked default: nothing thrown away mid-flight). Each phase ends on a hard, observable exit gate. The two locked decisions drive the whole shape: **2.5D sprites in an orthographic 3D scene** (custom `depthKey` sort) and **B-as-destination art** (export the JS bakers to atlases; native C# Painter2D port deferred as an optional spike).

**Effort calibration:** solo dev (Mike) + Claude Code, this being Mike's *first* Unity project. Estimates are in **focused working days** and assume Claude owns the C#/YAML/glue and Mike owns Editor composition, device testing, and taste calls. They are deliberately ranged — per the locked dimension decision, the renderer *choice* is near-certain (~88%) but the *effort* is the risk surface (~65% confidence in a clean cost story), so treat the high end of each range as the planning number.

**Cross-cutting conventions adopted in Phase 0 and enforced thereafter** (from the Claude↔Unity lane): `.asmdef`-layered assemblies (`Godzilla.Core` / `Godzilla.Data` / `Godzilla.Presentation` / `Godzilla.Editor` / `Godzilla.Tests`); **all game logic lives in plain UnityEngine-free C# classes**, MonoBehaviours are thin adapters; **doubles/longs never floats/ints** for money/HP (values reach `ROW_HP`=1e9, `WORLD2_COST`=12e9); a project `CLAUDE.md` documenting the asmdef rule; `Library/` gitignored, `Packages/manifest.json` committed, Git LFS for atlases.

---

### Phase 0 — Toolchain, MCP, project skeleton

**Goal:** A buildable, Claude-drivable, CI-wired empty Unity project on Unity 6 LTS — *plus* the one technical de-risking spike that both locked decisions hinge on (the additive-FX glow layer), proven before any body art is committed.

**Key deliverables**
- Unity 6 LTS (6000.x), **URP 2D Renderer**, Personal license. Confirm free/no-splash/no-runtime-fee status holds (it does as of mid-2026; revenue is $0, far under the $200k Personal cap).
- The `.asmdef` skeleton + empty `Godzilla.Tests` EditMode assembly that runs in CI in seconds.
- **MCP wiring:** install **IvanMurzak/Unity-MCP** (Apache-2.0, auto-generates Claude Code Skills) as primary; **CoplayDev/unity-mcp** (MIT, one-click `Configure All Detected Clients`) alongside as fallback. Smoke test: "list GameObjects in the open scene" from Claude Code.
- **CI skeleton:** `BuildScript.cs` with `[MenuItem]`-mirrored static `PerformAndroidBuild` / `PerformiOSBuild`; GameCI GitHub Actions (EditMode tests + Android AAB) on a Linux runner; a **self-hosted macOS runner on Mike's Mac** for the iOS/IL2CPP leg. **License-activate headlessly with a real token, by hand, once** (the live-spike lesson — #1 silent CI failure; mock runs won't catch it).
- **Phase-0 FX spike (the genuine de-risk, gates both locked decisions):** prototype `drawGlow` + one `'screen'`-blend beam + the supernova motes + the white kill-flash as **URP 2D additive sprites/particles (or a custom additive material)**. Validate on a **real low-end Android device** — this is ~40% of the gz-v27→v32 look and has *no* PNG-atlas equivalent, so it must be proven as a shader/particle idiom independent of which body pipeline ships.

**Claude owns:** `.asmdef` layout, `BuildScript.cs`, GameCI YAML, `Fastfile` stub, MCP config, the project `CLAUDE.md`. Drafts the additive-material/particle FX prototype.
**Mike owns:** Unity install, runner registration on his Mac, the one-time manual license activation + Apple/Play account state check, the on-device FX feel judgment.

**Effort:** 3–5 days (2 of which are the FX spike + on-device validation).
**Exit / DoD:** `git clone` → CI runs EditMode tests green and produces an Android AAB unattended; Claude can read the console and enter Play Mode over MCP; **the additive-FX prototype renders the glow+beam+motes+flash convincingly on a real low-end Android device.** If the FX idiom fails here, stop and revisit the art decision before spending a day on bodies (it's a named revisit condition in the locked dimension).

---

### Phase 1 — Vertical slice: tap-to-smash one iso building

**Goal:** The single most important gate in the whole plan — prove the **renderer + feel** reproduce the web look *by construction* before committing to parallel build-out. One kaiju, one building, the iso camera, the core loop beat: tap → damage → destroy → cash → number-go-up. Screenshot-diffable against the live PWA.

**Key deliverables**
- **Orthographic camera at the iso angle**; the **`depthKey` sort ported verbatim** from `iso.js` (`(wx+wy)·1024 + wz·4 + depthBias`) as an explicit per-entity sort key — *not* Unity's center-pivot sprite sort. This is a **first-class task, not a footnote**: the custom sort defeats sprite batching for overlapping dynamic actors, so it's also where the on-device overdraw budget starts.
- One building rendered from a **baked atlas** (the body pipeline, Option B) + the **live glow/flash layer from the Phase-0 spike** composited on top — proving the body-static / FX-live seam the web build already uses.
- One kaiju: **walk + attack (one `'screen'`-blend beam) + the live glow + floating "+$" damage text**, baked body to `Texture2D`/atlas.
- **Feel core:** `FixedUpdate` at 1/60 replacing the hand-rolled accumulator; **hit-stop** via unscaled `Time.timeScale=0` pulse; **trauma-shake with the `iso.js` scalar math kept verbatim in C#, driving a Cinemachine noise amplitude** (the one feel system that is a re-author, not a port — the anti-compounding clamp + exponential decay is engineered, preserve it by construction). Cinemachine vcam for damped follow + Confiner2D for the origin clamp.
- **Input:** one On-Screen SMASH button (hold-to-autofire via `IsPressed()`) + tap-to-target via a silhouette `Collider2D` + `Physics2D.OverlapPoint` (sprite-hitbox picking, *not* pick-by-cell).
- A **screenshot-diff harness** vs the live web build at matched camera/pose.

**Claude owns:** `depthKey` C#, the FixedUpdate loop, hit-stop/trauma C#, the atlas-load + additive-FX composite, input reader, the diff harness.
**Mike owns:** the camera-angle/feel judgment call, the side-by-side fidelity verdict.

**Effort:** 6–10 days (this is where the ~65%-confidence effort risk concentrates).
**Exit / DoD:** tap a building → it takes `attackPower` damage → destroys → pays out → money HUD updates, with the glow layer live, hit-stop + shake firing, at a screenshot match Mike judges acceptable against the PWA. **This is the GO/NO-GO gate for the entire parallel build:** if C# can't hit Canvas2D fidelity here (AA, gradients, the additive layer), fall back to offline bake-to-PNG-atlas for static bodies or reconsider keeping the PWA as the shipping surface — both are named revisit conditions. Do not start Phases 2–6 until this passes.

---

### Phase 2 — Art system: all 20 forms + buildings to atlases

**Goal:** Scale the proven Phase-1 seam to the full art set. Run the existing JS bakers (`archetypes.js`+`assets.js`+`sprites_special.js`) **offline** to emit sprite atlases for all 20 forms × facing × frame + every building style — preserving the exact gz-v32 look at zero runtime generation cost.

**Key deliverables**
- An **offline bake pipeline:** run the current JS bakers headless (node-canvas) to produce per-form/facing/frame atlases + the building-style/damage-stage sheets + the specials (statue/pyramid/field/sandpile/plane/house-tints). The **JS procedural generator stays alive as the art-authoring tool** — "add a `FORMS` row → re-run bake → re-export atlas" becomes a CI step.
- **Pack into sprite atlases** (one atlas, tint baked in) to avoid iso sort errors and cut draw calls; the per-form additive glow re-authored as the Phase-0 particle/material idiom, parameterized per form.
- The **8-way authored-5 / mirror-3 facing scheme** preserved (5 authored S/SE/E/NE/N, 3 mirrored via FACING_MAP).
- **Per-form bake-fidelity verification** (first-class task): composite each form vs the web render; the **`wz·WZ`-as-screen-Y flyer-constant-size invariant** carried as a *tested* property; the muzzle-matches-glow coupling preserved.
- **On-device overdraw/fill-rate budget** profiled for the transparent-FX layer (the one place the "cheap renderer" claim could break).

**Claude owns:** the headless bake harness + atlas-pack config + importer/slicer editor scripts, the per-form FX parameterization, the fidelity-diff automation.
**Mike owns:** per-form sign-off, the overdraw budget judgment on his target devices.

**Effort:** 8–12 days.
**Exit / DoD:** all 20 forms + all building styles + specials render from atlases at per-form fidelity Mike signs off, flyers hold constant screen-size at altitude (tested), and the FX-overdraw budget passes on a real low-end Android device.

---

### Phase 3 — Full city: world gen, lifecycle, targeting

**Goal:** The 21×58 iso city with deterministic generation, the building lifecycle FSM, roaming, and full targeting — the world layer (`world.js` + `entities.js`).

**Key deliverables**
- **Deterministic city gen:** port **mulberry32 RNG + the integer `hash` bit-exact** so the `WORLD_SEED=0x9E3779B1` city is reproducible (or accept a different-but-deterministic layout — flag the choice). City ground as a Unity **Isometric Tilemap** (one chunk-batched renderer); buildings/kaiju stay billboard sprites with the `depthKey` sort.
- The **4-state lifecycle FSM** (standing→crumbling→rubble→respawning), the **single damage entry point** (`hitBuilding`) discipline so bank/FX/audio fire exactly once, the **off-screen respawn gate** (roam-vs-camp), the rare-spawn table (gold/rainbow/diamond), flyer drift+wrap.
- **Full locomotion + AI:** accel/friction integration, AABB collision vs standing footprints, jump kinematics, **flyer hover-over-buildings + altitude depth-bias** (`pushPlayer` renders flying kaiju over not through), the 5 data-driven attack kinds (beam/bolts/cloud/dive/volley), Nova-Slam finisher, Mothra DoT, target-acquisition priority (click→faced→nearest, airborne-prefers-flying).
- **FX pool** → Unity ParticleSystem (not VFX Graph on mobile) + object pools; the reduced-motion cap as a quality tier.

**Claude owns:** all of it — this is pure gameplay logic, the codebase's biggest asset, ideal for Claude. EditMode tests for FSM transitions, single-damage-entry, deterministic gen.
**Mike owns:** play-feel of locomotion/targeting, spot-checks vs the PWA.

**Effort:** 10–14 days.
**Exit / DoD:** roam the full city; buildings cycle the FSM correctly; rare spawns appear; flyers pass over buildings; all 5 attacks + Nova fire with correct FX; deterministic-gen and single-damage-entry tests green.

---

### Phase 4 — Economy, forms, save, shop UI

**Goal:** Port the money/upgrade/combo/forms power axis and the **entire v4 save system** as testable C# core; rebuild the shop as Unity UI.

**Key deliverables**
- **`Godzilla.Core` economy:** `attackPower`/`clawsCost` with the **bounded-economy cancel-invariant** (`clawsCost === CLAWS_MULT × attackPower` at every collection multiplier — locked as an NUnit test across all power-sets), the `FORM_BONUS`-sums-to-63 boot assertion (as a test *and* a `Debug.Assert`), atk/move/finisher tracks, combo (`tickCombo`/`bumpCombo`, WINDOW_MS 3250), `canFinale`/`markFinale` (free World 2), win-finale.
- **Save system ported wholesale, backend changed:** the **v4 atomic single-key container** → one JSON file in `Application.persistentDataPath` written **temp-file-then-`File.Replace`** for atomicity (localStorage's was free); **`System.Text.Json`/Newtonsoft, NOT `JsonUtility`** (it drops `Dictionary` and can't distinguish missing-vs-default, which would break the migration/toast logic); **`sanitizeGame` allowlist ported verbatim** (the security/clamp boundary); slot CRUD + undo; dirty-flag + 2s flush + **`OnApplicationPause/Focus`** flush (not `OnApplicationQuit` — unreliable on mobile). **Drop the v3→v4 migration branch + `maybeReapV3`** — Unity starts fresh at v4 schema.
- **`GZS1:` export codes byte-identical** (crc32 + base64url-of-UTF-8 JSON, `GUIUtility.systemCopyBuffer` for clipboard) — this is the **only cross-install bridge** from web saves to the app; keep it lossless.
- **FORMS → 20 `FormDefinition` ScriptableObjects + `FormDatabase`**; balance scalars → `balance.json` → `BalanceConfig` POCO (diffable, keeps Core UnityEngine-free). Claude authors via a `forms.json` manifest → `Godzilla → Rebuild Form Assets` editor command (text-source, deterministic regen), optionally live via MCP.
- **Shop DOM (~450–600 LOC) rebuilt** as Unity UI (UI Toolkit/UGUI) — the only true UI rewrite — event-driven off `OnMoneyChanged`/`OnPowerChanged` instead of the `hudDirty` poll.
- **Native cloud save** layered *over* the local file, keyed on the existing `rev` field (newer-wins): iCloud KVS + Play Games Saved Games via a single wrapper (e.g. gilzoide/unity-cloud-save); `GZS1:` code as the universal manual fallback. (Document the IAP hooks behind an `IPurchaseGate` — cosmetics/remove-ads only; **do not build IAP this round**.)

**Claude owns:** all Core economy + save logic + tests, the SO regen pipeline, the shop UI, the cloud-save wrapper.
**Mike owns:** shop layout/taste, confirming a web-exported `GZS1:` code imports losslessly.

**Effort:** 8–12 days.
**Exit / DoD:** full purchase loop works; combo/finale/World-2 correct; **the cost==2×power invariant + FORM_BONUS==63 tests green**; saves persist across app restart and survive a mid-write kill; a real `GZS1:` code exported from the live PWA imports cleanly into the Unity app.

---

### Phase 5 — Input, audio, HUD, feel polish (full parity pass)

**Goal:** Close the remaining web surfaces — full touch+desktop input, audio, HUD chrome, day/night — and tune until it *feels* like the web build.

**Key deliverables**
- **Full input:** floating joystick (On-Screen Stick + custom deadzone-rescale), multi-thumb SMASH/JUMP/NOVA discs (**verify simultaneous stick+SMASH on a real device**; EnhancedTouch + `touchId` routing as the proven fallback), NOVA hold-charge/release, `Screen.safeArea` disc layout, desktop WASD/mouse/keyboard via control schemes, the **screen→world movement relabel ported verbatim** (push-up = forward is a design choice, not geometry), `OnApplicationFocus(false)` clears held state.
- **Audio:** the entire **iOS WebAudio keepalive apparatus DELETED** (Unity's native audio has no idle-suspension); SFX as **baked clips + parametric pitch/lowpass scaling** (tier-scaled crumble, ±pitch/level jitter ported), AudioMixer master/mute keyed on `Economy.muted`, OS-interruption handling via `OnApplicationFocus`. **New capability: haptics** (Nice Vibrations) on smash/crumble/Nova/buy/deny, gated on the reduced-motion/settings toggle.
- **HUD/UI chrome:** money, `⚡ Power N/19` true-progression meter, the target-HP boss-bar (fast fill + lagging chip-ghost), combo pip ring (gold→red), green +$ popups, **finale beacon** (pulsing ring / clamped edge-arrow → statue), pause ownership, win card. **Day/night** (`Env.phase()` curve) → a global URP light + layered-sprite/skybox sky + parallax skyline; toast/announce fanfares.
- A **reduced-motion master setting** gating shake/hit-stop/flash/particle caps (default from the OS flag).

**Claude owns:** input reader + actions, audio clip-bake + mixer + haptics wiring, all HUD/UI, the Env light driver.
**Mike owns:** the feel tuning pass (trauma-shake side-by-side vs PWA, haptic weight, joystick deadzone curve), the multi-thumb device test.

**Effort:** 8–12 days.
**Exit / DoD:** every web control + HUD element + audio cue has a working Unity equivalent; multi-thumb verified on device; trauma-shake matches the web feel in a side-by-side; reduced-motion honored throughout. **Functional parity reached** — the parity checklist below passes.

---

### Phase 6 — Store submission (iOS + Android)

**Goal:** Ship the at-parity Unity build to both App Stores. The web PWA stays live until both are accepted (the single cutover).

**Key deliverables**
- **iOS:** bundle ID + Player Settings, IL2CPP/ARM64 (forced on iOS), Team **83T4PJ5UV6**, Xcode archive → TestFlight → App Store Connect via Fastlane `gym`/`pilot`. **Plan the Apr 28 2026 SDK floor** — the Unity 6 version must ship a Xcode-26/iOS-26-SDK-compatible toolchain by submission time.
- **Android:** AAB (not APK) via Gradle, release keystore + Play App Signing, **Target API 35+**, IL2CPP/ARM64, internal-test track → production via Fastlane `supply`.
- **Store compliance:** answer the **Apple age-rating questionnaire** honestly (cartoon kaiju violence → ~9+/E10+; the new app answers the current questionnaire at submission); declare **"Data Not Collected"** (true — on-device saves, no accounts/analytics/ads) + Android Data Safety match; **ship v1 with no real-money IAP** (all currency is earned → sidesteps Guideline 3.1.1 entirely); listings ×2 (screenshots, descriptions).
- Version/build-number bump automation; the `BuildScript` + `Fastfile` + GitHub Actions lanes finalized.

**Claude owns:** `BuildScript.cs`, `Fastfile`, GH Actions workflows, version-bump, store-metadata drafts.
**Mike owns:** Apple/Play account agreements + tax/banking, first-time provisioning/cert setup, the age/privacy questionnaires, App Store Connect + Play Console submission, review round-trips.

**Effort:** 5–8 working days of effort over ~2–3 calendar weeks (mostly account/review waits). Hard cash: **~$124** (Apple $99/yr + Google $25 one-time); Unity $0; CI $0 (own Mac).
**Exit / DoD:** both builds accepted and live; the web PWA can be retired or kept as the free web channel — Mike's call. **Cutover complete.**

---

### Parity checklist vs. the current game (`gz-v32`)

Functional parity = **every row green** before Phase 5 exits and Phase 6 begins.

| # | System | Parity criterion |
|---|---|---|
| 1 | Iso render | Orthographic iso cam; **custom `depthKey` sort** (not center-pivot); buildings/kaiju billboard over the Tilemap ground |
| 2 | Art fidelity | All **20 forms × facing × frame** + all building styles/damage-stages + specials render from atlases at sign-off fidelity vs web |
| 3 | Live FX layer | `'screen'`-additive glow/beam/motes + white kill-flash re-authored as URP particles/material — *the gz-v27→v32 signature look* |
| 4 | Flyer invariant | `wz·WZ`-as-screen-Y constant-size-at-altitude holds (**tested**); flyers depth-bias *over* buildings, not through |
| 5 | Facing scheme | 8-way, 5 authored + 3 mirrored (FACING_MAP) |
| 6 | City gen | Deterministic (mulberry32 + hash); 21×58; block/street tier banding |
| 7 | Building lifecycle | standing→crumbling→rubble→respawning FSM; **single damage entry** (`hitBuilding`); off-screen respawn gate; rare-spawn table |
| 8 | Locomotion/jump/hover | Accel/friction + AABB collision; jump kinematics; flyers hover-over (never jump) |
| 9 | Attacks | All 5 kinds (beam/bolts/cloud/dive/volley) + DoT; **Nova-Slam** finisher decoupled from the re-fire gate |
| 10 | Targeting | Sprite-hitbox pick (tall buildings, planes); click→faced→nearest priority; airborne-prefers-flying |
| 11 | Economy | `attackPower`/`clawsCost` **cancel-invariant** (cost==2×power at every mult, tested); bounded `CAP_HP` ceiling |
| 12 | Forms axis | 20 forms, collection multiplier, **FORM_BONUS sums to 63** (asserted) |
| 13 | Combo | Only damage multiplier; WINDOW_MS 3250; gold→red pip + green +$ popups |
| 14 | Save | v4 atomic single-file container; `sanitizeGame` allowlist; slot CRUD + undo; `rev` conflict authority; pause/focus flush |
| 15 | Export codes | `GZS1:` byte-identical (crc32 + base64url) — web→app import lossless |
| 16 | Cloud save | Native (iCloud KVS + Play Games), `rev` newer-wins, `GZS1:` manual fallback |
| 17 | Input | Floating joystick + multi-thumb discs (device-verified); NOVA hold-charge; desktop WASD/mouse; screen→world relabel |
| 18 | Audio | Tier-scaled SFX with jitter; mute via mixer; **iOS keepalive deleted**; **haptics added** (new) |
| 19 | Feel | FixedUpdate 1/60; hit-stop pulse; **trauma-shake C# math → Cinemachine noise** (anti-compound clamp preserved); damped follow + confiner |
| 20 | HUD/chrome | Money · ⚡Power N/19 meter · boss-bar chip-ghost · combo pip · **finale beacon** · pause · win card · toasts |
| 21 | Day/night | `Env.phase()` curve → global light + sky + parallax skyline |
| 22 | Reduced motion | Master setting gating shake/hit-stop/flash/particle caps (OS-flag default) |
| 23 | Platform | iOS + Android native binaries; IL2CPP/ARM64; AAB; **PWA dropped** (replaced by native packaging; web stays live in parallel until cutover) |

**Sequencing invariant:** Phase 1 is the GO/NO-GO gate — Phases 2–6 do not start until the vertical slice clears fidelity + feel against the live PWA. The web build remains the shipping surface through all six phases; the cutover is a single step at the end of Phase 6.

## 5. Build, distribution, licensing & risk register

This is the leg that turns a parity-complete Unity project into two shipped store binaries. The good news up front: **Mike can ship Godzilla Smash to both stores under the free Unity Personal license at zero Unity cost, no runtime fee, no splash screen** — total hard cost is ~$124 in store accounts. The dominant cost is *time and the port itself*, not money or licensing. Nearly all of the build/distribution machinery is CLI/script glue that Claude can own end-to-end.

### 5.1 Unity licensing & cost reality for a solo dev (mid-2026, verified)

The single most volatile area in this whole plan — and as of June 2026 it is the most stable Unity's pricing has been in years.

| | Unity Personal | Unity Pro |
|---|---|---|
| **Cost** | **Free** | ~$2,200/seat/yr (8% rise eff. Jan 1 2025; +5% more eff. Jan 12 2026) |
| **Revenue / funding cap** | **< $200,000 USD trailing 12 mo** (doubled from $100k) | Required above $200k |
| **"Made with Unity" splash** | **Optional / removable on Unity 6+** | n/a |
| **Runtime fee** | **Cancelled — does not exist** | Cancelled |

- **The runtime fee is dead.** Unity formally cancelled it in September 2024, before it ever took effect, and has not resurrected it; the model reverted to per-seat subscriptions with no revenue share.
- **Verdict for Mike: he ships free, indefinitely, with no splash.** Godzilla Smash uses **in-game currency only** — no real-money purchases, no ads, no analytics — so revenue is effectively $0, vastly under the $200k Personal cap. He stays on Personal until the game itself earns or he raises >$200k/yr, which is not a near-term concern. **Build on Unity 6 LTS** (current 6000.x line) so the optional-splash and the current iOS/Android toolchains apply.

**Hard cash, year 1:** Apple Developer Program **$99/yr** + Google Play Console **$25 one-time** = **~$124**. Unity = **$0**. CI = **$0** (his own Mac). No other mandatory spend.

### 5.2 iOS build & submission pipeline

Flow: **Unity (batchmode build) → generated Xcode project → Xcode archive → App Store Connect.**

- **Mac is mandatory** (Mike is on Darwin — covered). iOS builds require macOS + Xcode for the IL2CPP → C++ → native compile step; there is no Linux path for the iOS leg.
- **Scripting backend: IL2CPP is forced on iOS.** Unity cross-compiles all C# to C++, then Xcode compiles `libGameAssembly`. This also satisfies Apple's ARM64/64-bit requirement — there is no Mono option for App Store iOS.
- **Signing (Team ID 83T4PJ5UV6):** standard Apple flow — set the **Bundle Identifier** in Player Settings, then in Xcode select the **Team (83T4PJ5UV6)**, let Xcode manage signing (automatic provisioning is fine for a solo dev), archive, and upload. No special Unity step beyond the bundle ID. Mike already operates under this Team ID for his native iOS apps, so certificates/provisioning infrastructure exists.
- **Deployment target vs build SDK** — keep these distinct: you freely set *minimum iOS* (e.g. iOS 16/17) for backward compatibility; that is separate from the **SDK Apple makes you build against** (see the dated requirement in §5.4).
- **Requirement:** Apple Developer Program **$99/yr** — needed for certs, provisioning, and App Store Connect. Presumed already active under 83T4PJ5UV6.

### 5.3 Android build & submission pipeline

Flow: **Unity (batchmode build) → AAB via Gradle → Play Console.**

- **Format: AAB, not APK.** Google Play requires an Android App Bundle; the Unity APK default won't publish. Set it in **Build Profiles → Android**.
- **Signing / keystore:** create a **release keystore** in Player → Android → Publishing Settings → Keystore Manager (the debug keystore cannot publish). Enroll in **Play App Signing** — upload the AAB, let Google hold the app signing key, you keep an upload key. **Automation note:** Unity does *not* persist the keystore password on disk; pass it via an **env var** in CI.
- **Backend:** **IL2CPP + ARM64** (required for 64-bit Play compliance).
- **Target API gate:** new apps/updates must target **Android 15 (API 35)** (enforced after Aug 31 2025). Unity 6's Android tooling targets this; confirm Target API = 35+ in Player Settings.
- **Requirement:** Google Play Console **$25 one-time** (not annual, unlike Apple).

### 5.4 App-store requirements a tap-to-smash game must meet

- **⚠️ Apple age-rating questionnaire (deadline Jan 31 2026 — verified).** Apple added 13+/16+/18+ categories and a mandatory questionnaire (in-app controls, capabilities, violent themes). Apps that didn't complete it are blocked from new submissions/updates. Because the Unity build is a **new app** in App Store Connect, Mike answers the *current* questionnaire at submission — a "be aware, answer honestly" item, not a missed-deadline crisis for the new app. **Action: 2-minute check that his existing native iOS apps under the same account already completed it.** A kaiju-smashes-buildings game rates roughly **9+ / E10+** (cartoon/fantasy violence, no realistic gore).
- **⚠️ Apple build-SDK floor bumps Apr 28 2026.** From that date, App Store uploads must be built with **Xcode 26 + iOS 26 SDK** (today's floor is Xcode 16 / iOS 18). This affects only the SDK you build *against*, not your min-iOS. **Action: install a Unity 6 version whose iOS toolchain is Xcode-26-compatible before submitting after April 2026.** (Unity had not published the exact Unity-6-minor → Xcode-26 mapping in indexed sources as of mid-2026 — verify against Unity 6 release notes at port time.)
- **Privacy — trivially clean.** The game collects **no user data** (on-device saves only, no accounts/analytics/ads), so it earns the **"Data Not Collected"** label on Apple and an honest "no data collected/shared" on Google Play Data Safety. Keep it true by **not** bolting on ad/analytics SDKs. (Unity's runtime ships its own privacy manifest for required-reason APIs.)
- **Age rating (Android):** the IARC questionnaire generates ESRB/PEGI/USK in one form — cartoon kaiju violence lands ~**Everyone 10+ / PEGI 7**.
- **IAP / monetization (Guideline 3.1.1) — a non-issue today.** All "cash" is earned in-game currency, which is **not** an IAP and triggers no StoreKit/Play Billing obligation. **Recommendation: ship v1 with no real-money IAP** — it sidesteps the single most painful App Review category entirely. (If Mike later monetizes, iOS must use StoreKit/Apple IAP with restore-purchases and Android must use Play Billing; the bounded-economy invariant means he should sell **cosmetics / remove-ads**, never the `claws` power track — selling power literally ends the game faster.)

### 5.5 Build automation Claude can own

A high-ROW delegation target: this is all YAML / Ruby / shell / C# build-method glue that Claude writes reliably and Mike would otherwise hand-roll.

- **Unity batchmode CLI** — the headless entry point. Claude writes a C# `BuildScript` with `[MenuItem]`-mirrored static methods (`PerformiOSBuild` / `PerformAndroidBuild`) so the *same* entry point works from CI, from Fastlane, **and** from Claude-over-MCP. Invoked as:
  `Unity -quit -batchmode -nographics -projectPath <path> -executeMethod BuildScript.PerformAndroidBuild -logFile -`
  Drives version/build-number bump, AAB / Xcode-project output, keystore password via env var. For iOS this emits an **Xcode project** — it does not produce the .ipa itself.
- **Fastlane for the store leg.** iOS: batchmode emits the Xcode project → Fastlane `gym` (build/sign) + `pilot`/`deliver` (TestFlight/App Store), handling the Team ID 83T4PJ5UV6 signing and upload. Android: Fastlane `supply` uploads the AAB to Play. `fastlane-plugin-unity` wraps `unity_version`/`build_target`/`execute_method`.
- **CI options, two paths:**
  1. **Local Mac + GitHub Actions self-hosted runner** — free, uses Mike's Mac for the IL2CPP/Xcode compile; pair with `game-ci/unity-builder` for Android + tests on Linux. **Recommended** — best $0 option for a solo dev who already owns the Mac; Claude scripts it end-to-end.
  2. **Unity Build Automation (cloud Macs)** — free tier now includes **100 Mac build minutes/month** + 2 concurrent builds (new DevOps pricing eff. Mar 1 2026), enough for low-frequency solo releases. Use as a fallback/overflow.
- **What Claude owns end-to-end:** `BuildScript.cs`, the GameCI workflow YAML, the `Fastfile`, secret wiring (`UNITY_LICENSE`/`UNITY_EMAIL`/`UNITY_PASSWORD`, keystore password, Apple API key), and a version-bump step. **What stays manual:** Apple provisioning/cert setup the first time, App Store Connect submission gates.

> **Live-spike lesson applies hard here** (from Mike's global CLAUDE.md): *activate the Unity license headlessly with a real token once, by hand, before trusting the CI YAML.* Headless license activation is the #1 silent CI failure and a mock run will not catch it. Verify the Personal-tier license supports headless CI activation before wiring GameCI.

### 5.6 Effort & cost to get THIS game into both stores

Assuming the Unity **port to parity** (the dominant cost, owned by the other lanes) is already done, the build/distribution/store leg alone:

| Task | Effort (solo + Claude) |
|---|---|
| Apple/Play accounts + agreements + tax/banking forms | 0.5–1 day (mostly review waits) |
| iOS: Player Settings, bundle ID, signing, first Xcode archive → TestFlight | 1–2 days (signing always eats time the first time) |
| Android: keystore, AAB, Play App Signing, internal-test upload | 0.5–1 day |
| Store listings ×2 (screenshots, descriptions, age questionnaire, privacy "no data") | 1–2 days |
| Build automation (`BuildScript.cs` + Fastlane + GH Actions) — Claude-driven | 1–2 days |
| App Review round-trips (Apple 24–48h/cycle; expect 1–2 cycles) | 3–7 calendar days (mostly waiting) |

**Net: ~5–8 working days of effort over ~2–3 calendar weeks** for the store-delivery leg, *on top of* the engine port.

### 5.7 Risk register

Top migration risks across the whole plan, scored for a solo dev building his first Unity project in parallel with a live PWA.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Art-fidelity gap** — the procedural Canvas2D look (gradients, AA, `'screen'`-blend additive glow/mote/flash layer that is ~40% of the gz-v27→v32 look) doesn't reproduce in Unity sprites. The live FX layer cannot be captured by a static PNG atlas. | **High** | **High** | **Locked decision de-risks this:** ship bodies via **bake-the-existing-JS-bakers-to-atlas (Option B)**, pixel-identical; re-author the additive layer as **URP 2D additive sprites/particles** as a **dedicated Phase-0 spike** validated on a real low-end Android device *before* committing the body pipeline. Define "parity" against the FX layer, not against "sprites render in an iso scene." Screenshot-diff every form against the live web build. Fallback: accept minor static-body loss; keep PWA as shipping surface if the spike fails. |
| **Feel-fidelity gap** — the trauma-shake camera (anti-compounding clamp + exponential-decay steady-state, an explicit past bug fix) does not port mechanically to Cinemachine Impulse. | **Medium** | **Medium** | **Keep the proven C# trauma scalar math verbatim** and use Cinemachine only as the noise/follow/confine renderer (drive `CinemachineBasicMultiChannelPerlin` amplitude = `SHAKE_MAX_PX·trauma`). Preserves the bug-fixed feel by construction. Budget one focused side-by-side tuning pass vs the live PWA. Hit-stop via unscaled-time `Time.timeScale` pulse; audit the ms-vs-s fixed-step split on every timer. |
| **Scope / time overrun** — first Unity project, solo, ~10,800 LOC across renderer + input + economy + save, "parity" is much further than a sprite import (the real port surface is ~750 live `ctx.` calls, not just `archetypes.js`). | **High** | **High** | **Gate the parallel build on a one-form vertical-slice spike** (one kaiju + one building: walk + attack + one `'screen'`-blend beam + live glow + damage text, screenshot-diffed) *before* committing. Keep the PWA live the whole time — nothing thrown away mid-flight, no forced deadline. Use the asmdef-layered, MonoBehaviour-free core so the ~1,100 LOC of pure economy/save logic ports as testable C# fast. Apply Mike's "is this too complex?" gate at iteration 3–4. |
| **Licensing / cost change** — Unity pricing is historically volatile; a future runtime-fee-style reversal or cap change could alter the "ship free" story. | **Low** | **Medium** | Verified stable as of mid-2026 (fee cancelled, $200k Personal cap, splash optional). Revenue is $0 (no real-money loop), so Mike is far under any cap. Pin the Unity 6 LTS minor version at port start; re-check Personal terms at ship time. The $200k headroom means even modest success doesn't force a paid tier. |
| **MCP immaturity** — the Unity-MCP bridges (CoplayDev / IvanMurzak) move fast and version weekly; a breaking change could disrupt the Claude verify loop. | **Medium** | **Low** | MCP is the *verification/scaffolding* layer, **not** the thing that writes the game — generate-C#-to-disk is the primary channel and is bridge-independent. **Pin a specific MCP server version**, commit before agent sessions (git is the safety net), and re-verify on update. Keep two bridges installed (zero conflict) so one is a fallback. Official Unity MCP (best consent model) is the future fallback once Mike is on a paid tier. |
| **Store rejection** — App Review bounce on a new app. | **Low** | **Medium** | Pre-empt the top categories: **no real-money IAP** (sidesteps Guideline 3.1.1 entirely), **"Data Not Collected"** declared honestly (no ad/analytics SDKs), age questionnaire answered honestly (~9+/E10+ cartoon violence), AAB + API 35 + ARM64 compliance built in. Run the **app-store-prep** checklist before submission. Budget 1–2 review cycles. Apple's Apr 28 2026 Xcode-26 SDK floor is the one hard external gate — install a compatible Unity 6 toolchain ahead of it. |

### 5.8 Go / no-go framing

**GO — proceed to a gated parallel build, not an all-in commit.** Every one of Mike's actual drivers (native iOS + Android app stores, cross-platform tooling, Claude/Unity learning) is served by this migration, and the two hardest blockers (licensing cost, store eligibility) are **resolved in his favor**: he ships free on Unity Personal, ~$124 total, no real-money IAP, clean privacy story, ~9+ rating. The build/distribution leg is ~5–8 days of mostly-Claude-owned scripting on top of the port.

**The decision is not "should we move to Unity" — it's "does the one-form vertical-slice spike clear the fidelity bar."** That spike (one kaiju + one building + the `'screen'`-blend glow re-authored as URP additive, screenshot-diffed against the live build, profiled on a low-end Android) is the single load-bearing gate. **Spend the first phase there and nowhere else.**

- **Hard GO** if the spike reproduces the body art *and* the additive glow layer within acceptable effort → commit the parallel build, keep the PWA live, migrate once at parity.
- **Conditional GO** if bodies match but the glow re-author is marginal → ship with a simplified FX layer or budget extra shader work as a first-class task; still proceed.
- **NO-GO / re-scope** only if the spike shows C# cannot reach Canvas2D fidelity *and* the glow can't be re-authored acceptably → fall back to bake-to-PNG-atlas (accepting static-body loss) or keep the PWA as the shipping surface. **The web PWA staying live throughout means a NO-GO costs only the spike, not the product** — that is the core risk containment of this entire plan.

**Two external dates to calendar now:** the **Apr 28 2026 Xcode-26/iOS-26 SDK floor** (install a compatible Unity 6 toolchain before any post-April submission) and a **2-minute check** that Mike's existing iOS apps cleared the **Jan 31 2026 age-rating questionnaire**.

**Sources:** [Unity — Canceling the Runtime Fee](https://unity.com/blog/unity-is-canceling-the-runtime-fee) · [Unity — Terms Update: Runtime Fee Cancellation](https://unity.com/blog/terms-update-runtime-fee-cancellation) · [Game Developer — Unity killing its Runtime Fee](https://www.gamedeveloper.com/business/unity-is-killing-its-controversial-runtime-fee) · [CG Channel — Unity scraps Runtime Fee but raises prices (Sept 2024)](https://www.cgchannel.com/2024/09/unity-scraps-controversial-runtime-fee-but-raises-prices/) · [Apple Developer — Latest News (age ratings)](https://developer.apple.com/news/) · [SoCast — iOS Age Rating Updates Required by Jan 31 2026](https://www.socastdigital.com/2025/12/15/important-ios-app-age-rating-updates-required-by-january-31-2026/) · [Apple Developer Forums — age-rating deadline thread](https://developer.apple.com/forums/thread/810473) · [groovyweb — App Store publishing cost 2026](https://www.groovyweb.co/blog/how-much-does-it-cost-app-store) · [newly.app — App Store Requirements 2026](https://newly.app/articles/app-store-requirements)

## 6. Locked decision — Dimension (adversarially verified)

### DIMENSION DECISION — LOCKED

**Choice: Option A — 2.5D sprites in a 3D scene.** Textured quads / SpriteRenderers on an XZ ground plane, **orthographic** camera at the iso angle, depth driven by an explicit per-entity sort key ported from `iso.js`'s `depthKey` — not Unity's default center-pivot sort.

**Confidence: 88% in the choice. ~65% in a "clean 1:1 port" cost story** — the renderer decision is near-certain; the effort estimate is where the risk lives (see below).

#### Rationale (3 bullets)

- **It is the only target that reproduces the look by construction.** `iso.js`'s `y=(wx+wy)·HH − wz·WZ` with height-as-screen-Y-and-no-rescale maps exactly onto an orthographic camera + flat billboards + a custom sort key. Options B (Tilemap) and C (full 3D) both break this: B can't hold stateful roaming actors, C foreshortens away the flat baked silhouette and throws out the whole procedural art engine.
- **It protects the codebase's biggest asset — the procedural sprite *output* — while matching Mike's actual goals.** `archetypes.js` only ever emits 2D sprites; A is the only option that consumes them natively (port the bake to C# `Texture2D`, or bake offline to atlases). Ships to iOS/Android identically to B/C, and teaches the highest-transfer Unity skills (2D/sprite/orthographic-cam/sorting/shaders) — directly serving app-stores + tooling + learning, without buying 3D scope Mike explicitly declined.
- **It keeps the migration a port, not a redesign,** preserving the "build in parallel, migrate once at parity, nothing thrown away" default — and leaves a clean incremental on-ramp to real 3D later if Mike ever wants it.

#### Top risk + mitigation

**Risk — "parity" is much further than a sprite import: the port is a full immediate-mode-renderer reconstruction, and the adversarial pass corrected the recon framing on three counts:** (1) the mandatory custom `depthKey` sort *defeats* sprite batching for overlapping dynamic actors, and the heavy transparent-FX overdraw ports over untouched — so A is the cheapest of the three but **not free** on mobile; (2) the art is **not** "baked once" — `entities.js` bakes per-facing×frame×form×scale into a 64-entry LRU **plus a live per-frame `drawGlow`/mote/`_flash` additive (`'screen'`-blend) layer** that is ~40% of the gz-v27→v32 look and **cannot** be captured by a PNG atlas; (3) the true port surface is ~750 live `ctx.` calls across `render.js`/`entities.js`/`sprites_special.js` (sky, shadows, HUD, touch UI, FX) — not just `archetypes.js`.

**Mitigation — gate the parallel-build plan on a one-form vertical-slice spike *before* committing.** Build one kaiju + one building: walk + attack + one `'screen'`-blend beam + the live glow layer + floating damage text, bake-to-`Texture2D`, under an orthographic cam with the ported sort key — then screenshot-diff against the live web build. This is the cheapest place to learn whether C#'s rasterizer can hit Canvas2D fidelity and whether the glow re-author as a shader/particle layer holds up. The migration plan must then carry as **first-class tasks** (not footnotes): ported `depthKey` sort · atlas/material strategy with tint baked in · an overdraw/fill-rate budget profiled on-device · re-author of the live glow/mote/flash FX as shaders/particles · the `wz·WZ`-as-screen-Y flyer-constant-size invariant as a *tested* property · per-form bake-fidelity verification. Define "parity" against **those**, not against "sprites render in an iso scene."

#### Conditions to revisit

- **Mike adds "richer 3D" as a real driver** (true 3D kaiju, dynamic lighting, camera moves) → re-open Option C; A's flat-billboard identity becomes a ceiling rather than a feature.
- **The one-form spike fails fidelity** — C# `Texture2D`/`Graphics.Blit` can't reproduce the Canvas2D look (AA, gradient interpolation, stroke geometry) and the glow re-author can't match the additive layer within acceptable effort → fall back to **bake-to-PNG-atlas offline** for the static body (accepting some loss) or reconsider keeping the PWA as the shipping surface.
- **Primary-source check fails** on Unity 6.3's "2D sprites sort in one scene with 3D Mesh Renderers" claim (flagged **unconfirmed as of mid-2026**) → if that capability isn't real/stable, the depth-sort task gets harder and must be re-budgeted before relying on it.
- **On-device profiling shows the transparent-FX overdraw actually janks** on Mike's target device classes (not expected — the game isn't perf-bound — but it's the one place the "cheap renderer" claim could break) → add FX-layer overdraw reduction (atlas trim, fewer stacked alpha passes) as a hard task rather than a budget.

## 7. Locked decision — Art pipeline (adversarially verified)

### ART-PIPELINE DECISION — LOCKED

#### Choice: **"B-as-destination, A-as-deferred-spike"** — Export the existing JS bakers to Unity sprite atlases (Option B) as the shipping art pipeline; keep the JS procedural generator alive as an offline art-authoring tool; demote the native C#/Painter2D port (Option A) to an optional, post-ship, budget-gated R&D spike that is never on the critical path.

**Confidence: 88%**

#### Rationale (3 bullets)

- **B alone satisfies every one of Mike's actual drivers — A satisfies none that B doesn't.** App Stores, cross-platform tooling, and learning Unity require *shippable art in Unity*, not a generator running natively in C#. Option B delivers pixel-identical art to parity in days, is the cheapest-possible per-frame cost on low-end Android (pre-baked atlas, zero runtime generation), and throws nothing away. The procedural system is fully preserved — it keeps living in the JS bakers as an "add a `FORMS` row → re-export atlas" CI step. The game already bakes everything to a cache and is not performance-bound, so the one thing Option A buys (in-engine runtime generation) is a capability this game does not use.

- **The premise that made A look cheap is false in this codebase.** The "Canvas2D ≈ Painter2D 1:1, mechanical port" framing breaks on ground truth: ~60 live `globalAlpha` sites (many animated, can't be baked into a static color), `globalCompositeOperation = 'screen'` additive blending in `entities.js:258/1558/1587` (Painter2D has *no* blend-mode control), and 28 `ellipse()` calls (Painter2D is `Arc`-only) — plus the bake-to-Sprite path runs through an unpaved UI-Toolkit→RenderTexture readback with a documented main-thread `ReadPixels` stall. A is real engineering and net-new shader work, not a line-by-line port, and it lands the hardest, least-paved corner of Unity on a solo dev's *first* Unity project.

- **The live additive-FX layer is the true technical risk, and it is independent of A vs B.** The signature glow/beam/aura/mote layer (`drawGlow` + `MOTE_FX` per-frame in `entities.js`, ~16 animated `globalAlpha` pulses in `render.js`) is `screen`-blended live every frame and must be re-architected as **URP 2D additive sprites/particles** regardless of which body-art option ships. Naming it explicitly as its own track — and spiking it in Phase 0 — is what actually de-risks the migration; neither B nor A touches it for free.

#### Top risk + mitigation

- **Risk:** The live additive-FX layer (`screen`-blend glow/beams/motes/HUD pulses) has no native equivalent in the chosen sprite pipeline and is the most *visible* effect in the game — get it wrong and the build looks dead even with pixel-perfect bodies.
- **Mitigation:** Make it a **dedicated Phase-0 technical spike**, before committing to any body pipeline: prototype the glow + one beam + the supernova motes as **URP 2D Renderer additive sprites / particles (or a custom additive material)** and validate it on a real low-end Android device. This is the genuine de-risking step; the body-atlas export (B) is comparatively trivial and proceeds in parallel once the FX idiom is proven.

#### Pairing with the locked dimension (2.5D sprite + isometric)

This choice is the natural fit for the locked **2.5D sprite / isometric** dimension — it is not a compromise against it. City ground renders as a Unity **Isometric Tilemap** (one chunk-batched renderer); **buildings and kaiju render as billboard Sprites** with custom-axis depth sort, mirroring today's `drawImage` model exactly. The art splits cleanly along the same seam the web build already uses: **static bodies → pre-baked sprite atlas (B)**, **live FX → URP additive sprites/particles (the Phase-0 spike)**. No 3D meshes, no rigging, no Tilemap-rebuild of buildings — the iso-Tilemap carries only the ground plane, exactly where it's the documented mobile win.

---

## Appendix A — Current-app inventory (migration source of truth)

I now have a complete, accurate picture of all 15 modules, the procedural art engine, the save system, the PWA shell, and the HTML/CSS. Here is the source-of-truth inventory.

---

### Godzilla Smash — Complete System-by-System Migration Inventory

**Source of truth read directly from disk** at `/Users/MGitk/Projects/Godzilla Game`. Live version: **gz-v32** (sw.js `CACHE` + config.js `CACHE_VERSION` in sync). ~10,816 LOC of vanilla ES5-style JS across 15 IIFE modules hanging off one global `window.GAME` namespace, loaded in a fixed `<script>` order in `index.html` (no bundler, no build step). All art is procedural Canvas2D baked to offscreen canvases at runtime. PWA via `manifest.json` + `sw.js`.

**Global architecture pattern (carries to Unity as DESIGN):** every module is `(function (G) { 'use strict'; … G.X = …; })(window.GAME)`. Cross-module calls are *defensive* (`if (G.Foo && G.Foo.bar)`) so any module degrades gracefully if a sibling loads late or is stubbed — this is the headless-testability seam the campaign used. The DAG: `Config → Utils → iso → Assets → Archetypes → SpriteBuilders → Audio → Economy → Entities → World → Env(world_events) → Input → Render → UI → Main`.

---

#### 1. Data / Config — `js/config.js` (308 LOC)
**Responsibility:** Single source of truth. Pure data, zero deps. Holds: `saveKey`/`SAVE` container config, `CACHE_VERSION` (drift-checked vs sw.js at boot), `GRID` (cols 21 × rows 58, TILE_W 56, TILE_H 28, WZ_PX 40 — the zoom lever), `LAYOUT` (block/street period → tier banding), `ROW_HP` (19-tier HP ladder, `HP === cash payout`, 10 → 1e9), the unified **`FORMS` array (20 kaiju)** = per-form `{id,name,family,archetype,tier,base,cost,palette{…},shape{…},attack{kind,cooldown,…}}`, `FORM_BONUS` (collection-multiplier table, must sum to 63 → ×64 at full), `CLAWS_MULT`/`START_ATTACK`, upgrade tracks (`ATKSPD`/`MOVESPD`/`FINISHER`), `COMBO`, `COOLDOWN_*` gate tunables, `RESPAWN` timings, `SPECIALS` (statue/pyramid/sandpile/football/airplane/golden/rainbow/diamond), `RARE_SPAWNS`, `ENV` day/night, `JUMP`/`FLYER_ALTITUDE`, plus consolidated module tunables (`LOCO`/`CAMERA`/`INPUT_GEO`/`AUDIO`/`RENDER`).

**Notable:** the "forms-as-axis" invariant — `attackPower = START_ATTACK × CLAWS_MULT^claws × (1 + Σ FORM_BONUS)`, and `clawsCost` carries the same `(1+Σ)` factor so it **cancels**, keeping `clawsCost === CLAWS_MULT × attackPower` at every multiplier (no save migration ever needed). Tier decoupling: `tier = floor(row / LAYOUT.tierRows)`.

→ **Carries to Unity as DATA.** This is a clean ScriptableObject / JSON port. The 20 FORMS, ROW_HP, all balance constants become authored assets. Zero rewrite of logic.

#### 2. Utilities — `js/utils.js` (117 LOC)
**Responsibility:** pure helpers — `clamp`/`lerp`/`clampLen`, `fmt` (compact k/M/B/T), `shade` (hex tint), `hash` (integer mix), `rng` (mulberry32 seeded), `safeLoad`/`safeSave` (try/catch localStorage), `utf8`/`crc32`/`b64u` (export-code codec — TextEncoder-based, never `btoa(JSON)` so emoji survive), `reducedMotion` (read once from matchMedia).

→ **Mostly carries as DESIGN; REBUILD trivially in C#.** `fmt`, `clamp`, `lerp`, `shade` are one-liners. The seeded **mulberry32 RNG and the integer `hash`** must be ported bit-exact if you want the *same* deterministic city (see World §6). `crc32`/`b64u` must port bit-exact for export-code cross-compatibility (§7).

#### 3. Isometric projection & camera — `js/iso.js` (273 LOC)
**Responsibility:** the 2:1 iso math + follow camera + culling. `worldToScreen: x=(wx−wy)·HW, y=(wx+wy)·HH − wz·WZ`; inverse `screenToWorld` for picking; `pickTile` (raw client → integer {col,row}, accounts for canvas rect, CSS-space so no dpr math); `depthKey(e) = (wx+wy)·1024 + wz·4 + depthBias` (painter's order). Camera: critically-damped follow (`k = 1 − 0.0008^dt`, frame-rate independent), origin clamping to keep the grid diamond covering the screen, `cull()` → reusable visible-AABB by unprojecting the 4 screen corners.

**Notable gotcha — trauma-shake camera:** `trauma ∈ [0,1]` *clamped on add* (so sustained 8/sec autofire can't compound into a quake — the old additive-cap-64 bug); **exponential decay** (`trauma *= SHAKE_DECAY^dt`) for a stable steady-state under repeated fire (linear decay is bistable 0-or-clamp); linear offset `MAX·trauma`; legacy call magnitudes ~3..15 mapped via `SHAKE_TRAUMA_K`. No-op under reduced-motion.

→ **Carries to Unity as DESIGN, REBUILD with engine facilities.** Unity gives you a camera, world↔screen, and `ScreenPointToRay`/tilemap-cell picking for free, **but** the design decisions (the 2:1 skew constants, the corridor-ahead focus anchor 0.5/0.66, the trauma model, depth-key) must be re-implemented or re-tuned. In a true Unity-3D port the projection is replaced wholesale; in a Unity-2D-iso-Tilemap port you keep the algebra. The trauma-shake model is worth porting verbatim as a Cinemachine impulse profile.

#### 4. Procedural art / sprite baking — the art engine (3 files, ~3,125 LOC)
This is the single largest migration risk. **All 20 kaiju + every building are drawn in code, baked to offscreen canvases, cached, and blitted.** No image assets exist except the two PWA icons.

- **`js/assets.js` (559 LOC)** — the offscreen-canvas LRU memo cache (`get(key,w,h,drawFn)`, cap 64, dpr-aware re-bake), the **generic iso box-prism building renderer** (`drawPrismBuilding` — 5 style BANDS shack→skyscraper, windows via bilinear-interpolated quad faces with per-stage knockout, greebles chimney/tank/antenna/neon, 3 damage stages from hp/maxHp, pitch vs flat roofs), the ground diamond tile, and `buildingSprite(b)` — the **dispatch point** that routes `b.sprite` to either the prism or `GAME.SpriteBuilders[key]`, with positional-arg backward-compat and silent prism fallback. Every returned canvas is stamped `_cssW/_cssH/_anchorX/_anchorY` for correct anchored blitting.
- **`js/archetypes.js` (1755 LOC)** — the **kaiju art engine**. `GAME.Archetypes.build()` dispatches on `shape.archetype` to **`buildWyrm` / `buildFlyer` / `buildHydra` / `buildMecha`** (the 4 silhouette families covering all 20 forms via per-form `shape`/`palette` params from config). Shared primitives: `facingGeom` (the authored S/SE/E/NE pose table — single source, entities consumes it), `drawPlates`, `drawFissures`, `drawHydraNeck`, `drawGhidorahHead`, `drawBatWing`, `drawMothWing`/`drawGodRays`, `drawPteranoWing`, `drawMech*` (panels/spines/cannon/backpack/head), `rimCol` (one shared specular token `255,250,235`), deterministic GLSL-style `hash()` for jitter. **§1.6 BAKE GUARDRAILS** (load-bearing): no `shadowBlur`/`ctx.filter`/`globalCompositeOperation` in any builder; idle bakes frame 0 only; fixed `SPR_W=150 SPR_H=168` anchor (75,144.5).
- **`js/sprites_special.js` (811 LOC)** — `GAME.SpriteBuilders.{statue,pyramid,field,sandpile,plane,houseTint}` — landmark/special non-prism sprites (genuine iso pyramid, statue with capstone+torch glow, football field, airplane flat sprite, gold/rainbow/diamond house tints).

**Facing system:** 8 directions, only 5 authored (S,SE,E,NE,N), 5/6/7 are mirror-X of the authored ones (`FACING_MAP` in entities.js). The static body frame is baked & LRU-cached by a key `kj:token:base:fsm:frame:scale`; a **live glow overlay** (`drawGlow` — eyes, plate shimmer, breath charge, per-form motes) is drawn on top each frame and is *not* baked (animates).

→ **MUST BE REBUILT — and this is the central art-pipeline decision delegated to the fleet.** Porting `archetypes.js` line-by-line to C# Canvas-equivalent (e.g. a custom mesh/`Texture2D` rasterizer or runtime `RenderTexture` baking) is possible but is the most expensive path and fights Unity's grain. Realistic options to recommend: **(a) hybrid** — bake the procedural generator *once* offline (run the existing JS in headless Canvas / node-canvas, or a one-time C# port) to produce a sprite atlas per form/facing/frame, then ship authored sprites (this preserves the exact look with zero runtime cost and is the most Unity-native); **(b)** keep procedural runtime baking in C# only if per-form palette variation at runtime is still required (it currently is *not* — forms are fixed in config). The data (`FORMS[].palette/shape`, BANDS, SPECIALS) carries; the *rendering code* is a rewrite either way. Flag the bake-guardrails and the mirror-facing scheme as port-time constraints.

#### 5. Entities / locomotion / AI targeting — `js/entities.js` (1672 LOC)
**Responsibility:** `GAME.Kaiju` (the player unit) **and** `GAME.FX` (the particle/beam/text/shake/hitstop/flash pool). Kaiju owns: locomotion (accel/maxSpeed/friction integration, AABB collision vs standing footprints via `World.footprintsNear`, frontier advance), jump kinematics (`pos.z`/`velZ`, `Config.JUMP`) — **flyers (Mothra/Rodan) hover at fixed altitude and never jump**, instead passing *over* buildings; the **8-way facing→sprite** resolution; the 5 **data-driven attack kinds** (`beam/bolts/cloud/dive/volley`, dispatched from `form.attack.kind`, each with its own FX), the **Nova Slam finisher** (charge 0→1, AoE with falloff, parallel to autofire, never touches the re-fire gate), DoT application (Mothra cloud), target acquisition (explicit click → faced → nearest-standing, airborne prefers flying), the aim-highlight target, draw (cached body + live glow), muzzle position (must match the drawn breath glow exactly).

**Notable algorithms/gotchas:**
- **Re-fire gate decoupled from attack animation:** `gate = clamp(form.attack.cooldown × SCALE, FLOOR, CAP)`, then the attack-speed track asymptotically reduces it. Level-triggered (not edge) → hold-to-autofire + rapid tapping; smashes are interruptible.
- **FX pool** = fixed 320 (90 reduced-motion) preallocated particles, ring-buffer `acquire()`, zero per-frame alloc. Beams/bolts/missiles/puffs/rings/texts as separate small arrays. `hitStop` (max-wins, consumed by the loop), `screenFlash` (alpha owned here, drawn by render).
- **FX.spawnRewardText** (the green "+$N" combo popup) fires from `world.destroy()` not `dealDamage` so DoT/AoE kills surface it too.

→ **Carries to Unity as DESIGN, REBUILD as logic.** Locomotion, collision, targeting priority, the 5 attack signatures, finisher, DoT, jump/hover rules are all clean gameplay logic → MonoBehaviour/ECS rewrite. The **FX pool** maps to Unity particle systems / object pools (don't port the Canvas2D draw code). The muzzle-must-match-glow coupling and the facing/mirror scheme are art-pipeline constraints to preserve.

#### 6. World / city spawn + building lifecycle — `js/world.js` (864 LOC)
**Responsibility:** the 21×58 iso city. Deterministic procedural building factory (`makeBuilding` — per-cell seed from `hash(WORLD_SEED ^ hash(col·…) ^ hash(row·…))`, tier→HP from ROW_HP, footprint/height/style), block-and-street layout pass, special placement (statue top-mid, 4 pyramids, football field, 10 sand piles, 5 airplanes as separate `flyers[]`), sparse grid + occupancy maps. **`hitBuilding` is THE SINGLE damage entry point** — every direct hit, AoE, and DoT tick converges here so bank/FX/audio fire exactly once. The 4-state **lifecycle FSM** standing→crumbling→rubble→respawning, rare-spawn roll (gold/rainbow/diamond) on respawn, `triggerFinale` (statue-destroyed-while-can-one-shot → win card), flyer drift+wrap, plus the pick helpers (`pickBuildingAtScreen` height-aware sprite-hitbox pick, `pickFlyer` altitude-aware, `getTargetAt`).

**Notable gotchas:**
- **Off-screen respawn gate:** a cleared building only begins respawning once it's outside the camera cull AABB + margin (`clearToRespawn`) — forces the player to roam vs camping a block. Headless/no-camera → ungated (testable).
- Deterministic `WORLD_SEED = 0x9E3779B1` → identical city every load.
- Standing footprints are SOLID (collision/targeting); crumbling/rubble are PASSABLE.
- `hitBuilding` uses `Math.floor` not `| 0` (bitwise truncates to 32-bit on big HP).

→ **Carries to Unity as DESIGN.** The lifecycle FSM, single-damage-entry-point discipline, off-screen respawn gate, rare-spawn table, frontier persistence, and **deterministic seeded generation** are all logic that rewrites cleanly. To reproduce the *exact same city*, the mulberry32 RNG + integer hash (§2) must port bit-exact; otherwise the generation algorithm carries but the specific layout differs (acceptable). The sprite-hitbox pick (§4-coupled) becomes Unity collider raycasts.

#### 7. Economy / upgrades / forms / combo / **save** — `js/economy.js` (1563 LOC)
**Responsibility:** money, all purchases, the combo multiplier, the form-collection power axis, the shop DOM, **and the entire save system.**
- **Power/economy:** `attackPower`, the bounded-economy ceiling (`CAP_HP = max(ROW_HP)` — damage upgrades hard-stop when you one-shot the strongest building), `clawsCost` (the cancel-invariant), `atkSpeed`/`moveSpeed`/`finisher` tracks, `buyForm`/`switchForm` with family unlock-gating, win-finale (`canFinale`/`markFinale` — grants free World 2), `bankDestroy` (combo-scaled payout), combo (`bumpCombo`/`tickCombo`, STEP 0.12 → cap 2.0).
- **Combo:** the *only* damage multiplier; window 3250ms (shorter than rubble 4500ms so you can't camp a flattened block).
- **v4 multi-slot save system (built, shipped through Phase 4, NOT a separate file):** one localStorage key `godzilla-save-v4` holds a container `{v:4, rev, activeSlot, migratedFrom?, slots:[{id,name,createdAt,lastPlayed,…,prestige,game:{15 flat fields}}]}` written as a single atomic `setItem` (slots can't cross-corrupt). **Crash-safe v3→v4 migration** (keeps the v3 key as a safety net, reaps it only on a *later* boot that re-read a good v4). `sanitizeGame` = an **allowlist** rebuild (reads only the 15 known fields by name → prototype-pollution-proof, clamps each). Slot API: list/switch/new/rename/delete (+session undo). **Export/import codes:** `GZS1:` + base64url(UTF-8 JSON) + `.` + crc32hex — a true backup that survives clearing the browser. Batched saves (dirty flag + 2s timer + visibilitychange/pagehide flush); purchases save immediately.
- **Shop DOM:** builds all 5 tabs (Upgrades/Evolutions/Characters/Worlds/Saves) as DOM rows into `#shop-body`.

→ **SPLIT.** The economy/combo/power *logic and the save data model* carry to Unity as DESIGN+DATA — clean rewrite, the v4 container schema and the allowlist-sanitize discipline are worth porting verbatim. **The shop DOM builders must be REBUILT** as Unity UI (UGUI/UI Toolkit) — they're ~600 LOC of `document.createElement` that has no Unity analog. The **export/import codes carry as DATA contract**: if you want gz-v32 web saves to import into the Unity app, the `GZS1:` format + crc32 + base64url must port bit-exact (§2). The `Math.pow(CLAWS_MULT, level)` reaches huge numbers — note C# `double` vs JS `number` parity (both IEEE-754, fine).

#### 8. Input (touch + desktop) — `js/input.js` (742 LOC)
**Responsibility:** collapses Pointer Events + keyboard into ONE `consume()` intent struct `{moveX,moveY,attack,target,jump,charge,chargeRelease}` (one allocation, edge-signals reset each consume). **Touch:** multi-thumb (floating joystick in left zone, fixed bottom-right SMASH/JUMP/NOVA discs each claiming their own pointerId, safe-area-inset aware), tap-to-target elsewhere. **Desktop:** left-click/hold = aim+autofire (beam follows cursor), WASD/arrows, Space=attack, Shift/J=jump, F=Nova. Screen→world direction mapping (the deliberate *non*-inverse relabel: screen-up = +wy forward), 8-sector facing from world heading projected back to sprite space.

**Notable gotchas:** the "up = into the scene" control contract is a fixed relabel, not the geometric projection inverse (inverting would make up walk backward). `isTouch` (sticky routing flag) is decoupled from `currentInput` (display modality) so hybrid touch-laptops keep mouse handling. NOVA disc inert until owned. Blur/visibility clears held keys (anti-"walk forever"). Cancel-without-latch on Nova so an OS gesture doesn't detonate.

→ **REBUILD with Unity Input System.** Zero of this code carries (it's all DOM Pointer Events). But the **control *design* carries as DESIGN**: the multi-thumb layout, the screen→world relabel, the tap-to-target priority, the autofire-via-held-button model, safe-area handling (Unity has `Screen.safeArea`). The intent-struct boundary is a clean seam to preserve. This is exactly the rewrite that *justifies* Unity for the app-store/cross-platform goal (native touch + gamepad come free).

#### 9. Rendering / HUD — `js/render.js` (1036 LOC)
**Responsibility:** the painter's draw loop. Per frame: clear (device px) → dynamic sky gradient from `Env.phase()` → sun/moon disc → 3-layer parallax skyline (baked once, x-scrolled by camera.x, dpr-crisp) → ambient tint → enter camera transform → ground diamond → contact shadows → aim ring → **build visible list (culled buildings + flyers + player) → depth-sort (insertion sort, mostly-presorted) → blit** → world-space FX → leave transform → screen flash → HUD. HUD: combo pip, floating damage text, **finale beacon** (on-screen pulsing ring or clamped edge-arrow → statue), and touch-vs-desktop controls (discs vs key-legend + Nova pip).

**Notable gotcha — flyer depth bias:** `pushPlayer` adds `depthBias = 1 + ceil(min(3, z·WZ/HH))·1024` so a lifted/flying kaiju renders *over* the buildings it visually covers, not through them (Mike QA fix). Player-only; planes/buildings keep plain `iso.depthKey`.

→ **REBUILD entirely (it's Canvas2D draw code) — design carries.** Unity's renderer + sorting layers + Cinemachine replace the manual painter's loop, cull, parallax, depth-sort. The **depth-bias-for-altitude trick** maps to sorting-order/Z logic and must be re-derived. The HUD (combo pip, target HP bar, finale beacon) becomes Unity UI. Sky/parallax/day-night become a Unity skybox/layered sprites + a global light driven by Env.

#### 10. Audio — `js/audio.js` (265 LOC)
**Responsibility:** **fully procedural WebAudio SFX, zero asset files.** Lazy AudioContext (created on first gesture), one shared white-noise buffer, an **iOS keepalive** silent-loop source + per-frame `tick()` resume (iOS suspends the ctx on backgrounding/calls). Synth methods: `smash`/`crumble` (tier-scaled boom)/`finisher`/`evolve`/`recruit`/`buy`/`deny`, all built from oscillators + filtered noise envelopes. Mute source-of-truth deferred to Economy.

→ **REBUILD — design carries partially.** The synthesis recipes are clean specs you *could* port to a Unity DSP/`OnAudioFilterRead` graph, but the Unity-native path is to render these SFX to clips once and play AudioSources (much simpler, app-store-friendly). The iOS keepalive hack is unnecessary in Unity (the engine owns the audio session). Recommend: bake to clips, keep the tier-scaling/variance design.

#### 11. UI / shop chrome + day-night — `js/ui.js` (478 LOC) + `js/world_events.js` (217 LOC, `GAME.Env`)
**`ui.js`:** the DOM HUD glue (not canvas) — `#money`, `#form-badge` (active unit + **"⚡ Power N/19"** true-progression meter = how many ROW_HP tiers your attackPower one-shots), open/close/pause lifecycle of `#shop`, the **target-HP boss-bar** (`syncTargetHp` — fast fill + lagging white chip-ghost, snaps on target switch), mute toggle, win-card, dirty-flag refresh (only writes DOM on change). Pause is state UI owns and Main reads (`GAME.UI.isPaused`), bound to Esc/P; win-card owns the keyboard while open.
**`world_events.js` (`GAME.Env`):** the day/night clock (scalar t over `ENV.dayLengthMs=120s`, smoothstep `dayness`), `phase()` → interpolated sky/tint/sun/moon/ambient for render, and `announce(text)` → the `#toast` element (rare-house/recruit/finale fanfares).

→ **REBUILD (DOM) — design carries.** All of ui.js is DOM manipulation → Unity UI. The dirty-flag refresh pattern, the boss-bar chip-damage feel, the power meter formula, and the pause-ownership model carry as DESIGN. The Env day/night curve + `phase()` interpolation carries as clean logic driving a Unity directional/global light + skybox.

#### 12. PWA / service worker — `manifest.json` + `sw.js` (45 LOC) + `index.html` (CSS/DOM shell)
**`sw.js`:** cache-first app shell, `CACHE='gz-v32'` is the authority (bumped with config.CACHE_VERSION). Caches the 15 JS + shell; network-fallback only caches same-origin `resp.ok` basic responses (never poisons with 404/opaque); offline serves `index.html` only for navigations, 503 (never HTML-as-JS) for scripts.
**`index.html`:** all CSS (HUD, shop modal, target-HP bar, toast, win-card) + the DOM skeleton + the fixed script-load order. The shop tabs/HUD elements ui.js & economy.js wire into live here.

→ **DROP — replaced by native app packaging.** The PWA/service-worker exists *because* the game ships as a web app; the entire Unity-move premise is native iOS/Android binaries, so sw.js/manifest/cache-versioning go away. The HTML/CSS layout is reference-only for the Unity UI rebuild. **The web PWA stays live in parallel** (Mike's default migration strategy) so this keeps running until the Unity build reaches parity.

#### 13. Game loop / fixed-timestep — `js/game.js` (156 LOC)
**Responsibility:** boot + the rAF loop. Boot: load save, assert `FORM_BONUS` sums to 63, spawn city, create player from active unit, init Input/UI, wire audio-unlock + blur/focus/visibility pause, cache-drift warn. Loop: **fixed-timestep sim** (`STEP = 1/60`, max 5 substeps, spiral-of-death guard) driving `player.update / World.updateBuildings / updateFlyers / tickCombo / FX.update / camera.follow`, with **hit-stop** (a real-time freeze on a satisfying kill — sim skipped, rendering continues, freezes the frame for impact). `syncForm`/`rebuildPlayer` for post-purchase form swaps without teleporting. Big-gap dt clamp; input edges drained while paused.

**Notable:** Main owns the DPR transform (`ctx.setTransform(dpr,…)`, dpr capped at 2); render inherits it. The fixed-step sim vs variable-rate render split is clean.

→ **Carries to Unity as DESIGN.** Unity has `FixedUpdate` (fixed-step) + `Update` (render) natively — the manual accumulator/substep/spiral-guard becomes engine-managed. The **hit-stop** (kill-freeze) is a deliberate game-feel beat to preserve (Unity: `Time.timeScale` pulse or an unscaled-time freeze). The form-sync-without-teleport and the boot assertions carry as logic.

---

#### Migration summary (what's DATA/DESIGN vs REBUILD)
| Subsystem | Verdict |
|---|---|
| config.js (FORMS, ROW_HP, balance) | **DATA** — JSON/ScriptableObject port, no logic change |
| utils.js (rng/hash/crc32/b64u) | **REBUILD trivially**; bit-exact port needed for same-city + save-code compat |
| iso.js (projection, camera, trauma-shake, cull) | **DESIGN**; rebuilt on Unity camera/Cinemachine — port the shake & depth-key models |
| **art engine (assets/archetypes/sprites_special, ~3,125 LOC)** | **REBUILD — the central pipeline decision.** Recommend hybrid: bake the existing procedural generator → sprite atlas (preserves exact look, Unity-native), data carries, draw code is a rewrite |
| entities.js (locomotion/AI/attacks/finisher/FX pool) | **DESIGN** logic rewrite; FX pool → Unity particles |
| world.js (gen, lifecycle FSM, single damage entry, off-screen respawn) | **DESIGN** — clean logic; bit-exact rng for identical city |
| economy.js (power/combo + **v4 save + GZS1 codes**) | **DATA+DESIGN** logic & save schema carry verbatim; **shop DOM REBUILD** as Unity UI; codes need bit-exact codec |
| input.js (multi-thumb touch + desktop) | **REBUILD** on Unity Input System — design carries; this is what justifies the move |
| render.js (painter loop, HUD, parallax, depth-bias) | **REBUILD** (Canvas2D) — sorting/depth-bias design carries |
| audio.js (procedural WebAudio + iOS keepalive) | **REBUILD** — recommend bake-to-clips; iOS hack drops |
| ui.js + world_events.js (DOM HUD, day/night) | **REBUILD** (DOM) — boss-bar/power-meter/pause/day-night design carries |
| PWA (sw.js/manifest/index.html) | **DROP** — replaced by native packaging; web PWA stays live in parallel |
| game.js (fixed-step loop, hit-stop) | **DESIGN** — Unity Fixed/Update; preserve hit-stop game-feel |

**Cross-cutting things nothing must lose in migration:** the single-damage-entry-point discipline (world.hitBuilding), the bounded-economy cancel-invariant (clawsCost === CLAWS_MULT × attackPower), the trauma-clamp shake, the off-screen respawn gate, the fixed-timestep + hit-stop, the v4 atomic single-key save container + allowlist sanitize, the GZS1 export-code format (for web→Unity save portability), the 8-way authored-5-mirror-3 facing scheme, and the FORM_BONUS-sums-to-63 boot assertion.

Key files for the migration plan authors: `js/config.js` (all data), `js/economy.js` lines ~410-820 (the v4 save system + GZS1 codes), `js/archetypes.js` (art engine + §1.6 bake guardrails at lines 42-70), `js/iso.js` (projection + shake), `js/game.js` (loop), and `docs/campaign/CAMPAIGN-BOOT.md` (project history/decisions).
