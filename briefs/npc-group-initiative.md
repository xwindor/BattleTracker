# Rules Brief — NPC Group Initiative (linked rows)

## Request

Support running multiple NPCs as a single linked initiative row that rolls and holds **one** shared Initiative Score and acts back-to-back at that position in the order, while each NPC in the row keeps an **independent Condition Monitor**, and damage taken by an individual NPC does **not** change the row's shared Initiative Score.

## Governing rules

**SR5 already has this mechanic. It is called Grunts.**

- Grunts are NPCs grouped together because they have virtually identical game statistics; the book says outright they are most easily handled by the GM in groups, with one set of attributes and skills for everybody. Different groups of similar grunts may differ from each other, and a group may contain one or two flagged specialists (a street witch among gangers, one guy with an assault rifle) (p. 378).
- **Group Initiative, verbatim mechanic:** the GM may streamline Initiative in combat by making a *single Initiative Test for the entire group of grunts*, and the result of that test applies to all the grunts (p. 379). This is exactly the requested "one score, whole row."
- **The book's own carve-out from that:** "although augmented specialists can make one of their own if the gamemaster so chooses" — a flagged specialist may be split out onto its own Initiative Score at GM discretion (p. 379).
- **The book's own carve-out that conflicts with the request:** immediately after granting the single group roll, the text says some modifiers, *specifically injury modifiers*, might cause some of the grunts to act on a different Initiative Score than the rest of their team (p. 379). See "Interactions" below — this is the one place the feature as described departs from RAW.
- **Condition Monitors are per-grunt, not shared.** Each grunt has only one Condition Monitor, used to track both Physical and Stun damage, with boxes equal to 8 + half of the higher of Body or Willpower, rounded up. All damage of either type goes on that one track. When it is full, the grunt is out of action for the rest of the fight. Grunts do not get overflow damage like PCs do (p. 379). Alive-or-dead afterwards is decided by the type of the final attack: Stun, or Physical less than the grunt's Body, means alive; Physical greater than Body means dead (p. 379).
- Note the shape of this: "only one Condition Monitor" means one *combined track per grunt* instead of the PC's two, not one track shared by the group. So the request ("each row has its own condition monitor for each npc") matches RAW; the group shares initiative, never health.
- Ordinary initiative machinery the row plugs into: Initiative Score = Initiative Dice roll + Initiative attribute; the GM records each score highest to lowest and the highest goes first, others in descending order each pass; at the end of each pass subtract 10 from all Initiative Scores and everyone still above 0 acts again (p. 159).
- Ties are broken by ERIC — Edge, Reaction, Intuition, Coin toss, in that order, higher attribute first — and *alternately, at the gamemaster's discretion, both characters can act simultaneously* (p. 159). That discretionary clause is the closest RAW licence for "these rows act back-to-back at one number."

## Interactions and exceptions

Each of these can pull an individual NPC off the row's shared score under RAW.

