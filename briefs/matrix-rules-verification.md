# Matrix Rules Verification — UNVERIFIED-RULES items 1-10

**Date:** 2026-08-27 · **Branch:** `feat/matrix-v2`

**Source:** SR5 Core Rulebook only (`rules/pages`, printed page = PDF page − 2).
Pages 477-491 are the Master Index, which cross-references books NOT in `rules/`
(Data Trails, Run & Gun, Rigger 5.0, Chrome Flesh, Street Grimoire, Run Faster).
Anything tracing to those is reported as "not found in indexed rules".

---

## Bucket A — CONFIRMED

| # | Claim | Page | Operative text |
|---|---|---|---|
| 1a | Cold-Sim VR init = Data Processing + Intuition, 3D6 | 159, 229, 231 | "In cold-sim VR, you use your Data Processing + Intuition as your Initiative, and you get +3D6 Initiative Dice" (p. 229) |
| 1b | Hot-Sim VR init = Data Processing + Intuition, 4D6 | 159, 230, 231 | p. 230; hot-sim also grants +2 dice to all Matrix actions |
| 2 | VR leaves the body limp/vulnerable | 229, 243 | "your body goes limp and your only sensory input comes from the Matrix" (p. 229). Mechanics are a gap — see C4 |
| 3a | Convergence at OS 40 | 232, 247 | 12 DV Matrix damage, forced persona reboot erasing all marks, dumped from Matrix (dumpshock if VR), physical location reported. Inside a host instead: host gets 3 marks on you and starts deploying IC (p. 247) |
| 5 | Marks capped at 3 per marker per icon | 236, 238, 240, 231 | "up to a maximum of three (unless you're an owner)". Owner = same as 4 marks. A host and all its IC SHARE one mark pool (p. 247) |
| 9 | Deck reconfig = Free Action swapping two Matrix attributes | 228, 164 | "only on your own Action Phase. This is not a Matrix action." Switch two attributes OR swap a program — not both |
| 10 | Noise is a per-roll dice pool modifier | 230, 231 | Distance term is target-relative, so recomputed per action per target. "Noise never applies to defense or resistance tests" |

### Additional confirmed facts the tracker needs

- **One Initiative Score, not two tracks.** VR *replaces* your Initiative Attribute and dice; it does not add a second participant (pp. 159, 160, 229, 243).
- **Mid-turn init changes:** attribute change = signed delta to current Score; dice gained/lost are rolled immediately and added/subtracted (p. 160).
- **Full Matrix Defense:** −10 Initiative Score, rest of Combat Turn, interrupt action (p. 240).
- **OS ticks +2D6 every 15 minutes**, rolled secretly by GM (p. 232).
- **Reboot resets OS to zero** and erases all marks, yours and others' on you; device returns at end of following Combat Turn (pp. 232, 242).
- **Jack Out** is a Simple action, reboots your device, dumpshock if in VR; defense pool applies only if link-locked (p. 240).
- **Dumpshock:** 6S cold-sim / 6P hot-sim, resist Willpower + Firewall; plus −2 dice on all actions for (10 − Willpower) minutes. Bricked deck = no Firewall, resist with Willpower alone (p. 229).
- **Link-lock:** cannot Switch Interface Mode, Enter/Exit Host, or Reboot own device; escape only via successful Jack Out (p. 229). Applied by Black IC, Blaster IC, Tar Baby IC (pp. 248-249) and the Lockdown program (p. 246).
- **IC spawn cadence:** one IC per Combat Turn, at the beginning of the turn; host may run up to its Rating in IC at once; no more than one of each type at once; crashed IC can relaunch next turn (p. 247).
- **IC never generates OS** — always considered legal. Nor do G-men, spiders, GOD-sanctioned users (pp. 232, 248).
- **OS is per-persona.** Sprites get their own on compile (p. 254). Nothing aggregates across a team.
- **Running silent:** Simple Action to enable; −2 dice to all your Matrix actions while silent. Finding one needs a hit establishing presence, then Opposed Computer + Intuition [Data Processing] v. Logic + Sleaze; tie or defender win = stays hidden. Multiple silent icons: "pick randomly which one you're going to look at" (pp. 235, 236, 241).
- **Spotting persistence:** once spotted you keep spotting even if target goes silent; lost only if it succeeds at Hide against you, or reboots/jacks out. You always spot icons you have a mark on, any range, no test. You cannot Hide from an icon that has a mark on you (pp. 235, 240).
- **Direct connection:** ignore all noise and grid/public-grid modifiers. A slaved device attacked via direct connection cannot use its master's ratings to defend. A mark on a slave gives a mark on the master, even via direct connection. In a WAN host you count as directly connected to all WAN devices; in a WAN the master must be a host (pp. 232, 233).
- **Grid penalties:** −2 acting against a target on another grid (not inside a host); −2 for public grid, even in a host. They stack (pp. 233, 234).
- **Wireless cutoff:** situational Noise (excluding distance) exceeding an item's Device Rating temporarily kills its wireless. Turning wireless off is a Free Action (p. 421).
- **Failure consequences:** failed Sleaze = target gets one free mark on you and immediately informs owner / host launches IC. Failed Attack = 1 unresisted box of Matrix damage per net hit the defender scored. Successful Attack makes the target aware it is under attack but does not reveal you; successful Sleaze does not increase visibility (pp. 231, 236).

