# Action Log readability pass

## What changes at the table

Three groups of changes, all about how the Action Log *reads*. Nothing about
initiative, damage, turn order or who can act changes.

**1. Declared actions read as sentences.**
Today the log prints the tracker's own category labels back at you:

> Sarah: Free: Take Aim | Simple: Fire Weapon, Reload x2

After this change it reads as a sentence:

> Sarah: took aim (free), fired their gun (simple), and reloaded twice (simple).

The category is still shown, in brackets, because at the table you often need to
know whether something was a Free, Simple or Complex action. What goes away is
the pipe-and-colon shorthand.

Interrupts get the same treatment. "GM: Ganger 2: Interrupt Full Defense"
becomes "Ganger 2: interrupted, going full defense." Note that the "GM:" prefix
disappears — the line is now attributed to the combatant who did it, the same
way a player's own action already is. Tapping Act with nothing selected reads
"passed their action" instead of a bare "Act".

This needs a plain-English phrase for every action in the app — 86 declared
actions and 18 interrupts. I have drafted all of them and they are in the
technical spec; you do not need to review the list before work starts, but you
will see them in the log afterwards and can change any that read wrong.

**2. NPC group lines get shorter, and their explanations move to tooltips.**
Several group-related log lines currently carry a paragraph of explanation
inside the log entry itself. Those explanations move to hover tooltips on the
buttons that cause them, and the log line keeps only the fact:

- an NPC joining a group: "Ganger 4 joined the group." (plus "arrives wounded
  (-2)" only when they turn up already hurt)
- a lone grunt added: "Grunt 1 added."
- a group formed by merging: "Gangers: formed from Grunt 1, Grunt 2, Grunt 3."
  — the house-rule note about carried-over damage moves onto the Merge button
- a group wiped out: "Gangers: every member is out of action." — the note about
  the row keeping its place in the order moves onto the group's badge
- hitting an NPC who is already down: "Ganger 2 already out of action — hit had
  no effect."
- the shared-wound house rule: "Gangers: group wound from Ganger 2 (-2) →
  shared score 6", with the words "(house rule)" replaced by a small coloured
  "house rule" badge, like the existing "hidden" and "NPC" badges

**3. One dead log line removed.** There is a leftover line in the Matrix
mode-switching code that prints a raw internal value ("VR mode → cold-sim").
It turns out nothing in the app can actually reach it — the Switch Mode button
goes through a different path that already logs properly — so this is tidying,
not a bug fix you would have noticed. It is removed.

## What is NOT changing

- No change to initiative, scores, passes, damage, who acts when, or undo.
- No change to what players are allowed to see. Lines that are GM-only stay
  GM-only; lines players see stay shared.
- No change to the dice-roll, initiative-roll, damage or heal log lines.
- No new information appears in the log that was not there before; some
  explanatory text is removed from lines and re-homed as tooltips.

## Decisions I need from you

**1. "Ganger 4 joined the group." or "Ganger 4: joined Gangers."?**
Every group log line is currently spoken *by the group* — the group's name
appears at the front of the line automatically. So writing the group's name
into the sentence as well gives you "Gangers: Ganger 4 joined Gangers."
*My default: keep the group as the speaker and say "Ganger 4 joined the
group."* It reads clean and matches every other group line. The alternative is
to make the NPC the speaker for just this one line, which gives you exactly the
sentence you asked for but makes this line behave differently from its
neighbours.

**2. Dropping the shared score from the join line.**
Today that line says which score the reinforcement inherits ("joins the row on
shared initiative score 5"). Your wording drops it. That number is visible in
the group's row on screen anyway.
*My default: drop it, as you asked.* Say so if you want it kept — it is the one
piece of information the shorter line actually loses.

**3. Dropping "alive/dead" from the no-effect line.**
Today, hitting an already-downed NPC logs "no effect, already out of action (6,
dead)". Your wording drops the "dead". That verdict is still shown on the NPC's
own badge in the group panel, and it was already logged once when they went
down.
*My default: drop it, as you asked.*

**4. Full stops.**
Your example lines end with a full stop; most existing log lines do not ("claim
released", "jacked out").
*My default: follow your examples — these new lines are sentences, the older
ones are fragments.* The log will be slightly mixed either way.

**5. A player whose tab has not reloaded.**
The player's own screen builds the sentence for their declared action and sends
it to you. A player who has not reloaded after this ships will keep sending the
old-style text for their actions until they refresh.
*My default: accept it.* It self-corrects on the next page load, and the fix
(sending the raw selection instead of the finished sentence) is a bigger change
than this one warrants.

**Resolved 2026-08-14 — all defaults accepted.**

## What could break

- The action-styling in the log (the coloured highlight on action names) keys
  off the old "Free:" / "Simple:" wording and has to be re-pointed at the new
  wording, or declared actions will lose their colour.
- Roughly a dozen existing automated tests check the old wording word-for-word
  and will need updating. That is expected and is listed precisely in the spec.
- The GM's local (non-session) log for declared actions and interrupts changes
  shape slightly. Nothing players see changes in visibility.