1. **Wound modifiers (the direct conflict).** Wound modifiers accumulate with every third box of damage and are cumulative between damage tracks and with other negative modifiers (p. 169). The Wound Modifier penalty is applied to the character's Initiative attribute and therefore their Initiative Score during combat (p. 170). These changes are made immediately after the injury occurs and can affect the initiative order *even within the same Initiative Pass*; they do not grant an extra action, they only change the score (p. 160). The grunt rules restate this specifically for groups (p. 379). **By the book, a wounded grunt drifts off the group's score.** The requested behaviour — wounds never shift group initiative — is a deliberate GM-shortcut house rule, not RAW. It is a defensible one (it is the same bookkeeping-reduction motive the grunt rules are written for), but the brief must not pretend it is printed. See OPEN RULINGS QUESTION 1.
2. **Surprise.** Surprise occurs on a **character-by-character basis**; a character walking into an ambush set by two opponents may be surprised by one and not the other (p. 192). Each participant rolls Reaction + Intuition (3); failure costs 10 off Initiative Score, either when Initiative is rolled or immediately if it happens mid-Combat-Turn, and the character is surprised until their next Action Phase with no Defense Test (p. 192). A critical glitch means no action in the first Action Phase and, on entry, both the –10 for failing Surprise and the –10 for entering mid-fight (p. 192; worked out in the example on p. 193, where two bodyguards of the same detail end up on different scores). **So Surprise splits a row exactly the way wounds do**, and the book is explicit that it is per-character. See OPEN RULINGS QUESTION 2.
3. **Interrupt Actions.** A character may take an action out of turn only if he has enough Initiative Score left to pay for it, and the Initiative Score reduction occurs at the time of the Interrupt Action (p. 167). One grunt in a row going Full Defense would, RAW, reduce *that grunt's* score. See OPEN RULINGS QUESTION 3.
4. **Lieutenants are explicitly not on the group score.** Lieutenants have their own attributes and skills rather than the team's common set (p. 380), and they *do* make their own Initiative Tests; if a lieutenant rolls the same Initiative as his team, he always goes first. Like other grunts he possesses a single Condition Monitor (p. 381). This is a printed, mandatory tie-break rule between a lieutenant and his own group's row.
5. **Augmented specialists** may be given their own Initiative Test at GM discretion (p. 379) — the row needs a "detach this NPC to its own row" affordance, which is RAW-sanctioned rather than invented.
6. **Mid-turn Initiative changes generally.** A character's Initiative attribute changing applies the difference immediately to Initiative Score for all remaining actions that Combat Turn; gaining Base Initiative Dice means immediately rolling the new dice and adding them; losing dice means rolling the lost dice and subtracting (p. 160). Anything that does this to one row member (a drug, a spell cast on it, damaged augmentation) has the same splitting problem as wounds.
7. **Late entry.** A character entering combat after it has begun rolls Initiative Score normally then subtracts 10 for each Initiative Pass that has already occurred (p. 160). Adding an NPC to an existing row mid-combat needs a rule for whether it inherits the row's score or takes its own late-entry score.
8. **Group Edge.** Grunts have no individual Edge attribute; a team shares a Group Edge pool equal to its Professional Rating, and the GM can spend a point of it on any grunt on the team (p. 380). This matters to initiative in one place only: Edge on an Initiative Test rolls the maximum 5D6 for a single Combat Turn (p. 159), and ERIC's first tie-breaker is the Edge attribute (p. 159) — which grunts do not have (p. 380). See OPEN RULINGS QUESTION 5. **Group Edge as a spendable resource is out of scope for this feature** per the user's instruction; only the ERIC consequence is in scope.
9. **Astral / Matrix boundary.** Initiative type changes the attribute and dice: Physical is Reaction + Intuition, 1D6; Astral is Intuition x 2, 2D6; Matrix AR 1D6, cold-sim VR 3D6, hot-sim VR 4D6 (p. 159). A magician who astrally projects gains the die and the Initiative change during that Combat Turn and swaps Reaction + Intuition for Intuition x 2 (p. 160). A grunt-group street witch who projects therefore cannot remain on the row's physical score. Combined with the standing ruling in `RULINGS.md` (2026-07-31, bonus Initiative Dice carry additively into astral), the correct handling is: detach to own row.
10. **Optional "Mowing Them Down" rules (p. 379)** — one wound takes a grunt down, no resistance rolls, auto-surprise on any Sneaking hits, ambushes auto-fail. **Explicitly out of scope**; they are printed as optional and the user asked for no simplified combat resolution. Flagging only so a later agent does not "discover" them and scope them in.
11. **Professional Rating morale thresholds** (PR 0 breaks if anyone goes down; PR 1–2 retreats past a quarter casualties; PR 3–4 withdraws past half; PR 5–6 fights to the last) (p. 380). **Out of scope** — no group-wide status effects. Noted because a row makes casualty-fraction visible and a later agent may be tempted.

## Edge cases the book defines

1. Row score is set by one Initiative Test whose result applies to every grunt in it (p. 379).
2. A wounded member of the group may act on a different Initiative Score than the rest of the team (p. 379) — RAW behaviour the feature is overriding.
3. A lieutenant tied with his team's Initiative always goes first (p. 381).
4. An augmented specialist may roll separately at GM discretion (p. 379).
5. Two rows (or a row and a PC) tied on Initiative Score resolve by ERIC, and the GM may instead let them act simultaneously (p. 159).
6. Each grunt's single Condition Monitor is 8 + ceil(max(Body, Willpower) / 2), takes both Physical and Stun, has no overflow, and when full the grunt is out of action for the rest of the fight (p. 379).
7. Post-combat alive/dead for a downed grunt is decided by the final attack's type and DV vs. Body (p. 379).
8. Surprise is resolved per character, not per group, and costs the failing character 10 Initiative Score (p. 192).
9. Late entrants subtract 10 per pass already elapsed (p. 160); a critical-glitching surprised entrant eats both –10s (p. 192).
10. Interrupt Actions are refused unless the actor has enough Initiative Score left to pay, and the cost lands at the moment of the interrupt (p. 167).
11. All members of a row are still subject to the ordinary –10 end-of-pass decay and drop out of the pass rotation when their score is 0 or less, with an Initiative Score of 0 or less still allowing one Free Action and defensive responses (p. 159, p. 160).

