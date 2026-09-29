# GM screen overhaul

Status: ready-for-agent
From: planning and grilling sessions, 2026-09-18 to 2026-09-28
Mockup: https://claude.ai/artifact/UXxuMHwQNZ9EV9N8BqnMzV (matches this spec except
the points marked "not in the mockup" below)

## Problem Statement

The GM screen grew one module at a time: Matrix, decks, astral, grunt groups,
the action log, the dice roller, player rooms, and the initiative-rolling
prompts. Now everything is on screen at once, and the initiative tracker at the
centre of it is getting lost.

- Opening things pushes the initiative list around. The Matrix run panel opens
  above the list, and the Deck, Awakened and Group panels drop open under their
  row.
- Every row carries set-up tools (stat boxes, Duplicate, Delete, claim setting)
  next to the controls used every turn.
- The action log and dice roller sit below the list and scroll out of sight
  during a long fight.
- The details column appears whenever a row is clicked, squeezes the list, and
  can't be closed.

On a laptop at the table, the GM spends attention hunting for the initiative
order instead of running the fight.

## Solution

The GM screen is reorganised into fixed areas. The initiative flow is always
visible, and everything else opens on demand in one right-hand slot.

- **Top bar** (always visible): round status (Combat Turn, Initiative Pass,
  current Initiative), the round buttons, a Matrix button, the room code, Copy
  player link, and a room menu (⋯) holding Join another room, Close room and
  End room.
- **Warning area** (always visible, under the top bar): the existing
  roll/turn warning lines, stacked.
- **Rolls-owed bar** (above the initiative list): one bar replacing both the
  between-turns Prep card and the mid-combat Pending Rolls card.
- **Initiative list** (always visible): slimmer rows carrying only what's used
  every turn, plus a row menu (⋯) for occasional actions.
- **Participant panel** (right-hand slot, on demand): one participant's
  Condition, Stats, Deck, Awakened or Group details, as tabs.
- **Matrix panel** (the same right-hand slot, wide): the existing Matrix run
  panel.
- **Bottom strip** (always visible): the action log and the dice roller,
  collapsible to one line.

**Ground rule:** every step only *moves* controls. It never changes what they
do. A behaviour difference after a step is a defect. There is one named
exception: merging grunts now starts from the row menu (see user stories
46–50).

## User Stories

### Top bar and warning area

1. As a GM, I want the Combat Turn, Initiative Pass and current Initiative
   always visible at the top, so that I know where we are in the fight without
   scrolling.
2. As a GM, I want the round buttons (Start / Next Initiative Pass / End Combat
   Turn / End Combat) in the top bar, so that advancing the fight is always one
   click away.
3. As a GM, I want the room code and Copy player link in the top bar, so that
   I can get a late player in without hunting.
4. As a GM, I want Join another room, Close room and End room tucked into a
   room menu, so that I can't hit End room by accident mid-fight.
5. As a GM, I want a Matrix button in the top bar, so that I can open the
   Matrix panel from anywhere.
6. As a GM, I want the Matrix button to show how many "Overwatch owed"
   reminders are waiting (e.g. "Matrix 2"), so that I know one is waiting even
   with the Matrix panel closed.
7. As a GM, I want the warning lines (the pass ending while a roll is owed,
   nobody able to act, roll status, why the Act window closed) stacked in one
   area under the top bar, so that anything stopping someone from acting is
   always in view.
8. As a GM, I want the warning area to take no space when there's nothing to
   warn about, so that the list gets the room.

### Rolls-owed bar

9. As a GM, I want one rolls-owed bar that appears whenever any participant
   still owes an Initiative roll, so that I have one place to chase rolls
   whether it's between turns or someone has joined mid-turn.
10. As a GM, I want the bar to say how many are owed and who, and who has been
    asked, so that I know who to nudge.
11. As a GM, I want Request player rolls, Roll remaining NPCs and Force roll
    outstanding on the bar, so that I can settle the rolls from there.
12. As a GM, I want Begin Combat Turn on the bar only between turns, so that
    it's there when I need it and absent mid-turn, where it would mean nothing.
13. As a GM, I want the bar to disappear once nobody owes a roll, so that it
    doesn't take space.

### Initiative list rows

14. As a GM, I want each row to show the Initiative Score, the participant's
    name and their badge (GROUP / GRUNT / LIEUTENANT), so that I can read the
    order at a glance.
15. As a GM, I want the roll box and die button on the row, so that I can
    type or roll Initiative every turn without opening anything.
16. As a GM, I want the "Ask this player to roll" button and the Needs roll /
    Asked tag on the row, so that I can see and chase a missing roll in place.
