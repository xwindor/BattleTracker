# Spec: widen Matrix hierarchy parent/child to files and personas; align Public Space add controls with hosts (minus IC)

## Request

Widen `canHaveParent()` in the Matrix hierarchy editor so a `file`- or
`persona`-type target in Public Space (`context === "public"`) can be
assigned a parent (restricted to a `device`-type Public Space target, as
today), and add "File" and "Persona" add controls to Public Space alongside
the existing "Loose Device" control.

This does **not** cross a `SCOPE.md` boundary — it stays inside "representing
state" (where an icon sits relative to another icon), and does not add any
new resolved mechanic. It does, however, correct a premise in the request:
see "Governing rules" below — RAW does not support treating this as "PAN
membership" for files/personas, only as location/co-location bookkeeping.

## Governing rules

**PAN/WAN definitions and device-only membership.** A PAN is a master
device (commlink/deck) plus devices slaved to it, capped at (Device Rating ×
3) slaves; a WAN is the same shape with a host as master and effectively
unlimited device slaves. "Only devices can be slaves, masters, or part of a
PAN. In a WAN, the slaves must be devices, and the master must be a host."
(p. 233)

**Devices vs personas.** Devices and personas are the only icon types that
act in the Matrix (hosts act "internally"); a device is any wireless
real-world object, and persona is the mode an icon takes when a person is
actively connected through a device. (p. 234)

**Persona subsumes the device icon; agents are personas; IC is host-only.**
When a person connects through a device, the device's icon is subsumed into
the persona's icon. An agent is itself a persona: alone, it replaces the
device's icon exactly like a human user; alongside its owner's persona on
the same device, it shows as its own separate persona icon. Each IC program
has its own persona, and "IC programs are not connected to devices because
they're only found in hosts." A technomancer's living persona attaches to no
device at all. (p. 235)

**Files are data objects; the PAN icon-collapse is a display convention.**
A file is a data collection (film, song, book, records, image, folder of
other files) with its own icon. This page's own description of a PAN — an
individual's devices visually collapsed to one icon — never lists files as
part of that collapse. (p. 219)

**File protection is independent of location.** Protecting a file (Simple
Action, Computer + Logic [Data Processing]) sets a rating that blocks
reading/changing/deleting/copying until broken, and has no printed
dependency on the file's device/host location. (p. 239)

**Mark propagation is device-only at both ends** — already established and
implemented, cited here for completeness: `RULINGS.md` 2026-09-03,
"Propagation is device-only at both ends," citing p. 233
(`rules/pages/p0235.txt:54-58`, freshly re-confirmed this run). Confirmed
independently in code: `MatrixStateService.addMark()` gates the entire
propagation walk on `target.type === "device"` before it ever looks at
`parentTargetId`; `canHaveParent()`/`parentOptionsFor()` are a UI-side gate
on an entirely separate code path. Widening the child-type gate cannot
change what propagates.

## Interactions and exceptions