## DECISIONS (Xavier, 2026-08-01)

These resolve the open rulings questions. Binding on implementation; not the recommended defaults in every case — read carefully, several depart from what was recommended.

1. **Wounds vs. shared score.** Neither "immune" nor "RAW split-off." **When any NPC in the row takes a wound (crosses a Wound Modifier threshold, p. 169), that wound's Initiative penalty applies to the row's shared Initiative Score, affecting every member of the row together.** The row stays in sync — nobody splits off — but the group as a whole gets slower as its members get hurt. This is a house rule distinct from both p. 379 (individual grunts split off) and the "immune" option; log it in `RULINGS.md` with the p. 379 / p. 170 counter-cite. Wound modifiers additionally still apply to each wounded NPC's own dice pools as normal (p. 170) — that part is unaffected and untouched by this ruling.
2. **Surprise vs. shared score.** **No in-tracker surprise handling for rows.** The tracker does not run a row-level or per-NPC Surprise Test and does not automatically split a row on Surprise outcomes. If a GM needs some members of a group surprised and others not, they set that up as separate rows (or standalone NPCs) before combat starts — that's a GM workflow choice outside this feature, not something the tracker resolves. Nothing here overrides the app's existing (non-row) Surprise handling for standalone participants, if any exists.
3. **Interrupt Actions from a row member.** **Forbidden.** An NPC that is part of a group row cannot take Interrupt Actions. This is a deliberate departure from p. 167 (accepted, not accidental) — there is no coherent single-shared-score way to let one row member pay for an interrupt without side-effects on the rest of the row, and Xavier has chosen to disallow it rather than model the side-effects. An NPC that needs to act on Interrupt Actions should be detached to its own row first (per Acceptance Criterion 12).
4. **Condition Monitor shape per NPC.** **Always grunt-style single track**, no per-row toggle. Every NPC placed in a group row uses the combined Physical+Stun track of 8 + ceil(max(Body, Willpower)/2) boxes, no overflow (p. 379). Not configurable.
5. **ERIC tie-breaking for a row.** Confirmed as recommended: **treat the row's Edge as 0** for the first ERIC step and fall through to Reaction, then Intuition, then coin toss, using the row's shared stat block (p. 159, p. 378, p. 380). Do not substitute Group Edge / Professional Rating for the Edge attribute.
6. **Lieutenant tie rule.** Confirmed as recommended: **manual only.** No lieutenant-row link is modeled. If a lieutenant ties with his own team's row (p. 381), the GM reorders manually. Out of scope for this feature.
7. **Adding an NPC to an existing row mid-combat.** **Inherits the row's current shared Initiative Score directly** — no separate late-entry roll, no –10-per-elapsed-pass penalty (p. 160 not applied here). This is a deliberate departure from p. 160 for simplicity: reinforcements joining an existing linked row just slot into that row's current position and score.
8. **Row emptying.** **Row is automatically removed** from the initiative order once every NPC in it is out of action (Condition Monitor full, p. 379). This departs from the recommended default (skip-but-keep-visible) in favor of a cleaner display; combat-log fidelity for what happened to the row's members is expected to live in the combat log, not in the initiative order itself.

## ADDENDUM DECISIONS (Xavier, 2026-08-03)

Post-approval extension, requested after table use: a way to add a lone grunt without a row, and a way to later fold standalone/detached grunts into a group. Binding on implementation, same status as the DECISIONS section above.