---

## Bucket B — CONTRADICTED / WRONG

**Any code built against these four is wrong.**

| # | Claim | What the book actually says | Page |
|---|---|---|---|
| 1c | "AR = DP + INT, 1d6" | **AR does not use Data Processing at all and is not fixed at 1D6.** "Matrix: AR / **Reaction + Intuition** / 1D6" (p. 159). "When in AR, you use your **normal Initiative and Initiative Dice**" (p. 229). User Modes Table: "Augmented Reality / Physical Initiative / Physical Initiative Dice" (p. 231). A decker with Wired Reflexes 2 rolls **3D6** in AR, not 1D6. **Do not special-case AR — it is just meat initiative.** AR also carries an optional GM −2 to Perception for noticing physical surroundings, and AR users take **no** biofeedback damage (p. 229) | 159, 229, 231 |
| 3b | "IC Alert at OS 20" | **No such rule exists in the CRB.** There is exactly one OS threshold: 40. Hosts launch IC when they *spot* you doing something unauthorized (p. 247) or when you *fail* a Sleaze action (pp. 231, 236) — never as a function of OS. All 32 occurrences of "Overwatch" checked; Master Index lists only "SR5 231, 232" plus DT 111 (not in `rules/`) | 232, 236, 247 |
| 4a | "IC dice pool = 2 (Patrol) or 4 (other)" | **"IC rolls the Host rating × 2 for any attacks, limited by the Host's Attack rating."** A Rating 6 host's Killer IC rolls **12 dice, not 4**. Attack is a Complex Action. Resistance pool varies by IC type (Willpower + Firewall for Acid/Marker/Scramble/Track; Intuition + Firewall for Black IC/Killer/Crash/Probe; Logic + Firewall for Blaster/Tar Baby; Willpower + Data Processing for Binder; Willpower + Attack for Jammer). **Patrol IC's entry is literally "Attack: n/a"** — no attack at all; it runs Matrix Perception and shares results with the host. Failed IC attack damages the IC, except Patrol | 247, 248-249 |
| 4b | "IC initiative = host rating × 2" | The book gives IC an Initiative Score and **4D6** Initiative Dice but **never states the Initiative Attribute**. "IC uses the Matrix attributes of its host." IC has no Intuition, so DP + Intuition can't apply. Host Rating × 2 appears only as the IC *attack pool*, on the adjacent paragraph — this looks like a transcription slip. **Real hole → C2** | 247 |
| 6 | "Hack on the Fly = +2 OS per mark on success" | **"When you perform an Attack or Sleaze action, your OS increases by the number of hits the target gets on its defense test."** One rule, every illegal action. Wrong quantity, wrong trigger, wrong direction: OS is driven by the **defender's hits**, accrues on **failure as well as success**, and has nothing to do with marks placed. Declaring extra marks costs **dice** (−4 for two, −10 for three), not OS. Worked example p. 232: Brute Force 4 hits vs 2 → OS 2; Crack File 4 hits vs 3 → OS 5. HotF is a Sleaze action: Hacking + Logic [Sleaze] v. Intuition + Firewall | 232, 240, 244 |
| 7 | "Brute Force = OS marks × 4" | Same rule as above. Brute Force is an Attack action: Cybercombat + Logic [Attack] v. Willpower + Firewall. Marks-scaling costs are dice penalties (−4 / −10). Optional damage rider: 1 DV Matrix damage per two full net hits. None of it touches OS | 232, 238, 244 |
| 8 | "Direct Connection = 1 free mark on host, 0 OS" | Direct connection grants **no marks**. It grants: ignore all noise, ignore grid/public-grid modifiers (p. 232); slaved device cannot borrow master's ratings to defend (p. 233); a mark you *earn* on a slave propagates to the master (p. 233). You still must succeed at Brute Force or Hack on the Fly, and those generate OS normally. The real benefit: the defender's pool is the weak device's ratings instead of the host's, plus zero noise. GM chapter states the tactic plainly (p. 355) | 232, 233, 355 |

