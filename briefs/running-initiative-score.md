# Rules Brief: Running Initiative Score Across Passes

**Feature request (verbatim):** getCurrentInitiative() recomputes Initiative
Score from base each pass rather than maintaining a running score. Per the
analyst's finding (pp. 159-160), the book applies -10 as a subtraction from a
mutating current score. Rework this so mid-turn changes to Initiative Score
persist correctly across passes.

**RULINGS.md status at time of writing:** empty — no prior binding rulings to
reconcile. Open Ruling Questions below are new and need a table decision
before/at approval.

---

## Summary

RULINGS.md at the repo root is **empty** — there are no prior binding table rulings to cite or preserve. Everything below is derived fresh from `rules/`.

**The feature request's premise is correct, and its page citation is correct.** SR5 core treats Initiative Score as a **single mutable running value per participant per Combat Turn**. It is rolled once at the start of the turn, and thereafter *everything* — the end-of-pass –10, Full Defense, wound modifiers, drugs, spells, astral projection, VR mode switches — is applied as a **delta to that running value**, never as a recompute from a base. Recomputing from base each pass is not a thing the book ever describes, and it produces demonstrably wrong results against the book's own worked examples.

All citations are from the **Shadowrun Fifth Edition Core Rulebook**, the only book in the index. Files are `rules/pages/pNNNN.txt` where PDF page = printed page + 2; page numbers below are **printed** page numbers.

---

## Rules Findings

### F1. Initiative Score is rolled once per Combat Turn (p. 159, p. 158)
Step 1 of the Combat Turn Sequence is "Roll Initiative": determine Initiative Scores for all participants, once, for the whole turn (p. 158). To get the Score you roll your Initiative Dice and add the total to your Initiative attribute (p. 159). The GM records the score and characters act highest-to-lowest "during each Initiative Pass" (p. 159). Edge may be spent on this test to roll the maximum of 5D6, and that applies "for a single Combat Turn" (p. 159).

### F2. Each pass *subtracts* 10 from the recorded Score — it does not recompute (p. 159, p. 160)
Step 4: once all characters have acted in a pass, "subtract 10 from all characters' Initiative Scores and return to step 2 for all characters with an Initiative Score greater than 0" (p. 159). Restated in the Initiative Passes section: "At the end of each Initiative Pass the gamemaster subtracts 10 from all characters Initiative Score" (p. 160).

### F3. The book's own worked examples confirm a running score, including negatives (p. 160, p. 191)
Cayman 22 → 12 → 2; Halloweener 16 → 6 → **–4**; Pete 10 → 0 (p. 160). Note the book keeps subtracting past zero rather than clamping. In the Active Defenses example, Blackfeather rolls 11, spends –10 on Full Defense to reach 1, then takes the end-of-pass –10 to reach **–9**, and is explicitly told he "can't" Parry because "his Initiative Score is already in the negatives" (p. 191). A recompute-from-base model cannot produce –9, and cannot gate the Parry.

### F4. "Changing Initiative" is written explicitly as delta arithmetic on the current Score (p. 160)
> "If a character's Initiative attribute changes, immediately apply the difference as a positive or negative modifier to the character's Initiative Score. This new Initiative Score applies to all remaining actions in that Combat Turn."

The worked example is unambiguous and is the load-bearing text for this feature: a character with Initiative attribute 8 and Initiative Score 11 activates an implant raising his Initiative attribute to 10 (+2), and "immediately raises his Initiative Score to 13 (**11 + 2**)" (p. 160). The book adds the delta to 11 — the mutated running value — not to a freshly recomputed base.

### F5. Mid-turn Initiative Dice changes also add/subtract, and only the *changed* dice are rolled (p. 160)
- **Increase:** the character "immediately rolls the extra Initiative Dice and adds the sum to their **current** Initiative Score for that Combat Turn" (p. 160).
- **Decrease:** the character "immediately rolls the number of lost dice and subtracts the total from their Initiative Score (along with any decrease to their Initiative Attribute)" (p. 160).

There is no re-roll of the whole pool and no recompute.

