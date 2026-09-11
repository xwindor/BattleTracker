# Widening the Matrix hierarchy tree: files, agents, and PANs

## What's changing and why

Right now, in the Matrix tracker's "Public Space" (the open grid, outside
any host), only a device can be nested under another device in the tree —
one add button ("+ Loose Device"), one thing that can be a child. A host, by
contrast, offers four kinds of thing you can add to it: device, file,
persona, IC.

The request is to widen Public Space so a file or a persona (specifically,
an agent's persona) can be nested under a device too — the same way a file
or persona already can be nested inside a host — and to give Public Space
the same set of add buttons a host has.

## What the rules actually say

I went and checked this against the book rather than taking the framing on
trust, and the answer is a genuine mix of "yes" and "not quite."

**Right: a PAN's master is always a device.** The book is explicit: a
personal area network is a commlink or deck (the master) plus the devices
slaved to it, and a master can handle up to (its Device Rating × 3) slaved
devices — printed page 233. That part of the mental model is correct.

**Not quite right: files and personas can't actually be "slaved" into a
PAN at all.** The very next sentence on that same page says, in so many
words: "Only devices can be slaves, masters, or part of a PAN." A file
sitting near a device, or an agent's persona running on a device, is not
the same relationship as a device slaved to another device. Slaving comes
with real mechanical weight in the book — a slaved device borrows its
master's defense rating when attacked — and that weight only ever applies
device-to-device.

What a file or a persona *does* have with a device is a location fact: a
file lives on a device (or in a host), and an agent's persona runs on the
device it's using (page 235: a device's icon is "subsumed" by the persona
using it; an agent replaces the device's icon the same way a person does,
or runs alongside its owner's persona on the same device as a separate
icon). That's worth showing in the tree — it's exactly the kind of thing a
GM would otherwise have to remember — but it isn't the same thing as PAN
membership, and the app shouldn't imply it is.

**Practical upshot: build what's asked, describe it correctly.** Letting a
file or a persona nest under a device in the tree is good bookkeeping. It
just isn't "widening what a PAN can contain" — RAW keeps that door shut —
it's "showing where a file or an agent's icon lives," a different and
smaller claim.

**On mark propagation — the good news is it's already safe.** I checked the
code, not just the rule: the part of the tracker that copies a mark from a
slaved device up to its master already only fires for devices, and it
checks that independently of whatever the tree's parent/child field allows.
Widening what can be a *child* in the tree cannot make a file or a persona
start propagating marks — the two switches are wired separately already.
This matches the book too (same page 233: only a device passes a mark up).

**On IC — you were right to leave it out, and the book says so directly.**
Page 235: "IC programs are not connected to devices because they're only
found in hosts." IC cannot exist outside a host, full stop. So Public
Space should get three of the host's four add buttons — device, file,
persona — never IC. Giving Public Space an IC button (to literally match
the host's four) would let the GM create something the book says can't
exist.

## Not building — and why

- **No change to how marks propagate.** Still device-only at both ends,
  still the same 3-mark cap, still one-way upward. Confirmed in the code,
  not just assumed.
- **No enforcement of the Device Rating × 3 slave cap.** The book gives a
  hard number, but the tracker enforces nothing there today, and adding it
  would be new scope beyond "let files and personas nest." See decision 1.
- **No file-protection mechanics.** Protecting a file is its own test with
  its own rating (page 239) and has nothing to do with where the file sits.
  Not requested, not touched.
- **No technomancer or sprite modelling.** Adjacent subsystem, out of scope.
- **Nothing changes inside hosts.** A device or file already inside a host
  still gets no parent picker — host containment is a separate mechanism.

## Scope questions for you

Answering these may mean updating `SCOPE.md`.

1. **The Device Rating × 3 slave cap** (page 233) — should the app count
   how many things are nested under a device and flag it if that number
   looks high, or say nothing? *My default: say nothing for this pass.* The
   tracker generally warns rather than blocks, and this would be new
   scope beyond "let files/personas nest" — it's cleaner as its own later
   feature if you want it.

2. **Editing an existing Public Space item's type to "IC"** — should the
   type dropdown even offer "IC" for something already in Public Space,
   given the book says IC can't exist there? *My default: no, hide it* —
   mirrors the missing add button and stops a state the rules flatly rule
   out.

3. **What can be a parent** — should a file or persona ever be nest-able
   under something other than a device (e.g., a file under a persona)?
   *My default: no, parent choices stay device-only,* matching the book
   (only a device is ever a master of anything) and matching what the
   tracker already restricts parent choices to today.

4. **The literal "same buttons as a host" framing** — do you want Public
   Space's IC button to exist but sit disabled/greyed with an explanation,
   or simply not be there at all? *My default: not there at all* — a
   button that can never do anything is just clutter.

5. **How the tracker should describe this relationship.** Since RAW says a
   file or persona is *not* a PAN member, should the app avoid the word
   "PAN" for these and treat the nesting as "lives on / runs on"? *My
   default: yes* — call it what it is, so the tree doesn't quietly teach a
   rule that isn't in the book.

## What's affected, and what could break

- The Matrix hierarchy editor's Public Space section (add buttons, the
  parent picker, the Add/Edit form).
