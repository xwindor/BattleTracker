# Unverified rules claims

> **Matrix deferral:** Items 1-9 below are Matrix claims. The Matrix module
> is deferred (see `docs/MATRIX_MODULE_PLAN.md`), and these items are
> deliberately left unverified until it resumes. Do not verify or clear them
> ad hoc — when Matrix work picks back up, run them through
> `sr5-rules-analyst` first.

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

3. **Overwatch Score thresholds: IC Alert triggers at OS 20, Convergence/GOD
   attack triggers at OS 40.**
   Originally in: `CLAUDE.md`, Step 2 ("OS counter inline editor").

4. **IC initiative = host rating × 2; IC dice pool = 2 (Patrol type) or 4
   (other IC types).**
   Originally in: `CLAUDE.md`, Step 3 ("IC as initiative participants").

5. **Marks on a target are capped at 3 per decker per target.**
   Originally in: `CLAUDE.md`, Step 6 ("Mark tracking").

6. **Hack on the Fly adds +2 Overwatch Score per mark, on a successful test.**
   Originally in: `CLAUDE.md`, Step 9 ("Full hacking workflow").

7. **Brute Force adds Overwatch Score equal to marks × 4.**
   Originally in: `CLAUDE.md`, Step 9.

8. **Direct Connection access grants 1 mark on the host and costs 0 Overwatch
   Score.**
   Originally in: `CLAUDE.md`, Step 9.

9. **Deck Reconfiguration ("Switch Two Matrix Attributes") is a Free Action
   that swaps the values of any two of Attack/Sleaze/Data Processing/Firewall.**
   Originally in: `CLAUDE.md`, Step 11 ("Deck reconfiguration action").

10. **Noise is a per-roll dice-pool modifier, not a persistent jack-in-time
    field.**
    Originally in: `CLAUDE.md`, Step 4 ("Hacking workflow shell") — acceptance
    criterion 6.

11. **Wound Modifier: every 3 boxes of damage above Pain Tolerance applies a
    −1 penalty to all dice pools.**
    Originally in: `.local-notes/docs/ARCHITECTURE.md`, §7 ("Wound Modifier").
    Note: this one describes a general core-combat rule, not Matrix-specific,
    and it does match what the code actually computes
    (`src/Combat/Participants/Participant.ts`, `get wm()`). The *code* is not
    in question here — only the printed-page source for the −1-per-3-boxes
    rule itself is unverified.

---

Items 1–10 were part of the Matrix module build plan, now parked in
`docs/MATRIX_MODULE_PLAN.md` while the Matrix module is deferred. Item 11
stands alone in `.local-notes/docs/ARCHITECTURE.md`.
