# Grunt naming on add, and grunts from CRB statblocks — technical spec

## Request

Allow a grunt (and any participant) to be named before its creation is committed so the combat log records the final name rather than the auto-generated default, and add the ability to instantiate grunts from the Professional-Rating-organised sample NPC statblocks printed in the SR5 core rulebook.

## Source

All citations are **Shadowrun, Fifth Edition core rulebook**, printed page numbers. `rules/pages/` contains this one book only; page files are named by PDF page, offset +2 from the printed page (`p0381.txt` = printed 379). Pages read for this brief: 101, 159, 160, 378–385, 389–392, 402.

## Governing rules

**G1. Grunts are defined as interchangeable NPCs sharing one stat block.** A group of antagonists whose members have virtually identical game statistics is handled as a unit, with one set of attributes and skills for everybody. They are explicitly described as nameless and faceless. (p. 378)

**G2. Specialists inside a group are the exception, and the GM is told to note them.** Different groups may add specializations to basic skills; one member may be a magician or carry a heavier weapon than the rest, and the book instructs the GM to make a note of these special cases and give the specialist the skill to use the gear. (p. 378)

**G3. Specialists should be capped at one or two per group, for bookkeeping.** (p. 379)

**G4. One Initiative Test for the whole group.** Initiative is streamlined by rolling a single Initiative Test for the entire group of grunts; augmented specialists may roll their own at the GM's option. The result applies to all the grunts, though injury modifiers may put some grunts on a different Initiative Score from the rest of the team. (p. 379)

**G5. Grunt Condition Monitor.** One Condition Monitor only, tracking both Physical and Stun. Boxes = 8 + half of the higher of Body or Willpower, rounded up. No overflow. When full, the grunt is out of action for the rest of the fight. (p. 379)

**G6. Alive-or-dead after the fight.** Record the type of damage that knocked the grunt out. Stun, or Physical with DV less than the grunt's Body → alive. Physical with DV greater than Body → dead. Equality is not addressed (see E5). (p. 379)

**G7. Professional Rating is a mechanical number.** It measures the group's overall experience and discipline; it is used as a dice pool modifier for resisting Social Skill Tests, and it determines the rating of their Edge attribute and Edge pool. (pp. 379–380)

**G8. Professional Rating bands and break behaviour.** (p. 380)
- **0 (Untrained):** clueless, never trained as a unit. If somebody in their group goes down, the rest turn tail and run. Examples: mall cops, random street mobs.
- **1–2 (Semi-trained):** some team training, some combat. If more than a quarter of the team is taken out of the fight, the team stops fighting and retreats. Examples: rookie beat cops, many gang members, corporate security teams.
- **3–4 (Trained):** well trained, experienced, don't take foolish chances. If casualties exceed half the group, they withdraw. Examples: professional bodyguards, experienced cops, typical mercenary units.
- **5–6 (Elite):** will not break; fight to the last man or until mission parameters call for withdrawal. Examples: HTR and SWAT teams, military special forces, fanatics.

No dice test is printed for any of these. They are stated as descriptions of behaviour.

**G9. Group Edge.** Grunts do not have their own Edge attributes at all; they share a common Edge pool with their teammates. A team's Group Edge equals its Professional Rating. The GM may spend a point of Group Edge on any grunt on the team, should restrict its use to situations critical to the grunts' goals, may adjust the pool size, and may adjust the refresh interval — but never more frequently than PCs recover Edge. (p. 380) **Note the direct contradiction with G7 on the same page**; see RULINGS 2026-08-01, which is binding: rows use Edge 0.

**G10. Lieutenants.** One per team. The rest of the team has a common set of attributes and skills; lieutenants have their own. Their attributes totalled should be at least 4 higher than an individual grunt's, and their Active skills totalled should exceed the other grunts' by at least 4 points. (p. 380)

**G11. Lieutenant combat behaviour.** Like other grunts, lieutenants draw on Group Edge rather than their own. They make their own Initiative Tests, and **if they get the same Initiative as their team, they always go first**. They possess a single Condition Monitor, like other grunts. A lieutenant with Leadership can use it to increase his group's Professional Rating by 1 higher than normal, which also adds 1 to their Edge. (p. 381)

**G12. Lieutenants are optional and stackable.** The GM shouldn't feel obliged to include a lieutenant every time a group shows up, and can use multiple lieutenants to make an elite squad of a particular type of grunt. (p. 381)

**G13. Sample grunts exist as printed templates.** "These sample characters represent typical grunts at each Professional Rating. Each entry includes brief descriptions and game statistics for both a grunt and a lieutenant." (p. 381) Blocks run pp. 381–384.

**G14. Grunts are nameless; prime runners have names.** "Grunts, no matter their Professional Rating, are nameless cannon fodder. They're not meant to be remembered ... Prime runners, though, are different. They have names." (p. 385) **There is no rule anywhere in the indexed pages governing how a GM labels an individual grunt.** Searched: `grunt`, `Grunt`, `Professional Rating`, `lieutenant`, `SAMPLE CONTACTS`. Naming is a tracker affordance, not a rules mechanic. Its only rules hook is G6, which is per-grunt and therefore needs stable per-grunt attribution.

**G15. Statblock abbreviations.** B Body, A Agility, R Reaction, S Strength, W Willpower, L Logic, I Intuition, C Charisma, E Edge, Ess Essence, M Magic, Res Resonance, Init Initiative. (p. 379)

**G16. Contact statblocks omit Armor deliberately.** "Due to the flexible nature of a contact's equipment, the Armor Rating is not included in their stat block." (p. 390)

**G17. Derived-stat formulas, for validating imports.** (p. 101, Final Calculations Table)
- Initiative = (Intuition + Reaction) + 1D6; add augmentation attribute and Initiative Dice bonuses.
- Astral Initiative = (Intuition × 2) + 2D6.
- Matrix AR Initiative = (Intuition + Reaction) + 1D6.
- Matrix VR cold-sim = (Data Processing + Intuition) + 3D6; hot-sim = same attribute, + 4D6.
- Mental limit = [(Logic × 2) + Intuition + Willpower] / 3, round up.
- Physical limit = [(Strength × 2) + Body + Reaction] / 3, round up.
- Social limit = [(Charisma × 2) + Willpower + Essence] / 3, round up.
- PC Physical Condition Monitor = [Body / 2] + 8; PC Stun = [Willpower / 2] + 8 (both round up). Grunts override this with G5.
- Technomancer living persona: Data Processing = Logic, Firewall = Willpower, Attack = Charisma, Sleaze = Intuition, Device Rating = Resonance.

**G18. Initiative Attribute Chart.** Physical = Reaction + Intuition, 1D6 base. Astral = Intuition × 2, 2D6 base. Matrix AR = Reaction + Intuition, 1D6. Matrix cold-sim VR = Data Processing + Intuition, 3D6. Matrix hot-sim VR = Data Processing + Intuition, 4D6. Rigging AR = Reaction + Intuition, 1D6. (p. 159)

**G19. Tie-breaking.** Tied Initiative Scores use ERIC — Edge, Reaction, Intuition, Coin toss — comparing attributes in that order, higher goes first; still tied after all three, flip a coin, or at GM discretion both act simultaneously. (p. 159)

**G20. Late entry.** A character entering combat after it has begun rolls Initiative normally and subtracts 10 for each Initiative Pass that has already occurred. (p. 160)

**G21. Mid-turn Initiative changes.** An Initiative attribute change applies immediately as a signed modifier to the current Initiative Score and holds for the rest of the Combat Turn. A gain of Initiative Dice means immediately rolling the gained dice and adding to the current Score; a loss means immediately rolling the lost dice and subtracting. Wound modifiers apply directly to the Initiative attribute, take effect immediately on injury, and can reorder the initiative order within the same Initiative Pass — without granting an extra action. (p. 160)

**G22. Score 0 or below.** A character at Initiative Score 0 or less can take one Free Action per pass and may still respond to attacks by dodging or defending. (p. 160)

## Interactions and exceptions

**I1. Astral projection changes the Initiative attribute and dice.** Astral uses Intuition × 2 with 2D6 base (pp. 159, 101), and the p. 160 worked example describes a magician who projects mid-turn "gains the die" and replaces Reaction + Intuition with Intuition × 2 for the rest of that Combat Turn. **The PR 2 lieutenant (wagemage) is a Magician (Hermetic) with a printed Astral Initiative line**, so this template can enter astral space. RULINGS 2026-07-31 (bonus dice carry additively into astral) governs the dice arithmetic.

**I2. Matrix modes change the Initiative attribute and dice.** (pp. 159, 101) **The PR 4 lieutenant is a Technomancer with a printed Matrix Initiative line, and the PR 5 lieutenant carries a Shiawase Cyber-5 cyberdeck with programs** (pp. 383, 384) — both can leave the meat track. Note CLAUDE.md: the Matrix module is paused; a template that hands the GM a decker is a paused-module boundary, not a licence to build Matrix behaviour.

**I3. Augmentation-driven Initiative.** Wired reflexes appear implicitly across the high-PR blocks (PR 5 grunt and lieutenant both have wired reflexes 2 and 3D6; PR 6 grunt and lieutenant have 4D6). Reaction enhancers 2 on the PR 3 lieutenant raise Reaction 4→6 and therefore Initiative 9→11 with **no** extra die (p. 383). The templates therefore must distinguish "+attribute" from "+dice".

**I4. Adept powers change Initiative.** The PR 6 lieutenant has Improved Reflexes 3 and Initiative 15 + 4D6 (p. 384). His Initiative is a printed post-power figure, so loading it and *also* applying an Improved Reflexes bonus would double-count.

**I5. Drugs.** PR 1 grunt and lieutenant each carry 1 dose of cram or jazz; the PR 3 grunt and lieutenant each carry 2 doses of jazz (pp. 382, 383, referring the reader to p. 411). Drug effects were **not** looked up this pass — printed p. 411 was not opened. Any Initiative effect from these is not-found-in-this-brief and must be run through a fresh rules pass before implementation.

**I6. Wound modifiers.** RAW puts a wounded grunt onto a different Initiative Score from his team (p. 379) and applies wound modifiers directly to the Initiative attribute, immediately, possibly reordering within a pass (p. 160). **RULINGS 2026-08-01 overrides this**: wounds go to the row's shared Score. Templates must feed the row's base Initiative, and the shared wound accumulator applies on top.

**I7. Lieutenant tie-break vs ERIC.** G11's "if they get the same Initiative as their team, they always go first" is a *specific* override of G19's generic ERIC ladder, and it only applies against that lieutenant's own team. It is not currently modelled. See U7.

**I8. Group Edge vs ERIC Edge.** G19 compares Edge first. G9 says grunts have no Edge attribute. RULINGS 2026-08-01 binds this to Edge 0 for rows, falling through to Reaction, then Intuition, then coin toss. **Contacts (pp. 390–392) do print an Edge attribute (values 2–3)** — that ruling is scoped to linked NPC rows and does not obviously cover an imported contact. See U8.

