import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import {
  MatrixTarget, MatrixTargetType, MatrixTargetVisibility,
  MatrixHost, MatrixParticipant
} from "Matrix";
import { MatrixStateService, PropagationStop, MARK_CAP } from "app/services/matrix-state.service";

/**
 * Whether a propagation destination will actually receive a mark ("landing")
 * or is already at `MARK_CAP` and will receive nothing ("capped") — the two
 * states `HierarchyEditorComponent.highlightStateFor()` paints on the tree
 * instead of the retired `propagationPreview` sentence
 * (`briefs/mark-propagation-highlight-spec.md`).
 */
export type PropagationHighlightState = "landing" | "capped";

/**
 * Emitted by the +Mark picker so `HierarchyEditorComponent` can compute and
 * paint the propagation highlight. Carries the `MatrixTarget` object itself,
 * not an id, deliberately — the editor never needs an id -> target lookup
 * and `MatrixStateService.allTargets()` stays private
 * (`briefs/mark-propagation-highlight-spec.md`, "Proposed approach" §2).
 */
export interface MarkHighlightRequest {
  target: MatrixTarget;
  deckerId: string;
}

/** Marker glyph for a destination that will actually receive a mark. */
const PROPAGATION_LANDING_GLYPH = "▲";
/** Marker glyph for a destination already at `MARK_CAP` that will receive nothing. */
const PROPAGATION_CAPPED_GLYPH = "△";