### Two printed errors the implementer will hit

- **Matrix Actions by Function table (p. 244) lists Crash Program and Data Spike as "Simple."** Their own entries (pp. 238, 239) and the ATTACK column of the *same table on the same page* say **Complex**. Layout error; Complex is correct.
- **The only Matrix-capable NPC stat block in the CRB is internally wrong.** The Organized Crime gang technomancer lieutenant (p. 383) prints "Matrix Initiative 9 + 3D6 (Hot Sim)" with Logic 5 / Intuition 5. Per the Living Persona table (p. 251) her DP = Logic = 5, so hot-sim should be **10 + 4D6**. **Do not use published stat blocks as a test oracle.** There is also **no security spider stat block anywhere in the CRB** (p. 356 describes them narratively only). Cross-references are unreliable: p. 100 points to "Matrix Initiative (p. 313)"; p. 313 is the Assensing Table.

---

## Bucket C — CRB silent or ambiguous: rulings needed

Nothing below has been filled in. Each needs Xavier's decision, then a `RULINGS.md`
entry noting "CRB is silent, p. NNN is the nearest text".

**BLOCKING (tracker cannot place a row without these): C2, C4, C11, C12.**

### C1. Any OS threshold below 40?

Book: one threshold, 40 (p. 232); +2D6/15min; GM keeps OS secret — player learns it via Check Overwatch Score (Simple, Electronic Warfare + Logic [Sleaze] v. 6 dice; itself a Sleaze action so it raises your own OS, p. 238) or the Baby Monitor program (constant awareness, p. 245). Book does NOT define any intermediate threshold or "alert level"; IC launches are host-detection-driven, not OS-driven.

Options: (1) By the book, one threshold at 40, IC launches manual/failed-Sleaze. (2) House "heat" threshold at OS 20 flagging the host alerted and auto-starting IC cadence — invention, deadlier, double-counts with failed-Sleaze. (3) **Display-only banding** (green <15, amber 15-29, red 30+), no mechanical effect — table tension, zero rules drift. *Analyst preference: 3.*

Master Index points to DT 111 (Data Trails) for more.

### C2. What is IC's Initiative Attribute? — BLOCKING

Book: IC has own Initiative Score and 4D6 (treated as hot-sim); "IC uses the Matrix attributes of its host" (p. 247). Host Matrix attributes = Rating, +1, +2, +3 in any order. Book never gives the base number. Hot-sim formula needs Intuition; IC has no Mental attributes. The p. 237 "Device Rating stands in for missing Mental attributes" rule is written for *defense tests*, and IC isn't a device.

Options: (1) **Host Rating × 2 + 4D6** — simple, sane numbers (R6 → 12+4D6, avg 26), but not in the book and suspiciously identical to the adjacent IC attack pool. (2) **Host DP + Host Rating + 4D6** — most principled reading of "uses the Matrix attributes of its host" + p. 237; varies with the GM's host array. (3) **Host Rating + 4D6** — slower IC, more forgiving hosts.

Surface as an editable per-IC field regardless.

### C3. What does Patrol IC roll for Matrix Perception?

Book: Patrol "has no attack, but it shares its information with its parent host"; scans marks and looks for illegal activity using Matrix Perception on all targets in the host (p. 248). Matrix Perception = Computer + Intuition [Data Processing] (p. 241). The Host Rating × 2 rule is scoped to **attacks** (p. 247). Book doesn't say whether it extends to non-attack actions, what limit applies, or whether "all targets" is one roll or one per target.