**I9. Late entry vs row joining.** G20 applies to new participants. RULINGS 2026-08-04 exempts an NPC *joining an existing row* (it inherits the row's current Score) but applies the full penalty to a newly merged row. A template import must route through the same paths so this is inherited, not reimplemented.

**I10. Condition Monitor re-derivation.** RULINGS 2026-08-04 makes a standalone grunt's box count a function of stored Body and Willpower, recomputed on every edit, with existing damage clamped. A template import must therefore write Body and Willpower, not a box count.

**I11. Log privacy.** RULINGS 2026-08-13 forbids Condition Monitor maximums in any log, GM-only included. RULINGS 2026-07-31 makes GM/NPC log lines player-visible by default with an opt-out. RULINGS 2026-08-19 established the GM-only sync channel (`session:update-gm-state`) as the correct home for GM bookkeeping.

**I12. Row removal semantics.** RULINGS 2026-08-13 distinguishes a row emptied by damage (flagged red) from one emptied by hand (plain empty row) and requires confirmation on manual member removal. A template-created row inherits this unchanged.

**I13. Qualities referenced by the statblocks were not looked up.** Toughness (PR 1 grunt, PR 1 lieutenant, PR 4 grunt), Natural Hardening (PR 4 lieutenant), Magician (Hermetic) (PR 2 lieutenant), Technomancer (PR 4 lieutenant), Adept + Initiate Grade 2 (PR 6 lieutenant), Aspected Magician (Enchanter) (Talismonger). Their mechanical effects are **not found in the pages read for this brief** — the Qualities chapter was not opened. Carry them as text.

**I14. `docs/UNVERIFIED-RULES.md` item 11** (wound modifier = −1 per 3 boxes past Pain Tolerance) is still unverified and must not be relied on. This brief does not depend on it.

## Edge cases the book defines

1. **A wounded grunt splits off the group's Initiative Score** (p. 379) — overridden by RULINGS 2026-08-01.
2. **A grunt takes no overflow damage**; the track simply stops at full (p. 379).
3. **A full grunt Condition Monitor removes him for the rest of the fight** (p. 379) — read per RULINGS 2026-08-07 as "for as long as the track stays full."
4. **Alive-or-dead is decided by the type and DV of the final attack against Body** (p. 379).
5. **DV exactly equal to Body is undefined** (p. 379) — RULINGS 2026-08-01 records this as reported-undetermined, GM calls it.
6. **A team has exactly one lieutenant** (p. 380), but a GM may stack several to build an elite squad (p. 381), which is the book contradicting its own "teams only have one" in the next column.
7. **A lieutenant tied with his own team goes first** (p. 381).
8. **A lieutenant with Leadership raises the group's Professional Rating and Edge by 1** (p. 381).
9. **"Mowing Them Down" optional rules** (p. 379), all opt-in: a single wound takes a grunt down; normal resistance rules don't apply and all rolls against grunts are unopposed, so most spells go off unhindered and grunts don't dodge ranged attacks; any hits on a PC's Sneaking Test automatically surprise the grunts; grunts who see the runners coming may attempt an ambush, but it automatically fails.
10. **Contacts print no Armor** (p. 390).
11. **Initiative Score 0 or below still buys one Free Action and full defence** (p. 160) — already enforced per RULINGS 2026-08-07.

## The statblock data set

### Sample grunts, SR5 core, pp. 381–384

Fourteen blocks: seven Professional Ratings × (grunt, lieutenant). Attribute order throughout is B A R S W L I C Ess. No grunt or lieutenant block prints an Edge attribute (consistent with G9). Values in parentheses are augmented; where a stat line prints two Initiative figures the second is the augmented one.

---

**PR 0 — THUGS & MOUTH BREATHERS (p. 381)**

*Grunt* — B 3, A 3, R 3, S 3, W 3, L 2, I 3, C 2, Ess 6
Initiative 6 + 1D6 · Condition Monitor 10 · Limits **not printed** · Armor 0
Skills: Blades 3, Clubs 3, Intimidation 3, Unarmed Combat 3
Gear: Club [Club, Acc 4, Reach 1, DV 6P]; Knife [Blade, Acc 5, Reach —, DV 4P, AP −1]; Meta Link commlink (Device Rating 1)
Qualities: none printed

*Lieutenant* — B 3, A 4, R 3, S 4, W 3, L 3, I 3, C 3, Ess 6
Initiative 6 + 1D6 · Condition Monitor **not printed** · Limits Physical 5, Mental 4, Social 5 · Armor 0
Skills: (Organization-specific Street Knowledge) 3, Blades 3, Clubs 4, Intimidation 5, Pistols 3, Unarmed Combat 4
Gear: Club [Club, Acc 4, Reach 1, DV 7P]; Colt America L36 [Light Pistol, Acc 7, DV 7P, AP —, SA, RC —, 30 (c)]; Knife [Blade, Acc 5, Reach —, DV 5P, AP −1]; Meta Link commlink (Device Rating 1)

---

**PR 1 — GANGERS & STREET SCUM (p. 382)**

*Grunt* — B 4, A 4, R 3, S 4, W 3, L 2, I 3, C 3, Ess 6
Initiative 6 + 1D6 · Condition Monitor 10 · Limits Physical 5, Mental 3, Social 4 *(as printed; conflicts with G17 — see X3)* · Armor 9
Skills: Blades 4, Clubs 3, Etiquette (Street) 3 (+2), Intimidation 4, Pistols 4, Unarmed Combat 3
Qualities: Toughness
Gear: Armor vest [9]; Browning Ultra-Power [Heavy Pistol, Acc 5 (6), DV 8P, AP −1, SA, RC —, 10 (c)]; Knife [Blade, Acc 5, Reach —, DV 5P, AP −1]; Meta Link commlink (Device Rating 1); 1 dose of cram or jazz (p. 411)

*Lieutenant* — B 4, A 4, R 4, S 4, W 4, L 3, I 4, C 4, Ess 5.7
Initiative 8 + 1D6 · Condition Monitor 10 · Limits Physical 6, Mental 4, Social 5 *(Mental/Social conflict with G17 — see X3)* · Armor 12
Skills: Blades 3, Etiquette (Street) 4 (+2), Intimidation 4, Leadership 1, Pistols (Semi-Automatics) 3 (+2), Thrown Weapons 2, Unarmed Combat (Cyberimplants) 3 (+2)
Qualities: Toughness
Augmentations: Retractable spur [Acc 6, DV 7P, AP −2]
Gear: Armor jacket [12]; Browning Ultra-Power [Heavy Pistol, Acc 5 (6), DV 8P, AP −1, SA, RC —, 10 (c)]; Knife [Blade, Acc 5, Reach —, DV 5P, AP −1]; Sony Emperor commlink (Device Rating 2); 1 dose of cram or jazz (p. 411)

---

**PR 2 — CORPORATE SECURITY (p. 382)**

*Grunt* — B 4, A 4, R 4, S 3, W 3, L 2, I 3, C 3, Ess 6
Initiative 7 + 1D6 · Condition Monitor 10 · Limits Physical 5, Mental 4, Social 5 · Armor 12
Skills: Automatics 3, Etiquette 3, Perception 2, Pistols 4, Running 4, Unarmed Combat 3
Gear: Armor jacket [12]; Colt Cobra TZ-120 [SMG, Acc 4 (5), DV 7P, AP —, SA/BF/FA, RC 2 (3), 32 (c)]; Fichetti Security 600 [Light Pistol, Acc 6 (7), DV 7P, SA, RC (1), 30 (c)]; Renraku Sensei commlink (Device Rating 3); Stun baton [Club, Acc 4, Reach 1, DV 9S(e), AP −5, 10 charges]

*Lieutenant (wagemage)* — B 3, A 4, R 4, S 3, W 4, L 4, I 4, C 3, Ess 6, **M 3**
Initiative 8 + 1D6 · **Astral Initiative 8 + 3D6** *(as printed; G18 gives Astral base 2D6 — see X4)* · Condition Monitor 10 · Limits Physical 5, Mental 6, Social 6 · Armor 12
Skills: Assensing 4, Astral Combat 3, Conjuring skill group 3, Counterspelling 4, Leadership 3, Pistols 2, Spellcasting 4
Qualities: Magician (Hermetic)
Gear: Armor jacket [12]; Fichetti Security 600 [Light Pistol, Acc 6 (7), DV 7P, AP —, SA, RC (1), 30 (c)]; Mage sight goggles (10 m); Renraku Sensei commlink (Rating 3); Spellcasting (Combat) focus (Force 2)
Spells: Detect Life, Light, Physical Barrier, Powerbolt, Silence, Stunball

---

**PR 3 — POLICE PATROLS (p. 383)**

*Grunt* — B 4, A 3, R 4, S 3, W 3, L 2, I 3, C 3, Ess 6
Initiative 7 + 1D6 · Condition Monitor 10 · Limits Physical 5, Mental 4, Social 5 · Armor 12
Skills: Clubs 3, Perception 3, Pistols 4, Running 3, Unarmed Combat 4
Knowledge Skills: Law Enforcement 4, Local Crime 3
Gear: Ares Predator V [Heavy Pistol, Acc 5 (7), DV 8P, AP −1, SA, RC —, 15 (c)]; Armor jacket [12]; Defiance EX Shocker [Taser, Acc 4, DV 11S(e), AP −5, SS, RC —, 4 (m)]; Renraku Sensei commlink (Rating 3); Sunglasses (image link, smartlink); Stun baton [Club, Acc 4, Reach 1, DV 9S(e), AP −5, 10 charges]; 2 doses of jazz

*Lieutenant* — B 4, A 4, R 4 (6), S 3, W 4, L 3, I 5, C 4, Ess 5.1
Initiative 9 + 1D6 (11 + 1D6) · Condition Monitor 10 · Limits Physical 5 (6), Mental 5, Social 6 · Armor 12
Skills: Automatics 4, Close Combat skill group 6, Intimidation 4, Leadership 5, Perception 5, Pistols 6, Sneaking 3
Knowledge Skills: Law Enforcement 6
Augmentations: Cybereyes [Rating 2, w/ flare compensation, image link, low-light vision, smartlink, thermographic vision]; reaction enhancers 2
Gear: Ares Predator V [Heavy Pistol, Acc 5 (7), DV 8P, AP −1, SA, RC —, 15 (c)]; Armor jacket [12]; Defiance EX Shocker [Taser, Acc 4, DV 11S(e), AP −5, SS, RC —, 4 (m)]; Erika Elite commlink (Device Rating 4); Stun baton [Club, Acc 4, Reach 1, DV 9S(e), AP −5, 10 charges]; 2 doses of jazz

---

**PR 4 — ORGANIZED CRIME GANG (p. 383)**

*Grunt* — B 4, A 5, R 4, S 4, W 4, L 3, I 4, C 3, Ess 6
Initiative 8 + 1D6 · Condition Monitor 10 · Limits Physical 5, Mental 5, Social 6 *(Physical conflicts with G17 — see X3)* · Armor 9
Skills: Automatics 5, Blades 5, Intimidation 6, Perception 2, Pistols 4, Unarmed Combat 6
Qualities: Toughness
Gear: Ceska Black Scorpion [Machine Pistol, Acc 5, DV 6P, AP —, SA/BF, RC (1), 35 (c)]; Lined coat [9]; Knife [Blade, Acc 5, Reach —, DV 5P, AP −1] **or** sword [Blade, Acc 6, Reach 1, DV 7P, AP −2]; Renraku Sensei commlink (Device Rating 3)

*Lieutenant (technomancer)* — B 3, A 3, R 4, S 3, W 5, L 5, I 5, C 4, Ess 6, **Res 5**
Initiative 9 + 1D6 · **Matrix Initiative 9 + 3D6 (Hot Sim)** *(as printed; G18/G17 give hot-sim = Data Processing + Intuition + 4D6, i.e. 10 + 4D6 — see X5)* · **Condition Monitor 10** *(as printed; G5 with B 3 / W 5 gives 11 — see X2)* · Limits Physical 5, Mental 7, Social 7 · Armor 9
Skills: Compiling 7, Computer 5, Cybercombat 6, Decompiling 6, Leadership 4, Perception 5, Pistols 3, Registering 7, Software 6
Qualities: Natural Hardening, Technomancer
Gear: Beretta 201T [Light Pistol, Acc 6, DV 6P, AP —, SA/BF, RC (1), 21 (c)]; Erika Elite commlink (Device Rating 4); Lined coat [9]
Complex Forms: Cleaner, Diffusion of Data Processing, Diffusion of Firewall, Editor, Infusion of Attack, Infusion of Data Processing, Resonance Spike, Tattletale, Transcendent Grid

---

**PR 5 — ELITE CORPORATE SECURITY (p. 384)**

*Grunt* — B 6, A 5 (7), R 5 (7), S 4 (6), W 4, L 4, I 5, C 3, Ess 1.9
Initiative 10 (12) + 3D6 · Condition Monitor 11 · Limits Physical 7 (9), Mental 6, Social 4 · Armor 18
Skills: Athletics skill group 6, Close Combat skill group 7, Etiquette (Corporate) 6 (+2), Firearms skill group 9, Perception 6, Sneaking 6
Augmentations: Cybereyes [Rating 2, w/ flare compensation, image link, low-light vision, smartlink, thermographic vision]; muscle augmentation 2; muscle toner 2; wired reflexes 2
Gear: Ares Alpha [Assault Rifle, Acc 5 (7), DV 11P, AP −2, SA/BF/FA, RC 2, 42 (c)]; Ares Predator V [Heavy Pistol, Acc 5 (7), DV 8P, AP −1, SA, RC —, 15 (c)]; Erika Elite commlink (Device Rating 4); Full body armor [15] & full helmet [+3] (w/ chemical seal)

*Lieutenant* — B 5, A 6 (9), R 5 (7), S 4 (7), W 5, L 5, I 5, C 4, Ess 1.3
Initiative 12 + 3D6 · Condition Monitor 11 · Limits Physical 6 (8), Mental 7, Social 5 *(augmented Physical conflicts with G17 — see X3)* · Armor 18
Skills: Athletics skill group 6, Close Combat skill group 7, Cracking skill group 7, Demolitions 5, Electronics skill group 6, Etiquette (Corporate) 4 (+2), Firearms skill group 8, Leadership 6, Perception 6, Sneaking 6
Augmentations: Cybereyes [Rating 3, w/ flare compensation, image link, low-light vision, smartlink, thermographic vision, vision magnification]; datajack; muscle augmentation 3; muscle toner 3; wired reflexes 2
Gear: Ares Alpha [Assault Rifle, Acc 5 (7), DV 11P, AP −2, SA/BF/FA, RC 2, 42 (c)]; Ares Predator V [Heavy Pistol, Acc 5 (7), DV 8P, AP −1, SA, RC —, 15 (c)]; Full body armor [15] & full helmet [+3] (w/ chemical seal); Shiawase Cyber-5 cyberdeck [DR 5, Atts 8 7 6 5, Prog 5]
Programs: Armor, Biofeedback, Configurator, Decryption, Encryption, Fork, Hammer, Lockdown
*(No Matrix Initiative line is printed for this lieutenant despite the cyberdeck.)*

---

**PR 6 — ELITE SPECIAL FORCES (p. 384)**

*Grunt* — B 6, A 6 (9), R 5 (8), S 5 (8), W 5, L 4, I 6, C 4, Ess 2.3
Initiative 14 + 4D6 · Condition Monitor 11 · Limits Physical 7 (10), Mental 7, Social 6 · Armor 18
Skills: Athletics skill group 7 (10), Stealth skill group 6, Close Combat skill group 8, Demolitions 7, Firearms skill group 9, Perception 7
Augmentations: **none itemised** despite Ess 2.3, bracketed A/R/S and 4D6 (see X6)
Gear: Full body armor [15] & full helmet [+3] (w/ chemical seal); Grapple gun; Hermes Ikon commlink (Device Rating 5); HK 227 [SMG, Acc 5 (7), DV 7P, AP −4, SA/BF/FA, RC (1), 28 (c), w/ APDS ammo]; Smoke grenades (2) [Grenade, DV —, AP —, Blast 10 m Radius]; Thermal smoke grenades (2) [Grenade, DV —, AP —, Blast 10 m Radius]

*Lieutenant (adept)* — B 6, A 6 (9), R 6 (9), S 5 (8), W 5, L 5, I 6, C 5, Ess 6
Initiative 15 + 4D6 · Condition Monitor 11 · Limits Physical 8 (11), Mental 7, Social 7 · Armor 18
Skills: Athletics skill group 7 (10), Stealth skill group 6, Close Combat skill group 8, Demolitions 7, Firearms skill group 9, Perception 7 *(identical to the PR 6 grunt's — see X7)*
Qualities: Adept; Initiate Grade 2
Adept Powers: Improved Reflexes 3, Improved Agility 3, Improved Ability (Automatics) 3
Gear: Full body armor [15] & full helmet [+3] (w/ chemical seal); Grapple gun; Hermes Ikon commlink (Device Rating 5); HK 227 [SMG, Acc 5 (7), DV 7P, AP −4, SA/BF/FA, RC (1), 28 (c), w/ APDS ammo]; Smoke grenades (2) [Grenade, DV —, AP —, Blast 10 m Radius]; Thermal smoke grenades (2) [Grenade, DV —, AP —, Blast 10 m Radius]; Qi focus (Force 6, Improved Strength 3); Sword weapon focus [Force 2, Blade, Acc 6, Reach 1, DV 11P, AP −2]

---

### Sample contacts, SR5 core, pp. 390–392

Eight blocks. These **do** print an Edge attribute and **do not** print Armor (G16). Attribute order B A R S W L I C E Ess.

| Contact | Page | B | A | R | S | W | L | I | C | E | Ess | Init | CM | Limits (P/M/S) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bartender | 390 | 3 | 4 | 3 | 3 | 4 | 3 | 3 | 4 | 2 | 6 | 6 + 1D6 | 10 | 4 / 5 / 6 |
| Beat Cop | 390 | 4 | 4 | 4 | 3 | 3 | 3 | 4 | 3 | 3 | 6 | 8 + 1D6 | 10 | 5 / 5 / 5 |
| Fixer | 391 | 3 | 3 | 3 | 3 | 4 | 3 | 5 | 5 | 3 | 6 | 8 + 1D6 | 10 | 4 / 5 / 7 |
| Mafia Consiglieri | 391 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 3 | 6 | 7 + 1D6 | 10 | 4 / 6 / 7 |
| Mechanic | 391 | 4 | 3 | 3 | 4 | 3 | 4 | 4 | 3 | 3 | 6 | 7 + 1D6 | 10 | 5 / 5 / 5 |
| Mr. Johnson | 392 | 3 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 3 | 6 | 8 + 1D6 | 10 | 4 / 6 / 7 |
| Street Doc | 392 | 3 | 5 | 3 | 3 | 3 | 5 | 4 | 3 | 3 | 6 | 7 + 1D6 | 10 | 4 / 6 / 5 |
| Talismonger | 392 | 3 | 3 | 3 | 3 | 5 | 4 | 5 | 4 | 3 | 6 (M 4) | 8 + 1D6 | 11 | 4 / 6 / 7 |

Skills, in full:
- **Bartender:** Etiquette (Street) 6 (+2), Intimidation 5, Longarms (Shotguns) 4 (+2), Negotiation 5, Pistols 4, Unarmed Combat 4. Knowledge: Alcohol 6, Media Stars 5, Sports 6, Street Rumors 6, Trivia 6.
- **Beat Cop:** Automatics 4, Clubs 5, Etiquette (Street) 6 (+2), Intimidation 5, Leadership 4, Perception 6, Pistols 6, Running 4, Unarmed Combat 5. Knowledge: Crime Syndicates 7, Illegal Goods 6, Law Enforcement 4, Local Gangs 6, Police Procedures 8, Street Rumors 6.
- **Fixer:** Computer 7, Data Search 8, Etiquette (Street) 8 (+2), Negotiation 9, Perception 6, Pistols 5. Knowledge: Corporate Rumors 8, Fences 7, Gear Values 9, Shadowrunner Teams 8.
- **Mafia Consiglieri:** Computer 5, Etiquette (Mob) 7 (+2), Instruction 6, Leadership 7, Negotiation 6, Perception 6, Pistols 3. Knowledge: Business 6, Law 7, Local Politics 6, Mob Politics 9, Police Procedures 5, Psychology 7.
- **Mechanic:** Aeronautics Mechanic 6, Automotive Mechanic 8, Computer 4, Gunnery 3, Hardware 6, Industrial Mechanic 4, Pilot Ground Craft 6. Knowledge: Chop Shops 8, Combat Biking 7, Vehicles 8.
- **Mr. Johnson:** Computer 6, Con 4, Etiquette (Corporate) 7 (+2), Intimidation 4, Negotiation 8, Perception 5, Pistols 5. Knowledge: Corporate Finances 5, Corporate Rumors 8, Psychology 5, SOTA Technology 6.
- **Street Doc:** Cybertechnology 7, First Aid 6, Medicine 8, Negotiation 4, Perception 6. Knowledge: Biology 7, Medical Advances 5, Organleggers 4, Psychology 4, Smugglers 3.
- **Talismonger:** Arcana 5, Artisan 5, Assensing 6, Enchanting skill group 6, Etiquette (Magical) 5 (+2), Negotiation 6, Perception 3. Knowledge: Magical Background 5, Magical Goods 5, Metalworking 6, Woodworking 6. Qualities: Aspected Magician (Enchanter).

All eight contacts' printed Initiative and Limits match G17/G18 exactly. All eight Condition Monitors match the **grunt** formula (G5) rather than any PC-shaped pair; the Talismonger's 11 (B 3 / W 5 → 8 + 3) is the discriminating case, since PC-shape would print 10/11 and critters do print two numbers, e.g. "Condition Monitor 11/10" (p. 402). This is an inference, not a printed statement — see U10.

### Printed inconsistencies (X-list)

These are the book's own errors or omissions. Every one needs an explicit handling decision, not a silent fix.

- **X1.** PR 0 grunt has **no Limits line**; PR 0 lieutenant has **no Condition Monitor line** (p. 381). By G17 the grunt's Limits are Physical 4, Mental 4, Social 5; by G5 the lieutenant's Condition Monitor is 10.
- **X2.** PR 4 lieutenant prints Condition Monitor 10; G5 with Body 3 / Willpower 5 gives **11** (p. 383 vs p. 379).
- **X3.** Four Limits lines disagree with G17: PR 1 grunt Mental 3 (formula 4) and Social 4 (formula 5); PR 1 lieutenant Mental 4 (formula 5) and Social 5 (formula 6); PR 4 grunt Physical 5 (formula 6); PR 5 lieutenant augmented Physical 8 (formula 9). All other blocks and all eight contacts check out.
- **X4.** PR 2 lieutenant prints Astral Initiative 8 + **3**D6; G18 gives Astral base 2D6 and he has no printed source of a bonus Initiative die (p. 382 vs p. 159). The attribute half (Intuition 4 × 2 = 8) is correct.
- **X5.** PR 4 lieutenant prints Matrix Initiative **9 + 3D6 (Hot Sim)**; G18 makes hot-sim VR Data Processing + Intuition + **4**D6, and G17 makes a technomancer's living-persona Data Processing equal Logic (5), so the formula gives **10 + 4D6** (p. 383 vs pp. 159, 101).
- **X6.** PR 6 grunt has Essence 2.3, bracketed Agility/Reaction/Strength and 4 Initiative Dice but **no Augmentations line** (p. 384). Contrast the PR 5 grunt, which itemises its ware.
- **X7.** PR 6 grunt and PR 6 lieutenant print **identical** Skills lines, so the lieutenant fails G10's "+4 totalled Active skills"; their totalled attributes differ by 3, also short of G10's "+4" (p. 384 vs p. 380).
- **X8.** Melee Damage Values in every sample block are Strength-derived: knives are Strength + 1 (PR 0 grunt S 3 → 4P; PR 0 lieutenant S 4 → 5P; PR 1 grunt/lieutenant S 4 → 5P; PR 4 grunt S 4 → 5P), and clubs, swords and spurs are Strength + 3 (PR 0 grunt S 3 → 6P; PR 0 lieutenant S 4 → 7P; PR 1 lieutenant spur S 4 → 7P; PR 4 grunt sword S 4 → 7P; PR 6 lieutenant sword focus S 8 → 11P) — all pp. 381–384. The `(STR+1)P` notation is confirmed as SR5's convention on p. 402. **The Street Gear melee weapon table itself was not opened this pass**, so treat "knife = STR+1, club = STR+3" as an observed regularity across these blocks, not a cited general rule.

## Undefined / needs a table ruling

Each recommended default is a proposal only. These are duplicated in the plain-language brief for Xavier to answer.

**U1. Log-line timing and content for a newly added participant.** The rulebook has nothing to say. *Recommended:* emit exactly one line, at commit time, with the final name; emit none at dialog-open or on cancel. *Why:* p. 379 settles alive-or-dead per individual grunt, so per-grunt log attribution must be stable from the first line onward.

**U2. Player visibility of template identity.** *Recommended:* the joined-combat line goes to the shared log with the name only; the statblock name and Professional Rating go to the GM-only channel. *Why:* Professional Rating is a dice pool modifier and an Edge pool size (pp. 379–380) — capability information of the same class as Condition Monitor maximums, which RULINGS 2026-08-13 bars from every log. This narrows RULINGS 2026-07-31 and so needs an explicit decision.

**U3. Printed statblock vs printed formula.** *Recommended:* Condition Monitor is always derived from stored Body and Willpower per G5 (so X2 resolves to 11, not the printed 10); Limits are stored verbatim as reference text with no derivation; the three anomalous Initiative lines (X4, X5) are stored verbatim and labelled "as printed". *Why:* RULINGS 2026-08-04 already makes box count a live function of Body and Willpower — a template that wrote a box count directly would break that invariant on the first attribute edit.

**U4. Base vs augmented attribute load.** *Recommended:* load augmented values by default, with a "load base (ware off)" toggle. *Why:* the PR 5 and PR 6 blocks print their Initiative already augmented, so loading base attributes alongside the printed Initiative would be internally inconsistent. Note the PR 3 lieutenant prints both Initiative lines (9 + 1D6 / 11 + 1D6, p. 383) and is the natural test case.

**U5. Group vs individual by default.** *Recommended:* the template add dialog defaults to a linked NPC row with a member count; a lieutenant, if requested, is created as a separate participant. *Why:* p. 379 makes the single group Initiative Test the recommended streamlining; p. 381 gives the lieutenant his own Initiative Test.

**U6. Auto-include a lieutenant?** *Recommended:* no; separate unticked checkbox, and allow more than one. *Why:* p. 381 explicitly says the GM shouldn't feel obliged, and explicitly allows multiple lieutenants to build an elite squad.

**U7. Lieutenant-beats-his-own-team tie-break.** *Recommended:* store the row a lieutenant was created alongside (or detached from), and short-circuit ERIC in favour of the lieutenant when he ties with that specific row. Against any other participant, ERIC per p. 159 with the row at Edge 0 per RULINGS 2026-08-01. *Why:* p. 381's rule is a specific override of p. 159's general ladder, but it is scoped to "his team", which the tracker currently has no representation of.

**U8. Edge attribute for imported contacts and for standalone/detached grunts.** RULINGS 2026-08-01 fixes Edge 0 for *linked NPC rows*. Contacts print real Edge attributes of 2–3 (pp. 390–392); grunt blocks print none. *Recommended:* imported contacts carry their printed Edge into ERIC; imported grunts and lieutenants, standalone or in a row, use Edge 0. *Why:* the existing ruling's reasoning (p. 380's Group Edge sidebar) is about grunts and does not reach contacts.

**U9. Unmodelled gear, skills, spells, complex forms, adept powers and qualities.** *Recommended:* store as GM-facing read-only reference text on the participant, snapshotted for rejoin; do not attempt to model, and do not recompute Strength-derived melee DV when the GM edits Strength (leave the printed value stale, per X8). *Why:* the tracker models initiative and condition monitors, not gear; and the underlying melee weapon table has not been verified here.

**U10. Are imported contacts grunt-shaped or PC-shaped?** *Recommended:* grunt-shaped (one combined track, sized by G5). *Why:* the contact blocks print a single Condition Monitor number, and the Talismonger's 11 matches G5 exactly while PC-shape would require printing two numbers as the critter blocks do (p. 402). The book never says so directly, hence the ruling.

**U11. Professional Rating break points in the UI.** *Recommended:* a non-blocking advisory badge showing the group's break threshold and current casualties, never automatic removal or an automatic roll. *Why:* p. 380 states these as behavioural descriptions with no test attached; inventing a morale roll would be a house rule.

**U12. Whether "name before add" applies to all participant types or grunts only.** The request says "or any participant for that matter." Not a rules question. *Recommended:* apply uniformly — every add path collects the name before committing and logging.

## Acceptance criteria

Each item is testable and checkable against a page.

1. Adding a participant of any type writes **exactly one** combat-log line, at commit, containing the name the GM entered — never the auto-generated placeholder — and cancelling the add writes **zero** lines. (p. 379 supplies the per-grunt attribution requirement; timing is U1.)
2. Cancelling an add leaves the participant list and the initiative order byte-identical to their pre-dialog state, and creates no session-sync broadcast.
3. If the GM leaves the name blank, the auto-generated default is used and is unique within the encounter — no two live participants share a name at any time. (p. 379 requires per-grunt alive-or-dead attribution.)
4. Default naming keeps the three existing namespaces distinct: standalone grunts, merged rows, and unrenamed row members must not collide.
5. All **fourteen** sample grunt/lieutenant statblocks (pp. 381–384) and all **eight** sample contact statblocks (pp. 390–392) are available as templates, with the exact attribute, Initiative, Condition Monitor, Limits, Armor, skill and gear values transcribed in "The statblock data set" above.
6. Every template records its Professional Rating (0–6 for grunts; contacts have none) and the printed statblock name. (p. 380)
7. Instantiating a grunt template sets Body and Willpower from the block, and the resulting single combined Condition Monitor equals 8 + ceil(max(Body, Willpower) / 2). Spot checks: PR 0 grunt (B 3 / W 3) = 10; PR 5 grunt (B 6 / W 4) = 11; PR 6 lieutenant (B 6 / W 5) = 11. (p. 379)
8. The PR 4 lieutenant template yields **11** Condition Monitor boxes, not the printed 10, and a GM-facing note records the discrepancy. (p. 379 formula vs p. 383 print; U3.)
9. The PR 0 lieutenant template yields 10 Condition Monitor boxes despite the block printing none, and the PR 0 grunt template carries Limits Physical 4 / Mental 4 / Social 5 despite the block printing none, each flagged as derived. (pp. 381, 379, 101; X1.)
10. No template instantiation ever writes a Condition Monitor box count directly; box count is always a function of stored Body and Willpower. (p. 379; RULINGS 2026-08-04.)
11. A template grunt's Initiative attribute equals Reaction + Intuition and its Initiative Dice match the printed block. Spot checks: PR 2 grunt 7 + 1D6; PR 5 grunt 12 + 3D6 with ware active, 10 + 3D6 with ware off; PR 6 lieutenant 15 + 4D6. (pp. 159, 101, 382–384.)
12. Instantiating a template as a linked NPC row produces **one** shared Initiative Score for the whole row, rolled once. (p. 379)
13. A template row added after combat has begun subtracts 10 from its rolled Initiative Score for each Initiative Pass already elapsed; a template grunt added to an **existing** row inherits that row's current shared Score with no penalty. (p. 160; RULINGS 2026-08-04 and Decision 7.)
14. A template row's Edge attribute is 0 for ERIC purposes; Professional Rating is never written into an Edge attribute anywhere. (p. 159 ERIC; RULINGS 2026-08-01, binding over p. 380's contradictory sentence.)
15. An imported contact carries its printed Edge attribute (2 for Bartender, 3 for the other seven) into ERIC. (pp. 390–392; U8.)
16. A lieutenant instantiated from a template is a separate participant with its own Initiative Score, its own single grunt-shaped Condition Monitor, and is never auto-created alongside its grunt group. (pp. 380, 381; RULINGS 2026-08-01.)
17. When a lieutenant's Initiative Score ties his own group's row, the lieutenant acts first without consulting ERIC; against any other participant ERIC applies normally. (p. 381 over p. 159; U7.)
18. Condition Monitor maximums never appear in any log line produced by this feature, GM-only included. (RULINGS 2026-08-13.)
19. Professional Rating and statblock identity are broadcast only on the GM-only sync channel, never on `SharedParticipantState`. (RULINGS 2026-08-19 precedent; U2.)
20. Everything a template writes — name, Body, Willpower, Reaction, Intuition, Initiative Dice, Armor, Professional Rating, reference text — survives a GM rejoin via the participant snapshot.
21. Damage applied to a templated grunt still records the final attack's type and DV, and the alive-or-dead verdict compares Physical DV against **Body**, reporting `undetermined` on exact equality. (p. 379; RULINGS 2026-08-01.)
22. A DV larger than the boxes remaining can still be recorded on a templated grunt; the track fills and the full DV is stored. (p. 379; RULINGS 2026-08-13.)
23. Skills, gear, spells, complex forms, adept powers and qualities from a template are stored as read-only GM-facing reference text and are never interpreted as dice pools or modifiers. (I13; U9.)
24. Any template carrying a printed Astral or Matrix Initiative line (PR 2 lieutenant, PR 4 lieutenant) stores it verbatim and marks it "as printed", and the app does not silently rewrite it to the p. 159 formula value. (pp. 382, 383 vs p. 159; X4, X5, U3.)
25. A templated participant at Initiative Score 0 or below is blocked from Simple and Complex actions but may still take one Free Action and still defends. (p. 160; RULINGS 2026-08-07.)

