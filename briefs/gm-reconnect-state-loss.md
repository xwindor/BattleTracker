# When the GM rejoins a room, the fight loses its injuries

## What you reported

> "There is a major issue when a GM reconnects to a room session — all the condition monitors are reset, and I think there are some issues with NPC groups too."

Both parts are real. I found the cause, and it is worse than "condition monitors get reset" — some combatants don't come back at all.

## First, the important distinction: two different "reconnects"

These behave completely differently, and only one is broken. It matters because it explains why the bug seems to come and go.

**Safe — the server hiccups, or you lose wifi, but your GM tab stays open.** Nothing is lost. Your tab is still holding the whole fight in memory, notices the drop, reconnects, and pushes everything back out to the players. Damage, condition monitors, downed NPCs, everything. This path is correct and I am not changing it.

**Broken — your GM tab is gone and you type the room code back in.** Page refresh, browser crash, laptop restart, switching to a different device, or handing the GM screen to someone else. Your tab now has nothing, so it has to pull the fight back down from the room. That download is *a summary of what players need to see*, not a save file — and it has never contained anyone's injuries. So the fight comes back with everybody at full health.

Closing the room and rejoining it in the same tab is safe (it takes the first path). It is specifically "the tab that was running the fight is no longer there" that loses everything.

## What actually gets lost today

Everything in this list disappears on that second kind of rejoin:

- **All damage on every combatant** — player characters, ordinary NPCs, deckers, magicians, lone grunts. Everyone comes back at zero Physical and zero Stun.
- **The size and shape of every condition monitor.** A troll you set up with a 12-box track comes back with the standard 10. Pain tolerance and a Pain Editor implant are both forgotten.
- **Anyone who was down.** A downed NPC is not merely restored healthy — they are not in the room's snapshot at all, so they vanish from the fight completely. If every combatant was down, the rejoin refuses outright and tells you the room can't be restored.
- **Who has already gone this pass.** Everybody comes back as "waiting", so anyone who had already taken their action this pass gets a second one.
- **Delayed actions.** A character who was holding their action loses the hold.
- **Edge spent to seize the initiative.** They drop back into the normal order.
- **Committed interrupts.** Someone on Full Defense loses the Full Defense status, and can pay for it a second time in the same turn.
- **The coin toss that broke initiative ties.** It gets re-rolled, so a tie can resolve differently after a rejoin than it did before.

## What breaks for NPC groups specifically

You were right to be suspicious, but the shape of it is unusual — groups are partly *better* off than everyone else, and in one situation much worse.

**The good part:** a group row that still has someone standing does come back correctly. Its NPCs come back by name, each with the right number of boxes filled, with the record of what took them down, and with the group's shared initiative penalty intact. That path was built for the NPC-group work and it still works — there is an existing test covering exactly this, and my reading of the code agrees with it. (The project backlog raised a doubt about this on 2026-08-07; I checked, and the row path is sound. The reason it looked broken at the table is the next paragraph.)

**The bad part:** the moment the *last* member of a group goes down, the whole group counts as out of action — and out-of-action combatants are not put in the room's snapshot at all. So a wiped-out group vanishes on rejoin: the row, every NPC in it, their damage, and the record of who died to what. You cannot heal anyone back up, you cannot settle alive-or-dead afterwards, and there is no trace it ever existed.

**Also:** the little "Acted" markers on each NPC in a group are deliberately not saved, so after a rejoin mid-pass you cannot tell which of your six gangers has already gone. And a lone grunt — one added with the "Add Grunt" button, or detached from a group — comes back as an ordinary character with two separate condition monitors instead of the single combined grunt track. Its Body and Willpower are forgotten, which is what settles whether it died or was only knocked out.

## Why it happens, in one paragraph

There is one and only one thing saved about a fight: the summary the players' screens are drawn from. It carries names, initiative order, whose turn it is, what dice they rolled. It was never meant to be a save file, and injuries were deliberately left out of it — partly because it is sent to every player in the room, and how badly hurt an NPC is has always been treated as your information, not theirs. When your tab disappears, that player-facing summary is the only thing left to rebuild from, so the fight comes back with only the things players were allowed to see. This is a known gap: it has been in the project's backlog as high-priority since 3 August, and you reported it live on 7 August. It has never been fixed.

## What the fix does

Add a second, **private** save alongside the player summary. It goes out on its own channel that the server never forwards to any player, and it carries the things that are yours: everyone's damage, the size and shape of every condition monitor, who is down, who has already acted, who is delaying, who spent Edge, who is on Full Defense, and every out-of-action combatant the player summary leaves out — including a wiped-out NPC group with all of its casualties.