### F6. Late entry into combat is modelled as a subtraction, not a modified base (p. 160)
A character joining an in-progress combat "should roll for their Initiative Score as normal and then subtract 10 for each Initiative Pass that has already occurred" (p. 160). See the worked example on p. 193: Bodyguard B rolls 19, then 19 – 10 (failed Surprise) – 10 (joined after the first pass) = –1.

### F7. Ties (relevant, because mutation creates and breaks ties mid-pass) (p. 159, p. 158, p. 161)
Tied Initiative Scores are broken by **ERIC** — Edge, Reaction, Intuition, Coin toss — comparing attributes in that order, higher goes first; if still tied, flip a coin, or at GM discretion both act simultaneously (p. 159). Step 2 repeats this (p. 158). Delayed actions that land on the same Score break ties "in the same manner as Initiative (p. 159)" (p. 161). Timed items always go last on a tied Initiative Score (p. 161).

This matters here because ERIC is a **comparison over live attributes**, not over the Score — so a wound modifier that changes Reaction mid-turn can change both the Score *and* the tiebreak.

### F8. Delayed Actions freeze the Score but do not exempt it from the –10 (p. 161)
"Characters delaying an action in this manner keep their initial Initiative Score. If the character does not act before the end of the Initiative Pass, they incur the standard reduction of 10 at the end of the Initiative Pass" (p. 161). Acting on a delay means acting at a Score lower than their own, with a –1 dice pool penalty (p. 161). A delayed character can act first in the next pass but "must still use his own Initiative Score to determine the Action Phases he has for the Combat Turn" (p. 161).

### F9. Interrupt Actions debit the running Score at the moment they are taken (p. 167)
"When a character uses an Interrupt Action... he takes an action out of turn, but only if he has enough Initiative Score left in the Combat Turn to pay the price... **The Initiative Score reduction occurs at the time of the Interrupt Action.**" Interrupts do not cost the Action Phase "unless they reduce their Initiative Score below 0 with their actions" (p. 167). A character may only take an Interrupt Action prior to their first Action Phase if they are not surprised (p. 167).

---

## Precise Definitions

| Term | Definition | Lifetime |
|---|---|---|
| **Initiative attribute** | Reaction + Intuition for Physical (p. 52, p. 159). Per the Initiative Attribute Chart (p. 159): Astral = Intuition × 2; Matrix AR = Reaction + Intuition; Matrix cold-sim VR and hot-sim VR = Data Processing + Intuition; Rigging AR = Reaction + Intuition. | A derived stat. Changes when its inputs change (augmentation, spell, wound modifier). Persists across turns. |
| **Initiative Dice** | Extra dice rolled to produce the Score. Base is 1D6 Physical / 2D6 Astral / 1D6 Matrix AR / 3D6 cold-sim / 4D6 hot-sim (p. 159). Everyone has one and can gain up to four more, **hard cap 5D6** (p. 52, p. 288). | Property of the character/mode. |
| **Initiative Score** | `Initiative attribute + sum of Initiative Dice roll` at the moment of the Initiative Test (p. 159). Thereafter it is a **running, mutating value**. | Rolled once per Combat Turn (p. 158); mutated all turn (p. 160); discarded and re-rolled at the start of the next turn (p. 159 Step 5, and the p. 273 rigger example: "It's the start of a new Combat Turn, and the new Initiative Scores after rolling are..."). |
| **"Initiative Rating"** | Used in the p. 160 example ("Initiative Rating of 11") as a synonym for the Initiative attribute. This is a rulebook inconsistency, not a fourth quantity. | — |

**Which persists across passes:** the **Initiative Score** persists and mutates. **Which is fixed for the whole turn:** nothing is truly fixed — the Initiative attribute can change mid-turn (p. 160), and even the dice count can change mid-turn (p. 160). The only thing not repeated is the *Initiative Test itself*; you never re-roll the whole pool mid-turn.

---

## Mid-turn Mutation Behavior

**This is addressed by RAW, and the answer is: apply as a delta to the running Score, effective immediately, affecting all remaining actions this turn.** It is neither "future passes only" nor "retroactive recompute."

Enumerated by source:

### Attribute changes (p. 160)
Delta applied immediately to the current Score. "This new Initiative Score applies to all remaining actions in that Combat Turn." Explicitly triggered by activating an augmentation, a drug, a spell, or "other enhancer"; and negatively by being wounded or having vital equipment damaged (p. 160).