- Nothing about mark propagation changes — that logic is already correctly
  restricted to devices and doesn't read the same switch this feature
  touches. I confirmed this by reading the code, not just trusting the
  framing.
- Risk area: if the type dropdown for a Public Space item isn't restricted,
  someone could retype a device to "IC" while it's sitting in Public
  Space, which the book says can't happen. Worth closing off explicitly
  (see decision 2 above), otherwise it's a silent gap the UI doesn't
  currently protect against.

---

## Implementation plan — added by Stage 1b

### What actually has to change on screen

Three things, and they're smaller than they sound:

1. **Public Space gets two more add buttons** — "File" and "Persona" next to
   the existing "Loose Device" button — matching two of the three buttons a
   host already has (never "IC Target"; that one stays host-only, and the
   book is explicit that IC cannot exist anywhere else).
2. **A file or a persona in Public Space can now show a "Parent" field when
   you open its Edit screen**, the same field a device already has. Picking a
   device there nests the file/persona under it in the tree, exactly like a
   weapon nests under a mount today.
3. **Nothing about marks changes.** I re-confirmed this in the code, not just
   the rule: the part of the tracker that copies a mark up to a parent only
   ever runs for devices, checked completely separately from the field this
   feature touches. Nesting a file under a device cannot make a mark jump to
   that device.

### A control this touches that the request didn't mention

There's a small "+" button on every device's card in the tree (added two
changes ago) that creates a new device already nested under the one you
clicked. It currently decides whether to show itself by asking the exact same
question as "can this thing have a parent" — because until now, those two
questions had the same answer for every icon type. Once files and personas
can have a parent too, that stops being true: the "+" button must still only
ever appear on devices (only a device can *hold* something in this app,
per the rules), so it needs its own, separate check rather than continuing to
piggyback on the widened one. If this isn't split out, a file icon would grow
a "+" button that lets you create a device nested under a file — which the
rules do not allow and which this feature was never meant to introduce.

### A warning message that becomes obsolete

