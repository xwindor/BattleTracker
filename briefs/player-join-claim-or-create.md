# Players choose "claim" or "create" when they join a room

## What happens today

A player opens the player link, types the room code, and taps Join. If they
don't already have a character in that room — which is always true the first
time, and after a refresh — they get a single panel headed "Claim Or Create
Character" that shows **everything at once**:

- a dropdown of unclaimed characters with a Claim button next to it, *only if
  the GM has actually marked some characters claimable*, and
- underneath it, unconditionally, a full eight-box form (Character name, Init
  Dice, Overflow, Reaction, Intuition, Edge, Physical CM, Stun CM) with a
  "Create New Character" button.

So on a normal night, a player who is meant to claim the character you already
set up for them is looking at a wall of stat boxes they are supposed to ignore.
And a player who is meant to create one sees a dropdown that is either empty or
full of other people's characters. Neither of them is told which one they are
supposed to do.

There is also a small line of text at the top after joining that says "Claim a
character from the list or create a new one" — which is the only instruction
anyone gets.

The panel disappears the moment the player holds a character, and comes back on
its own if you later release their claim or their character leaves the
encounter.

## What changes

The panel opens with **two buttons and nothing else**:

- **Claim a Character**
- **Create a New Character**

Tapping one reveals only that path. The claim path shows the dropdown and the
Claim button. The create path shows the stat form and the Create button. Each
path has a small "Back" link so a player who tapped the wrong one is not stuck.

That's the whole change. Nothing about how claiming actually works, what a
claim means, what you see on your GM screen, what goes in the Action Log, or
what the server stores is being touched. The same two things a player could
already do are still the same two things — they are just asked which one first.

## What this means at the table

**The common case gets shorter.** You say "you're the elf, code is 4KJ2ZP".
They join, tap Claim a Character, pick the elf, done. They never see a stat form
and never wonder whether they were meant to fill it in.

**A drop-in player gets a clean path.** Someone brings a character you haven't
entered. They tap Create a New Character, fill the eight boxes, tap Create. Same
form, same fields, same result — it just isn't in the way of everyone else.

**Nothing changes once they have a character.** The moment a player holds one,
the whole panel disappears exactly as it does now, and they see the initiative
order, the dice roller, the log and their own character panel.

**If you take a character away from a player, they get the two buttons back.**
Releasing a claim, or removing their character from the encounter, drops them
back to the chooser rather than a half-open form.

## A thing worth knowing that is not changing

**A browser refresh loses a player's claim.** Each browser tab invents a
throwaway identity when it loads, so refreshing the page makes that player a
stranger to the room. The server notices the old tab dropped, frees the
character, and the returning player has to claim it again. That is true today
and this change does not fix it — it just means they'll see the two buttons
again rather than the wall of boxes. Making a claim survive a refresh is a
bigger piece of work (it needs a real player identity) and is already on the
backlog as its own item. See open decision 6.

## Xavier's decisions (2026-08-24)

Xavier accepted **all nine recommendations as written**. For the implementer,
that resolves to:

1. Create = the existing eight fields, unchanged. No fuller character sheet.
2. Claim button is always rendered; **disabled with an explanatory line** when
   there is nothing to claim.
3. **Back control on both branches.**
4. Gate on "holds no character" (the existing `ownParticipants.length === 0`),
   not on a one-shot "just joined" flag. Reset must be edge-triggered.
5. **Decision 5 is taken:** both buttons stay usable while the GM is absent,
   with a warning line in a **new** element (not the existing
   `data-testid="gm-not-connected"`). Scenario S6 in the spec is in scope.
6. Claim does not survive a full page reload. No token persistence.
7. One character per player. No "create another" affordance.
8. The `@if (connected && state)` gate stays as-is. The sub-second empty-room
   window is accepted.
9. Card header reads **"Get A Character"**.


### Create-form field order — resolved, not a defect

The Stage 3 review flagged the create form's field order (Edge and Overflow
swapped versus the last commit) and the `Physical CM` / `Stun CM` labels as an
unexplained deviation it could not find in git history.

**Xavier made that edit himself, by hand, in the working tree, to match the
field order on his players' character sheets.** It is deliberate and stays.
That is also why the spec's "Current behaviour" table did not match `HEAD` —
the scoper read the working tree, the reviewer diffed against the last commit.

Keep the new order. The only part of that finding that was a real defect was the
commented-out "Will to live" cell, which has been deleted.

## Open decisions