## Gameplay scenarios to survive

**S1 — Ordinary case: naming on add.**
Combat has not started. GM presses "Add Grunt", types `Halloweener Torch` in the dialog, confirms.
*Expected:* exactly one shared-log line, "Halloweener Torch joined the fight" (or the app's existing wording), containing the typed name. No line mentioning `Grunt 1` or any placeholder exists anywhere in the log, GM-only text included. If the GM instead presses Cancel, the log is empty, the participant list is unchanged, and no `session:update-state` fires.

**S2 — Ordinary case: template instantiation.**
GM adds "PR 1 — Gangers & Street Scum" as a linked row of four, names the row `Ancients`, and members default to `Ancients 1..4`. Combat begins; the row rolls once and gets 4 on 1D6.
*Expected:* one Initiative Test for the row (p. 379). Row Initiative attribute 6 (Reaction 3 + Intuition 3, p. 382), Score 10. Each member has one combined Condition Monitor of 10 boxes (8 + ceil(max(Body 4, Willpower 3) / 2), p. 379). Armor 9, Professional Rating 1 recorded, Toughness carried as text. The players' log shows the row joining by name; the players' log does **not** show "PR 1" or "10 boxes".

**S3 — Tie, resolved by the lieutenant rule and then by ERIC.**
The `Ancients` row (above) is at Initiative Score 10. A PR 1 lieutenant, `Ancients Boss`, is added from the paired template and detached onto his own row; he rolls to Initiative Score 10 as well (attribute 8 + 2 on 1D6, p. 382). A player character, Cayman, is also at 10 with Edge 3, Reaction 6, Intuition 5.
*Expected:* `Ancients Boss` acts before the `Ancients` row without an ERIC comparison, because he is that row's lieutenant (p. 381). Against Cayman, ERIC runs normally: Cayman's Edge 3 beats the lieutenant's Edge 0 (p. 159; RULINGS 2026-08-01), so the order is Cayman, then `Ancients Boss`, then the `Ancients` row.

**S4 — Mid-Combat-Turn state change: a templated grunt takes a wound during the pass.**
Second Initiative Pass. The `Ancients` row is at Score 0 (10 − 10). `Ancients 3` takes 3 boxes of Physical from a Predator V burst, crossing a wound threshold and applying a −1 Initiative penalty.
*Expected:* the penalty lands on the **row's** shared Score, not on `Ancients 3` alone, taking the row to −1 (RULINGS 2026-08-01, overriding p. 379's split-off). No member splits onto a separate score. `Ancients 3` still takes his own wound modifier on his own dice pools. The row can still take one Free Action and still defends (p. 160). The damage log line names `Ancients 3` and shows the boxes taken but **not** the track maximum (RULINGS 2026-08-13). The row's Initiative attribute for the next Combat Turn is its base 6 minus the accumulated shared wound modifier (p. 159).