17. As a GM, I want Act, Delay and Defend (Interrupt) on the row, so that the
    turn's actions are one click away.
18. As a GM, I want Deck, Awakened and Group buttons on the row, so that I can
    reach those details for a specific participant directly.
19. As a GM, I want the Interrupt Actions taken this turn and "Astral
    projecting" shown as small tags beside the name, so that I can see them
    without the row growing a second line.
20. As a GM, I want the Claimed / release-claim button to stay on the row as
    today, so that I can free a character a player claimed by mistake without
    opening a menu.
21. As a GM, I want the acting participant's row clearly highlighted, so that
    I never lose track of whose turn it is.
22. As a GM, I want clicking empty space on a row to only highlight it, so
    that a stray click never opens or changes a panel.
23. As a GM, I want nothing to drop open under a row, so that the list never
    jumps while I'm reading it.
24. As a GM, I want Edge, Reaction, Intuition and Initiative Dice off the row,
    so that set-up values don't crowd the controls I use every turn.

### Row menu

25. As a GM, I want a row menu (⋯) on each row, so that occasional actions
    stay close to the participant without cluttering the row.
26. As a GM, I want Seize the Initiative in the row menu, offered only when
    today's rules allow it, so that the rare Edge spend is reachable without
    sitting on nearly every row.
27. As a GM, I want Duplicate in the row menu, so that I can copy a
    participant.
28. As a GM, I want Enter combat / Leave combat in the row menu, so that I can
    take someone out of the order without deleting them.
29. As a GM, I want the player-claim setting in the row menu, so that I can
    control which characters players can claim.
30. As a GM, I want Delete in the row menu, asking for confirmation exactly as
    today, so that removal stays deliberate.

### Participant panel

31. As a GM, I want clicking a participant's name to open their participant
    panel, so that their details are one deliberate click away.
32. As a GM, I want the Deck, Awakened and Group row buttons to open the
    participant panel on that tab, so that each button goes straight to what I
    asked for.
33. As a GM, I want a character's or grunt's panel to have Condition, Stats,
    Deck and Awakened tabs, so that all their details live in one place.
34. As a GM, I want a grunt group's panel to have Group and Stats tabs and no
    Condition tab, so that I never see a meaningless shared Condition Monitor
    for a group.
35. As a GM, I want the Condition tab to behave exactly as the current
    Condition Monitor does (two tracks for characters; one combined track plus
    DV, Physical, Stun, Heal, Body and Willpower for grunts), so that nothing
    about damage changes.
36. As a GM, I want the Stats tab to hold Edge, Reaction, Intuition,
    Initiative Dice and the existing stats (Lieutenant of, Overflow, Physical
    and Stun Health, Pain Tolerance, Ignore Pain), so that all set-up values
    are together.
37. As a GM, I want the Deck tab to hold everything the Deck panel holds today
    (enable/remove deck, deck stats, AR / Cold Sim / Hot Sim, Jack In/Out,
    Switch Mode, the VR and OS chips), so that nothing is lost in the move.
38. As a GM, I want the Awakened tab to hold everything the Awakened panel
    holds today (enable/remove Awakened, astral project / return to body), so
    that nothing is lost in the move.
39. As a GM, I want the Group tab to hold everything the grunt group panel
    holds today (members, each member's Act/Acted, name, name suggestion, Body,
    Willpower, Condition Monitor, DV, Physical/Stun/Heal, Detach, Remove, and
    Add NPC), so that nothing is lost in the move.
40. As a GM, I want the panel to show which participant it's for, and to
    close with its × or the Escape key, so that I can dismiss it instantly.
41. As a GM, I want the list to narrow beside the open panel rather than be
    covered, so that I can keep pressing Act and Delay while the panel is open.
42. As a GM, I want the panel to stay on the participant I opened when the
    turn moves on, so that it never changes under my mouse.
43. As a GM, I want adding a character or grunt to open their panel on the
    Stats tab, so that I can type in their stats straight away now that the
    stat boxes aren't on the row.
44. As a GM, I want deleting the participant whose panel is open to close the
    panel, so that I'm never looking at someone who's gone.
45. As a GM, I want Leave combat to keep their panel open, so that I can still
    edit someone sitting out.

### Merging grunts (the one named exception)

46. As a GM, I want "Merge into a group…" in a lone grunt's row menu, so that
    merging is available without tick boxes sitting on every grunt row.
47. As a GM, I want choosing it to show tick boxes only on lone grunts, with
    the one I started from already ticked, so that I can pick the others.