9. **Add Grunt (standalone).** A new GM control creates a single grunt-shaped NPC — same Condition Monitor shape as a detached grunt (Decision "detached grunt keeps its single Condition Monitor", `RULINGS.md` 2026-08-01) — occupying its own slot in the initiative order, not inside a row. It **rolls its own Initiative Test** like any other new standalone participant; no special-cased score.
10. **Merging grunts into a group.** Two or more standalone/detached grunts (any mix) can be combined into a linked NPC row (a "Grunt Group") after the fact. **Merging is only allowed when none of the grunts being merged has rolled Initiative for the current Combat Turn** — i.e. before combat starts, or after a Combat Turn ends and before the new turn's Initiative Test is rolled. Once any of them has a rolled Score for the current turn, merging is refused (the GM detaches/re-groups between turns instead). This sidesteps the question of whose score the merged group takes, since nobody merged has one yet.
11. **Damage carries into a merge, no retroactive wound penalty.** A merged grunt keeps its existing Condition Monitor damage exactly as-is. Consistent with Decision 7 (reinforcement joining an existing row is score-neutral): merging never applies a retroactive Wound Modifier penalty to the new group's Initiative Score on account of damage a member already had before the merge. The group's shared wound accumulator (Decision 1) starts at 0 regardless of what its founding members were already carrying, and only moves on wound *events* from that point forward, exactly like any other row.
12. **Identification badges.** Both a standalone/detached grunt and a Grunt Group row get a small visual badge in the initiative list, on **both** the GM view and the player view, so either can be told apart from a PC/ordinary NPC at a glance. No new rules content — presentation only.

## ROUND 3 DECISIONS (Xavier, 2026-08-07)

Table-tested fixes and reversals after live use of the addendum. Binding on
implementation, same status as DECISIONS and ADDENDUM DECISIONS above.

13. **Grunt healing while out of action.** Healing a grunt below its
    out-of-action threshold (combined damage no longer meets the box count)
    **clears out-of-action status**, the same way raising Body/Willpower
    already un-latches it (Round-2 D1 fix) and the same way ordinary
    participants already behave. This **reverses** the 2026-08-02 ruling that
    healing cannot revive an out-of-action grunt and that a GM must use global
    Undo to take back a killing blow instead — that instruction is no longer
    workable now that Xavier plans to remove the Undo mechanic. "Out of
    action" is a live-derived value (current combined damage vs. box count,
    plus the manual bench flag), not a sticky/latched status, in both the grow
    and the heal direction.
14. **Row removal on last member down.** A Grunt Group row is **no longer
    auto-deleted** when its last member drops (**reverses Decision 8**).
    Instead it is flagged/highlighted the same way a downed ordinary
    participant already is, and stays in the initiative order until the GM
    removes it manually via the existing per-row delete control. Rationale:
    auto-deletion destroyed the row (and any member's chance to be healed back
    up per Decision 13) the instant the last member dropped, and was
    inconsistent with how every other participant type is handled on going
    out of action.
15. **Manual bench flag dropped.** `manuallyOutOfAction` (the "benched" grunt
    concept introduced for the Round-2 D2 fix, refusing to merge a
    hand-benched grunt) has no GM-reachable control anywhere in the app and
    is **removed**, along with the merge-refusal check that depended on it.
    If a bench control is built later, the refusal logic can be reintroduced
    at that point; until then the code path is unreachable and is dead
    weight.
16. **Actions at Initiative Score 0 or below.** A participant at Score 0 or
    below (grunt, row, PC, or ordinary NPC alike — this is general p.159/160
    mechanics, not a grunt-specific house rule) may still declare and take
    **one Free Action per pass** (p. 160), and still **defends against
    incoming attacks normally** — a Defense Test is not an Interrupt Action
    and is never gated by Initiative Score. It may **not** take a Simple or
    Complex action, since those require a live Action Phase and a Score of 0
    or below does not have one. Interrupt Actions remain gated by cost as
    already implemented (`canUseAction`, p. 167) and need no further change on
    that front — the gap is specifically that Simple/Complex actions were not
    being blocked.
17. **Row/grunt log privacy and player-facing content.** Damage lines shown to
    **players** for a row/grunt event must not include the exact Condition
    Monitor fraction (e.g. `6/10`) — GM sees full numbers, players see only
    that damage occurred. Wound-modifier updates (Decision 1's house rule
    firing) and "row emptied, removed from initiative" events are GM
    bookkeeping about NPCs, not fictional events the players witness, and must
    be **GM-only** log entries (same routing already built for the Round-2 D4
    merge-refusal fix).
18. **Per-NPC acted tracking inside a row.** Each NPC member of a row gets its
    own "has acted this pass" indicator/control, mirroring how a regular
    (non-row) participant's Act button/state works, so the GM can track which
    members of the row have gone this pass without relying on memory.