There's an existing on-screen warning: "switching this to a File will NOT
keep its parent — only a device can have a parent." That warning exists
*because* only devices could have parents. Once files and personas can too,
that warning would only ever fire for something that's actually impossible to
reach through today's Type dropdown (IC, which the dropdown already hides
outside a host) — so it becomes dead weight that can never actually show up
on screen again. Recommended: update its condition to match reality (so it
provably can't fire falsely) and say so plainly in the code comment, rather
than leaving a warning that quietly never fires again with no explanation.

### Size

Small. This is a few-hour change plus test updates, not a multi-day feature —
one shared gate to widen, one predicate to split out that wasn't previously
separate, two new buttons, and a batch of existing tests that currently
assert the *old* rule and need to assert the new one instead. No new
scope-question decisions beyond the ones the rules brief already raised.

### What could break, restated for the table

- A handful of existing automated checks currently prove "a persona/file can
  never get a Parent field" and "switching a device's Type to file drops its
  parent." Those are the exact behaviours this feature reverses on purpose,
  so those checks have to be rewritten, not just left failing.
- The layout tests that measure how much room device names get on a narrow
  screen (from the "+" button work) are unaffected — they only ever used
  device chains, and the "+" button's own visibility rule doesn't change.
- Mark propagation's own tests are unaffected — confirmed by reading the
  gate, not just trusting it.

---

## Xavier's answers — 2026-09-11

1. **Slave cap: warn, don't block.** The app flags a device whose slaved-device
   count exceeds Device Rating × 3, but still lets the GM record it. Consistent
   with `SCOPE.md`'s stated stance — the tracker helps the GM follow the rules
   but must stay flexible, because GMs override rules constantly. Note the cap
   counts slaved **devices** only: files and personas nested under the same
   master do not count toward it, so the number must be selective rather than a
   raw child count.

2. **File rules go back to the rules analyst.** Xavier checked the CRB himself
   and corrected the first pass on three points, none of which the analyst's
   reading covered:
   - Files live on **commlinks** (and therefore personas), **not on devices in
     general**.
   - Files **share the stats of their owner** — they do not carry their own.
   - A group of files can be a **folder**, and files can carry protection.

   These change the data model, not just a gate. The tracker currently cannot
   distinguish a commlink from a drone — every device is a device with a
   rating — and a file today carries its own `rating`, used for its condition
   monitor (`MatrixTarget.ts:42-43, 129`). So "files only on commlinks" is not
   a filter that can be written against today's model, and "shares the owner's
   stats" contradicts what the code does now.

   Sent back for page-cited verification before designing around it.

---

## Second pass — where files actually live, and whether they carry their own stats

Xavier asked me to double-check three things against his own reading of the
book: that files only exist on commlinks (and therefore personas), that a
group of files is a "folder," and that a file shares its owner's stats rather
than having its own. Here is what the book actually says.

**You were right on two of the three, and stricter than the book on the
third.**

**1. Files aren't restricted to commlinks — but the book never tests the
difference either.** The rulebook shows files in exactly two places: on a
commlink or deck (a hacker copying a music file off a waitress's commlink),
and inside a host (the bank-archive example, where a file sits in the host,
not on any device at all). Nowhere does it say a file *can't* sit on an
ordinary device like a maglock or a drone. More importantly, the one rule
that actually cares where a file is — Edit File, which protects, copies or
deletes it — only ever asks one question: is the file inside a host or not?
If not, the defender is simply "the file's owner." The rule never asks which
device the file happens to sit on. So restricting files to commlinks would be
a stricter house rule than the book requires. Reasonable, since it matches
every printed example — but a preference, not a rule.

**2. A file "on a persona" is really a file on the persona's device, made to
look that way.** When someone connects through a device, that device's icon
disappears and the persona's icon takes its place — so a file that was on the
commlink now visually reads as belonging to the persona, because there is no
commlink icon left to show it next to. The book still treats the underlying
relationship as file-to-device. Nothing lets a persona itself hold a file.
Recommend keeping this as pure display: the file's actual parent stays the
device.

**3. Yes — a file shares its owner's stats, and the tracker already gets this
right.** The book says it outright: files have no ratings of their own and
use their owner's ratings whenever a test is made against them. Files also
cannot take Matrix damage. I checked the code: the tracker already gives a
file no condition monitor and treats it as undamageable. There is a leftover
unused `rating` field on the file data structure, never shown and never used
— dead code worth tidying, not a bug. **No behaviour change needed.**

**4. A folder is not a separate kind of thing** — it is a file whose contents
happen to be other files, exactly as you said. Same icon type, same lack of
stats, one protection rating covering the whole thing.

**5. File protection is confirmed**, with one extra detail worth having: who
defends against an attempt on a protected file depends only on whether it is
in a host. Inside a host, the host defends; outside one, the owner does. The
file's parent device is never part of that test.

**6. Commlinks are not mechanically special.** This one surprised me: most
devices *including commlinks* have only two of the four Matrix attributes
(Data Processing and Firewall). Only decks and hosts get all four. So a
commlink is not a richer category the tracker could meaningfully filter on —
what makes commlinks feel special is the convention that people keep their
files there, not any rule.

**7. Confirmed — the ×3 slave cap counts devices only.** A file or persona
nested under a device never counts toward it.

### What this changes for the app

Nothing already built needs correcting. It settles two things: a file or
persona's parent stays restricted to a device, and the tracker does **not**
need to learn what a commlink is — which would have been a much larger change.

### One decision left for you

**Should the app restrict a file's parent to commlink/deck devices only, or
allow any device?** The book does not force either answer. *My
recommendation: allow any device* — restricting it would mean teaching the
tracker to distinguish device sub-types (commlink vs maglock vs drone) that it
does not track at all today, purely to enforce a convention rather than a
rule. If you would rather keep the "files live on commlinks" flavour strict,
that is a legitimate table preference — just worth knowing it is a house rule,
and that it needs its own scoping because the tracker has no concept of a
commlink today.

### Xavier's answer — file parents, 2026-09-11

**No restriction: a file may be parented to any device.** Xavier's reasoning,
which also corrects a framing error in the brief above: files can legitimately
be floating loose in public space with no parent at all, so a hard restriction
would be wrong in both directions.

He also corrected the characterisation of p. 226. That page establishes only
that commlinks are not *attribute*-distinct — they carry Data Processing and
Firewall like most devices, while decks and hosts carry all four. It does
**not** establish that commlinks are mechanically unremarkable: the book
singles them out in plenty of rules, with the same numbers but different rules
attached, and Shadowrun does this in many places. The brief's "commlinks are
not mechanically special" line overreached; the narrow attribute claim is what
the citation supports.

The practical outcome is unchanged — no device sub-type modelling is needed for
this feature — but for the right reason: the rules governing *file location*
never test which device a file sits on, not that commlinks are
indistinguishable in general.

### Assumed, not explicitly answered — wording

Scope question 5 from the first pass (whether the app should avoid calling a
file's or persona's nesting "PAN membership") was not answered directly.
Proceeding on the recommended default: **call it what it is.** A device nested
under a device is a real PAN slaving relationship; a file or persona nested
under a device is a location fact — it lives on, or runs on, that device. The
tree renders identically either way; this governs labels and tooltips only.
Say so if you would rather it all read as PAN membership.