### Wound modifiers (p. 158, p. 160, p. 169)
Wound modifiers are applied **directly to the character's Initiative attribute** (p. 160), which propagates to the Score (p. 169: "The Wound Modifier penalty is also applied to the character's Initiative attribute and therefore their Initiative Score during combat"). "These changes are made immediately after the injury occurs and **can affect the initiative order even within the same Initiative Pass**. These changes do not allow the character to act again; they simply change their Initiative score" (p. 160). Cross-referenced from Step 1 (p. 158) and noted as carrying into subsequent Combat Turns (p. 159).

### Initiative Dice changes (p. 160)
Roll only the delta dice; add or subtract the result from the current Score (see F5).

### Astral projection mid-turn (p. 160)
A magician with 1D6 who spends her first action to astrally project (2D6 base) "gains the die (and the change in Initiative) for their Astral Initiative during that Combat Turn," and "would also replace their Reaction + Intuition for Physical Initiative with Intuition × 2 for Astral Initiative." Both changes are deltas onto the existing running Score.

### Interrupt Actions — all immediate debits (p. 167)
- **Full Defense**: –10, immediately; the Willpower defense bonus lasts the entire Combat Turn (p. 188, p. 191).
- **Dodge / Parry / Block**: –5 each, one Defense Test each (p. 188, p. 191–192, summarized p. 168).
- **Interception**: voluntarily decrease Initiative Score by 5 to make an out-of-turn melee attack (p. 194); cannot be done without enough Score left (p. 168).
- **Spell defense declaration** when you have no Free Action left: Interrupt Action reducing Initiative Score by 5 (p. 294).
- **Full Matrix Defense**: Initiative Score reduced by 10, effects last the rest of the Combat Turn (p. 240).
- **Evasive Driving**: treated as Full Defense — driver reduces Initiative Score by 10 (p. 205).

### Externally imposed Score reductions
- **Surprise**: failure costs 10 from Initiative Score, "either when Initiative is rolled **or immediately if it occurs in the middle of the Combat Turn**"; surprised until their next Action Phase; no Defense Test; spending Edge preserves defense rolls but **not** the lost points (p. 192). Critical glitch = no action in the first Action Phase, then –10 for the glitch plus –10 for mid-fight entry (p. 192).
- **Electricity secondary effect**: immediate –5 Initiative Score plus –1 dice pool for 1 Combat Turn. Non-accumulating across multiple hits. "If the character's Initiative Score is reduced to 0 or below, they lose their last action. If they have no Initiative Score left the reduction comes on the start of the next Combat Turn" (p. 171).
- **Called Shot — Shake Up**: target loses 5 from Initiative Score; "If his Initiative Score is dropped below 0, he loses his last Action Phase for this Initiative Pass." Applies even if all damage is resisted, so long as the shot hit (p. 196).
- **Bugs / Swarm spells**: target loses 2 from Initiative Score per net hit; if sustained, loses the same amount again **at the beginning of each Combat Turn** (p. 290).
- **Critter Natural Weapon (paralyzing variety)**: Reaction reduction "affects the target's Initiative and Initiative Score," lasting (Magic + net hits) Combat Turns (p. 399).
- **Decrease [Attribute] spell**: lowering Reaction or Intuition lowers Initiative for as long as sustained (p. 288).
- **Combat Paralysis quality**: on the character's first Initiative Test, halve the Initiative Score for that turn, rounded up; normal in subsequent Combat Turns; also –3 on Surprise Tests (p. 80).