**S5 — Two initiative tracks at once: the wagemage lieutenant projects.**
GM adds the PR 2 Corporate Security row (four guards) plus its paired wagemage lieutenant, `Sec Mage Kessler`, detached onto his own row. Combat is in Pass 1. Kessler's physical Initiative is 8 + 1D6 (Reaction 4 + Intuition 4, p. 382); he rolls 5 for Score 13. On his Action Phase he astrally projects.
*Expected:* his Initiative attribute switches from Reaction + Intuition (8) to Intuition × 2 (8) — coincidentally unchanged here — and his dice count changes per the p. 160 "gains the die" example and RULINGS 2026-07-31, i.e. +1 relative to his current 1D6, giving 2D6 astral. The newly gained die is rolled immediately and added to his current Score (p. 160). His printed "Astral Initiative 8 + 3D6" is stored as reference text and flagged "as printed" — it does **not** override the computed value (X4, U3). His body remains a participant in the meat track; the guard row's shared Score is untouched by his detachment (RULINGS 2026-08-01). When he returns to his body the die gained on the way out is subtracted back off, and only that die.

**S6 — Unconscious and surprised participants.**
The GM enables the "Mowing Them Down" optional rules (p. 379) for a PR 0 Thugs & Mouth Breathers row of six. A player character makes a Sneaking Test and scores hits.
*Expected:* every member of the row is automatically surprised (p. 379). Separately, `Thug 4` takes a DV 9 Physical hit against his 10-box track with 8 already filled: the track fills (no overflow, p. 379), the recorded final attack is Physical DV 9 — the **full** DV, not the 2 boxes that fit (RULINGS 2026-08-13) — and against Body 3 the verdict is dead (9 > 3, p. 379). Under Professional Rating 0's break description, one man down means the rest turn tail and run (p. 380): the tracker shows the advisory badge and **does not** remove or roll for the row (U11). If the GM then heals `Thug 4` below the threshold (a mis-keyed hit), he is no longer out of action, the row's shared wound accumulator is paid back, and the recorded final-attack type and DV are left untouched (RULINGS 2026-08-07).

**S7 — Matrix / host boundary: the technomancer lieutenant jacks in.**
GM adds a PR 4 Organized Crime Gang row plus its paired technomancer lieutenant, `Vito's Wire`, detached. Combat is under way; he is on the meat track at 9 + 1D6 (Reaction 4 + Intuition 5, p. 383). Mid-Combat-Turn he goes to hot-sim VR.
*Expected:* his Initiative attribute becomes Data Processing + Intuition and his dice become 4D6 (p. 159); a technomancer's living-persona Data Processing equals Logic, i.e. 5, giving attribute 10 (p. 101). The printed block's "Matrix Initiative 9 + 3D6 (Hot Sim)" is retained verbatim as flagged reference text and is **not** used as the live value without an explicit ruling (X5, U3). The dice gain of 3 (1D6 → 4D6) is rolled immediately and added to his current Score (p. 160). His gang row's shared Score is unaffected by his mode change. Because the Matrix module is paused (CLAUDE.md), the acceptance test here asserts that the meat-side Initiative arithmetic and the row's independence hold — not that Matrix actions resolve.

**S8 — Membership churn does not move the shared Score.**
The `Ancients` row (S2/S4) is at shared Score −1 after `Ancients 3`'s wound. The GM adds a fifth ganger from the same template, and then manually removes `Ancients 1`.
*Expected:* the joiner inherits the row's current Score of −1 with no late-entry penalty and brings no Initiative penalty of his own however hurt (RULINGS 2026-08-01, Decision 7). The manual removal takes none away — the wound already paid stays paid — is confirmed first, and does **not** raise the red out-of-action flag; if it emptied the row, the same prompt would offer to delete the row and would leave it as a plain unflagged empty row (RULINGS 2026-08-13). By contrast, if a *new* row were created by merging standalone templated grunts, that row would roll fresh and subtract 10 per elapsed pass (p. 160; RULINGS 2026-08-04).

**S9 — Attribute correction resizes the track.**
GM realises the PR 5 grunt he added should be a troll variant and edits Body from 6 to 9.
*Expected:* the single Condition Monitor immediately re-derives to 8 + ceil(max(9, 4) / 2) = 13 boxes (p. 379). Damage already recorded stays exactly where it was; nothing is rescaled (RULINGS 2026-08-04). If the grunt had been full and is now not, he is back on his feet — a stat correction, not a heal (RULINGS 2026-08-04). No log line reports the new maximum (RULINGS 2026-08-13).

## Not found in the indexed rules

Any rule governing the naming of individual grunts (searched `grunt`, `Grunt`, `Professional Rating`, `lieutenant` across `rules/pages/`); any dice test for grunt morale or break behaviour; the Street Gear melee weapon table entries behind X8; the drug effects referenced at p. 411 by the PR 1 and PR 3 blocks; and the mechanical definitions of Toughness, Natural Hardening, Magician, Technomancer, Adept and Aspected Magician. Each of those would need its own rules pass before anything is built on it.

---

# Implementation plan — technical appendix

*Appended after the rules spec above. No rules facts are added, disputed or
re-derived here; `rules/` was not opened. Everything below is implementation
planning against the code as read on 2026-08-25 (branch `main`, HEAD `97362bc`).*

## Request (implementation restatement)

Introduce a two-phase "collect details → commit → log once" add flow so that
every participant-creating path in the GM tab writes exactly one combat-log
line, at commit, carrying the GM's final chosen name; and add a statblock
template data module plus an instantiation path that feeds the existing grunt
Body/Willpower → Condition Monitor derivation.

**Not in scope:** any change to initiative arithmetic, the pass/turn loop, the
Condition Monitor formula itself, damage/heal semantics, the Matrix module, the
player view's own add/claim flow, or `server.js` transport behaviour beyond
whatever new optional fields ride the existing GM-only channel.

## Current behaviour

### Participant creation paths (exhaustive)

Every location that inserts into `CombatManager.participants`, and what it logs.
File is `src/app/battle-tracker/battle-tracker.component.ts` unless stated.

| # | Path | Creates | Default name source | Logs on create? |
|---|---|---|---|---|
| 1 | Constructor, line 959 → `addParticipant()` | `Participant` | none (`_name = ""`) | **no** |
| 2 | `btnAddParticipant_Click()`, line 4509 | via `addParticipant()` | none | local-only `LogHandler.log(..., "AddParticipant_Click")`, line 4510 |
| 3 | `inpName_KeyDown()`, lines 5236–5243 (Tab off the name box) | via `addParticipant()` | none | local-only `LogHandler.log(..., "TabAddParticipant")`, line 5238 |
| 4 | `addParticipant(selectNewParticipant = true)`, line 5477 | `new Participant()` | none | **no** |
| 5 | `btnAddGrunt_Click()`, line 4519 | via `addGrunt()` | — | local-only `"AddGrunt_Click"`, line 4520 |
| 6 | `addGrunt(name?, body, willpower, selectNewGrunt)`, line 5520 | `createStandaloneGrunt()` | `nextStandaloneGruntName()`, line 5526 | **yes** — `this.logRowEvent(grunt.name \|\| STANDALONE_GRUNT_NAME_PREFIX, "added.")`, line 5544 |
| 7 | `addNpcRow(selectNewRow = true)`, line 5983 | `new NpcRowParticipant()` | `nextMergedGruntRowName()`, line 5990 | **no** |
| 8 | `addNpcToRow(row, name?, body = 3, willpower = 3)`, line 6054 | `new GruntMember(...)` | `nextRowMemberName(row)`, line 6055 | **yes** — `logRowEvent(rowLogActor(row), "<name> joined the group<carriedWounds>.")`, lines 6065–6066 |
| 9 | `mergeSelectedGrunts()`, line 5713 | `mergeGruntsIntoRow()` | `nextMergedGruntRowName()`, line 5715 | **yes** — `logRowEvent(row.name, "formed from …")`, lines 5748–5749; refusal path logs GM-only at line 5726 |
| 10 | `detachRowMember(row, member, factory)`, line 6396 | `DetachedGruntParticipant` via `row.detachMember` | inherits the member's existing name | **yes** — line 6416–6417. Name is already the GM's, so this path is already correct. |
| 11 | `btnDuplicate_Click(sender)`, line 5000 → `CombatManager.copyParticipant`, `src/Combat/CombatManager.ts:233` | `p.clone()` | `"<base> <n+1>"`, and **renames the source** to `"<base> 1"` when no numbered sibling exists (`CombatManager.ts:252-255`) | **no** |
| 12 | `handleSessionCommand` `register_character` branch, line 2762 → `upsertPlayerParticipant(...)`, line 3830 | `Participant` or `MatrixParticipant`, line 3872 | player-supplied `characterName` | **yes** — `appendPlayerCommandLog(characterName, PLAYER_COMMAND_LOG_TEXT.joined)` at line 2762, deliberately emitted **before** creation (see the comment at 2753–2761 explaining the boundary-logging ordering constraint) |
| 13 | `restoreFromSharedState(state, gmState)`, line 4173 | every class, via `buildRestoredParticipant()` line 3995 | from the wire | **no**, and must stay so |
| 14 | `promoteToMatrixParticipant` (~6799), `demoteToParticipant` (~6866), `promoteToAstralParticipant` (~6917), `demoteFromAstralParticipant` (~6978) | in-place type swaps, re-inserted with `addParticipant(p, true)` | carried | **no** join line (they log the mode event elsewhere) |