Options: (1) Host Rating × 2 [Data Processing], one Opposed test per target per Complex Action — consistent, correctly limited, but scanning 4 PCs takes 4 turns. (2) One roll compared against every silent icon per Complex Action — matches "all targets" literally, keeps hosts dangerous, but overrides the "pick randomly" rule (p. 236) inside hosts. (3) One target per Combat Turn, GM's choice — dramatic clock rather than dice engine.

### C4. What does "PHYS LOCKED" actually do? — BLOCKING

Book: body limp, meat senses blocked (p. 229). In the *Matrix*, an unconscious VR user can't defend. General combat: "Defender unaware of attack — No defense possible. Treat as a Success Test" (p. 189); prone = −2, not applied vs ranged unless attacker within 5m. Book says only "don't do it somewhere dangerous" (p. 243). It NEVER says whether a VR user is mechanically unaware of a *physical* attack, gets a defense test, counts as prone, can be woken, or what happens if the body is moved/restrained/datajack-yanked. The Rigger chapter is equally silent.

Options: (1) **Unaware of attack — no defense possible (p. 189)**, and not in the physical initiative order. Harshest, simplest, matches fiction; one guard with a pistol ends the decker. (2) Defends at full Reaction + Intuition but cannot act — softer, hard to justify against "meat senses are blocked". (3) Defends at Reaction + Intuition −2 (prone/helpless), does not act; being hit forces Willpower + Firewall or auto-switch to AR — invented middle path, makes the badge mean something.

**Sub-question either way: can a VR character be in the physical initiative order at all?** Per p. 160, no — VR *replaces* the initiative type. A separately targetable body is a UI concept (inert token), not a second initiative entry.

### C5. Do physical Initiative Dice enhancements stack onto VR's 3D6/4D6?

Book: chart calls 3D6/4D6 the "**Base** Initiative Dice" (p. 159); body text says "**+3D6**… (remember that any enhancements or bonuses cannot take you past the maximum of 5D6)" (p. 229) and "+4D6" (p. 230). 5D6 cap is universal. The p. 102 sample decker has no augmentation line, settling nothing.

Options: (1) **Enhancements stack, capped 5D6** — most literal reading of p. 229's parenthetical, which only makes sense if enhancements can apply. (2) **VR dice fixed at 3D6/4D6; meat 'ware does nothing in VR** — matches the "Base" column heading; cleaner to implement; stops deckers needing to also be sammies. (3) Only Matrix-side enhancements stack — future-proof, today identical to (2).

Decides whether mode-switch is "roll +3D6" or "recompute total, roll the difference".

### C6. Is the two-turn reboot OS-reset loop legal?

Book: Reboot Device resets OS to zero and erases all marks; device returns end of following Combat Turn (p. 242). Fresh boot = clean slate (p. 232). "Hackers, by contrast, reboot regularly to avoid detection by GOD" (p. 236). Book defines NO cooldown, minimum offline duration, residual OS, or cycling penalty. RAW: at OS 38, Reboot (Complex), sit out ~2 turns, return at OS 0 with a fresh 15-min timer, losing only marks.

Options: (1) **By the book, no cooldown** — losing all marks is a real mid-infiltration cost, so less broken at the table than it reads. (2) Reboot resets OS but GM re-rolls a starting 2D6 for carried-over suspicion. (3) Reset only if offline a full minute (20 Combat Turns) — makes reboot a strategic retreat, probably the design intent, but needs an off-clock timer.

Matters because OS is the *only* pressure mechanic in the chapter.

### C7. Do agents have an Overwatch Score?

Book: sprites explicitly get their own OS on compile (p. 254); IC/G-men/spiders never accrue OS (pp. 232, 248). Agents have their own persona and icon, use the Matrix attributes of the device they run on, share the host device's Matrix Condition Monitor (p. 246). Book never says whether agents accrue OS, or to whom.

Options: (1) Own separate OS, by analogy with sprites — makes agents a disposable OS sponge; needs a second meter. (2) Agent actions add to the owner's OS — closes the proxy loophole hardest. (3) Own OS, and convergence on an agent crashes it and reports the deck's location — mirrors the sprite rule (p. 254).

### C8. How does Noise work inside and toward a host?