### Positive mid-turn sources
- **Adrenaline Boost** (adept, Free Action): +2 Initiative Score per level **for the current Combat Turn**; Drain equal to levels at the beginning of the next turn (p. 308–309).
- **Increase Reflexes** spell: +1 Initiative per hit, +1 Initiative Die per two hits; only one such spell at a time; max +5D6 (p. 288).
- **Improved Reflexes** (adept): +1 Reaction (which affects Initiative) and +1D6 per level, max level 3; **cannot be combined** with other technological or magical Initiative increases (p. 310).
- **Wired reflexes**: +1 Reaction and +1D6 per rating when activated. Activation is a Complex Action manually, a Simple Action wirelessly (p. 455) — i.e., it happens mid-turn and routes through Changing Initiative.
- **Drugs**: Cram +1 Reaction, +1D6 (p. 411); Jazz +1 Reaction, +1 Physical limit, +2D6 (p. 411); Kamikaze +2D6 among other bonuses (p. 412). Onset is governed by the substance's **Speed** attribute — "Immediate", "1 Combat Turn", "3 Combat Turns", etc. (p. 410).
- **Edge — Blitz**: roll the maximum of five Initiative Dice for a single Combat Turn (p. 56, p. 161).
- **Edge — Seize the Initiative**: move to the top of the order **regardless of your Initiative Score**, for the entire Combat Turn (multiple passes), returning to normal position at the start of the next turn (p. 56, p. 160–161). Multiple Seizers order among themselves by Initiative Score.

### Explicit *anti*-mutation exception
- **Built-in-timer projectile explosives**: detonate in the next Combat Turn "on the same Initiative Score in which it was fired minus 10, **regardless of any changes to the attacker's Initiative Score**" (p. 182). This must be a snapshot at fire time, not a live reference to the mutating field.
- **Generic timed items**: by contrast, go off "based on the character's current Initiative Score" (p. 161) — a live read.

---

## Open Ruling Questions

Numbered. Each needs a table decision. **Not yet decided** — if answers are added
below by the user, they become binding for Stage 2 implementation.

1. **Does a mid-pass Score *increase* let a character act earlier within the pass they are already in?**
   RAW covers the decrease direction only: wound-modifier changes "can affect the initiative order even within the same Initiative Pass" but "do not allow the character to act again" (p. 160). Nothing addresses a character whose Score rises above the currently-acting character's Score after their own Action Phase has already passed.
   *Recommended default:* Score increases change ordering for **all not-yet-taken Action Phases**, but never grant a second Action Phase in a pass already used. Rationale: it is the direct mirror of the p. 160 "do not allow the character to act again" clause, and it preserves one-Action-Phase-per-pass.

2. **Can a mid-turn increase resurrect a character from Score ≤ 0 into an additional Initiative Pass?**
   Adrenaline Boost (+2/level, p. 308–309) can lift a Score of –1 to +1. Step 4 only says return to step 2 "for all characters with an Initiative Score greater than 0" (p. 159), evaluated at end of pass. Whether the check is re-evaluated after a later mutation is not stated.
   *Recommended default:* yes — evaluate "> 0" at the moment each new pass begins, not at the moment of the subtraction. Rationale: Adrenaline Boost's stated purpose is "This power lets you accomplish more in one Combat Turn" (p. 308), which is meaningless under the alternative.

3. **Does a Score reduction that drops a not-yet-acted character to ≤ 0 mid-pass cancel their pending Action Phase in the general case?**
   Defined only for specific effects: Electricity (p. 171) and Shake Up (p. 196) both say they lose the action; Interrupt Actions cost the Action Phase if they push the Score below 0 (p. 167). Not defined for e.g. a sustained Swarm tick (p. 290) or a Decrease Reaction spell (p. 288) landing mid-pass.
   *Recommended default:* generalize the specific rules — any reduction to ≤ 0 before the character's Action Phase in that pass cancels it. Rationale: three independent instances (pp. 167, 171, 196) all rule the same way; no instance rules otherwise.

4. **Exact ordering of the end-of-pass –10 relative to Interrupt Actions declared "at the end of" a pass.**
   Full Defense/Dodge/Parry can be declared "at any point in a Combat Turn" (p. 191), and the –10 occurs "at the time of the Interrupt Action" (p. 167), but the sequencing against the pass boundary is unstated.
   *Recommended default:* resolve all Interrupt Action debits first, then apply the –10, then evaluate the "> 0" gate for the next pass. Rationale: this is the ordering the p. 191 example implicitly uses (Blackfeather 11 → 1 via Full Defense → –9 after the pass).