19. **Default row naming / log text cleanup.** An unrenamed Grunt Group row
    must not produce a doubled name in its own log lines (it previously
    defaulted to the literal string `"NPC Row"` used as both the log actor
    label and as filler text, producing lines like `"NPC Row: NPC Row is out
    of action..."`). The informational line shown above an expanded row panel
    ("One Initiative Test for the whole row (p. 379); shared score N...") is
    removed as unnecessary UI chrome — the row's Initiative Score is already
    shown in the main row header.

**Explicitly deferred, not part of this round:** an "act simultaneously" GM
option for a tied row (Decision 5 / Acceptance Criterion 10) is confirmed
missing from the app entirely but stays backlogged per Xavier's choice.

## ROUND 4 DECISIONS (Xavier, 2026-08-13)

Live-table findings from the second pass over the Round 3 build. All six are
Xavier's direct table decisions; none reverses a printed rule.

20. **A grunt's Damage Value must be enterable above his remaining boxes.**
    The GM currently records damage on a standalone / detached grunt by
    clicking Condition Monitor boxes, so the largest hit that can be recorded
    is exactly the number of boxes left. That makes p. 379's alive-or-dead
    test — which compares *the DV of the final attack* against the grunt's
    Body — impossible to apply for any killing blow bigger than the remaining
    track. The standalone grunt Condition Monitor panel gains the same
    `DV` + `P` / `S` / `-1` controls the row panel already has, and an
    over-max DV is recorded in full for the final-attack determination even
    though the track itself still stops at full (no overflow, p. 379).

21. **Manual removal never produces the red out-of-action state, and always
    prompts.** Removing an NPC from a row (the per-member trash icon) now
    asks for confirmation first, exactly as deleting a participant row does;
    when the NPC being removed is the last one in the row, the same prompt
    also offers to delete the now-empty row. Xavier's wording: *"this is for
    all participant rows, it should prompt and offer to delete."* A row
    emptied by hand — by removal or by detaching the last member — is left as
    a plain empty row the GM can delete at leisure. It is **not**
    `spentFlagged`, not `ooc`, and not styled red. The red flagged state from
    Decision 14 is reserved for a group taken out **by damage**, which is the
    case Decision 14 was actually asked for.

22. **A grunt row has no whole-row Act button.** The row-level `Act` button
    (and the group-level action log line behind it) is removed for
    `NpcRowParticipant` only; ordinary participants keep theirs unchanged. A
    group does not take one action — its members each take their own.

23. **Each NPC's Act button opens the Act modal and logs that NPC's action.**
    The per-member Act control from Decision 18 stops being a silent toggle
    and becomes the member's real action declaration: it opens the same Act
    modal an ordinary participant gets, and the declared action is written to
    the log attributed to that NPC. When every member still standing in the
    row has acted, the row's turn is over and the initiative passes to the
    next participant exactly as it would for any other participant finishing
    its Action Phase.

24. **A member's Act button is disabled unless the row is actually up.** Two
    gates, both currently missing: the button is inactive when the row is not
    the participant whose turn it is, and inactive when the row's Initiative
    Score is 0 or below (Decision 16 — no live Action Phase down there).

25. **Condition Monitor changes are logged without the maximum.** Damage and
    healing stay in the log for every participant and every NPC — Xavier is
    explicit that these lines are wanted — but the `/max` half of the `(x/y)`
    fraction is removed everywhere it still appears, GM log included, because
    it broadcasts how many hits a combatant has left. The running damage
    total may stay; the maximum may not. Ordinary participants already log
    this way (`flushDamageLog`); the row-member damage, no-effect and heal
    lines still carry the fraction in their GM text and must stop. The
    "Grunt Condition Monitor: both damage types on one track, no overflow
    (p. 379)…" note under the grunt Condition Monitor panel is removed as UI
    chrome, on the same grounds as Decision 19's blurb removal.

## Acceptance criteria