**Conclusion on the reported defect.** The user's report — "the log prints as
soon as I add the grunt" — is exactly paths 6, 8 and 9. Paths 1, 4, 7 and 11
have the opposite defect: they log nothing at all. There is no shared choke
point; each path decided independently and they have drifted.

### Default-name generation — the four namespaces

Constants, all at the top of `battle-tracker.component.ts`:

- `STANDALONE_GRUNT_NAME_PREFIX = "Grunt"` (line 115) → `nextStandaloneGruntName()`
  (line 5560) scans **all** `combatManager.participants.items` for
  `/^Grunt (\d+)$/` and returns highest + 1. Always numbered from 1.
- `MERGED_GRUNT_ROW_NAME = "Grunt Group"` (line 128) →
  `nextMergedGruntRowName()` (line 5587) scans all participants against
  `DEFAULT_ROW_NAME_PATTERN` (line 136, `/^Grunt Group(?: (\d+))?$/`). A bare
  `"Grunt Group"` counts as group 1, so the second is `"Grunt Group 2"`. Shared
  by `addNpcRow()` and `mergeSelectedGrunts()` so a button-made row and a merged
  row cannot collide.
- `DEFAULT_ROW_MEMBER_NAME_PREFIX = "NPC"` (line 148) → `nextRowMemberName(row)`
  (line 6028). Prefix is the row's own name unless `isDefaultRowName(row.name)`
  (line 5600) is true, in which case it falls back to `"NPC"` — this exists so
  an unrenamed row does not log `"Grunt Group: Grunt Group 1 …"`. Scans
  `row.members` only, takes `max(highest, members.length) + 1`, then loops until
  the candidate is not in `taken`.
- **Fourth, wire-only namespace:** `buildSharedParticipant()` line 3239 emits
  `name: p.name || \`Participant ${index + 1}\`` — a plain participant with an
  empty name renders on the players' screen as "Participant 3". It is never
  written back onto the domain object.

### `isUnusedPlaceholder()` — the seeded-blank-participant logic

`isUnusedPlaceholder(p)` at line 2125. Reads, in order:

1. `Object.getPrototypeOf(p) !== Participant.prototype` → false (any subclass is
   a deliberate GM action).
2. `participantOwners.get(p) || participantClaimable.get(p)` → false.
3. Iterates `PARTICIPANT_BASE_BACKING_FIELDS` (`src/Combat/Participants/Participant.ts:105`,
   20 entries) comparing `p` against a freshly-constructed `new Participant()`,
   **skipping `_sortOrder`** (`PLACEHOLDER_SORT_ORDER_FIELD`, line 108).
   `_name` **is** in that list, and `new Participant()._name === ""`
   (`Participant.ts:504`).
4. `p.actionHistory.length !== ref.actionHistory.length` → false.
5. Side-map comparisons against `PLACEHOLDER_EDGE_RATING_DEFAULT` (0),
   `PLACEHOLDER_REACTION_DEFAULT` (3), `PLACEHOLDER_INTUITION_DEFAULT`
   (`PARTICIPANT_DEFAULT_BASE_INI - 3` = 3), and `pendingVrModes.has(p)`.

Consumers: `confirmDestructiveJoin`'s risk filter at line 1890
(`participants.items.filter(p => !this.isUnusedPlaceholder(p))`).

**Consequence for this change:** if the commit path assigns any default name to
a plain `Participant`, or seeds any side map differently, the constructor's
placeholder stops matching and every fresh tab shows the destructive-join
warning. This is the single most likely way to break something invisible.

### Grunt construction

- `createStandaloneGrunt(name = "", body = DEFAULT_GRUNT_ATTRIBUTE, willpower = DEFAULT_GRUNT_ATTRIBUTE)`
  — `src/Grunts/DetachedGruntParticipant.ts:357`. Sets `name`, sets
  `overflowHealth = GRUNT_OVERFLOW_BOXES` (0), then
  `setGruntAttributes(body, willpower)` (line 91), which writes `_gruntBody` /
  `_gruntWillpower` and calls `syncConditionMonitorToAttributes()` (line 108) —
  the *only* thing that writes `physicalHealth` / `stunHealth` on a grunt.
  Damage is clamped, never rescaled.
- `GruntMember` constructor — `src/Grunts/GruntMember.ts:187`, `(name, body, willpower)`.
  `conditionMonitorBoxes` is a **getter** (line 203); there is no box-count
  setter to misuse.
- `NpcRowParticipant.addMember(member)` — `src/Grunts/NpcRowParticipant.ts:290`.
- `mergeGruntsIntoRow(grunts, rowName = "")` —
  `src/Grunts/NpcRowParticipant.ts:615`. Pure. Takes `baseIni` and `dices` from
  `grunts[0]` (lines 643–644, `setDicesWithoutRoll`), sets `rowWoundModifier = 0`
  (line 650).
- `NpcRowParticipant.detachMember(member, factory)` — default factory in the GM
  component is `() => new DetachedGruntParticipant()`, `battle-tracker.component.ts:6399`.

### Side-map seeding on add

Both `addGrunt` (5528–5538) and `addNpcRow` (5992–5998) follow the same shape:
`participantClaimable` false, `participantEdgeRatings` = `NPC_ROW_EDGE_RATING`
(0, line 75), `participantReactions` = 3, `participantIntuitions` = 3, then
`p.baseIni = this.getParticipantBaseInitiative(p)` (line 5445, returns
`reaction + intuition` for a plain/grunt participant), then
`participantTieBreakers` = `Math.random()`, `getParticipantId(p)`, and
`lastKnownDamage` (grunt only). `addGrunt` and `addNpcRow` both end with
`syncSharedState()` **and** `sort()`; `addParticipant` calls only
`syncSharedState()`.

### Log emission helpers

- `logRowEvent(actor, text, playerText = text)` — line 5773. Writes the local
  Action Log via `LogHandler.log` **and** `appendSharedLog(actor, playerText)`.
- `appendSharedLog(actor, text, extra?)` — line 3413. **No-ops entirely when
  `shareRoomCode` is falsy** (line 3414). Assigns log order, then
  `sessionSync.appendLog(entry)`.
- `appendGmOnlyLog(actor, text, extra?)` — line 3553. Sets
  `hiddenFromPlayers: true`, inserts locally, and writes its own
  `LogHandler.log` line tagged `HIDDEN_FROM_PLAYERS_TAG`.
- `logGmOnlyRowEvent(actor, text, extra?)` — line 5802, thin wrapper.
- `appendParticipantEventLog(actorName, text)` — line 3534. Shared log when a
  session is open, local log otherwise, plus a local fallback when
  `shareConnectionLost`.
- `appendPlayerCommandLog(target, text, fallbackActor)` — line 3459.

### Session sync

- `SharedParticipantState` — `src/app/services/session-sync.service.ts:35`.
  Player-facing. Already carries `isNpcRow`, `isDetachedGrunt` (presentation
  only, line 94), `rowMembers` (`SharedGruntMemberState`, line 15),
  `rowWoundModifier`, `rowEverPopulated`, `edgeRating`, `reaction`, `intuition`.
- `SharedGmParticipantState` — line 248. GM-only. Carries `rosterIndex`,
  Condition Monitor shape and contents, raw Score backing fields, `status`,
  `edge`, `actionHistory`, `ooc`, `tieBreaker`, and the grunt/row extras
  `isGrunt`, `gruntBody`, `gruntWillpower`, `lastDamageType`, `lastDamageValue`,
  `rowSpentFlagged`, `rowMemberHasActed`.
- Built by `getSharedParticipants()` (line 3218) →
  `buildSharedParticipant(p, index)` (line 3236), and `buildGmState()` (line
  3336) → `buildGmParticipantState(p, rosterIndex)` (line 3369). Both pushed
  from the single choke point `syncSharedState()` (line 3138).
- Restored by `restoreFromSharedState(state, gmState)` (line 4173) →
  `buildRestoredParticipant(shared, gm)` (line 3995). The grunt branch is at
  line 4067 and keys off `gm?.isGrunt === true`.
- **Transport cap:** `server/gm-state-channel.js:22`,
  `GM_STATE_MAX_PAYLOAD_BYTES = 64 * 1024`. `validateGmStatePayload` (line 53)
  refuses an over-cap payload, and per the doc comment at lines 42–51 (and
  `ARCHITECTURE.md` §7) the `server.js` handler **clears `session.gmState` to
  `null`** on refusal. An over-cap push therefore destroys *all* GM-only
  reconnect state, not just the new fields. `isGmState` (line 30) is a shallow
  shape check that accepts unknown extra fields.

### Tie-break

`initiativeTieBreakComparator(p1, p2)` — line 7067. Order: effective initiative
(with ±100 edge / −1000 ooc weighting) → `participantEdgeRatings` →
`participantReactions` → `participantIntuitions` → `participantTieBreakers`
(random) → `sortOrder`. Called from `sort()` (line 1118) and
`enforceSingleCurrentActor()` (line 7104). There is **no** representation
anywhere of "which row is this participant's team".

## Affected paths

Every location below must be visited. This list is exhaustive; where a category
has exactly one member I say so rather than implying it.

### Part 1 — naming on add

**`src/app/battle-tracker/battle-tracker.component.ts`**

1. `btnAddParticipant_Click()` — line 4509. Must open the dialog instead of
   calling `addParticipant()` directly.
2. `btnAddGrunt_Click()` — line 4519. Same.
3. `addNpcRow()`'s template caller — `battle-tracker.component.html:830`. Must
   route through a new `btnAddNpcRow_Click()` that opens the dialog.
4. `addNpcToRow()`'s template caller — `battle-tracker.component.html:581`. Must
   route through a new `btnAddNpcToRow_Click(row)`.
5. `mergeSelectedGrunts()` — line 5713. The row name is generated at line 5715;
   the dialog must supply it instead.
6. `addParticipant(selectNewParticipant = true)` — line 5477. **Signature and
   behaviour must not change** (constructor placeholder + 12 spec call sites).
   A new overload or a separate `addNamedParticipant(name)` is the safe shape.
7. `addGrunt(name?, body, willpower, selectNewGrunt)` — line 5520. Signature
   must not change (≈40 spec call sites). Its log line at 5544 stays where it
   is; the dialog simply always passes a name.
8. `addNpcRow(selectNewRow = true)` — line 5983. Must gain an optional `name`
   parameter (defaulting to `nextMergedGruntRowName()`) so the dialog can supply
   one. It currently logs nothing — see Open Decision D2 below.
9. `addNpcToRow(row, name?, body, willpower)` — line 6054. Signature already
   accepts a name; no change needed beyond routing.
10. `inpName_KeyDown()` — lines 5236–5243. Tab-to-add. See Open Decision D4.
11. `btnDuplicate_Click(sender)` — line 5000. See Open Decision D5.
12. `isUnusedPlaceholder(p)` — line 2125. Must keep matching the constructor's
    placeholder; verify after any change to `addParticipant`.
13. `forgetParticipant(p)` — line 6489. Must gain a `forgetMapEntry` call for
    every new side map introduced (see Part 2).
14. Constructor line 959 — must remain silent.
15. `restoreFromSharedState()` — line 4173 — must remain silent.
16. The four promote/demote helpers (≈6799, 6866, 6917, 6978) — must remain
    silent on the join question.
17. `handleSessionCommand` `register_character` branch — line 2762. Already
    correct; must not be double-logged by any new choke point. Explicitly
    exclude it.

**`src/app/battle-tracker/battle-tracker.component.html`**

18. Line 824 (`btnAddParticipant_Click`), lines 830–833 (`addNpcRow()`),
    lines 837–841 (`btnAddGrunt_Click`), line 581 (`addNpcToRow`), lines
    849–855 (merge button). Plus one new `<ng-template>` for the add dialog,
    following the `openActModal` pattern at line 4575 (`modalService.open(tpl,
    { size: "lg", centered: true })` with a `result.finally` teardown).

**`src/Combat/CombatManager.ts`**

19. `copyParticipant(p)` — line 233. Renames the *source* participant at lines
    252–255. Not required to change, but must be named in the plan because it is
    the one other place a participant's name is written by the app rather than
    the GM.

**Searched and found only these.** Grepped `src/` for `logRowEvent`,
`appendSharedLog`, `appendGmOnlyLog`, `appendParticipantEventLog`,
`appendPlayerCommandLog`, `addParticipant`, `addNpcRow`, `createStandaloneGrunt`
and `mergeGruntsIntoRow`. There are no participant-creating paths outside the
list above. `src/app/player-view/` creates nothing in the GM's `CombatManager`;
it sends `register_character` commands, which land at path 17.

### Part 2 — statblock templates

**New files** (recommended placement, see Proposed approach):

20. `src/Grunts/statblocks/statblock-types.ts` — the `GruntStatblock` interface
    and enums. No logic.
21. `src/Grunts/statblocks/grunt-statblocks.ts` — the 14 blocks from spec
    section "Sample grunts, SR5 core, pp. 381–384".
22. `src/Grunts/statblocks/contact-statblocks.ts` — the 8 blocks from "Sample
    contacts, SR5 core, pp. 390–392".
23. `src/Grunts/statblocks/index.ts` — `ALL_GRUNT_STATBLOCKS`,
    `ALL_CONTACT_STATBLOCKS`, `getStatblockById(id)`.
24. `src/Grunts/statblock-instantiation.ts` — pure factory functions
    `instantiateStandaloneFromStatblock(sb, opts)` and
    `instantiateRowFromStatblock(sb, count, opts)`. **No Angular imports** —
    these live beside `createStandaloneGrunt` / `mergeGruntsIntoRow` and are
    unit-testable without a TestBed.

**Existing files that must change:**

25. `src/Grunts/index.ts` — re-export the new symbols, matching the existing
    barrel style (lines 1–29).
26. `src/app/services/session-sync.service.ts` — `SharedGmParticipantState`
    (line 248) gains the optional statblock fields. `SharedParticipantState`
    (line 35) gains **nothing** (U2).
27. `battle-tracker.component.ts` `buildGmParticipantState(p, rosterIndex)` —
    line 3369. Emit the new fields.
28. `battle-tracker.component.ts` `buildRestoredParticipant(shared, gm)` — line
    3995 — or, more precisely, the restore loop at 4259–4340: re-populate the
    new side map from the wire.
29. `battle-tracker.component.ts` `restoreFromSharedState()` — line 4185–4193 —
    clear the new side map alongside the existing eight.