**1. Does "create a new character" mean a fuller character sheet, or the eight
boxes that exist today?**
*Recommended: the eight boxes, unchanged.* This request is about how the two
choices are presented, not about what either one does. A fuller sheet is a real
feature with its own questions — where the numbers come from, whether a
Condition Monitor is worked out from Body and Willpower instead of typed in,
what happens to a sheet when the GM edits the character afterwards — and at
least some of those are rulebook questions that need a rules brief, not this
pipeline. Keeping the form identical also means this change cannot break
character creation, because it doesn't touch it.

**2. What should the Claim button do when there is nothing to claim?**
*Recommended: still show the button, greyed out, with a one-line reason under
it ("No characters are available to claim yet — ask the GM to make one
claimable").* Hiding it would mean "two buttons" is sometimes one button, and
a player has no way to tell whether that's a rule or a mistake. Greying it out
with a reason tells them exactly whose move it is. It also self-corrects: the
moment you mark a character claimable, the button lights up on their screen with
no action from them.

**3. Can a player change their mind after tapping a button?**
*Recommended: yes — a small "Back" link on each path.* Cheap, and without it a
mis-tap on a 6-inch phone screen means a reload, which (see the note above) is
not free.

**4. Should the chooser be tied to "just joined", or to "doesn't have a
character"?**
*Recommended: "doesn't have a character", which is what the panel already keys
off.* You asked for "when players first join", and that is the main case, but the
same panel already reappears when you release someone's claim or their character
leaves the encounter. Tying it strictly to the join would leave those cases with
no way back in. Practical consequence: it reappears after a refresh too, which is
correct — a refreshed tab genuinely does not hold a character any more.

**5. Should either button be blocked while you (the GM) are not connected?**
*Recommended: no — leave both usable, but show a warning line.* A player's claim
or create request is a message that only your tab can act on; if your tab is
closed, the request goes nowhere and nothing on their screen currently says so.
They just see "Claim request sent" forever. Blocking the buttons would be worse
(they'd be stuck with no explanation), so the recommendation is to let them tap
and add a line saying it won't take effect until the GM is back. The player view
already knows whether you are connected — it shows a separate warning about it
today — so this is reusing something that exists.

**6. Should a claim survive a browser refresh?**
*Recommended: not in this change.* It's the right thing to want, but it means
giving players a lasting identity, which changes who owns what on the server,
what happens when two tabs claim the same character, and how a claim gets freed
when someone really does leave. That is already recorded as its own backlog item
("Player identity / accounts and cross-room saved characters") and should stay
there. Worth confirming you're happy for a refresh to keep meaning "claim
again".

**7. Should a player be able to claim a second character?**
*Recommended: no — unchanged.* Today one browser tab effectively holds one
character; creating again while holding one would overwrite the first rather
than add a second. Nothing about that changes here, and the chooser is hidden
while they hold one, so the situation doesn't arise.

**8. What if a player joins before you've pushed anything to the room at all?**
*Recommended: leave as-is, and accept it.* There is a very narrow window — under
a second, between you tapping "Create Player Session" and your tab sending its
first update — where a player who joins sees an empty screen with no chooser at
all. A room you're rejoining from a previous night never has this problem. Fixing
it means showing the chooser before any room content has arrived, which is doable
but is a second, separable change. Say the word if you'd rather close it now.

## Which parts of the app are affected, and what might break

**Affected:** the player screen only — specifically the panel that appears
between joining and holding a character.

**Not affected, and deliberately so:** your GM screen, the Action Log, the
server, what is stored on disk about a room, the initiative order, dice rolling,
the Matrix/deck panel, the Awakened panel, and the claim/release controls on
your own screen. The messages the player's browser sends when they claim or
create are byte-for-byte the same as today, so your tab handles them the same way
and nothing you see changes.

**What might break:**

- **The claim dropdown itself.** It is moving behind a button. If the wiring is
  wrong, the symptom is a dropdown that doesn't appear or doesn't populate —
  visible immediately, on the first player who tries it.
- **One existing automated test.** There is a test that checks a downed
  character's entry in the claim dropdown says "(Out of Action)". It looks for
  that dropdown on screen straight away, so it will need to tap through to the
  claim path first. That is a test update, not a behaviour change — but if it is
  missed, the test suite fails loudly rather than quietly, which is the good kind
  of failure.
- **The instruction line after joining.** It currently says "Claim a character
  from the list or create a new one", which stops being accurate the moment there
  is no list on screen. It needs rewording.
- **Nothing is at risk mid-combat.** The chooser only exists for a player who has
  no character, and a player with no character isn't in the initiative order. A
  player joining or re-claiming mid-fight is handled by the same claim path as
  today.

There is no undo to worry about — the undo system is being removed from the
tracker in separate, in-flight work, and this change adds nothing that would
have used it. The reversals here are the Back link on the player's side and your
existing "release this claim" control on yours.