Book: "there is no 'physical' distance to any host in the Matrix. You can always spot a host from anywhere on the planet without a test" (p. 235). Noise table distance rows are all "PHYSICAL DISTANCE TO TARGET" (p. 231). Grid penalties explicitly do NOT apply inside a host (p. 233). In a WAN host you count as directly connected to all WAN devices, and direct connection zeroes noise (pp. 232, 233). Book never states distance-noise to a host is zero, whether your body's spam/static zone follows you in, or whether noise applies between two icons inside the same host.

Options: (1) **Inside a host, noise = 0, full stop** — clean, consistent with "no physical distance"; devalues static zones. (2) **Distance-noise = 0 but situational noise at your physical location still applies** (spam, jamming, Faraday, wireless negation) — most defensible; the book makes exactly this point about spotting range being measured from your physical location (p. 235); **the only option that keeps Jam Signals (p. 240) and jammers (p. 268) useful against a decker already in a host**. (3) Normal noise by distance to the host's facility — contradicts p. 235, avoid.

Swing of up to 6 dice per roll in a Rating 6 static zone.

### C9. How does a link-lock end other than by jacking out?

Book: locker "send[s] keep-alive signals to your deck… that force it to cancel any attempt to leave" (p. 229). Escape via successful Jack Out; if multiple lockers, beat each individually with a single roll (p. 240). Lockdown program holds "until you stop running this program or they successfully Jack Out" (p. 246). Book never says what happens when the locking icon is bricked, crashes, jacks out, or leaves the host.

Options: (1) **Ends when the locking icon stops running** — follows the keep-alive fiction (no sender, no signal); makes cybercombat vs Black IC a viable escape; strongly implied by the Lockdown wording. (2) Persists until Jack Out regardless — deadlier, matches Black IC flavour, no textual support, makes killing the IC pointless. (3) Option 1 plus: if the host has 3 marks on you it maintains the lock after the individual IC dies — consistent with host/IC shared marks (p. 247); more state.

### C10. Does dumpshock's −2 affect Initiative Score?

Book: "−2 dice pool modifier on **all of your actions** for (10 − Willpower) minutes" (p. 229). Separately, wound modifiers ARE applied directly to the Initiative attribute, immediately, and can change order within the same pass (p. 160). The 6S/6P damage generates wound modifiers normally. Book never labels whether the disorientation −2 is dice-pool-only.

Options: (1) **Dice pools only; Initiative untouched by the −2** (wound modifiers from the damage still hit Initiative) — literal reading, avoids double-dipping. *Analyst recommended default.* (2) Applies to Initiative too — harsher, stacks with wound mod for −5 or worse on one event. (3) Applies to Initiative once, on the pass the dump occurs, then dice only.

### C11. When does a host notice you, and how often does it roll? — BLOCKING

Book: "When a host spots you doing something unauthorized… it informs its owner… and launches whatever IC programs it has" (p. 247). Failed Sleaze = free mark + immediate spot + owner alert + IC launch (p. 236). Successful Attack makes the target aware but doesn't spot you — "It will most likely actively search for you on its next action" (p. 236). Host and IC instantly share spotting info (p. 247). But hosts have **no Initiative Score and no Matrix Condition Monitor, and cannot be attacked with Matrix damage** (p. 229 — *corrected 2026-08-29; this was originally mis-cited to p. 228, and stated too broadly. Hosts CAN be targeted: Brute Force and Hack on the Fly work on them for marks, pp. 238/240, and a host defends Edit File tests for files it holds, p. 239. What p. 229 rules out is Matrix damage, which is why they have no damage track*), and are never listed as combat participants — yet p. 236 implies the host has actions.

Options: (1) **Host is not an initiative participant; all host perception happens through its IC on the IC's initiative** — cleanest data model, consistent with hosts having no Initiative Score; a host with no Patrol IC is effectively blind until you fail a Sleaze. (2) Host gets one Matrix Perception per Combat Turn at Initiative Score 0, Host Rating × 2 [Data Processing] — baseline awareness, predictable clock, costs a participant row, invented. (3) Host is not a participant, but a successful Attack against a host icon triggers one free host Matrix Perception immediately — event-driven, matches p. 236's language most closely.

**This is an architectural decision: is "Host" a row in the initiative order?**

### C12. Where does newly launched IC sit in the initiative order? — BLOCKING