30. `battle-tracker.component.ts` `forgetParticipant(p)` — line 6489 — drop the
    new side map entry.
31. `battle-tracker.component.ts` `btnDuplicate_Click(sender)` — line 5000 —
    copy the new side map entry to the clone, exactly as it copies
    `participantEdgeRatings`/`participantReactions`/`participantIntuitions` at
    lines 5010–5012.
32. `battle-tracker.component.ts` `upsertPlayerParticipant`'s type-mismatch
    branch — lines 3854–3864 — delete the new side map entry alongside the seven
    it already deletes.
33. `battle-tracker.component.ts` `detachRowMember` — line 6396 — a lieutenant
    detached from a templated row should carry the row's statblock imprint (and,
    if U7 is approved, record the row it came from).
34. `battle-tracker.component.ts` `mergeSelectedGrunts` — line 5713 — decide
    what the merged row's imprint is when the merged grunts carry different
    imprints (recommend: the first grunt's, matching how `mergeGruntsIntoRow`
    already takes `baseIni`/`dices` from `grunts[0]`).
35. `battle-tracker.component.html` details panel — a new read-only reference
    section under the existing `ngbNav`, alongside the "Condition Monitor" tab
    (line 1028) and "Stats" tab (line 1120).

### Part 3 — lieutenant tie-break (only if U7 is approved)

36. `battle-tracker.component.ts` `initiativeTieBreakComparator(p1, p2)` — line
    7067. One new branch, placed after the effective-initiative equality check
    (line 7070) and before the Edge step (line 7074).
37. A new side map for the lieutenant→team-row relationship, inheriting every
    obligation in items 29–32 above.
38. `SharedGmParticipantState` gains a `lieutenantTeamRowId?: string`.

## Proposed approach

### The choke point

**One draft object and one commit function.** Add to `battle-tracker.component.ts`:

```
type AddDraftKind = "participant" | "grunt" | "row" | "rowMember";
interface AddDraft {
  kind: AddDraftKind;
  name: string;
  count: number;                 // rows only
  body: number; willpower: number;
  statblockId: string | null;
  loadAugmented: boolean;
  targetRow: NpcRowParticipant | null;  // rowMember only
  includeLieutenant: boolean;
}
```

- `openAddDialog(kind, tpl, targetRow?)` seeds `pendingAddDraft` with the
  *proposed* default name from the existing generator for that kind, opens the
  modal, and creates **nothing**.
- `commitAddDraft()` is the single function that (a) calls the existing creation
  method for that kind with the final name and (b) emits the join line.
- `cancelAddDraft()` clears `pendingAddDraft`. Nothing else.

**The log line must be emitted by `commitAddDraft()`, not by the creation
methods.** This is the load-bearing design point: `addParticipant()` is called
by the component constructor (line 959) to seed the placeholder, so a log line
inside it would fire a phantom join on every tab load. The same argument applies
to `restoreFromSharedState()`, which is a bulk rebuild.

The one exception to that rule is `addGrunt()`, which *already* logs at line
5544 and has a test asserting the exact text. Two options:

- **(Recommended) Leave `addGrunt`'s line where it is** and have
  `commitAddDraft()` skip emitting for `kind === "grunt"`. Zero churn, existing
  test passes unchanged. Same for `addNpcToRow` (line 6065) and
  `mergeSelectedGrunts` (line 5748).
- Move all three into `commitAddDraft()` and update the three tests. Cleaner in
  principle, but it makes `addGrunt`/`addNpcToRow`/`mergeSelectedGrunts` silent
  when called directly, which ≈40 existing spec call sites do.

Recommend the first. The choke point's job is then narrower but still real: it
is the only place a *name* is decided, and the only place a join line is emitted
for the two kinds that currently emit none (`participant`, `row`).

**Do not implement the dialog by creating the participant first and binding the
name box to it.** That would put a half-built participant in
`combatManager.participants`, break `isUnusedPlaceholder`, fire a
`syncSharedState()` broadcast the players would see, and leave an orphan on
cancel.

### Where the statblock data lives

`src/Grunts/statblocks/`, not `src/app/shared/`. Reasons: the instantiation
factory has to sit beside `createStandaloneGrunt` and `mergeGruntsIntoRow`
(`src/Grunts/`), must not import Angular, and must be unit-testable without a
TestBed the way `src/Grunts/npc-row.spec.ts` partly is. `src/app/shared/` holds
UI-layer data (`declared-actions.ts`, `interrupt-actions.ts`,
`log-formatter.ts`) and would drag a domain factory into the component layer.

### Template type shape

The governing constraint is **acceptance criterion 10 / RULINGS 2026-08-04**: no
template instantiation may write a box count. Therefore:

```
interface GruntStatblock {
  id: string;                       // stable, e.g. "pr1-grunt"
  label: string;                    // "PR 1 — Gangers & Street Scum (Grunt)"
  kind: "grunt" | "lieutenant" | "contact";
  professionalRating: number | null;   // null for contacts
  printedPage: number;

  base: StatblockAttributes;        // B A R S W L I C, plus Ess/E/M/Res where printed
  augmented?: Partial<StatblockAttributes>;   // only the bracketed values

  initiativeDice: number;
  augmentedInitiativeDice?: number;

  armor: number | null;             // null for contacts (G16)

  // Verbatim, reference only. NEVER read as a live value.
  printedInitiative: string;        // "10 (12) + 3D6"
  printedAltInitiative?: string;    // "Astral Initiative 8 + 3D6"
  printedConditionMonitor: number | null;
  printedLimits?: { physical: string; mental: string; social: string };

  reference: {
    skills: string[]; knowledgeSkills?: string[]; qualities?: string[];
    augmentations?: string[]; gear: string[]; spells?: string[];
    complexForms?: string[]; adeptPowers?: string[]; programs?: string[];
  };

  notes: string[];   // the X-list flags, e.g.
                     // "Condition Monitor printed as 10; p. 379 formula gives 11."
                     // "Astral Initiative shown as printed (3D6); p. 159 base is 2D6."
}
```

There is deliberately **no** `conditionMonitorBoxes` field. `printedConditionMonitor`
exists only so a note can be rendered next to the derived count; nothing reads
it as an input.

### How templates feed Body/Willpower

`instantiateStandaloneFromStatblock(sb, { augmented })` must:

1. Resolve the effective attributes: `augmented ? { ...sb.base, ...sb.augmented } : sb.base`.
2. Call `createStandaloneGrunt(name, eff.body, eff.willpower)`
   (`src/Grunts/DetachedGruntParticipant.ts:357`). This is the only correct
   entry point — it routes through `setGruntAttributes`, which is the sole
   writer of `physicalHealth`/`stunHealth` on a grunt.
3. `grunt.setDicesWithoutRoll(augmented ? (sb.augmentedInitiativeDice ?? sb.initiativeDice) : sb.initiativeDice)`.
   **Never `changeDiceCount`** — this is construction, and ARCHITECTURE §6 lists
   `createStandaloneGrunt` among the deliberate no-roll paths.
4. Return the grunt plus the effective Reaction/Intuition/Edge so the GM
   component can seed its side maps.

For a row: build `GruntMember(name, eff.body, eff.willpower)` per member and
`row.addMember(...)`. `GruntMember.conditionMonitorBoxes` is a getter with no
setter, so this is structurally safe.

**The GM component then does, exactly as `addGrunt` (5528–5533) already does:**

```
this.participantEdgeRatings.set(p, <0 for grunts/lieutenants, printed Edge for contacts per U8>);
this.participantReactions.set(p, eff.reaction);
this.participantIntuitions.set(p, eff.intuition);
p.baseIni = this.getParticipantBaseInitiative(p);   // line 5445
```

Do **not** write `p.baseIni` from `sb.printedInitiative`. The side maps are what
ERIC's Reaction and Intuition steps read (`initiativeTieBreakComparator`, lines
7080–7090) and what `SharedParticipantState.reaction`/`.intuition` broadcast
(line 3270–3271). Setting `baseIni` directly leaves them empty and silently
changes tie-break behaviour.

### How the GM-only fields travel

Add to `SharedGmParticipantState` (`session-sync.service.ts:248`):

```
statblockId?: string;
statblockAugmented?: boolean;
professionalRating?: number;
lieutenantTeamRowId?: string;   // U7 only
```

**Carry the id, not the text.** Reference text is re-hydrated on restore by
`getStatblockById(gm.statblockId)`. Two reasons, one of them a hard constraint:

- `GM_STATE_MAX_PAYLOAD_BYTES` is 64 KB (`server/gm-state-channel.js:22`) and an
  over-cap push causes the server to set `session.gmState = null`, destroying
  *all* GM reconnect state, not just the oversized part. The PR 5 lieutenant's
  reference text alone is ~800 bytes; twenty templated combatants would add
  ~16 KB on top of the existing per-participant payload. That is survivable but
  not comfortably so once a six-member row's `rowMembers` array is included.
- An id cannot drift from the printed data. Inlined text can.

GM-component side map: `participantStatblocks: Map<IParticipant, { id: string; augmented: boolean }>`.
It inherits every obligation listed in affected-paths items 29–32.

`SharedParticipantState` gains **nothing** (U2). Professional Rating is a dice
pool modifier and Edge pool size (pp. 379–380) and is the same class of
information as Condition Monitor maximums, which RULINGS 2026-08-13 bars.

### How the lieutenant tie-break would be represented (U7)

Store `lieutenantTeamRowId: string` (a participant id from `getParticipantId`),
not an object reference — object identity does not survive
`restoreFromSharedState`, which rebuilds every participant. Resolve to a live
participant lazily inside the comparator via the `participantIds` map.

In `initiativeTieBreakComparator` (line 7067), after the effective-initiative
equality test at line 7070 and before the Edge step at line 7074:

```
// p. 381: a lieutenant tied with HIS OWN team always goes first. A specific
// override of p. 159's ERIC ladder, scoped to that one row.
if (this.isLieutenantOf(p1, p2)) return -1;
if (this.isLieutenantOf(p2, p1)) return 1;
```

**Known limitation to disclose, not to hide.** This is a pairwise exception, so
a three-way tie (lieutenant, his row, and an unrelated third party) is not
guaranteed transitive, and `Array.prototype.sort` may order such a group
inconsistently between runs. In practice the printed templates make this narrow:
of the seven pairs, ERIC already puts the lieutenant first on Reaction or
Intuition in five of them. Only the PR 0 pair (grunt R 3/I 3, lieutenant R 3/I 3)
and the PR 5 pair (grunt R 5(7)/I 5, lieutenant R 5(7)/I 5) tie all the way down
to the coin toss, which is exactly where the override does real work.
Recommendation: build it, and add a comment recording the transitivity caveat.

## Acceptance criteria

Numbered independently of the rules spec's own list. Each is checkable against
observable behaviour.

**Phase 1 — naming on add**

IA1. Pressing any add control (Add Participant, Add Grunt, Grunt Group, Add NPC,
Merge) opens a dialog and adds **nothing** to `combatManager.participants` until
Confirm is pressed.
IA2. Pressing Cancel on any add dialog leaves `combatManager.participants.items`
referentially and field-for-field identical to its pre-dialog state, fires no
`sessionSync.broadcastState`, fires no `sessionSync.appendLog`, and adds no
`LogHandler` entry describing a join.
IA3. Confirming an add with a typed name writes **exactly one** shared-log entry
whose `actor` is the typed name and whose `text` contains no auto-generated
placeholder.
IA4. Confirming an add with the name box left blank uses the generator's default
and that default is unique across the encounter — no two live participants, and
no two members of one row, share a name at any point.
IA5. Confirming a Grunt Group add of N members produces one `NpcRowParticipant`
with N `GruntMember`s and exactly one shared-log entry for the row (member joins
inside the same commit do not each produce a line).
IA6. `isUnusedPlaceholder(placeholder)` still returns `true` for the participant
the component constructor seeds, on a tab that has done nothing else.
IA7. No log line is written by the component constructor, by
`restoreFromSharedState`, or by any of the four promote/demote helpers.
IA8. `addGrunt('X')` called directly still writes exactly one entry with
`actor === 'X'` and `text === 'added.'` (existing behaviour preserved).
IA9. `addNpcToRow(row, 'X')` called directly still writes exactly one entry with
`text === 'X joined the group.'`.
IA10. A `register_character` session command still writes exactly one
"joined the session" entry and is not double-logged by the new commit path.
IA11. No log line produced by any add path contains a Condition Monitor maximum,
a box count, or a Professional Rating, GM-only entries included.

**Phase 2 — statblocks**

IA12. `getStatblockById(id)` resolves for all 22 ids; `ALL_GRUNT_STATBLOCKS`
has length 14 and `ALL_CONTACT_STATBLOCKS` has length 8.
IA13. No `GruntStatblock` object has a field that is written to
`physicalHealth`, `stunHealth`, or `GruntMember` box count. (Assert by grep in
review; assert in test by checking derived box counts against the formula.)
IA14. Instantiating `pr0-grunt` produces a combined Condition Monitor of 10
boxes; `pr5-grunt` 11; `pr6-lieutenant` 11; `pr4-lieutenant` **11** (not the
printed 10) and its `notes` array contains a string naming the discrepancy.
IA15. `pr0-lieutenant` yields 10 boxes despite the block printing none, and
`pr0-grunt`'s `printedLimits` records the derived 4/4/5 with a note flagging it
as derived.
IA16. Instantiating a template as a row produces one participant in
`combatManager.participants`, with one `currentInitiativeScore` and one entry in
the derived order.
IA17. A template participant's `participantReactions` and `participantIntuitions`
entries equal the template's effective Reaction and Intuition, and
`p.baseIni === reaction + intuition`. Spot checks: `pr2-grunt` → 7;
`pr5-grunt` augmented → 12, base → 10; `pr6-lieutenant` → 15.
IA18. A template participant's `dices` equals the template's printed Initiative
Dice count and was written via `setDicesWithoutRoll` (no Score movement at
construction, verifiable by asserting `currentInitiativeScore` is unchanged by
the dice write).
IA19. `participantEdgeRatings.get(templateRow) === 0` for every grunt and
lieutenant template; no code path writes `professionalRating` into
`participantEdgeRatings`.
IA20. A templated row added while `combatManager.started && initiativePass > 1`
has `-(initiativePass - 1) * 10` applied; a template member added to an
*existing* row has no Score change at all.
IA21. `SharedParticipantState` for a templated participant contains no
`statblockId`, no `professionalRating`, and no reference text — assert by
`JSON.stringify(getSharedParticipants())` not matching `/professionalRating|statblock/`.
IA22. `SharedGmParticipantState` for a templated participant carries
`statblockId` and `statblockAugmented`, and a round trip through
`buildGmState()` → `restoreFromSharedState()` restores name, Body, Willpower,
Reaction, Intuition, dice count, Armor, Professional Rating and the reference
text (re-hydrated from the id).
IA23. `JSON.stringify(buildGmState()).length` for an encounter of 20 templated
participants including one six-member row is under
`GM_STATE_MAX_PAYLOAD_BYTES` (64 × 1024).
IA24. Editing a templated grunt's Body from 6 to 9 re-derives the track to 13
boxes with existing damage unmoved, and writes no log line naming the new
maximum.
IA25. Reference text (skills, gear, spells, complex forms, adept powers,
qualities, Limits) is rendered read-only and is never parsed into a dice pool or
modifier. Melee DV strings are not recomputed when Strength is edited.