5. **Should the tracker maintain simultaneous, independent Initiative tracks for a single character (meat + Matrix, or body + astral form)?**
   RAW does **not** support this. A magician who astrally projects *replaces* Physical Initiative with Astral Initiative on the same running Score (p. 160), and her body is in "a coma-like state" (p. 313). A VR decker's "body goes limp" (p. 229). AR users simply use "your normal Initiative and Initiative Dice" (p. 229, p. 231). Riggers jumped into a drone use "the VR initiative of the rigger" — one track (p. 270). The one genuinely separate track is a *different entity*: an autonomous drone (Pilot × 2, 4D6 total — p. 270) or an IC program with "its own Condition Monitor and Initiative Score" (p. 247).
   *Recommended default:* one Initiative Score per **participant entity**, with a `mode` field (Physical / Astral / Matrix-AR / Cold-sim / Hot-sim / Rigging-AR) that changes the *inputs* and triggers a delta. Model drones/IC/spirits as separate participants. Rationale: matches p. 160 exactly and avoids inventing a subsystem.

6. **Whether temporary "for this Combat Turn" modifiers should be folded into the next turn's Initiative Test.**
   Adrenaline Boost expires at turn end (p. 308–309); Edge's max-5D6 and Blitz are "for a single Combat Turn" (pp. 56, 159, 161); Seize the Initiative's ordering override ends "at the start of the following Combat Turn" (p. 56). But no rule states a general expiry procedure.
   *Recommended default:* tag every modifier with an explicit scope (`instant-delta` / `this-turn` / `sustained` / `permanent`); clear `this-turn` modifiers before the next Initiative Test. Rationale: each cited effect states its own scope, so the data model needs the field regardless.

7. **Is there a floor on Initiative Score?**
   The book never states one, and shows –4 (p. 160) and –9 (p. 191), and uses negativity as a gate on Parry (p. 191). But nothing says the end-of-pass –10 keeps applying once everyone is already ≤ 0 — Step 4 says once all characters are at 0 or less, move to Step 5 (p. 159).
   *Recommended default:* no floor; allow arbitrary negatives; stop applying the –10 once the turn ends. Rationale: negative values are load-bearing for the Interrupt-Action affordability check (p. 167).

**Scope note for Stage 2:** this feature is specifically about making
`currentInitiativeScore` a persisted running value that mutates via deltas
instead of being recomputed from base each pass, and about the pass-advance
(-10) and mid-turn attribute-change (delta) mechanics that depend on that.
Open Ruling Questions 3 and 6 (action cancellation on drop-to-zero mid-pass,
and modifier scope/expiry tagging) describe adjacent mechanics that are valid
to leave as future work if not already implemented, provided the implementer
does not build anything that would make them impossible to add later. Ruling
Question 5 (single participant track) is already the existing architecture
per ARCHITECTURE.md's Participant model, per the analyst; the implementer
should confirm this rather than change the participant model.

---

## Recommended Implementation Behavior

*(Plain rules terms. No code.)*

1. **One mutable `currentInitiativeScore` per participant per Combat Turn.** Seeded once, at Step 1, by the Initiative Test: Initiative attribute + Initiative Dice roll (p. 159).
2. **Never recompute the Score from a base after seeding.** Every subsequent change is a signed delta applied to the running value (p. 160).
3. **Pass advance is `score -= 10`**, applied to every participant, including those already at or below zero (pp. 159, 160, 191).
4. **A separate, also-mutable `initiativeAttribute`** tracks Reaction + Intuition (or the mode-appropriate formula, p. 159) plus wound modifiers, spell/augment/drug modifiers. When it changes by *d*, apply `score += d` **once**, immediately (p. 160).
5. **Wound modifiers hit the attribute, not the Score directly** (p. 160, p. 169) — so that they propagate to the Score, to ERIC tiebreaks via Reaction, and to the next turn's Initiative Test.
6. **Initiative Dice changes roll only the delta dice.** Gaining *n* dice: roll *n*D6, `score += result`. Losing *n* dice: roll *n*D6, `score -= result`, plus any attribute delta (p. 160). Enforce the 5D6 hard cap (p. 52, p. 288).
7. **Mode changes are attribute + dice changes, not new tracks.** Astral projection, Switch Interface Mode AR↔VR (p. 243, which itself cross-references Changing Initiative p. 160), and jumping into a drone all recompute the *attribute formula* and *dice count*, then apply both as deltas (p. 160).
8. **Interrupt Actions debit at declaration time**, and are gated on having enough Score left (p. 167). Model each as a named cost: Full Defense –10 (p. 191), Dodge/Parry/Block –5 (p. 191–192), Interception –5 (p. 194), spell defense –5 (p. 294), Full Matrix Defense –10 (p. 240), Evasive Driving –10 (p. 205).
9. **Delayed Actions freeze the acting Score but not the end-of-pass decay** (p. 161).
10. **Two distinct read semantics for timed effects:** generic timed items read the *live* current Score (p. 161); built-in-timer projectile explosives snapshot `firedAtScore - 10` and ignore later changes (p. 182).
11. **Seize the Initiative is an ordering flag, not a Score change** — it must not be modelled by inflating the Score, because it lasts the whole turn regardless of Score, and multiple Seizers still order by Score among themselves (p. 56, p. 161).
12. **Tiebreak by ERIC over live attributes** — Edge, then Reaction, then Intuition, then coin toss / simultaneous (p. 159). Re-evaluate ties whenever a Score mutates, since mutation both creates and dissolves them.