- **Mark propagation** (RULINGS.md 2026-09-02 "Marks propagate up the
  containment hierarchy," 2026-09-03 "Propagation is device-only at both
  ends," 2026-09-03 "Propagation is visible, not reversible") — unaffected
  by this feature; explicitly confirmed above. No change needed to
  `MatrixStateService.addMark()`, `collectPropagationStops()`, or
  `previewPropagation()`.
- **Host containment (`linkedHostId`)** — untouched. `canHaveParent()`'s
  `context === "public"` gate stays as-is; a device/file/persona inside a
  host still has no parent-picker at all (host containment is a different
  mechanism, per the existing doc comment on `parentTargetId`).
- **Device Rating × 3 slave cap** (p. 233) — not enforced anywhere in this
  app today for devices; this feature does not change that, and per
  `SCOPE.md`'s "Enforcing legality" section any enforcement is a separate,
  explicit decision.
- **Cross-grid −2 dice pool penalty, direct-connection defense-rating
  inheritance, Sleaze-failure one-way marking** (all p. 233) — all
  resolve-a-test mechanics, out of scope regardless of this feature.
- **Technomancer living persona / sprites** (p. 235) — adjacent, not
  requested, not touched by this feature.

## Edge cases the book defines

1. A PAN master (commlink/deck) caps its slaved devices at Device Rating ×
   3; a WAN master (host) has no such cap ("practically unlimited")
   (p. 233).
2. Marking a slaved device also marks its master, even if the slave was
   marked via a direct connection — but never the reverse, and a failed
   Sleaze against a slave marks only the slave's owner, not the master
   (p. 233).
3. A device's icon disappears (is "subsumed") while a persona is actively
   connected through it (p. 235).
4. An agent running alone on a device replaces that device's icon; an
   agent running alongside its owner's persona on the same device appears
   as a separate persona icon (p. 235).
5. IC has no existence outside a host — "only found in hosts" (p. 235).
6. File protection rating is set by a Simple Action test and is unrelated
   to the file's device/host location (p. 239).

## Undefined / needs a table ruling

1. **Should the app flag a device exceeding its Device Rating × 3 slave
   cap?** The book gives a hard number, but the tracker enforces nothing
   here today. Recommended default: do nothing this pass — no counting, no
   warning. Reason: keeps this feature to "widen the child-type gate," and
   `SCOPE.md` treats legality-enforcement as a per-feature decision rather
   than a default; if wanted, it should be scoped and decided as its own
   feature with its own acceptance criteria.
2. **Should a Public Space target's type be changeable to `"ic"` at all?**
   The book states flatly that IC only exists in hosts. Recommended
   default: no — hide/disallow `"ic"` in the type control whenever
   `context === "public"`, mirroring the missing add button, rather than
   allow the UI to reach a state the rules define as impossible.
3. **Should parent candidates ever include a non-device (file/persona) as
   the parent of another file/persona?** Recommended default: no — parent
   candidates stay restricted to `type === "device"`, matching both the
   book (only a device is ever a master of anything, p. 233) and the
   existing `parentOptionsFor()` filter, which needs no change under this
   default.
4. **Should the "same controls as a host" framing literally include a
   disabled IC button in Public Space** (visible but inert, with an
   explanatory tooltip), or should the control simply not exist there?
   Recommended default: does not exist — an always-disabled control adds
   UI noise for something the rules never allow, and Public Space already
   has precedent for offering fewer controls than a host (today, exactly
   one).

## Scope classification

**TRACK**

- A `file`-type Public Space target can be given a `device`-type parent in
  Public Space, rendered nested in the tree the same way a device parent
  already renders (p. 219, p. 233).
- A `persona`-type Public Space target can likewise be given a `device`-type
  parent in Public Space, representing an agent's persona running on that
  device (p. 235).
- Public Space's add controls include Device, File, and Persona (not IC),
  mirroring three of a host's four controls (p. 235 — IC is host-only).
- Mark propagation stays device-only at both ends and is unaffected by the
  widened child-type gate (RULINGS.md 2026-09-03; confirmed in code this
  run).
- No UI path allows a Public Space (`context === "public"`) target's type to
  become `"ic"` (p. 235).

**GM RESOLVES**

- Whether a specific device actually exceeds its Device Rating × 3 slave
  cap, and what to do about it (p. 233).
- Which rating (slave's own vs. master's) a slaved device uses on a given
  defense test (p. 233) — an opposed-test resolution.
- Whether, narratively, a device's icon should be treated as "subsumed" by
  an active persona at any given moment (p. 235) — a fictional/cosmetic
  call, not state the app needs to compute.

**OUT OF SCOPE**

- Dice-pool math for a slaved device's defense test using its own or its
  master's rating (p. 233) — resolving a test.
- File protection mechanics — the Simple Action test, its rating, and
  breaking it (p. 239) — a different, unrequested mechanic; not touched by
  this feature.
- The cross-grid −2 dice pool penalty and grid-hopping (p. 233) — resolving
  a test.
- Any deeper technomancer/sprite living-persona modeling (p. 235) —
  adjacent subsystem, not part of this request.

**SCOPE QUESTION**

- Displaying a running count of items nested under a device master (toward
  the Device Rating × 3 cap), purely as a readout with no enforcement.
  *For:* it is exactly the kind of tedious-to-hold-in-your-head number
  `SCOPE.md` says the tracker should track. *Against:* it is new surface
  beyond what was asked, and even an unenforced count risks reading as an
  implied rule the app is now watching, when `SCOPE.md`'s default leans
  toward warning rather than any new limit-tracking. Flagging for your
  call, not deciding it here.

## Acceptance criteria

1. A `file`-type target with `context === "public"` can be assigned a
   parent via `parentOptionsFor()`, restricted to `device`-type targets
   also in Public Space (p. 233; existing `parentOptionsFor()` filter,
   unchanged).
2. A `persona`-type target with `context === "public"` can likewise be
   assigned a `device`-type Public Space parent through the same mechanism
   (p. 235).
3. Placing a mark on a `file` or `persona` target that has a `device`
   parent does not place any mark on that parent device — `addMark()`'s
   `target.type === "device"` gate is unchanged and still refuses to enter
   `propagateMarkUp()` for a file or persona (RULINGS.md 2026-09-03,
   p. 233).
4. Placing a mark on a `device` target does not place any mark on a `file`
   or `persona` parented to it — propagation only ever walks upward from a
   marked device to its parent/host, never downward or sideways to
   children (p. 233; existing `collectPropagationStops()` behaviour).
5. `parentOptionsFor()` called for a `file` or `persona` target returns
   only `device`-type Public Space targets, identical in shape to what it
   already returns for a `device` target (p. 233 — only a device is ever a
   master).
6. Public Space's header controls include an "Add File" and "Add Persona"
   button alongside the existing "Loose Device" button, and no "Add IC"
   button (p. 235).
7. No control in the app allows setting a target's `type` to `"ic"` while
   that target's `context` is `"public"` (p. 235 — "IC programs ... are
   only found in hosts").
8. A device or file inside a host (`linkedHostId` set, `context !==
   "public"`) is still never offered a parent picker at all — the
   `context === "public"` gate on `canHaveParent()` is untouched by this
   feature (existing behaviour, `parentTargetId` doc comment).

## Gameplay scenarios to survive

1. **Ordinary case — agent on the open grid.** GM adds a device ("Fixer's
   Commlink") to Public Space, then adds a persona ("Fixer's Agent") and
   parents it to the commlink. Expected: the persona renders nested
   beneath the commlink. Marking the persona three times leaves the
   commlink's mark count untouched; marking the commlink leaves the
   persona's mark count untouched.

2. **File nested under a device.** GM adds a device ("Courier Drone") to
   Public Space, then a file ("Stolen Manifest") parented to it. A decker
   marks the drone (now 1/3) — the file is unaffected. The decker then
   marks the file directly — the drone's count stays at 1, no propagation
   either direction, and the mark-preview highlight does not light up the
   drone when the GM is about to mark the file.

3. **Device chain still propagates; a file at the end of it does not.**
   Device A (a loose sensor) is parented to Device B (a rigged vehicle),
   which has a file ("Sensor Log") parented to it. Marking Device A
   propagates the mark up to Device B (existing open-grid chain, Decision
   7b/8). Marking the file does not propagate to Device B and does not
   continue the walk, even though the file's own parent is a device.

4. **Attempted IC outside a host.** The GM wants to represent a rogue IC
   program loose on the open grid (say, extracted mid-run). No add control
   in Public Space creates it, and no type dropdown lets an existing
   Public Space target become `"ic"`. The GM records this as a note or log
   line instead — matching p. 235's flat statement that IC only exists in
   hosts.

5. **Mark cap independence at a device/file boundary.** A device parent
   already holds 3 marks from a decker (at cap). The same decker places a
   fresh mark directly on a file parented to that device. Expected: the
   file's own mark count increments independently (files have their own
   3-mark cap), nothing propagates to the device (file isn't a device),
   and the device's display is unaffected by the file's mark.

6. **Host-boundary regression check.** A device already sitting inside a
   host (`linkedHostId` set) is confirmed to still show no parent picker
   at all after this change, and neither does a file inside that same
   host — the `context === "public"` gate on `canHaveParent()` is
   unaffected by widening the type check.

---

## Implementation plan — added by Stage 1b (technical)

This section does not re-derive the rules established above; it plans the
build against the analyst's TRACK classification and eight ACs.

### The load-bearing finding

`canHaveParent()` currently answers two different questions that happen to
share an answer today: "can this target have a parent?" and "can this target
BE a parent?" The `+` add-child button binds `[canAddChild]="canHaveParent(t)"`
(`hierarchy-editor.component.html:473`). Widening `canHaveParent()` without
splitting the second question out would put a working add-child button on
every file and persona card, letting a GM create a device nested under a
file — which the rules forbid and this feature never intended.

**Split them.** Add `canBeParent(target)` carrying `canHaveParent()`'s OLD
body (`type === "device" && context === "public"`), and route the
`[canAddChild]` binding and both `parentOptionsFor*()` filters through it, so
"what can be a parent" has exactly one definition.

### Current behaviour (read from code)

- `canHaveParent(target)` (`hierarchy-editor.component.ts:1219-1221`):
  `type === "device" && context === "public"`.
- `parentOptionsFor()` (`:1186-1189`), `parentOptionsForNewTarget()`
  (`:1200-1202`) filter candidates to `t.type === "device"` — the
  destination-side rule, which Decision 3 leaves unchanged.
- `commitParentField()` (`:1238-1244`) writes via `setParent()`/`clearParent()`
  only when `canHaveParent(target)`; otherwise silently clears. Single choke
  point — must stay single.
- `setParent()`/`clearParent()` (`:1289-1300`) are the only writers of
  `parentTargetId` outside `deleteTarget()`'s re-homing (`:694-711`).
  `setParent()` re-validates against `parentOptionsFor()` at commit time.
- `parentDropWarning()` (`:1281-1287`) fires when
  `f.type !== "device" && f.hostId === null && f.parentTargetId`. Rendered at
  `hierarchy-editor.component.html:380-382`.
- The Type `<select>` (`hierarchy-editor.component.html:364-371`) already
  hides the `"ic"` option unless `targetForm.hostId !== null`. **AC-7 is
  therefore already satisfied today** — but no test asserts it.
- The Parent field's template gate (`:405`):
  `targetForm.type === 'device' && targetForm.hostId === null`.
- `openAddChildTarget()` (`:544-555`) always opens a device Add form. Its only
  caller is the `[canAddChild]` binding.
- **Propagation is gated independently and correctly**: `addMark()`
  (`matrix-state.service.ts:389-395`) and `previewPropagation()` (`:426-430`)
  both short-circuit on `target.type !== "device"` before touching
  `parentTargetId`; `collectPropagationStops()` (`:496-538`) additionally
  requires `parent.type === "device"`. **AC-3, AC-4 and the amber-highlight
  scenario are already true today with zero code change.**
- `childrenOf()` (`:1104-1106`) has no type check, and `publicTargetNodeTpl`
  recurses regardless of type — a non-device child already renders correctly
  nested. No change needed.
- `MatrixTarget.parentTargetId`'s doc comment (`src/Matrix/MatrixTarget.ts:83-117`)
  needs an addendum: a file/persona MAY now hold a `parentTargetId` (device
  only) as a location fact, and still never propagates through it.

### Affected paths

Exhaustive — six files, confirmed by repo-wide grep for `canHaveParent`,
`parentOptionsFor`, `parentDropWarning`, `canAddChild`.

1. **`hierarchy-editor.component.ts`**
   - `canHaveParent()` — widen to a `PARENTABLE_TYPES` check
     (`device`/`file`/`persona`) plus `context === "public"`.
   - **New `canBeParent(target)`** — the old body, kept as its own named
     predicate. Route `parentOptionsFor()`, `parentOptionsForNewTarget()` and
     `[canAddChild]` through it.
   - `parentDropWarning()` — condition must use the same widened constant.
     Becomes unreachable through any real UI path (the only failing type
     while `hostId === null` is `ic`, which the dropdown never offers there).
     See Open Decision 1.
   - `saveTargetForm()`'s cycle-check gate (`:637-639`) contains
     `f.type === "device"` — **must widen too**, or a file being re-parented
     onto its own descendant skips the cycle guard and corrupts the tree.
   - `openAddChildTarget()` (`:529-543` doc comment) — comment claims
     `canHaveParent()` only ever gates a public-space device; false once
     widened. Update the comment; behaviour unchanged provided `canAddChild`
     moves to `canBeParent`.
   - `wouldCreateCycle()` (`:1147-1162`) — no change; its documented asymmetry
     is about the parent side, which is unaffected.

2. **`hierarchy-editor.component.html`**
   - Parent field gate (`:405`) — widen via a component getter built on the
     same constant, not a third inline copy of the type list.
   - `[canAddChild]="canHaveParent(t)"` (`:473`) becomes `canBeParent(t)`.
     **The load-bearing fix.**
   - Doc comment (`:482-489`) claims a single shared gate; rewrite for the split.
   - Public Space header (`:21-27`) — add two buttons calling
     `openAddTarget(null, 'file')` and `openAddTarget(null, 'persona')`. No
     new component code. No IC button.
   - Type `<select>` (`:364-371`) — no change; add a regression test.

3. **`target-card.component.ts` / `.html`** — no change. `canAddChild` stays a
   plain boolean `@Input`; the fix is in what the caller passes.

4. **`src/Matrix/MatrixTarget.ts`** — doc-comment addendum only.

5. **`src/app/services/matrix-state.service.ts`** — confirmed no change.

6. **`src/scenarios/matrix-port-rules-correctness.spec.ts`** — see below.

### Proposed approach

- One constant `PARENTABLE_TYPES` as the single definition of "can have a
  parent," read by `canHaveParent()`, `parentDropWarning()`, the
  cycle-check gate and the template getter — one list, four call sites.
- One new method `canBeParent()` as the single definition of "can be chosen
  as a parent," read by both `parentOptionsFor*()` and `[canAddChild]`.
- `setParent()`/`clearParent()` remain the only writers. `commitParentField()`
  inherits the widened behaviour for free.

### Acceptance criteria (implementation-level, additive to the analyst's 8)

9. `canHaveParent()` returns `true` for public `file` and `persona`, still
   `true` for public `device`, still `false` for any host-context target.
10. `canBeParent()` exists and returns `true` only for public `device` —
    matching `canHaveParent()`'s pre-feature behaviour exactly.
11. Opening Edit on a public `file` or `persona` renders exactly one
    `.hier-parent-row` (DOM assertion), with the same options
    `parentOptionsFor()` returns (device-only, self/descendant-excluded).
12. A `file` or `persona` card never renders the add-child button
    (`.tc-actions .tc-icon-btn[title="Add child device"]`) — asserted in the
    DOM, not by reading `canAddChild`.
13. Public Space's header renders three buttons — Device, File, Persona — and
    never an IC button, asserted via rendered button text.
14. No `<option value="ic">` renders in `#hier-target-type` for any session
    with `hostId === null` — new regression coverage, no behaviour change.
15. Switching an existing device's Type to `file`/`persona` mid-Edit with a
    parent set, then Saving, **keeps** the parent. Reverses the pre-feature
    test at `matrix-port-rules-correctness.spec.ts:1097-1107`.
16. `parentDropWarning()` returns `null` for every reachable form state with
    `hostId === null`.

### Regression risk — tests that assert the OLD rule and must be rewritten

All in `src/scenarios/matrix-port-rules-correctness.spec.ts`:

- `:899-906` — "canHaveParent() is true only for a device target". Flip the
  file/persona assertions to `true`; keep device and host-context unchanged.
- `:924-943` — the file half (`:932-936`, expecting zero `.hier-parent-row`)
  flips to expecting one.
- `:1077-1082` — "opening Edit on a persona shows no Parent field" flips.
- `:1097-1107` — "switching Type device to file clears parentTargetId on Save"
  flips: the parent is now **kept**.
- `:1109-1132` — the opening assertions (`canHaveParent(loose)` false, zero
  parent rows) flip; the rest is unaffected.
- `:6162-6227` — the whole `parentDropWarning()` block. Every case switching
  to `'file'` with `hostId === null` can no longer warn. Rewrite to prove the
  warning is `null` in exactly those states, plus one case forcing
  `targetForm.type = 'ic'` directly as defense-in-depth.

**Confirmed unaffected** (cited so the validator need not re-derive):
`:866-897` (destination-side device-only, untouched), `:914-917` and
`:1084-1095` (host-context gate, untouched), `:5798-5817` (host-nested and IC
never show add-child — `canBeParent()` returns the same values),
`:3429-3457` (N-9) and `:5819-5910` (N-ADD-CHILD) — both use device-only
chains, so measured pixel figures do not change, though their inline comments
citing `canHaveParent(t)` should be updated to cite `canBeParent(t)`.

### Open decisions

1. **Keep or delete `parentDropWarning()`, given it becomes unreachable?**
   Recommended: **keep**, narrowed correctly, with its doc comment rewritten
   to say plainly that it is currently unreachable and why. Cheap
   defense-in-depth; deleting means re-deriving the same protection later
   with no history of why it existed.
2. **Should `canBeParent()` be public or private?** Recommended: **public**,
   matching `canHaveParent()`'s existing visibility and the template's need
   to bind it.
3. **Where should `PARENTABLE_TYPES` live?** Recommended: **private static on
   `HierarchyEditorComponent`**, matching the existing `TARGET_TYPES` pattern
   (`:155`) — this is a UI-layer concern; the domain model does not enforce it.

### Note on the shared checkout

`hierarchy-editor.component.*` and `target-card.component.*` are modified and
uncommitted by a parallel session. All line numbers above reflect the on-disk
state at the time of reading; re-read those spans before editing if that
session lands further changes.

---

## Second-pass addendum — file location, protection defender, and the commlink question

Extends, does not replace, the first-pass spec above. All citations freshly
derived; `docs/rules-notes/matrix.md` had no prior entries to reuse.

### Governing rules (new or confirmed this pass)

- **Files appear in exactly two printed locations: on a commlink/deck, and
  inside a host.** A hacker copies a file "from her commlink"; files also sit
  "in the archives of the bank's host," independent of any device (p. 224).
  **No page states a third location is disallowed.**
- **Edit File's defence branches only on host-vs-not, never on which device.**
  "The defender against this test is either the host holding the file or the
  owner of the file (if it's not on a host)" (p. 239). This settles the
  load-bearing question: no printed rule ever tests which device a file is
  parented to.
- **Protecting a file:** Simple Action, Computer + Logic [Data Processing];
  hits set the protection rating (p. 239) — first pass's citation
  independently re-derived and confirmed.
- **Files have no ratings of their own and use their owner's ratings on
  defence** (p. 227, "Files & Matrix Attributes" sidebar) — direct support for
  Xavier's third point, stronger than the first pass's citation.
- **Files cannot take Matrix damage.** Brute Force's damage clause is
  conditional — "if the target can take Matrix damage" (p. 238) — and p. 228
  prints only the device Condition Monitor formula; that files get none is
  supported by that absence plus p. 227 ("Files & Matrix Attributes"), not a
  positive statement that the page also covers personas or IC.
- **A folder is a file, not a separate icon type.** "It can even be a
  collection of other files (a 'folder')" (p. 219). Matrix Perception
  enumerates exactly four icon types — host, persona, device, file — with no
  fifth entry (p. 235).
- **Persona subsumption is icon replacement, not file re-parenting** (p. 235).
  Nothing describes a file attaching to a persona icon directly; the effect
  comes from the device's icon disappearing.
- **Commlinks are not attribute-distinct from ordinary devices.** "Most
  devices (including commlinks) have only two Matrix attributes: Data
  Processing and Firewall. Decks and hosts have all four" (p. 226). **This
  answers the modelling question: "commlink" is not a mechanically distinct
  category the tracker could filter on.**
- **The PAN slave cap counts devices only** (p. 233) — re-derived
  independently; confirms the first pass.

### Interactions (new this pass)

- **Data Bomb attaches to a file, not a device** (p. 239) — another
  file-level property, like protection. Out of scope; flagged for completeness.
- **Crack File defends with the file's own Protection Rating × 2** (p. 238) —
  the one case where a file test does *not* fall back to the owner's ratings.
  Sharpens "files use owner's ratings": true for tests without protection in
  play.
- **A device's Condition Monitor and defence pool are unaffected by what files
  sit on it** (p. 228, p. 238).

### Edge cases (continuing the first pass's numbering)

7. Edit File's defender is the host if the file is inside one, or the owner if
   not — never a specific non-host device, even if the tracker models the file
   as parented to one (p. 239).
8. A Data Bomb attached to a file can destroy it when triggered, independent
   of location (p. 239).
9. Crack File uses the file's own Protection Rating × 2 once protection is set
   (p. 238).
10. Most devices, including commlinks, carry only Data Processing and
    Firewall; only decks and hosts carry all four (p. 226).

### Undefined / needs a table ruling (adds to the first pass's four)

5. **Should the app restrict a file/persona's device parent to commlink/deck
   devices, or allow any device?** The book never tests this — Edit File's
   defence branches only on host-vs-not (p. 239), and every printed example is
   a commlink or a host, but no rule forbids the intermediate case.
   Recommended default: **no restriction**, leaving `canBeParent()` and
   `parentOptionsFor()` as already planned. Enforcing a device sub-type
   distinction the tracker does not otherwise track would be new modelling
   work in service of a convention rather than a printed rule. If Xavier wants
   the stricter reading, it is a legitimate house rule but needs its own
   scoping — the tracker has no concept of "commlink" vs "maglock" today.

### Scope classification (additions)

**TRACK** — no change to the first pass's list. This pass confirms the
existing implementation (`calcMatrixHealth` returning no Condition Monitor for
a `file` target) is already correct and needs no change (p. 227, p. 228).

**GM RESOLVES** — which device a file is treated as sitting on, when the
fiction matters; no printed test reads it (p. 239).

**OUT OF SCOPE** — unchanged: file protection mechanics, Data Bomb, Crack File
resolution.

**SCOPE QUESTION** — none new. The commlink-sub-type distinction was
considered and deliberately **not** raised as one: nothing found suggests a GM
would want the app to enforce flavour.

### Acceptance criteria

No new required behaviour. One existing detail worth a defensive regression
test, found correct but untested:

17. A `file`-type target's Matrix Condition Monitor is absent regardless of any
    `rating`/`deviceRating` stored on it — `calcMatrixHealth('file', ...)`
    returns `undefined` unconditionally (p. 227, p. 228).

Plus, from Xavier's 2026-09-11 decision on the slave cap:

18. A device whose count of **slaved devices** exceeds its Device Rating × 3 is
    flagged in the UI, and the GM can still record it — warn, never block
    (`SCOPE.md`; p. 233). Files and personas nested under the same device do
    **not** count toward that total.

### Scenarios to survive (additive)

5. **File moved from a device into a host.** A file starts parented to a loose
   device on the open grid, then the GM moves it into a host's archive.
   Expected: the tracker lets the location change without losing the file's
   name, marks or notes. Who defends an Edit File attempt switches from owner
   to host (p. 239) — a fact for the GM to apply, not something the app
   computes.
6. **Persona subsumption during file access.** A decker's persona is active on
   a commlink with a file parented to it. The file's `parentTargetId` never
   changes; only which icon it visually nests under does.
7. **Slave cap warning.** A device with Device Rating 4 (cap 12) has 12 slaved
   devices and three files nested under it. Expected: no warning — files do not
   count. Adding a 13th **device** raises the warning, and the GM can still
   confirm it.
