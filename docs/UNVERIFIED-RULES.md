# Unverified rules claims

> **Matrix deferral:** The Matrix claims remaining below (items 1, 2 and 9)
> are deliberately left unverified until Matrix work resumes (see
> `docs/MATRIX_MODULE_PLAN.md`). Do not verify or clear them ad hoc — when
> Matrix work picks back up, run them through `sr5-rules-analyst` first.
> Items 3, 4, 5, 6, 7 and 8 (all Matrix claims) were resolved and removed by
> `briefs/matrix-port-rules-correctness-spec.md` (2026-09-01) — see that
> brief's Governing Rules and Acceptance Criteria for the findings. Item 5
> (the 3-mark cap) was confirmed **true** (p. 236) and needed no code
> correction, only this citation. Item 10 was resolved and removed round-4
> (2026-09-02) — see below.

**Nothing in this file is confirmed.** These are Shadowrun 5e rules assertions
that were found stated as fact in project docs without a printed page
citation. None have been checked against `rules/` yet. No agent or contributor
should treat anything below as authoritative — treat it as "someone's
recollection, not yet verified" until it carries a printed page number.

To clear an item: have `sr5-rules-analyst` (or manual lookup) confirm it
against `rules/` and attach the printed page. Then either move it back into
the doc it came from with the citation, or record it in a brief.

---

1. **Matrix initiative = DP + INT, plus 1d6 (AR) / 3d6 (Cold-Sim) / 4d6 (Hot-Sim).**
   Originally in: `CLAUDE.md`, Step 1 ("Add Decker to the initiative tracker").

2. **Cold-Sim and Hot-Sim VR leave the decker physically incapacitated /
   vulnerable ("PHYS LOCKED").**
   Originally in: `CLAUDE.md`, Step 1.

9. **Deck Reconfiguration ("Switch Two Matrix Attributes") is a Free Action
   that swaps the values of any two of Attack/Sleaze/Data Processing/Firewall.**
   Originally in: `CLAUDE.md`, Step 11 ("Deck reconfiguration action").

11. **Wound Modifier: every 3 boxes of damage above Pain Tolerance applies a
    −1 penalty to all dice pools.**
    Originally in: `.local-notes/docs/ARCHITECTURE.md`, §7 ("Wound Modifier").
    Note: this one describes a general core-combat rule, not Matrix-specific,
    and it does match what the code actually computes
    (`src/Combat/Participants/Participant.ts`, `get wm()`). The *code* is not
    in question here — only the printed-page source for the −1-per-3-boxes
    rule itself is unverified.

---

**Resolved and removed 2026-09-01** (`briefs/matrix-port-rules-correctness-spec.md`):

- Item 3 (Overwatch thresholds: alleged "IC Alert" at OS 20, Convergence at
  OS 40) — **false**. SR5 defines exactly one Overwatch threshold, 40 (p. 232).
  There is no OS 20 alert of any kind.
- Item 4 (IC initiative = Host Rating × 2; IC dice pool = 2 for Patrol, 4 for
  others) — the claim conflated two different quantities. Host Rating × 2 is
  the IC **attack** dice pool (p. 247), not its initiative attribute; IC
  initiative base is Host Data Processing + Host Rating (Table Ruling 1,
  RULINGS.md 2026-08-28, restored 2026-09-01). Every IC type gets 4D6
  Initiative Dice, with no exception for Patrol (p. 247); Patrol's absent
  attack ("Attack: n/a", p. 248) is a separate fact from its Initiative Dice.
- Item 5 (3-mark cap per decker per target) — **confirmed true** (p. 236),
  moved out of this file with its citation. No code change was needed.
- Item 6 (Hack on the Fly adds +2 Overwatch per mark on success) — **false**.
  Overwatch rises by the defender's hits on its defense test against an
  Attack or Sleaze action, win or lose — never by a mark count (p. 232).
- Item 7 (Brute Force adds Overwatch equal to marks × 4) — **false**, same
  citation as item 6.
- Item 8 (Direct Connection grants 1 mark and costs 0 OS) — **half false, half
  true**. A direct connection places no marks at all: marks come only from the
  icon inviting you, Brute Force, or Hack on the Fly (p. 236). The 0 OS half is
  correct — connecting a cable is not an Attack or Sleaze action, so it accrues
  no Overwatch (p. 232). A direct connection does ignore all noise and grid
  modifiers, and a slaved device attacked this way loses its master's ratings
  (pp. 232, 233).

**Resolved and removed 2026-09-02** (round-4, `briefs/matrix-port-rules-correctness.md`
Scope Question B / D-13):

- Item 10 (noise is a per-roll dice-pool modifier, not a persistent field) —
  **superseded by a scope decision, not a rules finding**. Scope Question B
  (approved 2026-09-01) settled that this app tracks noise as a **persistent
  GM-set reminder field** (`MatrixRunState.noise`), displayed but never applied
  to any dice pool — the opposite of "per-roll modifier". Round-4 added the
  missing editor (`MatrixStateService.setNoise()`, `HierarchyEditorComponent`)
  so the field is actually reachable at the table, closing the gap where the
  claim could neither be confirmed nor cleared.

Items 1, 2 and 9 are part of the Matrix module build plan, now parked in
`docs/MATRIX_MODULE_PLAN.md` while the Matrix module is deferred. Item 11
stands alone in `.local-notes/docs/ARCHITECTURE.md`.