**Phase 3 (only if U7 / U11 approved)**

IA26. A lieutenant whose `lieutenantTeamRowId` names row R and whose effective
initiative equals R's sorts before R without consulting
`participantEdgeRatings`; against any participant other than R, the ordinary
ERIC ladder applies unchanged.
IA27. The Professional Rating advisory badge never removes a participant, never
sets `ooc`, never rolls, and never writes a log line.

## Regression risk

**Double-logging.** The sharpest risk. If `commitAddDraft()` emits a join line
for `kind === "grunt"` while `addGrunt` still logs at line 5544, every grunt add
produces two entries. Covered by `src/scenarios/action-log-readability.spec.ts:435`
(`expect(sent.length).toBe(1)`), which will fail. Same for `addNpcToRow` at
`action-log-readability.spec.ts:452`.

**Log loss on cancel.** A dialog whose Cancel path still calls the creation
method, or which creates on open and removes on cancel, produces a
`syncSharedState()` broadcast the players see. No existing test covers this;
IA2 is the new one.

**Placeholder-logic confusion.** Any write to a plain `Participant` on the add
path — a default name, a different Reaction seed, an extra side map — breaks
`isUnusedPlaceholder`. Covered by
`src/scenarios/persistent-rooms.spec.ts:3836–3956` (the entire "Round 4 - D5"
describe, 12 assertions). Failure mode if missed: the destructive-join
confirmation fires on every fresh tab.

**Default-name namespace collisions.** Covered by
`src/Grunts/npc-row.spec.ts:1788–1817` (merged-row numbering, including the
"second merge is Grunt Group 2" and "GM renamed a row to Grunt Group 4, next
merge is 5" cases) and `src/Grunts/npc-row.spec.ts:2397–2422` (row default
naming and the `"Grunt Group NPC 1"` doubled-name check at line 2422).

**Initiative order / tie-break.** Phases 1 and 2 do not touch
`initiativeTieBreakComparator`. Phase 3 does. There is **no dedicated spec file
for tie-breaking** (`ARCHITECTURE.md` "Test coverage"), so Phase 3 must ship
with its own. Indirect coverage:
`src/scenarios/npc-group-initiative.spec.ts`, `src/Combat/CombatManager.spec.ts:315,342,354`.

**Condition-monitor resizing invariant.** Any template path that writes
`physicalHealth`/`stunHealth` instead of `setGruntAttributes` breaks
re-derivation on the next attribute edit. Covered by
`src/Grunts/npc-row.spec.ts:1579–1660` (resize, clamp, shrink-and-regrow) and
`src/scenarios/grunt-heal-dv-input.spec.ts`.

**Session-sync payload shape.** Adding fields to `SharedGmParticipantState` is
safe (`isGmState` is a shallow check). Adding *bulk text* is not — see IA23 and
the `session.gmState = null` behaviour. Covered indirectly by
`src/scenarios/gm-reconnect-state-loss.spec.ts`; IA23 is a new, explicit test.

**Snapshot/restore.** A new side map that `restoreFromSharedState` does not
clear (line 4185–4193) leaks entries keyed on discarded participant objects. A
new side map that `forgetParticipant` (line 6489) does not drop outlives its
participant. Neither has compiler enforcement — `ARCHITECTURE.md` §8 flags this
category explicitly.

**Merge / late entry.** `src/scenarios/combat-boundary-logging.spec.ts:496–510`
asserts the merged-row late-entry arithmetic and the log ordering constraint
(the "formed from" line must precede any boundary line the removal loop
cascades into). Moving the merge log line out of `mergeSelectedGrunts` would
break that ordering. Do not move it.

**Other existing suites that call the affected methods directly and will fail on
a signature change:** `src/scenarios/remove-undo-system.spec.ts:133,536–539,572`,
`src/scenarios/combat-log-readability.spec.ts:285,379,440,457,471,490,504`,
`src/scenarios/action-log-attribution.spec.ts:88`,
`src/scenarios/gm-npc-rolls.spec.ts:79`, `src/scenarios/persistent-rooms.spec.ts:3862,4399,4422,4567`,
and ≈40 `component.addGrunt(...)` / `component.addNpcRow(false)` call sites in
`src/Grunts/npc-row.spec.ts`. **Do not change the public signatures of
`addParticipant`, `addGrunt`, `addNpcRow` or `addNpcToRow`.**

New scenario spec belongs at `src/scenarios/grunt-naming-and-statblocks.spec.ts`
— under `src/`, per `ARCHITECTURE.md` "Test coverage" (a spec outside `src/` is
silently never run).

## Scenarios to survive

Written as executable test cases against `BattleTrackerComponent`.

**IS1 — Ordinary case: the reported defect, fixed.**
```
combat not started; sent = [] (spy on sessionSync.appendLog)
component.btnAddGrunt_Click()            // opens dialog, creates nothing
expect(component.combatManager.participants.count).toBe(1)   // placeholder only
expect(sent.length).toBe(0)
component.pendingAddDraft.name = 'Halloweener Torch'
component.commitAddDraft()
expect(component.combatManager.participants.count).toBe(2)
expect(sent.length).toBe(1)
expect(sent[0].actor).toBe('Halloweener Torch')
expect(sent[0].text).toBe('added.')
expect(JSON.stringify(sent)).not.toContain('Grunt 1')
```

**IS2 — Cancel is total.**
```
const before = snapshotRoster(component)      // ids, names, scores, sortOrders
const broadcasts = spyOn(sessionSync, 'broadcastState')
component.btnAddParticipant_Click()
component.pendingAddDraft.name = 'Typed and then abandoned'
component.cancelAddDraft()
expect(snapshotRoster(component)).toEqual(before)
expect(broadcasts).not.toHaveBeenCalled()
expect(sent.length).toBe(0)
expect(component['isUnusedPlaceholder'](component.combatManager.participants.items[0])).toBeTrue()
```

**IS3 — Edge case: blank name, three namespaces held apart.**
```
component.btnAddGrunt_Click(); component.commitAddDraft()       // blank name
component.btnAddGrunt_Click(); component.commitAddDraft()       // blank name
const row = commitRowAdd(component, '', 2)                      // blank row name
expect(names(component)).toContain('Grunt 1')
expect(names(component)).toContain('Grunt 2')
expect(row.name).toBe('Grunt Group')
expect(row.members.map(m => m.name)).toEqual(['NPC 1', 'NPC 2'])
expect(new Set(allLiveNames(component)).size).toBe(allLiveNames(component).length)
```

**IS4 — Undo-equivalent: there is no undo, so correction must be free.**
(Undo/redo was removed from the tracker, commit `426827b`; the only correction
path is a manual edit. This scenario asserts that path stays open.)
```
const g = commitGruntAdd(component, 'Wrong Name')
expect(sent.length).toBe(1); expect(sent[0].actor).toBe('Wrong Name')
g.name = 'Right Name'; component.onParticipantUpdated()
expect(sent.length).toBe(1)                 // rename writes NO second join line
expect(sent[0].actor).toBe('Wrong Name')    // the log is append-only; history stands
component.btnDelete_Click(g)                // the real "undo": delete and re-add
expect(component['participantIds'].has(g)).toBeFalse()
const g2 = commitGruntAdd(component, 'Right Name')
expect(sent.length).toBe(2)
expect(sent[1].actor).toBe('Right Name')
expect(component['nextStandaloneGruntName']()).toBe('Grunt 1')  // no orphaned number
```

**IS5 — Live at the table: reinforcements arrive mid-combat, players waiting.**
```
// Pass 2 of Combat Turn 1. Row 'Ancients' at shared Score -1 after a wound.
component.combatManager.started = true
component.combatManager.initiativePass = 2
const row = existingWoundedRow(component, 'Ancients', -1)
const scoreBefore = row.getCurrentInitiative()

component.btnAddNpcToRow_Click(row, tpl)          // dialog opens mid-pass
expect(component.combatManager.currentActors.count).toBe(currentActorsBefore)
expect(broadcasts.calls.count()).toBe(broadcastsBefore)   // nothing pushed yet
component.pendingAddDraft.name = 'Ancients 5'
component.commitAddDraft()

expect(row.members.length).toBe(5)
expect(row.getCurrentInitiative()).toBe(scoreBefore)      // Decision 7: joiner is Score-neutral
expect(row.rowWoundModifier).toBe(1)                      // untouched by the join
expect(sent.filter(e => e.text.includes('joined the group')).length).toBe(1)
expect(sent[sent.length - 1].text).toBe('Ancients 5 joined the group.')
expect(sent[sent.length - 1].text).not.toMatch(/\d+\/\d+/)   // no CM maximum
```

**IS6 — Template instantiation produces a derived, not a printed, box count.**
```
const row = commitTemplateRowAdd(component, 'pr1-grunt', 4, 'Ancients', { augmented: true })
expect(row.members.length).toBe(4)
expect(row.members[0].conditionMonitorBoxes).toBe(10)      // B4/W3 -> 8 + ceil(4/2)
expect(component['participantReactions'].get(row)).toBe(3)
expect(component['participantIntuitions'].get(row)).toBe(3)
expect(row.baseIni).toBe(6)
expect(row.dices).toBe(1)
expect(component['participantEdgeRatings'].get(row)).toBe(0)
expect(component['participantStatblocks'].get(row).id).toBe('pr1-grunt')
// The X2 case, on the other template:
const lt = commitTemplateGruntAdd(component, 'pr4-lieutenant', 'Vitos Wire')
expect(lt.physicalHealth).toBe(11)                          // NOT the printed 10
expect(getStatblockById('pr4-lieutenant').notes.join(' ')).toContain('11')
// Nothing about the template reaches the players:
expect(JSON.stringify(component['getSharedParticipants']())).not.toMatch(/pr1-grunt|professionalRating/)
```

**IS7 — GM rejoin round-trips the template imprint and stays under the cap.**
```
buildTwentyTemplatedParticipantsIncludingASixMemberRow(component)
const gmState = component['buildGmState']()
expect(JSON.stringify(gmState).length).toBeLessThan(64 * 1024)
const state = { round: 1, pass: 1, participants: component['getSharedParticipants']() }
component['restoreFromSharedState'](state, gmState)
const restored = component.combatManager.participants.items.find(p => p.name === 'Ancients Boss')
expect(hasGruntConditionMonitor(restored)).toBeTrue()
expect(restored.gruntBody).toBe(4)
expect(restored.physicalHealth).toBe(10)
expect(component['participantStatblocks'].get(restored).id).toBe('pr1-lieutenant')
expect(component['getStatblockReference'](restored).gear.length).toBeGreaterThan(0)  // re-hydrated by id
```

**IS8 — Phase 3 only: the lieutenant tie-break, and its blast radius.**
```
const row = templateRow(component, 'pr0-grunt', 4, 'Thugs')    // R3 I3, Edge 0
const lt  = templateGrunt(component, 'pr0-lieutenant', 'Boss') // R3 I3, Edge 0
component['setLieutenantTeam'](lt, row)
const pc = plainParticipant(component, 'Cayman', { edge: 3, reaction: 6, intuition: 5 })
setEffectiveInitiative([row, lt, pc], 10)
component.sort()
expect(order(component)).toEqual(['Cayman', 'Boss', 'Thugs'])
// Against a non-team participant the override must not fire:
const otherRow = templateRow(component, 'pr0-grunt', 2, 'Other Thugs')
setEffectiveInitiative([otherRow], 10)
component.sort()
expect(indexOf('Boss')).toBeGreaterThan(indexOf('Cayman'))
expect(compareViaEric(lt, otherRow)).toBe(coinTossResult)      // ERIC, not the override
```

## Open decisions (implementation)

These are decisions the *implementation* leaves open, over and above the rules
spec's U1–U12. Each has a recommended default.

**D1. Should the add dialog also be used for the Duplicate button?**
`btnDuplicate_Click` (line 5000) currently produces `"Ganger 2"` silently, and
`CombatManager.copyParticipant` may *rename the source* to `"Ganger 1"`
(`CombatManager.ts:252–255`) — a mutation the GM did not ask for and is not
told about. *Recommended:* leave Duplicate alone in Phase 1 and record the
source-rename as a separate defect. *Why:* it is a different bug (an unannounced
rename, not a mis-named log line), and folding it in doubles Phase 1's blast
radius.

**D2. Should `addParticipant` and `addNpcRow` gain a join log line at all?**
They currently write nothing to the shared log. U12 says apply uniformly, which
implies yes. *Recommended:* yes, one line each, emitted from `commitAddDraft()`
only — `"<name> joined the fight."` for a plain participant,
`"<row name> formed."` for an empty row. *Why:* the players' log currently shows
an NPC appearing in the order with no announcement, which is the same
attributability problem in the other direction. But this is a visible change to
what players see and needs your sign-off.

**D3. Does the dialog offer Body/Willpower for a hand-built grunt?**
`addGrunt` already takes them (defaulting to `DEFAULT_GRUNT_ATTRIBUTE` = 3), and
they are editable afterwards in the details panel
(`battle-tracker.component.html:1081–1095`). *Recommended:* yes, show them in the
dialog with the existing defaults. *Why:* they determine the Condition Monitor
size, and the whole point of the dialog is getting it right before commit.