1. A group row rolls exactly one Initiative Test, and that single result is the Initiative Score of every NPC in the row (p. 379).
2. The row occupies a single position in the initiative order determined by that score, highest first, descending (p. 159), and all its NPCs act consecutively at that position before the order advances.
3. Every NPC in a row has its own Condition Monitor, independent of every other NPC in the row and of the row itself (p. 379).
4. Damage applied to one NPC in a row changes only that NPC's Condition Monitor and never the Condition Monitor of any other NPC in the row (p. 379).
5. When damage to an NPC in a row crosses a Wound Modifier threshold (p. 169), that wound's Initiative penalty is applied to the row's shared Initiative Score — affecting every member of the row together, not just the wounded NPC. This is a documented house rule departure from p. 379 / p. 170 (Decision 1). The wounded NPC's own dice pools still take the wound modifier as normal (p. 170).
6. When an NPC's Condition Monitor fills, that NPC is out of action for the remainder of the fight and is skipped when the row acts; the rest of the row continues to act normally (p. 379). Once every NPC in the row is out of action, the row is automatically removed from the initiative order (Decision 8).
7. A grunt-style Condition Monitor holds 8 + ceil(max(Body, Willpower) / 2) boxes, accepts both Physical and Stun damage on the same track, and does not overflow (p. 379). This is the only Condition Monitor shape a row member can have — not configurable (Decision 4).
8. At the end of each Initiative Pass the row's shared score decreases by 10 like any other participant, and the row acts again only while that score is above 0 (p. 159).
9. The row's Initiative Score is never clamped at 0 and may go negative (`RULINGS.md`, 2026-07-31, resting on p. 160 and p. 167).
10. A row tied with another participant resolves by ERIC, treating the row's Edge as 0 and falling through to Reaction, then Intuition, then coin toss — with a GM option to act simultaneously (p. 159, Decision 5).
11. Lieutenant/row tie-breaking (p. 381) is not automated; the GM reorders manually (Decision 6, out of scope).
12. Any NPC can be detached from a row onto its own initiative row, rolling its own Initiative Test (p. 379 for augmented specialists; p. 380–381 for lieutenants). This is also the required path for an NPC that needs to take an Interrupt Action, since row members cannot (Acceptance Criterion 17).
13. An NPC that changes Initiative type — astral projection (Intuition x 2, 2D6) or any Matrix mode (p. 159, p. 160) — cannot remain on a physical row's shared score and must be detached to its own row.
14. An NPC in a row at Initiative Score 0 or less may still take one Free Action and may still respond to attacks by dodging or defending (p. 160).
15. An NPC added to an existing row after combat has begun inherits that row's current shared Initiative Score directly — no separate late-entry roll or elapsed-pass penalty is applied (Decision 7, departs from p. 160 by design). A brand-new row (not joining an existing one) still rolls Initiative Score normally and, if added after combat has begun, subtracts 10 for each Initiative Pass already elapsed (p. 160) — this only changes for NPCs joining an *existing* row.
16. The tracker does not run any Surprise handling for rows — no row-level Surprise Test, no per-NPC Surprise flags, no automatic score or defense changes from Surprise (Decision 2, out of scope). Any surprise-based grouping is a GM workflow decision made before rows are formed, outside the tracker.
17. Interrupt Actions are not available to NPCs that are members of a group row (Decision 3, a deliberate departure from p. 167). An NPC must be detached from its row (Acceptance Criterion 12) before it can take an Interrupt Action, at which point ordinary Interrupt Action rules (p. 167) apply to it individually.
18. No group-wide Condition Monitor, no shared damage, no Group Edge pool, no Professional Rating morale automation, and no "Mowing Them Down" behaviour is introduced by this feature (scope guard; p. 379–380 are the pages that would tempt it).

## Gameplay scenarios to survive

**S1 — Ordinary case.** Four PR 1–2 gangers form one row. GM rolls one Initiative Test: 7 + 2D6 = 15. All four NPCs read Initiative Score 15 (p. 379). Cayman is on 22, Pete on 10. Order: Cayman 22, row 15 (ganger 1, 2, 3, 4 back-to-back), Pete 10. End of pass, everyone –10 (p. 159): Cayman 12, row 5, Pete 0. Second pass: Cayman, then all four gangers again, Pete gets only a Free Action (p. 160).

**S2 — Tie between a row and a PC, and between a row and its lieutenant.** The ganger row rolls 16; Wombat rolls 16. ERIC: grunts have no Edge attribute (p. 380), Wombat does, so Wombat goes first (p. 159) — same shape as the p. 193 example where Wombat wins a tie on possession of an Edge attribute. Separately, the gangers' lieutenant rolled his own Initiative and also got 16; by p. 381 he acts before his team regardless of ERIC. Expected order at 16: lieutenant, then Wombat vs. row per ERIC.