Book: host launches IC "at the beginning of each Combat Turn" (p. 247). General join-in-progress rule: "roll for Initiative Score as normal and then subtract 10 for each Initiative Pass that has already occurred" (p. 160). Book never reconciles the two.

Options: (1) **IC launched at turn start rolls initiative normally in Step 1 and acts that turn** — plain reading of p. 247, simplest (IC joins the roll queue), hosts escalate fast, which is the stated design intent ("Once the host starts to launch IC, it's time to finish up and buzz out of there"). (2) Rolls normally but with the p. 160 mid-combat −10/pass if the launch resolves after pass 1 started — more consistent for edge cases, needs elapsed-pass count at spawn. (3) IC always acts on its second Combat Turn — gives a warning shot, unsupported.

Life-or-death difference for the decker.

### C13. Does a mark on a slaved device count against the 3-mark cap on the master?

Book: "if you get a mark on a slave you also get a mark on the master. This happens even if the slave was marked through a direct connection… This doesn't work both ways" (p. 233). In a WAN the master must be a host. Cap is 3 per icon (p. 236). Book never says whether the propagated mark counts toward the cap, what happens at 3, whether the master is *alerted* by propagation, or whether propagation chains (device → RCC → host).

Options: (1) **Counts normally; 3 device hacks = 3 host marks; host alerted by the original action only** — makes the signature decker play powerful and rewarding, as the GM chapter's prominence suggests (p. 355); simplest. (2) Counts, and each propagation gives the host a chance to notice — viable but not free; a GM decision per hack. (3) Propagated marks grant host *access* but never stack to the 3 needed for Reboot/Format Device — preserves hosts as hard targets, hardest to justify, inconsistent mark model.

This is the entire economics of direct-connecting to a slaved camera to get into a host.

### C14. Is the Matrix Actions list exhaustive for what marks allow?

Book: each action lists its mark requirement — 0 (Brute Force, Hack on the Fly, Data Spike, Hide, Check Overwatch Score, Grid Hop, Matrix Perception, Matrix Search, Jam Signals, Disarm Data Bomb, Erase Matrix Signature), 1 (Crack File, Crash Program, Edit File, Enter/Exit Host, Set Data Bomb, Snoop, Spoof Command), 2 (Trace Icon), 3 (Format Device, Reboot Device, Jump Into Rigged Device, Erase Mark), Owner (Change Icon, Full Matrix Defense, Invite Mark, Jack Out, Switch Interface Mode). Control Device scales: 1 mark Free, 2 Simple, 3 Standard/Complex (p. 238). Owner = 4 marks. Book explicitly invites improvisation (p. 237) but gives no general mark ladder outside Control Device.

Options: (1) **Closed table** — accurate, verifiable, no invention. *Analyst recommended default.* (2) Closed table plus the Control Device ladder generalised as house guidance for improvised actions — low-risk. (3) Free-text notes per mark — max flexibility, zero help.

---

## Not found at all in `rules/`

- Any OS threshold other than 40 (all 32 "Overwatch" hits checked; Master Index lists only SR5 231-232 + DT 111)
- An Initiative Attribute (base number) for IC
- A dice pool for Patrol IC's Matrix Perception
- Any security spider stat block (narrative only, pp. 356, 358)
- Any mechanical treatment of a VR user's meat body under physical attack
- Any noise rule specific to hosts
- Any rule for a link-lock ending because the locker died or left
- Whether agents accrue Overwatch Score
- Any host "alert level" / "security tier" concept (only binary Security Response, p. 247)
- Data Trails, Rigger 5.0, Chrome Flesh, Street Grimoire, Run & Gun, Run Faster — referenced by the Master Index, none of their text is in `rules/`. The index flags expanded treatment in **Data Trails** for OS (DT 111), dumpshock/link-locking (DT 180), and noise (DT 169-170). Checking there would likely settle C1, C6, C8, C9 from a published source rather than from the table.

---

## Disposition of `docs/UNVERIFIED-RULES.md` items 1-10

Once the rulings are made:

- **Move out with citations as written:** 5, 9, 10
- **Move out in corrected form:** 1 (AR half is wrong), 2 (state confirmed, mechanics → C4), 3 (40 confirmed, OS-20 deleted)
- **DELETE and replace — actively wrong:** 4, 6, 7, 8