When you type the room code back in, the tab rebuilds the fight from both pieces. Players still receive exactly what they receive today — not one extra field.

## What it looks like at the table

You are three passes into a firefight. Two gangers are down, a third is on 6 boxes, your street sam is carrying 4 Physical and 5 Stun, the decker is on Full Defense, and one of the players has delayed. Your browser dies.

**Today:** you reopen, type the code, and get back a room where everyone is uninjured, the two downed gangers no longer exist, the decker is no longer on Full Defense (and could pay for it again), the delayed player is back in the queue as if they never delayed, and anyone who had already acted this pass gets another go. You re-key the whole board from memory while five people wait.

**After the fix:** you reopen, type the code, and the board is exactly as it was. You carry on.

## Xavier's answers (2026-08-19) — these are now decided

1. **Bring downed NPCs back — YES.** Restored still down, with injuries and the record of what killed them.
2. **Remember who has already acted — YES.** Including delayed actions, spent Edge, and the per-NPC "Acted" markers inside a group.
3. **Restore Full Defense and other committed interrupts — YES.**
4. **Lone grunts come back as grunts — YES.**
5. **Matrix IC — NO. Keep the paused Matrix module untouched.** IC continues to come back as an ordinary Matrix participant; that stays a known gap.
6. **Existing saved rooms — delete them.** No migration, no recovery of old data. The code still handles a missing private save without crashing, but only as a deploy-skew safety net, not as a data-compatibility promise.

## Decisions as originally posed (kept for the record)

**1. Should a downed NPC come back?**
Right now anything out of action is simply absent from the room's saved copy, which is why a wiped-out group disappears. My recommendation is **yes — bring back everyone, still down, with their injuries and with the record of what killed them.** You need them to heal someone back up, to settle who lived, and because a group vanishing mid-fight is the worst version of this bug. Players would still not see them; they go in the private half.

**2. Should the tracker remember who has already acted this pass?**
Today everyone comes back as "waiting", so people can act twice. Recommendation: **yes, restore it exactly** — including delayed actions, spent Edge, and the per-NPC "Acted" markers inside a group. Those markers were originally left out as disposable bookkeeping; that reasoning holds for a normal pass but not for a mid-fight rejoin, which is exactly when you need them. If you'd rather everyone came back "waiting" and you sorted it out by eye, say so — it is less code.

**3. Should Full Defense (and other committed interrupts) come back?**
Recommendation: **yes.** Today the initiative *number* is right but the status is gone, so the tracker will happily let someone buy Full Defense twice in the same turn. Restoring it is the only way that gate keeps working.

**4. Should a lone grunt come back as a grunt?**
Recommendation: **yes.** A standalone or detached grunt should keep its single combined condition monitor and its Body/Willpower, so the alive-or-dead call still works after a rejoin. Without this, fixing the damage transport still leaves lone grunts coming back the wrong shape — same combatant, broken a different way.

**5. Matrix IC — in or out?**
IC currently comes back as an ordinary decker. Restoring it properly is about three extra fields. Recommendation: **include it**, since we are already in this code and leaving it means knowingly walking past a broken case. Say no if you'd rather keep the paused Matrix module completely untouched.

**6. Rooms saved before this change.**
Any room already on disk was saved in the old format and has no injuries in it. Nothing can recover them. Recommendation: **accept it**, and keep the existing "here's what couldn't be restored" warning for those rooms only — so a rejoin into a new-format room stops nagging you about damage it just restored perfectly.

**7. One deployment note, not really a decision.**
If you have a GM tab open across a server restart running new code, the private data simply doesn't get saved for that session — it degrades quietly rather than leaking to players. Reloading the GM tab after a deploy fixes it. I chose the design specifically so the failure mode is "lost", never "shown to players".

## What could break

- The join button's behaviour when a room's whole cast is down changes: today it refuses the join, after this it restores normally. That refusal path stays in the code for old rooms.
- The player screens should look identical. The single largest risk in this change is accidentally putting injuries on the player wire, so the fix keeps them on a channel players are never sent — and the tests assert that explicitly.
- Initiative numbers are the delicate part. The running initiative score is rebuilt by hand on a rejoin, and injuries move that score. Restoring damage in the wrong order relative to the score would silently shift everyone's place in the order. The spec pins the exact order for this reason.
- Rooms saved on disk get bigger. Not by an amount that matters.