**In-scope for this feature specifically:** points 1–4 (running score, no recompute,
pass-advance delta, attribute-change delta) and their gameplay scenarios (S1–S3
below). Points 5–12 describe mechanics that already exist or are separate
features; the implementer should not need to touch Interrupt Actions, drone/
Matrix mode switching, Seize the Initiative, or timed items to satisfy this
brief unless the current recompute-from-base bug is also breaking one of
those paths — check and report if so, don't silently expand scope.

---

## Acceptance Criteria

1. Initiative Score is produced exactly once per Combat Turn, at Step 1, as Initiative attribute + Initiative Dice roll (p. 159).
2. Advancing to the next Initiative Pass subtracts exactly 10 from every participant's current Initiative Score (p. 159, p. 160).
3. Initiative Scores are permitted to go negative and are not clamped at 0; a participant at 12 who spends –10 on Full Defense and then takes a pass advance reads –8 (pp. 160, 191).
4. A participant only gets an Action Phase in a new Initiative Pass if their Initiative Score is greater than 0 at the start of that pass (p. 159).
5. A participant with Initiative Score 0 or less may still take one Free Action per pass and may still respond to attacks by dodging or defending (p. 160).
6. A change to Initiative attribute of +*d* raises the current Initiative Score by exactly *d*, not by recomputing: attribute 8 / Score 11 + implant to attribute 10 yields Score **13** (p. 160).
7. A mid-turn Initiative Dice increase of *n* rolls *n*D6 and adds only that result to the current Score (p. 160).
8. A mid-turn Initiative Dice decrease of *n* rolls *n*D6 and subtracts that result, plus any attribute delta, from the current Score (p. 160).
9. Total Initiative Dice never exceed 5D6 from any combination of sources (p. 52, p. 288).
10. Wound modifiers apply to the Initiative attribute (and thence the Score), immediately on injury, and may reorder the current pass without granting a new action (pp. 158, 160, 169).

*(Criteria 11–36 in the analyst's full output cover Interrupt Actions, Surprise,
drugs, Matrix/astral mode switches, delayed actions, and timed items — out of
scope for this feature per the scope note above; kept out of this brief's
acceptance list so Stage 2/3 don't chase them. Full list available by re-running
the analyst if a future feature needs them.)*

---

## Gameplay Scenarios to Survive (regression tests)

