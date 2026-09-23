# Making the "please roll initiative" prompt harder for players to miss

## What happens today

When the GM asks everyone to roll initiative, the app doesn't pop up anything demanding attention. Instead, a blue box quietly appears inside the "Initiative Order" card on the player's screen, with a text box to type a number in and two buttons: "Submit Manual Roll" and "Auto Roll." The box does flash red three times and plays a short chime (unless the player has muted notifications), but if a player has scrolled down, is looking at another tab, or the sound didn't register, it's easy to miss entirely — nothing blocks the screen or demands a response.

Separately, further down the same page, there's a general-purpose "Dice Roller" with its own "Roll" button, animated tumbling dice, and a running list of everyone's rolls. This roller is not connected to initiative at all — pressing its Roll button does not submit an initiative roll for you. It only animates during initiative because "Auto Roll" in the blue box feeds it the same numbers, purely for show.

There's also a real gap: the blue box only appears because of a one-time signal sent the moment the GM clicks "Request Player Rolls." If a player's browser refreshes, their connection drops and comes back, or they join the room a few seconds after that click, they never see the box — even though the app still knows they haven't rolled yet.

## What would change

- The quiet in-page box becomes a pop-up window in the middle of the screen that the player has to deal with — it can't be scrolled past.
- The animated dice roller sits inside that pop-up. The player presses one button, watches the dice tumble, and the result goes straight in as their initiative roll — no copying numbers across.
- Typing in a number rolled with physical dice is still offered in the same pop-up.
- The pop-up opens correctly for a player who reconnects, refreshes, or joins late, as long as the app still shows them as not having rolled. The GM won't need to click "Request Player Rolls" again.
- The smaller follow-up roll (for example, when a player switches into a faster VR mode mid-turn and rolls just the extra bonus dice) gets the same pop-up treatment, so the two prompts look and behave alike.
- The chime still plays when the pop-up appears.

## Not building — and why

- **Not changing who can roll, when, or what the numbers mean.** This is only about how loudly and clearly the app asks. Dice counts, the maximum allowed roll, and initiative math stay exactly as they are. If any of that turns out to need changing, it's a rules question for `/feature`, not this.
- **Not removing the physical-dice option.** Tables that roll real dice can still type the number in.
- **Not adding pop-ups for other dice rolls.** Only the initiative prompt and its follow-up version. The general Dice Roller further down the page stays and works as before.
- **Nothing changes on the GM's screen.** "Request Player Rolls" and "Force Roll Outstanding" are untouched.

## Scope questions for you

Answering these may mean updating `SCOPE.md`, since some of them set how the app behaves for any future "you must respond to this" prompt.

**1. Can the player close the pop-up without rolling?**
- *For letting them close it:* a player may need to glance at something else first, or the GM may be handling that character. Trapping someone in a window is frustrating at the table.
- *Against:* a pop-up you can just click away is only slightly better than today's quiet box.
- *Suggested:* allow closing it, but it comes back by itself next time they refresh or reconnect, or when the GM requests rolls again, as long as they still haven't rolled.

**2. Should the pop-up come back automatically when a player reconnects?**
- *For:* fixes the gap where a player who dropped off never gets prompted.
- *Against:* if the app's record of "has this character rolled" were ever wrong, it would nag someone who already rolled, which looks like a glitch mid-combat.
- *Suggested:* yes, based on the app's existing "has this character rolled yet" record, which the GM's screen keeps up to date and resends on every reconnect.

**3. What about a player who controls more than one character?**
- Today, only a player's first character ever gets a prompt; the GM has to handle rolls for any others. That's already true and this change doesn't make it worse.
- *For fixing it now:* a pop-up says "this is the one thing you need to do," so silently skipping a second character feels more wrong than before.
- *Against:* it's a noticeably bigger job (several pop-ups, or one with a character picker) and would turn a small change into a larger feature.
- *Suggested:* leave it as-is for now and add "prompt for every character a player controls" to the backlog.

**4. While the pop-up is open, can the player still use the page behind it?**
- *For blocking the page:* it's how the existing action-planning pop-up already works, and it keeps the player's attention on rolling.
- *Against:* a player might want to check the initiative order or their character's stats before rolling, which would mean closing the pop-up first.
- *Suggested:* block the page behind it, same as the action planner — combined with question 1's "you can close it," the player can still get out if they need to.

## Risks to the table

- A pop-up is more intrusive than the old box. It could interrupt a player mid-scroll or mid-conversation — worth trying at the table before calling it done.
- If the "has this player rolled" record and the pop-up ever disagree, a player could see the pop-up reappear after rolling. The plan ties the pop-up directly to that record to avoid this.
- The follow-up roll has different limits from the main roll (it only covers the extra dice). Putting both into the same style of pop-up needs care so one doesn't borrow the other's limits.

## Your answers

Answered by Xavier, 2026-09-15:

1. **Can the player close it without rolling? — No.** The pop-up stays open until the player submits a roll, or the GM resolves it for them (for example "Force Roll Outstanding"), or combat ends. There is no close button. The same applies to the follow-up (extra dice) pop-up.
2. **Reappear on reconnect? — Yes (suggested).** Based on the app's existing "has this character rolled yet" record.
3. **More than one character? — Leave as-is (suggested).** Only the first character is prompted; "prompt for every character" goes on the backlog.
4. **Block the page behind it? — Yes (suggested).**