**D4. What does Tab-to-add do?** `inpName_KeyDown` (line 5236) currently creates
a blank row instantly and focuses it — a fast keyboard flow for typing in six
combatants. A dialog would destroy it. *Recommended:* leave Tab-to-add exactly
as it is, creating an unnamed blank row with no log line, and emit the join line
when the name box is first given a non-empty value. *Why:* it is the only
genuinely fast entry path in the app and the log line is not lost, only
deferred. This is a real divergence from "one dialog for everything" and should
be a conscious choice, not an oversight.

**D5. What imprint does a merged row carry when its members came from different
templates?** *Recommended:* the first selected grunt's, mirroring
`mergeGruntsIntoRow`'s existing rule that the row takes `baseIni` and `dices`
from `grunts[0]` (`NpcRowParticipant.ts:643–644`). Record the others in the
row's notes.

**D6. Where does the reference text render?** *Recommended:* a third `ngbNavItem`
in the details panel, beside "Condition Monitor" (line 1028) and "Stats"
(line 1120), shown only when `participantStatblocks.has(selectedActor)`.
*Why:* it is GM-only bookkeeping, it is long, and the details panel is already
the place per-participant depth lives.

**D7. Phasing.** *Recommended:* three phases as described in the plain-language
appendix — (1) naming on add, all paths; (2) statblock data + instantiation +
reference panel; (3) lieutenant tie-break, PR advisory badge, contacts. *Why:*
Phase 1 is the reported defect and ships alone; Phase 2's cost is dominated by
careful transcription, not by logic; Phase 3 is the only part that touches
initiative ordering and deserves its own review.

## Which of U1–U12 materially change the implementation

Ranked by how much of the plan above changes depending on the answer.

**Structural — answer before any code is written:**
- **U1 (log timing)** — defines `commitAddDraft()`'s entire contract. Everything
  in Phase 1 derives from it.
- **U12 (all paths or grunts only)** — the difference between changing one
  handler and changing six handlers plus five template bindings. Also decides
  whether D2 above is even a question.
- **U4 (base vs augmented)** — decides whether `GruntStatblock` needs the
  `augmented` and `augmentedInitiativeDice` fields and whether the dialog needs
  a toggle. Answer before transcription starts; retrofitting it means touching
  all 14 grunt blocks.
- **U5 (group vs individual default)** — decides which factory
  `commitAddDraft()` calls for `kind === "grunt"` with a template selected, and
  therefore the dialog's field set.

**Data-shape and wire — answer before Phase 2:**
- **U3 (printed vs formula)** — the recommendation makes `printedConditionMonitor`
  reference-only. A different answer requires an override mechanism on
  `DetachedGruntParticipant` that does not exist today and would contradict
  RULINGS 2026-08-04.
- **U9 (unmodelled gear/skills)** — directly drives the 64 KB cap risk (IA23).
  "Store as text on the participant" is fine; "send that text on the GM-only
  channel" is what would break, and is why the id-only recommendation exists.
- **U2 (player visibility of template identity)** — decides whether
  `professionalRating` and `statblockId` go on `SharedGmParticipantState` alone
  or also on `SharedParticipantState`. Cheap now, awkward once players have seen
  it.

**Scope — decide whether contacts are in Phase 2 or Phase 3:**
- **U10 (contacts grunt-shaped?)** — decides whether contacts instantiate via
  `createStandaloneGrunt` or via `new Participant()` with two tracks. Different
  factory, different Condition Monitor UI branch.
- **U8 (contact Edge)** — decides whether `participantEdgeRatings` seeds 0 or
  the printed 2–3 for a contact. One line, but it changes ERIC results.
- Note: rules-spec acceptance criteria 5 and 15 assume contacts are in scope. If
  they move to Phase 3, those two criteria need amending.

**Isolated — can be answered last:**
- **U7 (lieutenant tie-break)** — the only decision that touches
  `initiativeTieBreakComparator` and the only one that adds a persisted
  participant-to-participant relationship. High effort, zero coupling to
  Phases 1–2.
- **U6 (auto-include lieutenant)** — one checkbox and one extra
  `commitAddDraft()` branch.
- **U11 (break-point badge)** — display only; reads
  `professionalRating` and `row.members.filter(m => m.outOfAction).length`.

## Rules-dependency note

Everything in this appendix is implementation planning against code. Three items
in the rules spec above remain genuinely rules-blocked and must **not** be
resolved by the implementer: **I5** (drug effects at p. 411, unread), **I13**
(Toughness, Natural Hardening, Magician, Technomancer, Adept, Aspected Magician —
Qualities chapter unread) and **X8** (the Street Gear melee weapon table). This
plan handles all three by storing them as inert reference text (IA25), which
needs no rules pass. If a later phase wants to *model* any of them, that is a
`/feature` request, not this one.

## Latent defect noticed while mapping (not part of this feature)

`CombatManager.copyParticipant` (`src/Combat/CombatManager.ts:252-255`) renames
the **source** participant when duplicating:

```ts
if (high === 0) {
  high++;
  p.name = base + " 1";
}
```

Duplicating "Ganger" silently renames the original to "Ganger 1". No log line
records it, and `clearGmRollAttributionIfNamed` keys off the old name. Flagged
as implementation Open Decision D1; recommend handling separately.

---

# Decisions — 2026-08-26 (binding)

*Xavier's answers. These override any contrary recommendation earlier in this
spec. Where an earlier acceptance criterion conflicts, the amendment below wins.*

## D-X1. U11 / plain-brief Decision 8 — Professional Rating break-point badge: **NOT BUILT**

Dropped entirely, not deferred. No badge, no threshold display, no casualty
count, no advisory, no automatic removal, no roll.

**Amendments:** rules-spec acceptance criteria list loses nothing (the badge was
only ever U11, never a numbered criterion); implementation criterion **IA27 is
struck**. `professionalRating` loses its only would-be consumer — see D-X4.

## D-X2. U9 — reference text: **NOT IMPORTED**

Verbatim: *"dont add in gear, skills, etc, just add in what the iniative tracker
is alredy uysing like body, willpower, etc."*

**Verified against the code.** The tracker's complete per-participant attribute
vocabulary is:

| Field | Storage | Consumer |
|---|---|---|
| Body | `DetachedGruntParticipant._gruntBody` (`src/Grunts/DetachedGruntParticipant.ts:59`), `GruntMember` ctor | `gruntConditionMonitorBoxes()` |
| Willpower | `_gruntWillpower` (`:76`), `GruntMember` ctor | same |
| Reaction | `participantReactions` side map (`battle-tracker.component.ts:927` region) | `getParticipantBaseInitiative()`, ERIC step 2 |
| Intuition | `participantIntuitions` side map | same, ERIC step 3 |
| Edge | `participantEdgeRatings` side map | ERIC step 1 |
| Initiative dice | `p.dices` via `setDicesWithoutRoll` | initiative roll |

Nothing else exists. Grepped `src/` for `armor` — **zero hits in any `.ts` or
`.html` outside specs**; armor is not modelled at all. Agility, Strength, Logic,
Charisma, Essence and Limits likewise have no representation.

**Therefore `GruntStatblock` is reduced to:**

```
interface GruntStatblock {
  id: string;                 // "pr5-grunt"
  label: string;              // "PR 5 — Elite Corporate Security (Grunt)"
  kind: "grunt" | "lieutenant";
  professionalRating: number; // 0-6
  printedPage: number;

  body: number;      willpower: number;
  reaction: number;  intuition: number;
  initiativeDice: number;

  // Augmented (bracketed) values, present only where the block prints them.
  augmented?: {
    reaction?: number; intuition?: number;
    body?: number; willpower?: number;
    initiativeDice?: number;
  };

  notes: string[];   // X-list discrepancies only, e.g.
                     // "Block prints Condition Monitor 10; p. 379 formula gives 11."
}
```

**Struck from the type as previously specced:** `armor`, `printedInitiative`,
`printedAltInitiative`, `printedConditionMonitor`, `printedLimits`, and the
entire `reference` sub-object (`skills`, `knowledgeSkills`, `qualities`,
`augmentations`, `gear`, `spells`, `complexForms`, `adeptPowers`, `programs`).

`notes` survives — it is a handful of short strings recording the book's own
arithmetic errors (X1–X7), not gear or skills, and it is what makes the PR 4
lieutenant's 10-vs-11 discrepancy visible rather than silent.

**Amendments to acceptance criteria:**
- Rules-spec criterion 5 → amended by D-X3 below (fourteen blocks, and only the
  attribute/initiative values, not "Limits, Armor, skill and gear values").
- Rules-spec criterion 23 (**"skills, gear, spells… stored as read-only
  GM-facing reference text"**) → **struck**. Nothing is stored.
- Rules-spec criterion 24 (printed Astral/Matrix Initiative lines stored
  verbatim and flagged) → **struck**. `printedAltInitiative` no longer exists.
  The PR 2 lieutenant's astral line and the PR 4 lieutenant's Matrix line are
  simply not imported; both templates import their meat-track Reaction and
  Intuition like every other block. X4 and X5 become notes-only, or are dropped.
- Implementation criterion **IA25 struck**; **IA13** narrowed to "no statblock
  field is written to `physicalHealth`/`stunHealth`"; **IA22** narrowed to the
  six imported values plus `statblockId`; **IA23** retained but now trivially
  satisfied.

**Consequences that remove risk, not add it:**
- The `GM_STATE_MAX_PAYLOAD_BYTES` 64 KB hazard (`server/gm-state-channel.js:22`,
  where an over-cap push sets `session.gmState = null` and destroys *all* GM
  reconnect state) is reduced to noise. The id-only recommendation stands anyway,
  since it costs nothing.
- The details-panel reference tab (affected-path item 35, open decision D6) is
  **not built**. D6 is moot.
- X8 (Strength-derived melee DV going stale on a Strength edit) is moot —
  Strength is never imported.
- Rules-dependency note: **I5** (drug effects, p. 411), **I13** (Toughness,
  Natural Hardening, Magician, Technomancer, Adept, Aspected Magician) and **X8**
  (Street Gear melee table) move from "parked as inert text" to **out of scope**.
  No rules pass is owed on any of them.

## D-X3. U8 / U10 — sample contacts: **NOT IMPORTED**

Verbatim: *"dont add contacts from the CRB, i just want the grunts that may be
in combat."*

Only the **fourteen** grunt and lieutenant blocks (PR 0–6, pp. 381–384) are
built. The eight contact blocks (pp. 390–392) are dropped.

**Amendments:**
- Rules-spec criterion 5 → "All **fourteen** sample grunt/lieutenant statblocks
  (pp. 381–384) are available as templates, with the Body, Willpower, Reaction,
  Intuition and Initiative Dice values transcribed above."
- Rules-spec criterion 6 → contacts clause dropped; every template has a
  Professional Rating 0–6.
- Rules-spec criterion 15 (imported contact carries printed Edge) → **struck**.
- Implementation criterion **IA12** → "`ALL_GRUNT_STATBLOCKS` has length 14";
  `ALL_CONTACT_STATBLOCKS` is **not created**.
- Affected-path item 22 (`src/Grunts/statblocks/contact-statblocks.ts`) is
  **not created**.
- **U8 and U10 are moot** and need no table ruling. The Edge-0 rule
  (RULINGS 2026-08-01) now covers every template without exception, so
  `participantEdgeRatings` is seeded 0 unconditionally.
- The contact table and skill lists earlier in this spec are retained as
  reference for a possible future request, clearly out of current scope.

## D-X4. `professionalRating` — retained as a GM-only label

With D-X1 removing the badge, `professionalRating` has no mechanical consumer.
It is retained anyway, alongside `label`, as GM-only identification so the GM can
see what a participant was created from.

- It is a short string/number, not gear or skills, so it does not violate D-X2.
- It rides `SharedGmParticipantState` only, **never** `SharedParticipantState`
  (U2 default, retained).
- It is **never** written into `participantEdgeRatings` (rules criterion 14,
  RULINGS 2026-08-01 — retained and now unconditional per D-X3).
- Recorded as an assumption for Xavier to veto; he was told explicitly.

## Decisions taking the recommended default

Unchanged and binding: **U1** (one line, at commit, typed name; none on open or
cancel), **U2** (statblock identity GM-only), **U3** (formula wins for Condition
Monitor; PR 4 lieutenant → 11 boxes with a note), **U4** (augmented by default,
base-values toggle), **U5** (statblock add defaults to a linked row with a member
count), **U6** (lieutenant never auto-added), **U7** (lieutenant beats his own
team on a tie, p. 381), **U12** (all add paths, not just grunts).

Implementation defaults retained: **D1** (Duplicate left alone; the
source-rename defect in `CombatManager.ts:252-255` recorded separately), **D2**
(plain participants and rows gain a join line, emitted from `commitAddDraft()`
only), **D3** (dialog offers Body/Willpower for a hand-built grunt), **D4**
(Tab-to-add preserved as-is, join line deferred until the name is first set),
**D5** (merged row takes the first grunt's imprint), **D7** (phasing — now two
phases, see below). **D6 is moot** per D-X2.

## Revised build

**Phase 1 — naming on add.** Unaffected by these decisions. Affected-path items
1–19 stand as written.

**Phase 2 — fourteen grunt statblocks.** Substantially reduced: fourteen blocks
of six numbers each (plus optional augmented overrides and a notes array),
`statblock-types.ts`, `grunt-statblocks.ts`, `index.ts`,
`statblock-instantiation.ts`, the picker in the add dialog, and the GM-only
`statblockId` round trip (affected-path items 20, 21, 23–34, minus 22 and 35).

**Phase 3 — reduced to U7 alone** (affected-path items 36–38). The badge is gone.
Contacts are gone. May ship with Phase 2 or after it.

## Still binding, unchanged by these decisions

Every rules constraint that survives: the Condition Monitor is always derived
from stored Body and Willpower and never written directly (criterion 10,
RULINGS 2026-08-04); one shared Initiative Test per row (criterion 12, p. 379);
late-entry arithmetic (criterion 13, p. 160); Edge 0 for ERIC (criterion 14);
no Condition Monitor maximums in any log (criterion 18, RULINGS 2026-08-13);
GM-only channel for statblock identity (criterion 19); snapshot survival
(criterion 20); alive-or-dead recording (criterion 21); full DV recorded past a
full track (criterion 22); Score ≤ 0 still buys a Free Action (criterion 25).
