# Brief: Combat/Dice Log Readability

## Request

Improve readability of the shared combat/dice log for players and GMs — i.e. how already-resolved rolls, hits, glitches, and combat results are *presented and recorded*, without changing or misrepresenting any resolution mechanic.

**Headline finding: this is overwhelmingly a UI/UX feature with almost no rules content.** SR5 does not specify a log format, a display order, or any presentation requirement whatsoever. What RAW *does* supply is (a) the vocabulary the log must use, (b) the minimum set of facts a reader needs in order to verify a stated result, and (c) one explicit statement that roll *visibility* is a table-configuration decision, not a rule. Everything else below is constraint-on-content, not a mandate to build anything.

RULINGS.md was read first. Neither existing ruling (no floor on Initiative Score; bonus Initiative Dice carry additively into astral space) is re-decided here; the second is referenced in Scenario 4 only as the already-settled behaviour the log must describe accurately.

All citations are from the **SR5 core rulebook** (the only book in `rules/`), by **printed** page number, each page opened and read.

## Governing rules

**Roll vocabulary and the anatomy of a result**

- A roll of six-sided dice is a *dice pool*; each 5 or 6 rolled is a *hit* (p. 44).
- *Threshold* is the number of hits needed to succeed; *net hits* are hits above what was needed, and net hits can add to effect (e.g. damage) (p. 45).
- Four things define a test: the kind of test, the dice pool, the *limit*, and the *threshold* (p. 46).
- A *limit* caps how many of your rolled hits you may actually apply. Roll more hits than the limit, and you count only hits equal to the limit (p. 47).
- Inherent limits are Physical, Mental, Social; a limit imposed by gear (e.g. a weapon's Accuracy) *overrides* the inherent limit whether higher or lower (p. 47).
- Limits generally apply only to tests whose pool is skill + attribute. Tests using one attribute, or two attributes, use no limit — so a Defense Test (Reaction + Intuition) has no limit (p. 47, worked in the example on p. 174).
- Test types are named: Success Test (a.k.a. Simple test), Opposed Test, Extended Test, Teamwork Test (p. 47–49). Opposed Tests have no threshold; you are trying to beat an opponent's hits (p. 47).

**Glitch definition — the one place a log can actually lie**

- A *glitch* is when **more than half the dice you rolled** show a 1 (p. 45).
- A glitch does **not** cancel a success. A roll can be both successful and a glitch, and both must stand (p. 45).
- A *critical glitch* is a glitch on a roll that also produced **no hits at all** (p. 45).
- The concrete consequence of a glitch is GM-adjudicated narrative, not a table lookup; the GM may also make a glitch more severe if the roll had only one or two hits (p. 45).

**Edge, which mutates roll semantics**

- Only **one point of Edge** may be spent on any specific test or action, and a character may only spend Edge on her own actions (p. 56).
- *Push the Limit*: add Edge rating to the pool, before or after the roll; invokes the **Rule of Six** (each 6 is a hit and is re-rolled, adding further hits) and lets you **ignore the limit** for that test. If used *after* the initial roll, only the Edge dice use the Rule of Six (p. 56).
- *Second Chance*: re-roll all dice that did not score a hit. It **cannot negate a glitch or critical glitch**, does not use the Rule of Six, and has no effect on limits (p. 56).
- *Close Call*: negate one glitch, or downgrade a critical glitch to a glitch. Two Edge cannot be spent to fully negate a critical glitch, and it does nothing about the zero hits (p. 46, p. 56).
- *Seize the Initiative* (move to top of order for the whole Combat Turn), *Blitz* (roll the maximum five Initiative Dice for a Combat Turn), *Dead Man's Trigger* (p. 56; Initiative uses restated p. 160).
- **Burning** Edge: *Smackdown* — automatically succeed with four net hits, no dice rolled by either side, limits ignored; *Not Dead Yet* (p. 57). The p. 57 example resolves an attack to 11P damage with no attack or defense roll at all.
- *Buying hits*: skip the roll, one hit per four dice, rounded down, all-or-nothing, GM approval required (p. 45).

**Combat resolution — the numbers a combat log entry summarises**

- Combat sequence is Declare / Attack / Defend / Apply Effect ("DADA") (p. 173).
- Attacker rolls Combat Skill + Attribute ± modifiers [Limit]; defender rolls Reaction + Intuition ± modifiers. More attacker hits than defender hits = hit, and the excess is net hits (p. 173).
- **A tie is not a miss.** A tied Opposed Test is a *grazing hit*: no damage, but contact is made, which still lets contact-only effects (poisons, shock gloves, touch spells) apply (p. 173).
- Net hits are added to the weapon's Damage Value; AP modifies the defender's Armor; modified DV ≥ modified Armor means Physical damage, otherwise Stun; defender resists with Body + modified Armor (or Body alone if modified Armor is not positive), each hit reducing DV by 1; DV reduced to 0 or less means no damage (p. 173).
- Remaining DV is applied to the Condition Monitor, one box per point, possibly triggering Wound Modifiers and knockdown (p. 173).
- The book's own worked example (p. 174) presents a result as a full chain: pool composition and modifiers → hits → limit → opposing hits → net hits → modified DV → modified Armor → damage type → resistance hits → boxes marked.
- The p. 207 healing example logs a roll as its literal die faces — "6, 6, 6, 5, 5, 5, 4, 4, 3, 2, 1, 1 for 6 hits" — and separately notes the limit check. This is descriptive of the book's presentation style, not a requirement.

**Initiative values a combat log will reference**

- Initiative Score = Initiative Dice roll + Initiative Rating; every Initiative Pass subtracts 10; characters with Score above 0 act again (p. 160).
- Initiative can change mid-Combat-Turn from augmentations, drugs, spells, wounds, or lost dice; wound modifiers apply directly to the Initiative attribute and can reorder the pass in progress (p. 160).
- Astral projection mid-turn: the magician rolls the extra Initiative Dice and adds them to the current Initiative Score, and swaps Reaction + Intuition for Intuition x 2 (p. 160).
- Entering combat late: roll normally, then subtract 10 per pass already elapsed (p. 160).

**The one explicit RAW statement about roll visibility**

- Under Gamemaster Advice, the book tells the group to decide up front whether **all dice are visible, including the gamemaster's**, whether the GM rolls **discreetly behind a screen or in front of the players**, and whether rolls will ever be fudged; it also recommends establishing procedures for **when initiative is rolled and reported** (p. 330). This is framed as a table agreement, not a rule.

## Interactions and exceptions

Subsystems that change what a "roll result" means, and therefore what a log entry must be able to express:

- **Edge / Push the Limit** — pool grows by Edge rating and the limit is ignored entirely; exploding dice mean the count of dice shown can exceed the stated pool (p. 56).
- **Edge / Second Chance** — produces a *second* set of dice for the same test, but glitch status was already determined and cannot be undone by it (p. 56).
- **Edge / Close Call** — retroactively downgrades or removes a glitch after the fact; the hits are untouched (p. 46, p. 56).
- **Burning Edge / Smackdown** — a resolved combat result with zero dice on either side and limits ignored (p. 57).
- **Buying hits** — a resolved test with zero dice (p. 45).
- **Extended Tests** — hits accumulate across rolls, pool shrinks by one die per roll; a glitch may cost 1D6 accumulated hits (GM's option) and a critical glitch fails the whole test outright (p. 48).
- **Teamwork Tests** — assistants' hits raise the leader's limit and pool; an assistant's glitch denies the limit bump, an assistant's critical glitch denies all limit adjustments (p. 49).
- **Trying Again** — cumulative –2 per retry, but taking another shot or sword swing is *not* a retry (p. 49).
- **Surprise** — a glitch on the Surprise Test means the character startles (GM-defined); a critical glitch means no action in the first Action Phase; Edge can avoid surprise but the Initiative Score penalty still applies (p. 192). The p. 193 example logs surprise as a –10 Initiative Score modifier and stacks a second –10 for joining late.
- **Quick Draw** — glitch: gun stuck in holster or dropped, no further actions; critical glitch: blade fumbled out of reach or pistol mishap (p. 165).
- **Grenades / thrown and launched explosives** — glitch doubles scatter and it explodes; critical glitch detonates on the attacker (p. 181, p. 182). Scatter also consumes hits, so hits do something other than damage here (p. 173, p. 182).
- **Called shots** — knockdown-type called shot: attacker glitch means he falls too, critical glitch means he falls and the defender doesn't (p. 196). Split-damage called shots split the pool, which raises glitch odds (p. 196).
- **Multiple attacks** — pool split across attacks, resolved separately; Edge dice are added *before* the split (p. 196).
- **Barriers** — attack test is unopposed; the only way to "miss" is a critical glitch (p. 197).
- **Armor** — a glitch on the armor's repair test destroys it irreparably; a critical glitch breaks it dangerously (p. 170).
- **Healing** — glitch doubles resting time, critical glitch adds 1D3 boxes on top (p. 207).
- **Magic / Drain** — Drain is Step 6 and the spell's effect happens even if Drain drops you; if casting hits exceed Magic rating, Drain becomes Physical rather than Stun (p. 282). A combat log showing a spell needs a Drain sub-entry with its own damage type.
- **Rituals** — glitch may add Drain, raise resisting Force by 2, or force the leader to seal alone; critical glitch is open-ended (p. 296).
- **Matrix** — deferred. Per CLAUDE.md the Matrix module is paused and its rules are unverified in this repo; Matrix-specific glitch, limit, or initiative-track behaviour was not verified and no claim is made about it here. Treat any Matrix log semantics as **not yet verified against `rules/`**.

## Edge cases the book defines

1. Successful roll that is also a glitch — both stand, the glitch does not cancel success (p. 45).
2. Glitch with zero hits is specifically a *critical* glitch, a distinct category (p. 45).
3. Critical glitch downgraded by Close Call still leaves the character with zero hits (p. 46).
4. Two Edge cannot be spent to erase a critical glitch; and if Edge was already spent on that test for dice, none can be spent again on it (p. 46, p. 56).
5. Second Chance re-rolls cannot remove a glitch already rolled (p. 56).
6. Hits above the limit are simply not counted — displayed hits and applied hits can differ (p. 47).
7. Gear limit overrides inherent limit even when the gear limit is *lower* (p. 47).
8. Tests with no skill in the pool (e.g. Defense Test, Reaction + Intuition) have no limit at all (p. 47, p. 174).
9. Tied Opposed attack = grazing hit, no damage but contact made (p. 173).
10. Damage type flips Physical↔Stun based on modified DV vs modified Armor, before resistance is rolled (p. 173).
11. Damage fully resisted (DV to 0 or less) is a resolved hit that inflicts nothing — not a miss (p. 173).
12. Extended Test glitch costs 1D6 accumulated hits at GM option; critical glitch fails the test with no roll (p. 48).
13. Teamwork assistant glitch/critical glitch alter the *leader's* limit, not the assistant's result (p. 49).
14. Surprise critical glitch removes the first Action Phase entirely (p. 192).
15. Attack against a barrier is unopposed; only a critical glitch misses (p. 197).
16. Wound modifiers hit the Initiative attribute immediately and can reorder the pass already underway (p. 160).

## Scope decisions (Xavier, 2026-07-31)

The rules brief above was written against the full SR5 combat-resolution model. Checking the actual codebase (`src/app/dice-roller/dice-roller.component.ts`, `src/app/shared/log-formatter.ts`, `src/Combat/`) shows the app implements far less than that: the dice roller only rolls N d6 and counts hits (≥5); there is **no limit, threshold, opposed-test, or Edge-action system** anywhere in the code (the only "threshold" hit is unrelated Matrix Overwatch Score logic). Most of the open questions below assume mechanics that don't exist yet and are out of scope for this pass — they'd each be their own future `/feature` request with its own rules brief.

**In scope for this feature:**
- Readability/formatting/grouping improvements to the *existing* log entries (rolls, hits, initiative changes, actions, damage/healing) — presentation only, no new mechanics.
- **Glitch / critical glitch labeling**, added to the dice roller and log. This is computable from data already captured (count of 1s vs. pool size, p. 45) even though there is no Edge system yet to react to it (Close Call, Second Chance, etc. remain unbuilt). Consequence text stays GM-authored free text, never auto-generated (AC 24 still applies).
- **GM roll visibility toggle** (Open Question 1): implement as a real feature. Default is **visible** — players see GM rolls in the shared log unless the GM hides a specific roll or session.
- NPC dice pool compositions may be shown (Open Question 2 answered: no need to hide).

**Explicitly out of scope for this feature** (no code exists to display; do not build the display or the underlying mechanic):
- Limits (Open Questions 3, 6; Acceptance Criteria 6–9, 13, 17) — the app has no limit concept.
- Opposed-test framing, net hits, damage-chain display (AC 10–13, Scenario S1, S2, S6) — the app has no opposed-test resolution.
- Edge actions — Push the Limit, Second Chance, Close Call, Smackdown, Seize the Initiative, Blitz, Dead Man's Trigger, Not Dead Yet, buying hits (Open Questions 4, 5, 7; AC 4, 5, 7, 14–16; Scenarios S3, S7, S8) — no Edge system exists.
- Extended Tests, Teamwork Tests (AC 17, 18) — not implemented.
- Rewind/undo interaction with the log (Open Question 9 partially): ignore rewind entirely; the log itself should be **persistent** (append-only history), which is the only part of that question in scope.
- Matrix-specific log semantics (AC 26) — already deferred per CLAUDE.md.

**Resolved (Xavier, 2026-07-31), addendum after validation:**
- AC22 (Surprise Test logging) and AC23 (spell Drain logging) are formally marked **out of scope** for this feature, alongside limits/opposed-tests/Edge-actions/Extended-Tests/Teamwork-Tests. Neither Surprise nor Drain mechanics exist anywhere in the app; building either would mean building the underlying mechanic first, which needs its own rules brief.
- The GM roll-visibility toggle ships **as best-effort, not airtight**. Final validation found real gaps: (1) the periodic participant state-sync broadcast (`getSharedParticipants`) sends a hidden NPC's roll numbers (dice, rolled total, attributes, Score) regardless of the log-hiding toggle — the toggle only ever hid the *log line*, not the underlying synced state; (2) the retained-hidden-entries recovery path (banner + rejoin-to-merge) only activates on a deliberate "Close Room" click — a real disconnect (server restart, dropped connection) never fires that path and destroys hidden entries with no warning, same as the pre-fix behavior; (3) `logRolledTotalClamp` can leak a hidden roll's numbers when triggered by the one-shot "hide next roll" case specifically (the session-level toggle case is fixed). These are accepted as known limitations for this pass rather than pursued further — the toggle is suitable for casually keeping routine rolls out of the log, not for concealing information a GM needs to strictly protect from players who might inspect network traffic or catch a lucky reconnect timing. Documented here per the project's standing rule against silently resolving reported gaps.

**Resolved (Xavier, 2026-07-31):**
- Open Question 10 (grouping by Combat Turn / Initiative Pass): **No.** Keep the log as a flat list; do not add visual grouping/separation by turn or pass.
- Open Question 8 (GM narrative glitch text field): **Yes.** Add an optional free-text field attached to a glitch/critical-glitch log entry for the GM to add their own narration (e.g. "gun jams"). GM-authored only, never machine-generated.
- Open Question 11 (Initiative Rating vs. Initiative Attribute naming): resolved by whatever term `ARCHITECTURE.md` / the existing code already uses — implementer follows existing convention, no action needed from Xavier.

## Open questions for Xavier (superseded by Scope decisions above — kept for reference)

None of these are settled in RULINGS.md, and most are product decisions rather than rules questions. Recommendations only.

1. **Are GM/NPC rolls visible to players in the shared log?** RAW explicitly hands this to the table (p. 330). *Recommended default:* GM rolls visible, with a per-roll or per-session "hidden from players" switch, since the tracker's value proposition is a shared record. Not a rules matter either way.
2. **Are NPC dice pool compositions and limits shown to players, or only the outcome?** Same p. 330 decision. *Recommended default:* show hits/glitch status but hide pool composition for NPCs, since pool size leaks Attribute/skill ratings players haven't earned.
3. **Individual die faces, or summary only?** RAW never requires die faces. But glitch status is only *verifiable* from the count of 1s against the pool size (p. 45). *Recommended default:* always show pool size, number of 1s, hits, and limit; make raw faces available but not the default line, mirroring how p. 207 shows faces only when it matters.
4. **Do Rule of Six re-rolled dice count toward the glitch denominator?** RAW gives "more than half the dice you rolled" (p. 45) and separately says Edge dice explode (p. 56) without reconciling the two. *Recommended default:* glitch is computed on the dice actually rolled including explosions, since that is the literal reading — but flag it, because the alternative (original pool only) is a common table reading and changes outcomes.
5. **Is a Second Chance re-roll one log entry or two?** Mechanically the glitch was fixed by the first roll (p. 56), so a single merged entry showing only combined hits would misstate glitch provenance. *Recommended default:* one parent entry with a nested re-roll child, glitch flag owned by the parent.
6. **Displayed "hits" — pre-limit or post-limit?** The book counts hits then caps them (p. 47). *Recommended default:* show both, e.g. rolled hits and applied hits, since net hits downstream derive from the capped value.
7. **How are zero-dice resolutions rendered?** Buying hits (p. 45) and Smackdown (p. 57) produce results with no roll. *Recommended default:* first-class log entries explicitly labelled as such, never faked as a dice roll.
8. **Does the log capture the GM's narrative glitch adjudication?** The consequence is entirely GM-invented (p. 45). *Recommended default:* an optional free-text field attached to the glitch entry; the rules give nothing to auto-generate.
9. **Is the log authoritative history or ephemeral display?** Pure product decision, zero rules content — but it determines whether undo/rewind must rewrite log entries or append corrections. Worth settling before implementation because it is architectural, not cosmetic.
10. **Retention, ordering, and grouping (by Combat Turn? by Initiative Pass? by Action Phase?)** No rules content. p. 330 only suggests agreeing *when* initiative is rolled and reported. *Recommended default:* group by Combat Turn then Initiative Pass, since those are the boundaries the Initiative Score arithmetic on p. 160 is defined against.
11. **"Initiative Rating" vs "Initiative Attribute".** The book uses "Initiative Rating" in the p. 160 example while the chart on p. 159 is titled the Initiative Attribute Chart. Pick one for the UI and stay consistent; check ARCHITECTURE.md for whatever the code already standardised on.

## Acceptance criteria

1. A log entry for any dice roll shows enough to independently verify glitch status: the number of dice rolled and the number of 1s (glitch = more than half the dice show 1) (p. 45).
2. A roll with hits ≥ threshold that also glitches is labelled as **both** a success and a glitch; the log never suppresses one because of the other (p. 45).
3. An entry is labelled *critical glitch* only when the roll glitched **and** produced zero hits; a glitch with one or more hits is labelled *glitch* (p. 45).
4. After Close Call is applied, a critical glitch entry displays as a glitch and a glitch entry displays as negated, and the hit count is unchanged (p. 46, p. 56).
5. A Second Chance re-roll never changes the displayed glitch or critical-glitch status of the original roll (p. 56).
6. Where a limit applied, the entry distinguishes hits rolled from hits counted, with hits counted never exceeding the limit (p. 47).
7. Where Push the Limit was used, the entry shows the limit as ignored rather than showing an applied cap (p. 56).
8. Entries for tests whose pool is attribute-only or two attributes (e.g. Defense Test, Reaction + Intuition) show no limit rather than showing a Physical/Mental/Social limit (p. 47, p. 174).
9. Where a gear limit applied (e.g. weapon Accuracy), the entry names the gear limit and does not additionally show an inherent limit, including when the gear limit is lower (p. 47).
10. A tied attack Opposed Test is labelled *grazing hit*, never *miss*, and shows zero damage while indicating contact was made (p. 173).
11. An attack entry shows the chain: attacker hits, defender hits, net hits, modified DV, modified Armor, resulting damage type (Physical or Stun), resistance hits, and boxes applied (p. 173, p. 174).
12. An attack whose damage was fully resisted (DV reduced to 0 or less) is labelled as a hit that inflicted no damage, distinct from a miss (p. 173).
13. Damage type shown is derived from modified DV vs modified Armor and is stated before the resistance roll, not after (p. 173).
14. Resolutions with no dice — bought hits (one hit per four dice, rounded down) and Smackdown (four net hits, limits ignored) — appear as log entries explicitly marked as not rolled (p. 45, p. 57).
15. Only one Edge expenditure can be attached to a given test/action entry (p. 56).
16. Edge use is labelled by its RAW name — Push the Limit, Second Chance, Seize the Initiative, Blitz, Close Call, Dead Man's Trigger, Smackdown, Not Dead Yet — not by invented synonyms (p. 56, p. 57).
17. An Extended Test is rendered as one grouped entry showing accumulated hits and the shrinking pool, with a glitch shown as a hit reduction and a critical glitch shown as total failure (p. 48).
18. A Teamwork Test entry attributes each assistant's contribution to the leader's limit and pool, and shows an assistant glitch as a denied limit bump rather than as a failure of the leader's roll (p. 49).
19. Initiative entries show Initiative Dice result plus Initiative Rating equalling Initiative Score, and pass decay is shown as –10 per Initiative Pass (p. 160).
20. Mid-Combat-Turn Initiative Score changes (wound modifiers, gained/lost Initiative Dice, augmentation/drug/spell effects) appear as their own timestamped entries in the pass where they occurred (p. 160).
21. Negative Initiative Scores render as signed negative values and are never displayed clamped to 0 (RULINGS.md, 2026-07-31; consistent with p. 160 and p. 193 examples).
22. Surprise is shown as a Surprise Test result plus a –10 Initiative Score modifier, with a Surprise critical glitch shown as loss of the first Action Phase (p. 192, p. 193).
23. A spell entry carries a distinct Drain sub-entry, with Drain marked Physical when casting hits exceeded the caster's Magic rating and Stun otherwise (p. 282).
24. Glitch consequence text, where present, is displayed as GM-authored narrative and is never machine-generated from a table (p. 45).
25. Visibility of GM/NPC roll detail is a configurable setting rather than a hardcoded behaviour, because the book assigns this choice to the table (p. 330).
26. No log entry displays a Matrix-specific rules claim (Matrix limits, Matrix glitch effects, Overwatch Score) until those rules are verified against `rules/` (CLAUDE.md; not verified in this brief).

## Gameplay scenarios to survive

**S1 — Ordinary ranged attack, full chain.** Wombat fires a Browning Ultra-Power at Cutter as a Simple Action, –1 modifier: Pistols 4 + Agility 6 – 1 = 9 dice, limit = Accuracy 6, rolls 4 hits. Cutter's free Defense Test is Reaction 3 + Intuition 3 – 1 = 5 dice, no limit, 2 hits. Net hits 2 → DV 8P + 2 = 10P; Cutter's armour jacket 12 – AP 1 = 11; modified Armor > modified DV so damage becomes 10S; Cutter rolls Body 3 + 11 = 14 dice, 5 hits, takes 5S. **Expected log:** one grouped entry showing both rolls, the limit on the attack and the *absence* of a limit on the defence, the net hits, the P→S flip stated before the resistance roll, and 5 boxes of Stun (p. 173, p. 174).

**S2 — Tie, and a glitch that still succeeds.** Same exchange, but attacker and defender both score 3 hits, and the attacker's 9-dice pool showed five 1s. **Expected log:** labelled *grazing hit* — zero damage, contact made, so a coated blade or shock glove still delivers — and simultaneously labelled *glitch*, because more than half the dice showed 1s, with the success/contact not cancelled. It must not read "miss" and must not suppress the glitch. GM narrative text attaches to the glitch (p. 45, p. 173).

**S3 — Mid-Combat-Turn state change plus retroactive Edge.** Cayman (Initiative Score 22) acts in Pass 1; a burst hits him and the wound modifier drops his Initiative attribute, immediately lowering his Score inside the pass in progress. Later that turn he critically glitches a Quick Draw — glitch would jam the gun in the holster and end his actions — and spends Edge for Close Call, downgrading it to a glitch. **Expected log:** a distinct Initiative-change entry inside Pass 1 attributing the delta to the wound modifier and showing the reordering; and the Quick Draw entry re-rendered as *glitch (downgraded from critical glitch by Close Call)* with hits unchanged at zero. He cannot then spend a second Edge on that same test (p. 46, p. 56, p. 160, p. 165).

**S4 — Two tracks at once: astral projection mid-turn.** A magician with wired-reflex-style bonus dice takes her first action to astrally project. Per p. 160 she rolls the newly available Initiative Dice and adds them to her *current* Initiative Score, and swaps Reaction + Intuition for Intuition x 2. Per the binding ruling of 2026-07-31, her Astral dice count is her current Physical dice count **+1**, not a reset to 2D6, and her body is left behind. **Expected log:** a mode-change entry naming the track (physical → astral), the dice actually rolled and added, the Initiative Rating recomputation, and a clearly separate representation for the vacated body versus the projecting magician, so a reader can tell which of the two rows the next roll belongs to (p. 160; RULINGS.md 2026-07-31).

**S5 — Surprised and then effectively unconscious.** From the book's own ambush: Sir Rigs-a-Lot rolls 2 hits with a glitch on his Surprise Test; Bodyguard B rolls 0 with a critical glitch; Mr. Johnson is surprised and unable to defend. Initiative Scores come out 13 – 10 = 3, and Mr. Johnson at 9 – 10 = –1. Bodyguard B is brought in later with –10 for the failed Surprise Test and another –10 for joining combat after it began. Sir Rigs-a-Lot's earlier glitch resolves as his SMG sight catching on his pocket, so he cannot fire on his Action Phase. **Expected log:** the –10 modifiers itemised separately rather than folded into one number; the negative Score (–1) shown signed, never clamped; a defenceless participant rendered as taking no Defense Test rather than as rolling and failing; and the deferred glitch consequence linked back to the original Surprise Test entry several entries earlier (p. 192, p. 193; RULINGS.md 2026-07-31).

**S6 — Boundary change: attack through a barrier, plus a spell with Drain.** A runner shoots a defender fully hidden behind a wall: –6 Blind Fire, defender unaware, and against the barrier itself the attack test is unopposed — the only possible "miss" is a critical glitch. The barrier resists with Structure + Armor and, if its Structure is exceeded, remaining damage carries through to the target behind it. In the same pass the team mage casts through a window: spell hits exceed her Magic rating, so Drain resolves as Physical, and the spell's effect lands regardless of whether Drain drops her. **Expected log:** the barrier attack shown as unopposed (no defender row) with damage explicitly carried over as a second application to the target behind it; and the spell entry showing effect resolution *before* the Drain sub-entry, with Drain marked Physical, not Stun (p. 197, p. 282).

**S7 — Zero-dice results next to rolled ones.** A player buys hits on a Perception-style check (12 dice → 3 hits, all-or-nothing, GM approved), and immediately afterwards Takouba burns Edge for Smackdown: automatic success, four net hits, no dice rolled by anyone, gun Accuracy irrelevant, base DV 7P raised to 11P, and the target rolls only the damage resistance. **Expected log:** neither entry fabricates dice or a glitch field; both are labelled as unrolled resolutions; the Smackdown entry shows limits as not applicable and Edge as *burned*, distinct from spent (p. 45, p. 57).

**S8 — Push the Limit with exploding dice.** A character with Edge 4 pushes on a 9-dice attack limited by Accuracy 5, rolls, and several 6s explode into further hits. **Expected log:** pool shown as 9 + 4 Edge, the limit shown as ignored rather than as a cap of 5, the exploded dice distinguished from the initial roll (and, if used after the initial roll, only the Edge dice exploding), and the glitch denominator computed by whichever rule Open Question 4 resolves to — the log must state which, not leave it implicit (p. 47, p. 56).

Relevant file read: `RULINGS.md`. Rules pages consulted (printed): 44, 45, 46, 47, 48, 49, 56, 57, 160, 165, 170, 173, 174, 181, 182, 192, 193, 196, 197, 207, 282, 296, 330 — all in `rules/pages/`.