48. As a GM, I want a bar at the top of the list reading "Merge N into a Grunt
    Group" with a Cancel button while I'm picking, so that I can see and finish
    or abandon the merge.
49. As a GM, I want merging or cancelling to end the picking and remove the
    tick boxes, so that the rows go back to normal.
50. As a GM, I want the merge itself to behave exactly as it does today, so
    that only how I start it has changed.

### Matrix panel

51. As a GM, I want the Matrix panel to open wide from the right, covering
    most of the screen, so that the Matrix map and host tree are readable.
52. As a GM, I want a strip of the initiative list to stay visible beside the
    Matrix panel, so that I don't lose the order while running the Matrix.
53. As a GM, I want the Matrix panel to hold the existing Matrix run panel
    unchanged, so that nothing about running the Matrix changes.
54. As a GM, I want the "Overwatch owed" reminders inside the Matrix panel,
    each with its own ×, so that Matrix reminders stay with the Matrix.
55. As a GM, I want opening a participant panel to close the Matrix panel, and
    opening the Matrix panel to close the participant panel, so that the right
    side only ever shows one thing.
56. As a GM, I want a reminder never to open the Matrix panel by itself, so
    that panels only open when I ask.
57. As a GM, I want the Matrix panel to close with its × or the Escape key,
    so that it's as easy to dismiss as the participant panel.

### Bottom strip

58. As a GM, I want the action log always visible along the bottom, so that
    what just happened never scrolls away.
59. As a GM, I want the dice roller (including Roll as, and the GM-rolls
    visible/hidden toggles) always visible beside the log, so that I can roll
    at any moment.
60. As a GM, I want to shrink the bottom strip to one line showing the latest
    log entry, and expand it again, so that on a laptop the list can have the
    room when I need it.
61. As a GM, I want the log's existing features (shared log badges, "+
    narration", retained-hidden banner) to work exactly as today in the strip,
    so that nothing about the log changes.

### Remembering after a refresh

62. As a GM, I want the screen to remember which panel was open (the
    participant and tab, or the Matrix panel) after a refresh, so that a
    reload mid-fight puts me back where I was.
63. As a GM, I want the screen to remember whether the bottom strip was
    shrunk, so that my layout choice sticks.
64. As a GM, I want a remembered panel for a participant who no longer exists
    to simply stay closed, with no message, so that a stale memory never gets
    in the way.
65. As a GM on a browser that blocks storage, I want the screen to work
    normally and just start with everything closed, so that storage settings
    never break the app.

### Unchanged

66. As a GM, I want Declare Actions to stay a centred pop-up, so that
    declaring works exactly as today.
67. As a GM, I want the add pop-up, the convergence alert and every other
    pop-up unchanged, so that only the layout moves.
68. As a player, I want the player view completely unchanged by this
    overhaul, so that nothing I rely on moves.
69. As a GM on a big monitor, I want the same layout with more room, so that
    nothing behaves differently on a larger screen.

## Implementation Decisions

- **Order of work.** Each step is its own to-do item, built and approved
  separately, and each keeps the app shippable:
  1. Participant panel frame, with the Condition and Stats tabs. Edge,
     Reaction, Intuition and Initiative Dice move off the row. Clicking the
     row only highlights it; the name opens the panel. The panel opens on
     Stats when a participant is added, closes on × / Escape / delete, and is
     remembered after a refresh. This replaces the current details column.
  2. Bottom strip: log and dice pinned at the bottom, collapsible, and the
     collapse remembered.
  3. Deck, Awakened and Group tabs replace the under-row panels. The row
     buttons open the panel on their tab. Status tags move beside the name.
  4. Row menu: Seize, Duplicate, Enter/Leave, claim setting, Delete, and
     "Merge into a group…" with the merge picking flow. (Release claim stays
     on the row.)
  5. Matrix panel: wide, sharing one slot with the participant panel,
     remembered after a refresh. It holds the Overwatch reminders, and the
     Matrix button shows their count.
  6. Top bar, warning area, and the rolls-owed bar merge.
- **Where the panel lives.** The slide-in panel is built inside the GM screen
  itself, not with the page toolkit's ready-made slide-out panel. That one
  blocks the page behind it, and the list must stay clickable while a panel is
  open.
- **One right-hand slot.** The open panel is a single piece of screen state:
  nothing, a participant panel (which participant and which tab), or the
  Matrix panel. Opening one replaces the other.
- **Remembering.** The slot state and the strip's collapsed state are saved in
  the GM's own browser. A participant is remembered by an identity that
  survives a reload. Reading or writing that storage never fails loudly:
  blocked, empty or unreadable storage means "nothing open, strip expanded".