@Component({
  standalone: true,
  selector: "app-target-card",
  templateUrl: "./target-card.component.html",
  styleUrls: ["./target-card.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule]
})
export class TargetCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) target!: MatrixTarget;
  @Input() host: MatrixHost | null = null;
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];
  /** Passed from parent when this target's edit form is open (highlights the row). */
  @Input() editing = false;
  /**
   * `"landing"` / `"capped"` / `null` — this card's own highlight state, set
   * by `HierarchyEditorComponent.highlightStateFor()` from the currently open
   * picker elsewhere in the tree. `null` for every card except the ones the
   * open picker's propagation walk actually reaches (never the clicked card
   * itself — see `MatrixStateService.previewPropagation()`'s visited-set).
   */
  @Input() propagationDestination: PropagationHighlightState | null = null;
  /**
   * True when a `+Mark` picker (card or host) is open and unconfirmed
   * somewhere else in the tree — `HierarchyEditorComponent.anyOtherPickerOpen()`
   * (`briefs/mark-counter-control-spec.md`, Open Decision 2, Option B).
   * While true, the dot-row controls on this card refuse to arm/commit an
   * add (right-click/remove is never blocked by this — only adding is).
   * Distinct from `blockedReasonFor()`, which blocks per-decker on the
   * 3-mark cap regardless of what else is open.
   */
  @Input() dotAddBlocked = false;
  /**
   * Whether to render the "+" add-child control in `.tc-actions`
   * (`briefs/add-child-button-spec.md`, Open Decision 1 = Option A).
   * Parent-computed: this card does not know or care WHY it can add a
   * child, only whether to show the control — `HierarchyEditorComponent`
   * owns `canBeParent()` (`briefs/pan-membership-spec.md`) and the actual
   * routing. Defaults to `false`,
   * safely, for the host-subsection call site (`hierarchy-editor.component
   * .html`, host-nested target instantiation), which never sets it — a
   * host-nested device never renders this control (Determination 3,
   * structural rather than a second explicit check).
   */
  @Input() canAddChild = false;
  /**
   * Short over-slave-cap badge text (e.g. `"⚠ 13/12 slaves"`), or `null`
   * when this device is not over its cap — `HierarchyEditorComponent
   * .slaveCapBadgeText()` (`briefs/pan-membership-spec.md`, Xavier's
   * 2026-09-11 decision "N2": "short badge, detail on hover"). Rendered
   * inline in `.tc-info-row`, the same row the "+" add-child button and the
   * ▲/△ propagation marker occupy, so it is measured against the same
   * accepted-cost harness (`N-9`/`N-ADD-CHILD`) rather than reflow the tree
   * as a separate line — see `.tc-slave-cap-badge` (target-card.component
   * .css) for why `white-space: nowrap` matters here. `null`, never an
   * empty string, when there is nothing to show — matches every other
   * "show a small marker or don't" input on this card
   * (`propagationDestination`).
   */
  @Input() slaveCapBadge: string | null = null;
  /**
   * The full over-cap sentence (citation included) — shown only as this
   * badge's `ngbTooltip`, never printed into the tree itself. Kept as a
   * separate input from `slaveCapBadge` rather than reconstructed here so
   * `HierarchyEditorComponent.slaveCapWarning()` (the single definition of
   * that sentence, also read by existing tests) stays the one source of the
   * wording.
   */
  @Input() slaveCapTooltip: string | null = null;

  @Output() readonly editTarget = new EventEmitter<void>();
  @Output() readonly deleteTarget = new EventEmitter<void>();
  @Output() readonly cycleVisibilityRequested = new EventEmitter<void>();
  /**
   * Fired when the GM clicks the "+" add-child control
   * (`briefs/add-child-button-spec.md`). The parent
   * (`HierarchyEditorComponent`) is what actually opens the Add form via
   * `openAddChildTarget(target)` — this card only reports the click.
   */
  @Output() readonly addChild = new EventEmitter<void>();
  /**
   * Fired only from DOM event handlers (`openAddMark()`,
   * `onSelectedDeckerChange()`, `confirmAddMark()`, `cancelAddMark()`), never
   * from a getter, and — since round-6 review, defects 1/2/3 — never from a
   * lifecycle hook either (see `lifecycleClear` below for those). The
   * consumer, `HierarchyEditorComponent.onPropagationHighlightChange()`,
   * computes the whole-tree highlight from this exactly once per emission,
   * not once per change-detection tick
   * (`briefs/mark-propagation-highlight-spec.md`, "Proposed approach" §2),
   * and handles it IMMEDIATELY/synchronously — safe here because every
   * caller runs strictly before Angular's own change-detection pass begins.
   */
  @Output() readonly propagationHighlightChange = new EventEmitter<MarkHighlightRequest | null>();
  /**
   * Fired ONLY from `ngOnChanges()` and `ngOnDestroy()` — the two lifecycle
   * hooks that can themselves run mid-change-detection-pass (a structural
   * directive removing this card, or reassigning an `@Input`, invokes them
   * partway through Angular's own template walk). Round-6 review, defects
   * 1/2/3: emitting `propagationHighlightChange` with `null` directly from
   * there mutates `HierarchyEditorComponent.highlightByNodeId` after an
   * ancestor's `[class.hier-prop-*]` binding elsewhere in the SAME pass had
   * already been read — `NG0100 ExpressionChangedAfterItHasBeenChecked`, and
   * a stranded highlight for one render pass if uncaught.
   *
   * This event carries no payload and is emitted SYNCHRONOUSLY, immediately,
   * from inside the hook — that part must stay synchronous, because by the
   * time a component is mid-destroy, deferring the emit itself to a later
   * microtask found the parent's subscription to THIS card's outputs already
   * torn down (measured: the deferred `null` never arrived, and the
   * highlight was never cleared at all). What must be deferred is the
   * PARENT's own state mutation, not the notification that it should happen
   * — see `HierarchyEditorComponent.onLifecycleClear()`, which schedules the
   * actual `markHighlight = null` / recompute on a microtask using its OWN,
   * still-alive instance, never touching this card again.
   */
  @Output() readonly lifecycleClear = new EventEmitter<void>();
  /**
   * Fired once, from `openAddMark()` only, whenever this card's own picker
   * opens — regardless of whether anything will actually highlight (a
   * blocked picker, `addMarkBlockedReason !== null`, still "opens", and
   * still emits `null` on `propagationHighlightChange`, so that stream alone
   * cannot identify *which* card just opened). `HierarchyEditorComponent`
   * uses this solely to close every other card's own picker (Defect 4,
   * `briefs/mark-propagation-highlight-spec.md` Open Decision 3, refined
   * 2026-09-06: one +Mark picker open at a time) — the one place that
   * decision is made.
   */
  @Output() readonly pickerOpened = new EventEmitter<string>(); // target.id

  addMarkOpen = false;
  selectedDeckerId = "";
  /**
   * Which decker's dot row (`.tc-dots-btn`, `markEntries`) currently owns the
   * transient hover/focus-driven propagation highlight, or `null`. Distinct
   * from `addMarkOpen`, which tracks the separate `+Mark` picker's own open
   * state — the two controls are mutually exclusive armed states, never
   * simultaneously the source of `HierarchyEditorComponent.markHighlight`
   * (`briefs/mark-counter-control-spec.md`).
   */
  armedDotDeckerId: string | null = null;

  constructor(readonly matrixState: MatrixStateService) {}

  get markEntries(): { deckerId: string; count: number }[] {
    return Object.entries(this.target.marks)
      .filter(([, c]) => c > 0)
      .map(([id, count]) => ({ deckerId: id, count }));
  }

  /**
   * Whether at least one of `deckerId`'s current marks on this icon arrived
   * by propagation rather than a direct GM click — rendered as a badge next
   * to that decker's mark row (Xavier's decision 9, 2026-09-03; see
   * `MatrixTarget.propagatedMarks`'s doc comment).
   */
  hasPropagatedMark(deckerId: string): boolean {
    return this.target.propagatedMarks[deckerId] === true;
  }

  /**
   * The marker glyph rendered next to a highlighted icon's name — `▲` for a
   * destination that will actually receive the mark, `△` for one already at
   * `MARK_CAP` that will not (`briefs/mark-propagation-highlight-spec.md`,
   * "Rendering" §4). Meaningless while `propagationDestination` is `null`;
   * the template only renders the marker span under `@if
   * (propagationDestination)`.
   */
  get propagationMarkerGlyph(): string {
    return this.propagationDestination === "capped" ? PROPAGATION_CAPPED_GLYPH : PROPAGATION_LANDING_GLYPH;
  }

  /**
   * The marker's accessible name (`aria-label`/`title`) — names *this one*
   * icon's state, not the whole destination list (that sentence was removed;
   * see `propagationDestinationNames()` for the still-wanted backward-looking
   * list). Xavier's answer, 2026-09-05 Open Decision 6: keep the per-icon
   * label so the cue survives without colour perception.
   */
  get propagationMarkerLabel(): string {
    return this.propagationDestination === "capped"
      ? `Already at the ${MARK_CAP}-mark cap for the selected decker — will receive nothing (p. 236)`
      : "Will also receive 1 mark when this +Mark is confirmed";
  }

  /**
   * Builds and emits the highlight request for the currently selected
   * decker, or `null` when nothing will be placed at all — the same
   * `addMarkBlockedReason !== null` guard the retired `propagationPreview`
   * used, kept as the single choke point for "nothing will be placed -> say
   * nothing" (AC-6). Called only from `openAddMark()` and
   * `onSelectedDeckerChange()`.
   */
  private emitHighlight(): void {
    this.propagationHighlightChange.emit(
      this.addMarkBlockedReason === null
        ? { target: this.target, deckerId: this.selectedDeckerId }
        : null
    );
  }

  /**
   * Path 10 (spec "Lifecycle" table): `@if (availableDeckers.length > 0)`
   * (`html:52`) removes the whole +Mark group's DOM the moment the last
   * available decker disappears from this card's OWN `@Input`s (`activeDeckers`
   * replaced, or `target`'s `marks` mutated through a path that also touches
   * an `@Input` reference), but leaves `addMarkOpen === true` — stranding any
   * highlight this card sourced with no click to clear it. **This hook alone
   * does not cover every way the last available decker can disappear** — an
   * external write that caps `target.marks` without changing any `@Input`
   * (e.g. a mark placed on this exact icon from session sync, or from a
   * different GM control) fires no `@Input` change here at all, so
   * `ngOnChanges` never runs for it.
   * `HierarchyEditorComponent.recomputeHighlight()` is the other half — it
   * runs on every `matrixState.stateChange$` tick regardless of any `@Input`,
   * and closes this card's picker for exactly that case (Defect 7,
   * round-6 review). Path 11: a reused card instance's `target` `@Input` is
   * swapped out from under an open picker. Both close the picker here and
   * emit `lifecycleClear` (see that field's doc comment — this method itself
   * runs mid-change-detection-pass, which is exactly why that event's
   * PAYLOAD/EMIT stays synchronous while its EFFECT on the parent is what
   * gets deferred).
   */
  ngOnChanges(changes: SimpleChanges): void {
    let shouldClear = false;
    if (this.addMarkOpen && this.availableDeckers.length === 0) {
      this.addMarkOpen = false;
      shouldClear = true;
    }
    if (changes["target"] && this.addMarkOpen) {
      this.addMarkOpen = false;
      shouldClear = true;
    }
    // Dot-row equivalent of the two guards above (`briefs/mark-counter-control-spec.md`
    // affected-paths table A): the armed decker's own dot control is
    // stranded, with no click ever available to clear it, either when the
    // whole `target` @Input is swapped out from under it (same hazard as
    // path 11 for `addMarkOpen`) or when the armed decker specifically no
    // longer has room on this icon (the dot-row analogue of path 10's
    // "last available decker disappeared" — the dot row has no
    // `availableDeckers` list to empty, so the per-decker cap check stands
    // in for it).
    if (this.armedDotDeckerId !== null
        && (changes["target"] || this.blockedReasonFor(this.armedDotDeckerId) !== null)) {
      this.armedDotDeckerId = null;
      shouldClear = true;
    }
    if (shouldClear) {
      this.lifecycleClear.emit();
    }
  }

  /**
   * Every other clear path in the spec's lifecycle table (target deleted,
   * Public Space collapsed, host collapsed, host deleted, panel collapsed)
   * destroys this card's component instance rather than firing an event on
   * it, so `ngOnDestroy` is the one place all of them converge. Guarded on
   * `addMarkOpen` — only a card whose own picker was open could have been the
   * source of the current highlight, so a card with no open picker being
   * destroyed elsewhere in the tree (e.g. an unrelated target deleted while
   * a different card's picker is open) does not spuriously clear a highlight
   * that has nothing to do with it.
   */
  ngOnDestroy(): void {
    if (this.addMarkOpen || this.armedDotDeckerId !== null) {
      this.lifecycleClear.emit();
    }
  }

  /**
   * Closes this card's own picker with **no emit at all** — distinct from
   * every path above, which all clear the shared highlight. Two callers,
   * both in `HierarchyEditorComponent`, both cases where the highlight is
   * being handled by the caller directly rather than by this card's own
   * lifecycle:
   *
   * 1. `onPickerOpened()` (Defect 4) — a DIFFERENT card's picker just opened
   *    and became the sole owner of the shared highlight; this card's picker
   *    closes because only one may be open at a time, not because its own
   *    highlight needs clearing (it already isn't the current one).
   * 2. `recomputeHighlight()` (Defect 7) — an external write capped every
   *    decker on THIS card's own icon while its picker was open; the editor
   *    has already cleared `markHighlight` itself (it owns that state), so
   *    this card only needs to close its own picker UI, not emit again.
   *
   * Round-10 review, Defect 1: also silently disarms `armedDotDeckerId`.
   * `closeAllPickersExcept()` (`HierarchyEditorComponent`) calls this on
   * every card OTHER than the one whose picker just opened — including a
   * card that is not the new highlight owner because its own +Mark picker
   * was open, but because the GM's pointer is still resting on one of its
   * dot controls from an earlier hover (`onDotRowEnter()`), unrelated to the
   * picker that is opening elsewhere. `HierarchyEditorComponent` already
   * treats "another picker opened" as taking sole ownership of the shared
   * highlight away from this card; leaving `armedDotDeckerId` set here left
   * a stale local arm that a later, ordinary `mouseleave`
   * (`onDotRowLeave()`) could not tell apart from still owning the
   * highlight — its `armedDotDeckerId === deckerId` guard only checks
   * whether THIS card thinks it is still armed, not whether the shared
   * highlight is still this card's to clear, and a card cannot see
   * `markHighlight` to make that check itself. Disarming here, in the one
   * place ownership handoff is already decided, closes that gap without
   * plumbing the shared highlight down to every card.
   */
  closePickerSilently(): void {
    this.addMarkOpen = false;
    this.armedDotDeckerId = null;
  }

  /**
   * Backward-looking, decker-independent, **cap-free**: every icon a mark on
   * this target would propagate to, named for the × remove-mark tooltip
   * (`html:46-47`). This is a *separate*, still-wanted feature from the
   * highlight above — it names where a mark **already went** so the GM can
   * hand-correct by hand (this app has no undo, `RULINGS.md` 2026-09-03,
   * "Propagation is visible, not reversible"), where the highlight names
   * where a mark is **about to go**, before the GM commits. Different tenses;
   * do not merge them back into one accessor.
   *
   * Carries **no** cap wording, deliberately: what an ancestor holds *now*
   * says nothing about what it held when the propagation actually occurred,
   * and no per-source mark ledger exists to check
   * (`RULINGS.md` 2026-09-03, "Propagation is visible, not reversible").
   *
   * `null` when there is nothing to name — the remove tooltip then falls
   * back to its plain, unchanged message.
   */
  propagationDestinationNames(): string | null {
    const stops = this.matrixState.previewPropagation(this.target, "");
    if (stops.length === 0) return null;
    return stops.map(TargetCardComponent.stopName).join(", ");
  }

  /** `kind === "host"` renders as `Host <name>`; `kind === "target"` as `<name>`. */
  private static stopName(stop: PropagationStop): string {
    return stop.kind === "host" ? `Host ${stop.name}` : stop.name;
  }

  /**
   * Deckers that still have room for another mark (count < 3, p. 236).
   *
   * Nameless participants are excluded: `marks` is keyed by `decker.name`, so
   * one cannot hold a mark. `BattleTrackerComponent.matrixActiveDeckers`
   * already filters these out, but this component takes `activeDeckers` as an
   * `@Input` from whoever mounts it — so the guard lives here too rather than
   * trusting every future caller. Without it the picker renders an option
   * with a blank label and an empty value, and `confirmAddMark()` then bails
   * silently on the falsy id.
   */
  get availableDeckers(): MatrixParticipant[] {
    return this.activeDeckers
      .filter(d => (d.name ?? "").trim() !== "")
      .filter(d => (this.target.marks[d.name] ?? 0) < MARK_CAP);
  }

  /**
   * Why the confirm button is disabled, or `null` when it is usable. Shown to
   * the GM instead of the button doing nothing when clicked — the failure mode
   * a blank picker produced.
   */
  get addMarkBlockedReason(): string | null {
    return this.blockedReasonFor(this.selectedDeckerId);
  }

  /**
   * Same logic as `addMarkBlockedReason`, parameterized — a dot row's decker
   * is fixed by `markEntries` and is not necessarily `this.selectedDeckerId`
   * (the `+Mark` picker's own selection). `addMarkBlockedReason` delegates
   * here so the two definitions cannot drift
   * (`briefs/mark-counter-control-spec.md`, affected-paths table A).
   */
  blockedReasonFor(deckerId: string): string | null {
    if (!deckerId) return "Pick a decker first";
    if ((this.target.marks[deckerId] ?? 0) >= MARK_CAP) {
      return `${deckerId} already holds the maximum ${MARK_CAP} marks on this icon (p. 236)`;
    }
    return null;
  }

  get canConfirmAddMark(): boolean {
    return this.addMarkBlockedReason === null;
  }

  dots(count: number): string {
    return "●".repeat(count) + "○".repeat(MARK_CAP - count);
  }

  deckerLabel(deckerId: string): string {
    return this.activeDeckers.find(d => d.name === deckerId)?.name ?? deckerId;
  }

  openAddMark(): void {
    this.addMarkOpen = true;
    if (!this.selectedDeckerId && this.availableDeckers.length > 0) {
      this.selectedDeckerId = this.availableDeckers[0].name;
    }
    // Defect 4: announce ownership before the highlight itself, so the
    // editor can close every other card's picker even when this one turns
    // out to be blocked (emitHighlight() below would emit null for that
    // case, which carries no target identity at all).
    this.pickerOpened.emit(this.target.id);
    this.emitHighlight();
  }

  /** Bound to the picker's `<select>` (`html:59`) instead of `[(ngModel)]` so a decker switch also recomputes the highlight. */
  onSelectedDeckerChange(id: string): void {
    this.selectedDeckerId = id;
    this.emitHighlight();
  }

  confirmAddMark(): void {
    if (!this.selectedDeckerId) return;
    if ((this.target.marks[this.selectedDeckerId] ?? 0) >= MARK_CAP) return;
    this.matrixState.addMark(this.target, this.selectedDeckerId);
    this.addMarkOpen = false;
    // Ordering matters: addMark() above fires stateChange$, which triggers
    // the editor's own recompute from the still-live markHighlight; emitting
    // null after is what actually clears it (spec Lifecycle table, path 1).
    this.propagationHighlightChange.emit(null);
  }

  cancelAddMark(): void {
    this.addMarkOpen = false;
    this.propagationHighlightChange.emit(null);
  }

  removeMark(deckerId: string): void {
    this.matrixState.removeMark(this.target, deckerId);
  }

  /**
   * Arms the dot control for `deckerId` — mouse (`mouseenter`) and keyboard
   * (`onDotRowFocus`, same body) both pass through here first, since a
   * pointer cannot click something without entering it and a keyboard
   * cannot activate something without first tabbing onto it
   * (`briefs/mark-counter-control-spec.md`, "Proposed approach" §2). Shows
   * the same propagation-highlight disclosure `openAddMark()` gives the
   * `+Mark` picker — unless this decker is already capped on this icon, in
   * which case nothing is emitted at all: there is nothing to preview
   * (no highlight for a capped decker — nothing will land).
   *
   * No-op entirely while `dotAddBlocked` (Open Decision 2, Option B): the
   * `[disabled]` attribute on `.tc-dots-btn` refuses `click`, but a browser
   * still delivers `mouseenter`/`focus` to a disabled `<button>` (unlike
   * `click`, `disabled` does not suppress hover/focus events) — without this
   * guard, hovering a *blocked* dot control would still arm it and steal
   * `HierarchyEditorComponent.markHighlight` away from whatever other
   * picker Option B exists to protect, defeating the whole point of
   * `dotAddBlocked` (`briefs/mark-counter-control-spec.md`'s S4 exists
   * exactly to catch this).
   */
  /**
   * Whether this card's dot controls refuse to arm or commit an add.
   *
   * Two independent reasons, deliberately combined here rather than in the
   * template so `onDotRowEnter()`/`onDotClick()` and the `[disabled]`
   * binding can never disagree:
   *
   * - `dotAddBlocked` — a picker is open somewhere ELSE in the tree
   *   (`HierarchyEditorComponent.anyOtherPickerOpen(t.id)`, Xavier's
   *   Option B, `briefs/mark-counter-control.md` 2026-09-10).
   * - `addMarkOpen` — THIS card's own `+Mark` picker is open. The editor's
   *   `anyOtherPickerOpen()` cannot supply this: it detects an open card
   *   picker by inspecting the shared `markHighlight`, and a hovered dot
   *   sets that same highlight, so a card passing its own id is the only
   *   thing keeping its dots from disabling themselves on hover. That
   *   self-exclusion left the same-card case uncovered — with a picker open
   *   on decker A, brushing decker B's dots on the SAME icon hijacked the
   *   highlight to B, and the following ordinary `mouseleave` cleared it
   *   entirely, leaving A's picker open, confirmable, and showing no
   *   disclosure at the moment of commit (round-3 review, 2026-09-10).
   *   `RULINGS.md` 2026-09-03 requires that disclosure, so the dots go
   *   inert while this card's own picker owns the decision.
   *
   * Removal is deliberately NOT gated on this — `onDotRightClick()` stays
   * live in both cases, per the spec's "removal is never blocked".
   */
  get dotAddDisabled(): boolean {
    return this.dotAddBlocked || this.addMarkOpen;
  }

  onDotRowEnter(deckerId: string): void {
    if (this.dotAddDisabled) return;
    this.armedDotDeckerId = deckerId;
    if (this.blockedReasonFor(deckerId) === null) {
      this.propagationHighlightChange.emit({ target: this.target, deckerId });
    }
  }

  /** Keyboard equivalent of `onDotRowEnter` — see that method's doc comment. */
  onDotRowFocus(deckerId: string): void {
    this.onDotRowEnter(deckerId);
  }

  /**
   * Disarms the dot control for `deckerId` — mouse (`mouseleave`) and
   * keyboard (`onDotRowBlur`, same body). Only clears if this decker is the
   * one currently armed, so a stray leave event for a row that never armed
   * anything (e.g. this decker was capped, so `onDotRowEnter` emitted
   * nothing) cannot clear an unrelated highlight.
   */
  onDotRowLeave(deckerId: string): void {
    if (this.armedDotDeckerId === deckerId) {
      this.armedDotDeckerId = null;
      this.propagationHighlightChange.emit(null);
    }
  }

  /** Keyboard equivalent of `onDotRowLeave` — see that method's doc comment. */
  onDotRowBlur(deckerId: string): void {
    this.onDotRowLeave(deckerId);
  }

  /**
   * Commits: adds exactly one mark to `deckerId` on this icon, regardless of
   * which dot the pointer/focus happens to be over (Open Decision 1,
   * click-adds-one, always — not click-sets-count-to-N). No-op while
   * `dotAddBlocked` (another picker is open and unconfirmed elsewhere in the
   * tree, Open Decision 2 Option B) or while this decker is already capped.
   * Ordering matches `confirmAddMark()`: `addMark()` fires `stateChange$`
   * first, and the clearing emit goes after.
   */
  onDotClick(deckerId: string): void {
    if (this.dotAddDisabled || this.blockedReasonFor(deckerId) !== null) return;
    this.matrixState.addMark(this.target, deckerId);
    this.armedDotDeckerId = null;
    this.propagationHighlightChange.emit(null);
  }

  /**
   * Right-click-to-remove — suppresses the native browser context menu on
   * this control only, then delegates to the existing, unchanged
   * `removeMark()`. Never blocked by the 3-mark cap or by `dotAddBlocked` —
   * capped/blocked only ever refuses an *add*.
   *
   * Round-10 review, Defect 2: if this decker's dot row is the one currently
   * armed (`onDotRowEnter()`, showing "this will also mark…"), a right-click
   * here is the GM choosing to *remove* instead of confirming that add — the
   * armed add-highlight is stale the instant this fires, since removing a
   * mark cannot be what it was warning about. Disarms and clears it the same
   * way `onDotClick()`/`onDotRowLeave()` do, rather than leaving it to show
   * until the pointer eventually leaves.
   */
  onDotRightClick(event: MouseEvent, deckerId: string): void {
    event.preventDefault();
    this.removeMark(deckerId);
    if (this.armedDotDeckerId === deckerId) {
      this.armedDotDeckerId = null;
      this.propagationHighlightChange.emit(null);
    }
  }

  typeIcon(type: MatrixTargetType): string {
    switch (type) {
      case "device":  return "fas fa-microchip";
      case "file":    return "fas fa-file-alt";
      case "persona": return "fas fa-user-circle";
      case "ic":      return "fas fa-shield-alt";
      case "host":    return "fas fa-server";
      default:        return "fas fa-question-circle";
    }
  }

  typeLabel(type: MatrixTargetType): string {
    switch (type) {
      case "device":  return "Device";
      case "file":    return "File";
      case "persona": return "Persona";
      case "ic":      return "IC Target";
      case "host":    return "Host";
      default:        return type as string;
    }
  }

  visibilityLabel(v: MatrixTargetVisibility): string {
    switch (v) {
      case "hidden":         return "HIDDEN";
      case "running-silent": return "RUNNING SILENT";
      case "active":         return "NORMAL";
    }
  }

  visibilityClass(v: MatrixTargetVisibility): string {
    switch (v) {
      case "hidden":         return "spotted-invisible";
      case "running-silent": return "spotted-ghost";
      case "active":         return "spotted-revealed";
    }
  }
}