**S3 — Mid-Combat-Turn state change (the house rule under test).** Row of four is on shared score 15, currently mid-first-pass. Wombat shoots ganger 3 for 6 boxes — a –2 wound modifier by p. 169. RAW (p. 379, p. 170, p. 160) would drop only ganger 3 to Initiative Score 13, possibly reordering him within the same pass. **Expected under Decision 1:** the whole row drops together to 13 — ganger 3 *and* gangers 1, 2, and 4 all move to shared score 13 and continue acting back-to-back at that position. Ganger 3's own dice pools additionally take the –2 wound modifier on his own tests (p. 170), same as any wounded character. The combat log must make it visible that a group-wide wound-debuff house rule fired here, and which NPC's wound triggered it.

**S4 — Two initiative tracks at once.** The row's flagged specialist is a street witch (the p. 378 "one of the gangers might be a street witch" case). On her first Action Phase she astrally projects. Her Initiative attribute becomes Intuition x 2 and she gains a die (p. 159, p. 160), and per `RULINGS.md` (2026-07-31) the die is a +1 delta on her current count. Expected: she is detached from the row onto her own initiative row with a recomputed astral score; her meat body remains listed with its own Condition Monitor and cannot act; the remaining three gangers keep the row's original shared score untouched. Same expectation for a decker NPC in the row switching to hot-sim VR (Data Processing + Intuition, 4D6, p. 159).

**S5 — Unconscious member.** Ganger 2's single combined track fills from a mix of Stun and Physical (p. 379). Expected: ganger 2 is out of action for the rest of the fight, skipped every time the row comes up, the row's shared score is unchanged, gangers 1, 3, 4 continue acting back-to-back, and the app records whether the finishing blow was Stun / Physical-under-Body (alive) or Physical-over-Body (dead) for later interrogation (p. 379). At PR 0 this would also trigger the "rest turn tail and run" morale line (p. 380) — **not automated**, flagged to the GM at most.

**S6 — Surprise, out of scope.** PCs ambush the four gangers. Per Decision 2, the tracker does nothing special here: it does not roll a row Surprise Test and does not track per-NPC surprise flags. If the GM wants some gangers surprised and others not, that's handled by forming two separate rows (or standalone entries) before combat starts — not something this feature models.

**S7 — Reinforcement joining an existing row.** Two more gangers arrive at the start of the second Initiative Pass and are added to the existing four-ganger row. Per Decision 7, they immediately take the row's current shared Initiative Score (whatever it is at that moment) — no Initiative roll, no late-entry penalty. They act back-to-back with the rest of the row from then on. (A reinforcement NOT joining an existing row — forming a new row of its own — still rolls Initiative normally and eats the p. 160 late-entry penalty if it's late; that path is unchanged.)

**S8 — Interrupt Action attempted from inside a row.** Ganger 1 wants Full Defense against Wombat's attack while still a member of the row. Per Decision 3, this is refused outright — row members cannot take Interrupt Actions. If the GM wants ganger 1 to have that option, ganger 1 must first be detached from the row onto his own initiative row (Acceptance Criterion 12); once detached, ordinary Interrupt Action rules (p. 167) apply to him individually and the cost lands on his own score.

---

### Scope guards for downstream agents

Present in `rules/` and deliberately **not** scoped: Group Edge as a spendable pool (p. 380), Professional Rating morale/withdrawal thresholds (p. 380), Professional Rating as a Social-Test resistance modifier (p. 379–380), lieutenant stat-generation guidance and the Leadership +1 Professional Rating use (p. 380–381), sample grunt stat blocks (p. 381), and the optional "Mowing Them Down" rules (p. 379). None of these are mandatory for a coherent shared-initiative row.

**Not found in indexed rules:** any rule making a group of NPCs share a single Condition Monitor; any rule insulating a shared Initiative Score from wound or surprise modifiers. Searched `rules/pages/` for `grunt`, `mook`, `mob`, `Initiative Score`, `Wound Modifier`, `SURPRISE`, `INTERRUPT ACTIONS`. The insulation the user wants is a house rule, and that is the single most important thing for the implementation to record rather than assume.

---

Files read: `RULINGS.md`, and `rules/pages/` files `p0159`, `p0161`, `p0162`, `p0169`, `p0171`, `p0172`, `p0194`, `p0195`, `p0380`, `p0381`, `p0382`, `p0383`.