- **Tabs per participant.** A grunt group gets Group and Stats. Every other
  participant gets Condition, Stats, Deck and Awakened. The Deck and Awakened
  tabs show "enable" when not set up, exactly as the under-row panels do today.
- **Controls move, logic stays.** Every moved control calls the same actions
  as today, with the same enable/disable and visibility rules. That includes
  Seize's rule: offered only once the participant has rolled and hasn't
  seized, which also satisfies the "refuse Seize before rolling" decision.
- **The merge exception.** Only how the merge is *started* changes: a picking
  mode begun from a lone grunt's row menu, with the starting grunt pre-ticked
  and a Merge / Cancel bar at the top of the list. What merging does is
  unchanged.
- **Product decisions respected.** There is still exactly one dice roller, in
  the bottom strip; the Matrix panel gets none (one dice roller). Nothing new
  is written in the log, and Condition Monitor sizes stay out of it (no
  monitor maximums in the log). No values are made up for new participants
  (never a made-up number). There is no undo (no undo).
- **Laptop first.** The layout is designed for about 1366×768 and must work
  there with the participant panel open. A big monitor just gets more room.
- **Names.** Use the glossary's terms throughout: top bar, warning area,
  rolls-owed bar, initiative list, row menu, participant panel, Matrix panel,
  bottom strip, participant, Awakened.

## Testing Decisions

- **One place to test from: the whole GM screen.** Tests build the full GM
  screen, act on it the way a GM does (click a name, a row menu item, a tab,
  the Matrix button, ×, Escape, Shrink), and check what's on screen. No tests
  of the screen's inner workings. Good tests describe what the GM sees and
  does, so they survive the inside being rearranged.
- **Remembering after a refresh** is tested by building the screen, opening a
  panel or shrinking the strip, then building the screen again on the same
  browser storage and checking the same state comes back. There are also cases
  for a remembered participant who's gone, and for storage that throws.
- **Each step ships its tests.** Each to-do item adds tests for what it moved,
  and updates existing tests that found controls in their old places:
  - the details column is opened by clicking a row today; these tests will
    click the name instead;
  - the under-row panels will be looked for in the participant panel;
  - two initiative-rolling tests find the Prep card as "the first card on the
    page", which changes in step 6.
- **Behaviour-unchanged checks.** For each moved control, at least one test
  checks that it still does what it did: for example, Delete still asks for
  confirmation, a damage box still records damage, and Seize is still absent
  before rolling.
- **Prior art.** The scenario tests already build the whole GM screen and
  drive it through its buttons: the mid-turn joiner, grunt heal/DV, NPC group
  initiative, and persistent rooms scenarios. The main GM screen test does the
  same for the details column and stat editing.
- **Every step:** the full test run, the code-style check and the build all
  pass. Then there's a hands-on walk-through at laptop width and at
  big-monitor width:
  - add a PC, a grunt group and a decker;
  - request rolls and add a mid-turn joiner;
  - act, delay and defend; go to the next pass;
  - apply damage and open every tab;
  - swap to the Matrix and back;
  - refresh with a panel open, and collapse the strip.

  Confirm the list never jumps and the player view is unchanged.

## Out of Scope

- Any change to what a control does, apart from the named merge exception.
- The player view.
- The Declare Actions pop-up, the add pop-up, the convergence alert and other
  pop-ups (they stay as they are).
- The inside of the Matrix run panel (it moves unchanged).
- Touch and tablet layouts.
- These existing to-do items, which wait until the step that moves their area:
  - take back a mis-tapped Interrupt (after step 3, which moves the
    Interrupt tags beside the name);
  - confirm only the Next Pass tap that ends the Combat Turn (after step 6);
  - show "alive" when a grunt's damage equals his Body (after step 1, in the
    Condition tab).
- These log fixes, which are independent and can be done any time:
  - the GM's log shows each line exactly once;
  - no pass or turn lines when running without a room;
  - Start Combat Turn with nobody able to act spams the log.

## Further Notes

- Decisions come from the planning sessions of 2026-09-18 and 2026-09-27 and
  the docs-upgrade grilling of 2026-09-28 (Q1–Q24).
- **Not in the mockup:** the Awakened naming (the mockup still says "Magic"),
  merge picking, status tags beside the name, the release-claim button on the
  row, Overwatch reminders in the Matrix panel, and the count on the Matrix
  button. The mockup cannot show Escape or remembering after a refresh.
- The mockup's source is kept in the project's temporary folder, which git
  ignores.