**S1 — Ordinary case (the book's own example, p. 160).**
Cayman rolls 11 on 3D6 with Initiative attribute 11 → Score 22. Halloweener: 9 + 7 → 16. Saskatchewan Pete: 2 + 8 → 10. Pass 1 order: Cayman, Halloweener, Pete. End of pass: subtract 10 → 12 / 6 / 0. Pass 2: Cayman then Halloweener; Pete is out (not > 0). End of pass: 2 / –4 / –10. Pass 3: Cayman alone. Then new Combat Turn. **Expected:** the tracker must show Halloweener at –4, not clamped. This is the regression baseline (both correct and buggy implementations pass this one).

**S2 — Mid-turn attribute change, applied in a later pass after decay (p. 160).**
Kicker has Initiative attribute 8, rolls 3 on 1D6 → Score 11. Pass 1 ends: Score 1. In **pass 2**, after decay, Kicker wirelessly activates wired reflexes 1: +1 Reaction → attribute 10 (+2), and +1D6. Per p. 160 he immediately gets Score 1 + 2 = 3, then rolls the one new die (say 4) and adds → 7. He acts in pass 2. End of pass 2: –3, no pass 3.
**Expected (correct/running-score):** 7 → –3, no third pass.
**Bug signature (recompute-from-base):** would reconstruct something like attribute 10 + 4 = 14 or similar from a stored base, decoupled from the actual decayed value, and likely grant an erroneous extra pass or wrong ordering. This is the scenario that must fail on the current code and pass after the fix.

**S3 — Interrupt Action spend followed by a pass boundary (p. 167, p. 191).**
Wombat rolls Score 26. Full Defense (Interrupt Action): –10 → 16. Block: –5 → 11. End of pass 1: → 1. Acts in pass 2 on Score 1. End of pass 2: → –9. In pass 3, attempts a Parry.
**Expected:** Parry is refused — Score is negative, insufficient to pay the 5-point cost (pp. 167, 191).
**Bug signature (recompute-from-base):** reconstructs 26 – 20 = 6 in pass 3 from base, wrongly permits the Parry, silently discarding the 15 points of interrupt spend already committed. This is the most direct proof of the bug and should be a required regression test.

These three scenarios (S1 baseline, S2 divergent mid-turn-change case, S3
divergent interrupt-spend case) are sufficient to prove the fix for this
feature's stated scope. Additional scenarios from the full analyst output
(ties, astral/Matrix mode switching, surprise, delayed actions) are documented
above for future features but are not required regression tests for this one.

---

## Things I searched for and did not find

- **No rule anywhere describes recomputing Initiative Score from a base value each Initiative Pass.** Searched "Initiative Score" across all 502 indexed pages (33 hits), plus "Initiative Dice"/"Initiative dice" (20 pages). Every mechanic is phrased as an addition to or subtraction from the existing Score.
- **No general rule for whether Initiative Score has a lower bound**, beyond the negative values shown in examples (pp. 160, 191, 193) — see Open Ruling Question 7.
- **No rule granting a character simultaneous, independently-decaying Initiative Scores in two planes/tracks.** See Open Ruling Question 5.

## Files relevant to this brief

- `E:\Programs\SR5E\RULINGS.md` — currently empty; Open Ruling Questions 1–7 above should be appended here once the table decides them.
- `E:\Programs\SR5E\rules\pages\p0160.txt` (printed 158), `p0161.txt` (159), `p0162.txt` (160), `p0163.txt` (161) — the core Initiative and Changing Initiative text.
- `E:\Programs\SR5E\rules\pages\p0169.txt` (167), `p0170.txt` (168), `p0190.txt` (188), `p0191.txt`/`p0193.txt` (191), `p0194.txt` (192), `p0196.txt` (194), `p0198.txt` (196) — Interrupt Actions, defenses, Surprise, Interception, called shots.
- `E:\Programs\SR5E\rules\pages\p0231.txt` (229), `p0233.txt` (231), `p0242.txt` (240), `p0245.txt` (243), `p0249.txt` (247), `p0272.txt` (270) — Matrix/rigging Initiative.
- `E:\Programs\SR5E\rules\pages\p0290.txt` (288), `p0292.txt` (290), `p0296.txt` (294), `p0311.txt` (309), `p0312.txt` (310), `p0315.txt` (313) — magic.
- `E:\Programs\SR5E\rules\pages\p0413.txt` (411), `p0414.txt` (412), `p0457.txt` (455), `p0082.txt` (80) — drugs, wired reflexes, Combat Paralysis.
- `E:\Programs\SR5E\docs\APP_DOCUMENTATION.md` and `E:\Programs\SR5E\ARCHITECTURE.md` — will need reconciliation once `getCurrentInitiative()` becomes a stored mutable field rather than a derived accessor; that is an implementation concern for Stage 2, not a rules question.
