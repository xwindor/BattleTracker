import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, QueryList, SimpleChanges, ViewChild, ViewChildren } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NgbTooltipModule } from "@ng-bootstrap/ng-bootstrap";
import { Subscription } from "rxjs";
import {
  MatrixParticipant,
  MatrixHost,
  MatrixTarget,
  MatrixTargetType,
  MatrixTargetVisibility,
  matrixConditionMonitor
} from "Matrix";
import { MatrixStateService, PropagationStop, MARK_CAP } from "app/services/matrix-state.service";
import {
  TargetCardComponent,
  MarkHighlightRequest,
  PropagationHighlightState
} from "app/matrix/target-card/target-card.component";
import { GeneratedNameKind, generateName, normaliseNameForComparison } from "app/shared/name-generator";

interface HostFormState {
  active: boolean;
  isEditing: boolean;
  host: MatrixHost | null;
  name: string;
  rating: number;
  attack: number;
  sleaze: number;
  dataProcessing: number;
  firewall: number;
  setActive: boolean;
}

interface TargetFormState {
  active: boolean;
  isEditing: boolean;
  target: MatrixTarget | null;
  /** null = public space; host.id = inside that host */
  hostId: string | null;
  name: string;
  type: MatrixTargetType;
  visibility: MatrixTargetVisibility;
  deviceRating: number;
  linkedParticipantId: string;
  /**
   * Buffered "Parent" choice (`briefs/parent-picker-into-edit-view-spec.md`,
   * Option A — Save-buffered). Empty string = no parent. Committed only by
   * `saveTargetForm()`, via `setParent()`/`clearParent()` so the
   * self/descendant guard stays the single choke point it already was for
   * the old tree-row control (Open Decision 4).
   */
  parentTargetId: string;
  /**
   * Inline message shown in the form when the buffered Parent choice above
   * was rejected at the last Save attempt (2026-09-09, Xavier: "a rejected
   * re-parent must say so" — supersedes the old AC-8 silent-drop). `null`
   * when there is nothing to report. Cleared whenever the GM changes the
   * Parent selection (`onParentSelectionChange()`) or reopens/re-blanks the
   * form (`openAddTarget()`/`openEditTarget()`/`closeTargetForm()`, all of
   * which build a fresh `TargetFormState` rather than mutating this one), so
   * a stale message can never linger past the condition that caused it.
   */
  parentError: string | null;
  /**
   * Render anchor for a form opened via a device's "+" control
   * (`briefs/add-child-button-spec.md`) — the id of the device this form was
   * opened as a child of, or `null` for every other Add/Edit session
   * (Loose Device, per-type host buttons, Edit). Deliberately distinct from
   * `parentTargetId` above: this field only decides WHERE the form renders
   * (`publicTargetNodeTpl`'s node-specific slot vs. the fixed top-of-
   * Public-Space slot) and is fixed at open time; it must not move if the
   * GM edits the Parent dropdown mid-session (AC-8), which only affects
   * `parentTargetId`.
   */
  addChildOfId: string | null;
}

const BLANK_HOST_FORM: HostFormState = {
  active: false, isEditing: false, host: null,
  name: "", rating: 4, attack: 4, sleaze: 5, dataProcessing: 6, firewall: 7,
  setActive: true
};

const BLANK_TARGET_FORM: TargetFormState = {
  active: false, isEditing: false, target: null, hostId: null,
  name: "", type: "device", visibility: "hidden",
  deviceRating: 4, linkedParticipantId: "", parentTargetId: "",
  parentError: null, addChildOfId: null
};

/**
 * Matrix Condition Monitor for a target being saved from this form, or
 * `undefined` when the type has none at all.
 *
 * - `device` and `persona`: 8 + ceil(Device Rating / 2) (p. 228). A persona's
 *   damage lands on the device it runs on, not on a monitor of its own
 *   (p. 228), so it is sized off the same Device Rating field the GM enters
 *   for a device — never the hard-coded rating of 1 the port used to pass.
 * - `ic`: 8 + ceil(Host Rating / 2) — IC borrows its host's rating, it has no
 *   Device Rating of its own (p. 247; size per Table Ruling 2, RULINGS.md
 *   2026-08-29).
 * - `file` and `host`: no Matrix Condition Monitor at all — hosts and files
 *   cannot be attacked with Matrix damage (p. 229). No `default` branch: an
 *   unhandled `MatrixTargetType` is a compile error here, not a silent 9
 *   (choke point — see briefs/matrix-port-rules-correctness-spec.md
 *   appendix G1).
 */
function calcMatrixHealth(type: MatrixTargetType, deviceRating: number, hostRating: number): number | undefined {
  switch (type) {
    case "device":
    case "persona":
      return matrixConditionMonitor(deviceRating);
    case "ic":
      return matrixConditionMonitor(hostRating);
    case "file":
    case "host":
      return undefined;
  }
}

/**
 * A PAN master device's slaved-device cap: Device Rating × 3
 * (`briefs/pan-membership-spec.md`, "Governing rules" — "A PAN is a master
 * device (commlink/deck) plus devices slaved to it, capped at (Device
 * Rating × 3) slaves," p. 233). Counts devices only — see
 * `HierarchyEditorComponent.slaveCapWarning()`.
 */
const DEVICE_SLAVE_CAP_MULTIPLIER = 3; // p. 233

@Component({
  standalone: true,
  selector: "app-hierarchy-editor",
  templateUrl: "./hierarchy-editor.component.html",
  styleUrls: ["./hierarchy-editor.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule, TargetCardComponent]
})
export class HierarchyEditorComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) activeDeckers!: MatrixParticipant[];

  /**
   * The new-host name box. Focused from `openAddHost()` rather than with the
   * `autofocus` attribute, which the template a11y rules forbid.
   */
  @ViewChild("hostNameInput") hostNameInput?: ElementRef<HTMLInputElement>;

  /**
   * Every `TargetCardComponent` currently rendered anywhere in this tree
   * (public space and every expanded host), regardless of the recursive
   * `ngTemplateOutlet` nesting used to render public-space nodes — Angular's
   * `@ViewChildren` walks the rendered view, not the static template.
   * `onPickerOpened()` (Defect 4) and `recomputeHighlight()` (Defect 7) are
   * the two, and only, readers.
   */
  @ViewChildren(TargetCardComponent) private targetCardsQuery!: QueryList<TargetCardComponent>;

  publicSpaceExpanded = true;
  expandedHosts = new Set<string>();

  hostForm: HostFormState = { ...BLANK_HOST_FORM };
  targetForm: TargetFormState = { ...BLANK_TARGET_FORM };

  // Expose type enum to template
  readonly TARGET_TYPES: MatrixTargetType[] = ["device", "file", "persona", "ic"];

  /**
   * Types that can HAVE a parent (`canHaveParent()`) — widened by
   * `briefs/pan-membership-spec.md` from device-only to device/file/persona.
   * A file or persona's parent is a location fact ("lives on" / "runs on"
   * the device), never real PAN slaving — only a device is ever a PAN
   * slave, master, or member (p. 233). `"ic"` and `"host"` are deliberately
   * excluded: IC only ever exists inside a host (p. 235), and a nested host
   * is not modelled here at all. The single definition of "can have a
   * parent" — read by `canHaveParent()`, the template's Parent-field getter,
   * `saveTargetForm()`'s cycle-check gate, and `parentDropWarning()` — so no
   * second copy of this type list exists anywhere, including the template.
   * Matches the `private static`, `TARGET_TYPES`-style pattern above.
   */
  private static readonly PARENTABLE_TYPES: readonly MatrixTargetType[] = ["device", "file", "persona"];

  /**
   * The +Mark picker currently open somewhere in this tree, or `null` when
   * none is. Set only from `onPropagationHighlightChange()`, which
   * `TargetCardComponent.propagationHighlightChange` drives.
   *
   * Open Decision 3, refined 2026-09-06 (Defect 4, extended the same day by
   * N-1, round-7 review): "last-opened wins" still governs which chain this
   * highlights, unchanged from the original spec — but as of this round, at
   * most one **picker of any kind** is ever open at all
   * (`closeAllPickersExcept()` below) — a card's own +Mark control, or the
   * host's own +Mark control (`hostMarkState`) — so "last-opened wins" is
   * now purely about which highlight is showing, never about a second,
   * losing picker being left open and armed with no visible highlight.
   * Defect 4 originally covered only card pickers; N-1 found the host
   * control was a third picker outside that mechanism, reachable end to
   * end (open the host's +Mark, then a card's, then cancel the card's — the
   * host's stayed open and armed, with no highlight anywhere to warn the
   * GM, and it survived a collapse/re-expand of the host besides). This
   * field is still the single source of truth for the highlight; no second
   * field tracks "which picker is open" — that is simply
   * `markHighlight?.target.id` when non-blocked, or the id
   * `onPickerOpened()` was last called with. The host control's own
   * open/closed state lives in `hostMarkState`, not here — it carries no
   * highlight of its own (a host mark is placed directly, never
   * propagated), so there is nothing for this field to track for it beyond
   * making sure it, too, closes.
   */
  markHighlight: MarkHighlightRequest | null = null;
  /**
   * `PropagationStop.id -> PropagationStop`, recomputed wholesale by
   * `recomputeHighlight()` every time `markHighlight` changes or
   * `matrixState.stateChange$` fires. `highlightStateFor()` is an O(1)
   * `Map.get` against this so it is safe to call from the template on every
   * node on every change-detection tick — the actual propagation walk
   * (`previewPropagation()`) runs exactly once per state change here, never
   * once per node (`briefs/mark-propagation-highlight-spec.md`, "Proposed
   * approach" §2). Do not call `previewPropagation()` from
   * `highlightStateFor()` or any other per-node accessor.
   */
  private highlightByNodeId = new Map<string, PropagationStop>();
  private stateChangeSub?: Subscription;

  constructor(readonly matrixState: MatrixStateService) {}

  get state() { return this.matrixState.state; }

  ngOnInit(): void {
    // A mark placed or removed elsewhere (host mark controls, session sync,
    // jackOut()) while a picker is open must update a still-open highlight's
    // cap state (spec Lifecycle table, path 12/13) — not clear it.
    //
    // `closeExhaustedHostPickers()` is a separate call, not folded into
    // `recomputeHighlight()` itself — round-8 review confirmed
    // `recomputeHighlight()` has zero references to `hostMarkState` and
    // must stay that way (it computes the tree-wide propagation highlight,
    // a card-picker concern; the host's own +Mark control is a distinct
    // picker with its own lifecycle, same relationship `hostMarkState` and
    // `markHighlight` already have everywhere else in this component).
    this.stateChangeSub = this.matrixState.stateChange$.subscribe(() => {
      this.recomputeHighlight();
      this.closeExhaustedHostPickers();
    });
  }

  /**
   * Round-9 review (`host-mark-control-parity-spec.md`): the host +Mark
   * picker can also be stranded-and-armed by a route that changes decker
   * availability WITHOUT ever touching `MatrixStateService` — `enableDeck()`
   * / `removeDeck()` (`battle-tracker.component.ts`) and
   * `CombatManager.removeParticipant()` all mutate `activeDeckers` and
   * arrive here purely as an `@Input` change, never through
   * `matrixState.stateChange$`. Before this, `closeExhaustedHostPickers()`
   * had exactly one caller — the `stateChange$` subscription in `ngOnInit()`
   * — so that whole input-driven route went unreconciled: the `@if
   * (hostAvailableDeckers(host).length > 0)` gate (`html:196`) still hid the
   * DOM the instant availability hit zero, but `hostMarkState` itself sat
   * untouched, `open: true` and armed, until a decker became available
   * again — at which point the picker reappeared already armed, placeable
   * on the very next tap with no fresh +Mark click.
   *
   * This mirrors `TargetCardComponent.ngOnChanges()`'s own two-route split
   * (`target-card.component.ts:195`) — the service route and the input
   * route both have to converge on the same cleanup. Deliberately calls
   * ONLY `closeExhaustedHostPickers()`, never `recomputeHighlight()`:
   * `matrixActiveDeckers` (`battle-tracker.component.ts:1249-1252`) is a
   * getter returning a fresh `.filter()` array on every read, so its
   * reference changes on every change-detection cycle and `ngOnChanges`
   * fires constantly here. `closeExhaustedHostPickers()` is safe at that
   * rate — it `continue`s immediately on any picker that is not open, so it
   * is a no-op walk over a tiny `Map` in the common case.
   * `recomputeHighlight()` is NOT safe at that rate: it calls
   * `previewPropagation()` and would duplicate work
   * `TargetCardComponent.ngOnChanges()` already does for the card-picker
   * highlight. `recomputeHighlight()` stays reachable only from the
   * `stateChange$` subscription above, and stays free of any `hostMarkState`
   * reference — see that method's own doc comment.
   */
  ngOnChanges(_changes: SimpleChanges): void {
    this.closeExhaustedHostPickers();
  }

  ngOnDestroy(): void {
    this.stateChangeSub?.unsubscribe();
  }

  /**
   * The sole consumer of `TargetCardComponent.propagationHighlightChange`,
   * from both tree positions (`html`). Mutates state IMMEDIATELY — safe here
   * because every caller of that output (`openAddMark`, `onSelectedDeckerChange`,
   * `confirmAddMark`, `cancelAddMark`) runs from a DOM event handler, before
   * Angular's own change-detection pass begins. Contrast `onLifecycleClear()`
   * below, whose callers cannot make that guarantee.
   */
  onPropagationHighlightChange(req: MarkHighlightRequest | null): void {
    this.markHighlight = req;
    this.recomputeHighlight();
  }

  /**
   * The sole consumer of `TargetCardComponent.lifecycleClear`, from both tree
   * positions (`html`) — fired only by a card's `ngOnChanges()`/`ngOnDestroy()`,
   * which can themselves run mid-change-detection-pass (round-6 review,
   * defects 1/2/3). Unlike `onPropagationHighlightChange()`, this defers the
   * actual state mutation to a microtask: scheduling the callback is itself
   * synchronous and touches no Angular-bound state, so the emit is safe to
   * receive at any point in a change-detection pass, and the mutation that
   * WOULD trip `NG0100 ExpressionChangedAfterItHasBeenChecked` lands only
   * after the current pass (and its dev-mode verification pass) has fully
   * completed. Microtasks drain before the next paint, so no user-visible
   * frame shows a stale highlight next to an already-closed picker.
   *
   * Deliberately does not reference the calling card at all — by the time
   * this runs, that card may already be destroyed and its own outputs torn
   * down (measured: a version of this fix that instead deferred the EMIT
   * itself, from inside the card, found the parent's subscription already
   * gone by the time the deferred emit fired, and the highlight never
   * cleared). This closure only touches `this` (the still-alive editor), so
   * that failure mode cannot recur here.
   */
  onLifecycleClear(): void {
    Promise.resolve().then(() => this.onPropagationHighlightChange(null));
  }

  /**
   * Defect 4 (round-6 review): the sole consumer of
   * `TargetCardComponent.pickerOpened`, from both tree positions (`html`).
   * Delegates to `closeAllPickersExcept()` — the one place the
   * one-picker-at-a-time decision is actually made, covering every card's
   * own picker AND (N-1, round-7 review) the host's own +Mark control — so
   * a card whose own opening turned out to be blocked (which
   * `onPropagationHighlightChange()` alone cannot see; a blocked open still
   * emits `null`, carrying no target identity) still closes every other
   * picker in the tree. No card, and no host control, decides this for
   * itself.
   */
  onPickerOpened(openedTargetId: string): void {
    this.closeAllPickersExcept({ kind: "card", targetId: openedTargetId });
  }

  /**
   * The single implementation of "one +Mark picker open at a time"
   * (Defect 4, round-6 review; extended to the host's own control by N-1,
   * round-7 review). `keep` identifies the picker that just opened and
   * should stay open; every other picker in the tree — every OTHER card
   * (`TargetCardComponent.closePickerSilently()`, no emit — see that
   * method's doc comment for why silence is correct here) and every OTHER
   * host's `hostMarkState` entry — closes. Picker state stays owned in
   * exactly two places (`targetCardsQuery`'s own cards, and this
   * component's `hostMarkState`); this method is what keeps them
   * consistent with each other, rather than each mechanism only knowing
   * how to close its own kind.
   */
  private closeAllPickersExcept(keep: { kind: "card"; targetId: string } | { kind: "host"; hostId: string }): void {
    this.targetCardsQuery
      .filter(card => !(keep.kind === "card" && card.target.id === keep.targetId))
      .forEach(card => card.closePickerSilently());
    for (const [hostId, state] of this.hostMarkState) {
      if (!(keep.kind === "host" && hostId === keep.hostId)) {
        state.open = false;
      }
    }
  }

  /**
   * Rebuilds `highlightByNodeId` from scratch. Calls
   * `matrixState.previewPropagation()` **exactly once** — never once per
   * node, never once per change-detection tick.
   */
  private recomputeHighlight(): void {
    this.highlightByNodeId.clear();
    if (!this.markHighlight) return;
    const stops = this.matrixState.previewPropagation(this.markHighlight.target, this.markHighlight.deckerId);
    for (const stop of stops) {
      this.highlightByNodeId.set(stop.id, stop);
    }

    // Defect 7 (round-6 review): an external write (session sync, the
    // host's own +Mark control, jackOut()) can cap every decker on the OPEN
    // picker's own icon without ever touching that card's `@Input`s, so
    // `TargetCardComponent.ngOnChanges()`'s path-10 guard never fires for
    // it — this `stateChange$`-driven recompute is the only other place
    // that clear path can run from. Reads the still-live card's own
    // `availableDeckers` getter directly, rather than re-deriving the same
    // two-line decker/MARK_CAP filter here, so the two definitions of
    // "available" can never drift apart.
    const openCard = this.targetCardsQuery.find(card => card.target.id === this.markHighlight?.target.id);
    if (openCard?.addMarkOpen && openCard.availableDeckers.length === 0) {
      openCard.closePickerSilently();
      this.markHighlight = null;
      this.highlightByNodeId.clear();
    }
  }

  /**
   * `"landing"` / `"capped"` / `null` for a target or host id — an O(1) map
   * lookup, safe to call from the template for every node on every tick. Not
   * a source of truth on its own: it only reflects whatever
   * `recomputeHighlight()` last computed.
   */
  highlightStateFor(nodeId: string): PropagationHighlightState | null {
    const stop = this.highlightByNodeId.get(nodeId);
    if (!stop) return null;
    return stop.willLand ? "landing" : "capped";
  }

  // ── Host form ────────────────────────────────────────────────────────────

  openAddHost(): void {
    const r = 4;
    this.hostForm = {
      ...BLANK_HOST_FORM,
      active: true,
      setActive: this.state.currentHostId === null,
      rating: r
    };
    this.suggestAsdfForForm(r);
    this.targetForm = { ...BLANK_TARGET_FORM };
    // The input does not exist until the @if block renders it.
    setTimeout(() => this.hostNameInput?.nativeElement.focus());
  }

  openEditHost(host: MatrixHost): void {
    this.hostForm = {
      active: true, isEditing: true, host,
      name: host.name, rating: host.rating,
      attack: host.attack, sleaze: host.sleaze,
      dataProcessing: host.dataProcessing, firewall: host.firewall,
      setActive: false
    };
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  closeHostForm(): void {
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  suggestAsdf(): void {
    this.suggestAsdfForForm(this.hostForm.rating);
  }

  /**
   * Fill the host form's Name box with a generated host name (brief
   * "cyberpunk-name-generator-spec.md" acceptance criterion 17). Writes
   * `hostForm.name` only - no `matrixState` call, so nothing is saved until
   * the GM presses Save.
   *
   * Defect 2 (validator round): the box's *current* value is folded into
   * `taken` before drawing - `takenMatrixNames()` only sees names already
   * saved onto a host or target, and an in-progress form's name is neither
   * until Save, so without this a press could redraw exactly what's already
   * on screen (rare for `host`'s ~18,000 combinations, but the same call
   * shape as `suggestTargetName()` below, where the small icon corpora make
   * it far more likely).
   */
  suggestHostName(): void {
    const taken = this.takenMatrixNames();
    if (this.hostForm.name) {
      taken.add(normaliseNameForComparison(this.hostForm.name));
    }
    this.hostForm.name = generateName({ kind: "host", taken });
  }

  private suggestAsdfForForm(rating: number): void {
    // "The ratings of these attributes are usually (Host Rating), (Host
    // Rating + 1), (Host Rating + 2), and (Host Rating + 3), in any order"
    // (p. 247, `rules/pages/p0249.txt:36-40`) — round-4 citation, D-12.
    const vals = [rating, rating + 1, rating + 2, rating + 3];
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    [this.hostForm.attack, this.hostForm.sleaze, this.hostForm.dataProcessing, this.hostForm.firewall] = vals;
  }

  saveHostForm(): void {
    const f = this.hostForm;
    if (!f.name.trim()) return;

    const rating = Math.max(1, Math.min(12, f.rating));
    // No matrixHealth here: hosts have no Matrix Condition Monitor (p. 229).

    if (f.isEditing && f.host) {
      this.matrixState.updateHost(f.host, {
        name: f.name.trim(), rating,
        attack: f.attack, sleaze: f.sleaze,
        dataProcessing: f.dataProcessing, firewall: f.firewall
      });
      this.expandedHosts.add(f.host.id);
    } else {
      const host = new MatrixHost({
        id: this.matrixState.generateTargetId().replace("t-", "h-"),
        name: f.name.trim(), rating,
        attack: f.attack, sleaze: f.sleaze,
        dataProcessing: f.dataProcessing, firewall: f.firewall
      });
      this.matrixState.addHost(host);
      if (f.setActive) {
        this.matrixState.setCurrentHost(host.id);
      }
      this.expandedHosts.add(host.id);
    }
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  deleteHost(host: MatrixHost): void {
    this.matrixState.removeHost(host);
    this.expandedHosts.delete(host.id);
    if (this.hostForm.host === host) this.hostForm = { ...BLANK_HOST_FORM };
  }

  setActiveHost(host: MatrixHost): void {
    this.matrixState.setCurrentHost(host.id);
  }

  clearActiveHost(): void {
    this.matrixState.clearActiveHost();
  }

  // ── Target form ──────────────────────────────────────────────────────────

  openAddTarget(host: MatrixHost | null, type: MatrixTargetType): void {
    this.targetForm = {
      ...BLANK_TARGET_FORM,
      active: true,
      hostId: host?.id ?? null,
      type,
      visibility: "hidden"
    };
    this.hostForm = { ...BLANK_HOST_FORM };
    if (host) this.expandedHosts.add(host.id);
  }

  openEditTarget(host: MatrixHost | null, target: MatrixTarget): void {
    this.targetForm = {
      active: true, isEditing: true, target,
      hostId: host?.id ?? null,
      name: target.name,
      type: target.type,
      visibility: target.visibility,
      deviceRating: target.deviceRating,
      linkedParticipantId: target.linkedParticipantId ?? "",
      parentTargetId: target.parentTargetId ?? "",
      parentError: null,
      addChildOfId: null
    };
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  closeTargetForm(): void {
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  /**
   * Opens a fresh Add-device form pre-seeded as a child of `parentTarget`
   * (`briefs/add-child-button-spec.md`), from the "+" control on a device's
   * own card. Reuses `BLANK_TARGET_FORM` rather than duplicating
   * `openAddTarget()`'s body, so both share one source of truth for what a
   * fresh Add session defaults to. Always public space (`hostId: null`,
   * `type: "device"`) — the "+" control that calls this is gated by
   * `canBeParent()`, not `canHaveParent()` (`briefs/pan-membership-spec.md`:
   * `canHaveParent()` now also admits public-space files and personas, but
   * only a device can ever BE a parent), so a caller-supplied `parentTarget`
   * is always a public-space device.
   *
   * Seeds two fields, deliberately different in nature: `parentTargetId` is
   * the ordinary buffered Parent-dropdown value (editable, matches Save's
   * existing commit path unchanged); `addChildOfId` is a separate render
   * anchor recording where the form should appear, fixed at open time —
   * changing the Parent dropdown afterwards must not move it (AC-8).
   */
  openAddChildTarget(parentTarget: MatrixTarget): void {
    this.targetForm = {
      ...BLANK_TARGET_FORM,
      active: true,
      hostId: null,
      type: "device",
      visibility: "hidden",
      parentTargetId: parentTarget.id,
      addChildOfId: parentTarget.id
    };
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  /**
   * Fill the target form's Name box with a generated icon name (brief
   * "cyberpunk-name-generator-spec.md" acceptance criterion 18). The corpus
   * follows `targetForm.type` - a device, a file, a persona or an IC read
   * differently on the Matrix Perception readout, so their names come from
   * different word lists.
   *
   * Defect 2 (validator round): the box's *current* value is folded into
   * `taken` before drawing, for the same reason as `suggestHostName()` above
   * - and worse here, since `ic` (20 options) and `persona` (30) are small
   * enough that a redraw of the on-screen value was reachable roughly one
   * press in 20-30 without this.
   */
  suggestTargetName(): void {
    const kind = this.iconKindFor(this.targetForm.type);
    const taken = this.takenMatrixNames();
    if (this.targetForm.name) {
      taken.add(normaliseNameForComparison(this.targetForm.name));
    }
    this.targetForm.name = generateName({ kind, taken });
  }

  /**
   * Which corpus a target icon's generate button draws from, keyed off
   * `MatrixTargetType`. Exhaustive `switch`, no `default` branch - the same
   * deliberate shape as `calcMatrixHealth` above, so a future
   * `MatrixTargetType` is a compile error here rather than a silent
   * fallback. `"host"` is included for exhaustiveness only: `targetForm.type`
   * is drawn from `TARGET_TYPES`, which never contains `"host"` - a host's
   * own name comes from `suggestHostName()`, not this form.
   */
  private iconKindFor(type: MatrixTargetType): GeneratedNameKind {
    switch (type) {
      case "device": return "device";
      case "file": return "file";
      case "persona": return "persona";
      case "ic": return "ic";
      case "host": return "host";
    }
  }

  /**
   * Every Matrix host and target name already in use, normalised - the
   * uniqueness scope for a generated host or target name (brief "Uniqueness
   * scope"). A separate namespace from `takenCombatantNames()` on the GM
   * component: a host called "Vulture" and a ganger called "Vulture" are not
   * confusable in any log line.
   */
  private takenMatrixNames(): Set<string> {
    const names = new Set<string>();
    for (const host of this.state.hosts) {
      names.add(normaliseNameForComparison(host.name));
      for (const target of host.targets) {
        names.add(normaliseNameForComparison(target.name));
      }
    }
    for (const target of this.state.publicTargets) {
      names.add(normaliseNameForComparison(target.name));
    }
    return names;
  }

  saveTargetForm(): void {
    const f = this.targetForm;
    if (!f.name.trim()) return;

    // Validate the buffered Parent choice BEFORE committing anything else.
    // 2026-09-09 (Xavier): "a rejected re-parent must say so" — supersedes
    // the old AC-8 silent-drop. A self/descendant cycle now blocks the WHOLE
    // save, with a visible message, rather than writing every other field
    // and quietly dropping only the parent half. Only checked when the
    // field is still meaningful for this save (an existing target, staying
    // a public-space device/file/persona — PARENTABLE_TYPES,
    // `briefs/pan-membership-spec.md`) — a type change away from a
    // parentable type (Scenario 2) still drops the buffered value silently
    // in `commitParentField()` below, because that is not a rejected
    // choice, just a field that no longer applies. A parent that was simply
    // deleted from state since the form opened is a different, more benign
    // case again (not an impossible nesting, just a stale option) — left to
    // `setParent()`'s existing guard to drop silently once the rest of the
    // save commits, rather than raising this message.
    //
    // Widening this gate to PARENTABLE_TYPES matters: without it, a file
    // being re-parented onto one of its own descendants would skip the
    // cycle guard entirely and corrupt the tree (`briefs
    // /pan-membership-spec.md`, "saveTargetForm()'s cycle-check gate").
    if (f.isEditing && f.target && f.parentTargetId
        && HierarchyEditorComponent.PARENTABLE_TYPES.includes(f.type) && f.hostId === null
        && this.wouldCreateCycle(f.target, f.parentTargetId)) {
      f.parentError = "Can't parent this under one of its own children.";
      return; // block the whole save — commit nothing
    }

    const host = f.hostId ? (this.state.hosts.find(h => h.id === f.hostId) ?? null) : null;
    const deviceRating = Math.max(1, f.deviceRating);
    // "ic" targets have no Device Rating of their own — they borrow the
    // containing host's Rating (p. 247); fall back to deviceRating only for
    // an "ic" target sitting in public space, which should not happen from
    // this form (IC Target is only offered when a host is selected) but
    // leaves no undefined rating if it ever does.
    const health = calcMatrixHealth(f.type, deviceRating, host?.rating ?? deviceRating) ?? 0;

    if (f.isEditing && f.target) {
      // Captured BEFORE the type change commits: whether this target could
      // be chosen as a parent under its OLD type/context
      // (`briefs/pan-membership-spec.md` D1). If a Save flips that from
      // true to false — the only live case today is device → file/persona,
      // since `canBeParent()` is device-only — any children still pointing
      // at this target's id via `parentTargetId` would otherwise go on
      // rendering nested under what the tree now shows as a non-device,
      // which p. 233 forbids. Re-home them through the same path
      // `deleteTarget()` uses, rather than duplicating that logic here.
      const couldBeParentBefore = this.canBeParent(f.target);
      this.matrixState.updateTarget(f.target, {
        name: f.name.trim(),
        type: f.type,
        visibility: f.visibility,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        linkedParticipantId: f.linkedParticipantId || undefined,
        matrixHealth: health
      });
      if (couldBeParentBefore && !this.canBeParent(f.target)) {
        this.rehomeChildrenOf(f.target);
      }
      this.commitParentField(f.target, f.parentTargetId);
    } else {
      const target = new MatrixTarget({
        id: this.matrixState.generateTargetId(),
        name: f.name.trim(),
        type: f.type,
        context: host ? "host" : "public",
        visibility: f.visibility,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        linkedParticipantId: f.linkedParticipantId || undefined,
        linkedHostId: f.hostId ?? undefined,
        matrixHealth: health
      });
      this.matrixState.addTarget(host, target);
      this.commitParentField(target, f.parentTargetId);
    }
    this.targetForm = { ...BLANK_TARGET_FORM };
  }

  /**
   * Removes a target. Round-5 defect D-4: an open-grid target that is
   * itself a parent left its children pointing at a now-deleted
   * `parentTargetId` — `childrenOf()` filters on the parent's id, so those
   * children simply stopped rendering anywhere, while still counting toward
   * the "Public Space" header count and still broadcasting to the player
   * view. Direct children are re-homed to top level (their `parentTargetId`
   * cleared) rather than deleted with the parent — deleting a GM's tracked
   * icons as a side effect of deleting an unrelated one is a bigger surprise
   * than un-nesting them. Made explicit rather than silent: if the target
   * being deleted has children, the GM is told how many and asked to
   * confirm before anything happens.
   */
  deleteTarget(host: MatrixHost | null, target: MatrixTarget): void {
    if (!host) {
      const children = this.childrenOf(target.id);
      if (children.length > 0) {
        const names = children.map(c => c.name).join(", ");
        const ok = window.confirm(
          `"${target.name}" has ${children.length} item(s) parented to it (${names}). ` +
          `Deleting it will move them to top level, not delete them. Continue?`
        );
        if (!ok) return;
        this.rehomeChildrenOf(target);
      }
    }
    this.matrixState.removeTarget(host, target);
    if (this.targetForm.target === target) this.targetForm = { ...BLANK_TARGET_FORM };
  }

  /**
   * Clears `parentTargetId` on every direct child of `target` (top-level
   * re-homing, not deletion) — the shared path behind two callers that both
   * need to un-nest a target's children rather than orphan them on a stale
   * id: `deleteTarget()` above (Round-5 defect D-4) and `saveTargetForm()`
   * below (`briefs/pan-membership-spec.md` D1 — a Save that changes a
   * target's type so it can no longer be a parent, e.g. device → file, must
   * not leave children rendering nested under what the tree now shows as a
   * non-device, which p. 233 forbids). Writes go through `clearParent()`,
   * so `setParent()`/`clearParent()` stay the only writers of
   * `parentTargetId`.
   */
  private rehomeChildrenOf(target: MatrixTarget): MatrixTarget[] {
    const children = this.childrenOf(target.id);
    for (const child of children) {
      this.clearParent(child);
    }
    return children;
  }

  // ── Visibility cycling ──────────────────────────────────────────────────

  cycleVisibility(host: MatrixHost | null, target: MatrixTarget): void {
    const order: MatrixTargetVisibility[] = ["hidden", "running-silent", "active"];
    const next = order[(order.indexOf(target.visibility) + 1) % order.length];
    this.matrixState.setTargetVisibility(target, next);
  }

  // ── Tree expand/collapse ─────────────────────────────────────────────────

  togglePublicSpace(): void {
    this.publicSpaceExpanded = !this.publicSpaceExpanded;
  }

  /**
   * Round-6 review, Defect 3: this used to call `onPropagationHighlightChange(null)`
   * unconditionally on every collapse, to dodge the same NG0100 fixed
   * properly now by `TargetCardComponent.lifecycleClear` (emitted from
   * `ngOnDestroy()`) and this component's own `onLifecycleClear()`, which
   * defers the actual state mutation to a microtask (see that method's doc
   * comment). That was wrong on its own terms, not just a workaround: it wiped
   * the highlight and left
   * an unrelated card's picker open and armed with no visible warning the
   * moment the GM collapsed ANY host, including one that had nothing to do
   * with the open picker (measured: 2 rails -> 0, then a mark landed on
   * three icons with no highlight ever shown for two of them) — a direct
   * breach of `RULINGS.md` 2026-09-03 in an app with no undo. Collapsing a
   * host now does exactly one thing besides toggling `expandedHosts`: it
   * closes THIS host's own `hostMarkState` entry (see round-7 review,
   * Defect D-3, below). If the picker that was open belongs to a card
   * inside THIS host, collapsing destroys that card and its own
   * `ngOnDestroy` clears the highlight, deferred safely past this
   * change-detection pass. If the open picker belongs to a card elsewhere
   * in the tree, nothing here touches it at all — the highlight and the
   * picker both survive, correctly.
   *
   * Round-7 review, Defect D-3: unlike a card's own +Mark picker, which is
   * destroyed along with its component when its containing branch
   * collapses, the host's own +Mark control (`hostMarkState`) is a `Map`
   * entry owned by THIS component — collapsing a host does not destroy it.
   * Left unclosed, an armed host picker (decker already selected, `open:
   * true`) survived a fold-and-reopen and re-rendered `.hier-mark-confirm`
   * still armed, one stray tap from placing a host mark with no undo. This
   * is the exact hazard the Defect-3 fix above (and Defect 4/N-1's
   * `closeAllPickersExcept()`) already guards against for every OTHER
   * picker in the tree; only this host's OWN collapse path was missing it.
   * Deliberately local and narrow: only `hostId`'s own entry closes here.
   * Reaching into `markHighlight` (that was Defect 3, already fixed once)
   * or into another host's `hostMarkState` entry would reintroduce exactly
   * the overreach this component's own regression test guards against —
   * collapsing an unrelated host must not clear a public-tree picker's
   * highlight, or another host's armed picker.
   */
  toggleHost(hostId: string): void {
    if (this.expandedHosts.has(hostId)) {
      this.expandedHosts.delete(hostId);
      const s = this.hostMarkState.get(hostId);
      if (s) {
        s.open = false;
      }
    } else {
      this.expandedHosts.add(hostId);
    }
  }

  // ── Display helpers ──────────────────────────────────────────────────────

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
      default:        return type;
    }
  }

  visibilityLabel(v: MatrixTargetVisibility): string {
    switch (v) {
      case "hidden":         return "HIDDEN";
      case "running-silent": return "RUNNING SILENT";
      case "active":         return "ACTIVE";
    }
  }

  visibilityClass(v: MatrixTargetVisibility): string {
    // CSS classes are reused from the old spotted-* classes for now.
    switch (v) {
      case "hidden":         return "spotted-invisible";
      case "running-silent": return "spotted-ghost";
      case "active":         return "spotted-revealed";
    }
  }

  deckerName(nameOrId: string): string {
    return this.activeDeckers.find(d => d.name === nameOrId)?.name ?? nameOrId;
  }

  isHostExpanded(hostId: string): boolean {
    return this.expandedHosts.has(hostId);
  }

  isActiveHost(host: MatrixHost): boolean {
    return this.state.currentHostId === host.id;
  }

  isTargetFormForHost(hostId: string | null): boolean {
    return this.targetForm.active && this.targetForm.hostId === hostId;
  }

  isEditingTarget(target: MatrixTarget): boolean {
    return this.targetForm.isEditing && this.targetForm.target === target;
  }

  isEditingHost(host: MatrixHost): boolean {
    return this.hostForm.active && this.hostForm.isEditing && this.hostForm.host === host;
  }

  // ── Host mark management ─────────────────────────────────────────────────

  private hostMarkState = new Map<string, { open: boolean; selectedDeckerId: string }>();

  getHostMarkState(hostId: string): { open: boolean; selectedDeckerId: string } {
    if (!this.hostMarkState.has(hostId)) {
      this.hostMarkState.set(hostId, { open: false, selectedDeckerId: "" });
    }
    return this.hostMarkState.get(hostId)!;
  }

  hostMarkEntries(host: MatrixHost): { deckerId: string; count: number }[] {
    return Object.entries(host.marks)
      .filter(([, c]) => c > 0)
      .map(([id, count]) => ({ deckerId: id, count }));
  }

  /**
   * Deckers that can still receive another mark on this host (count <
   * MARK_CAP, p. 236).
   *
   * Nameless participants are excluded: `marks` is keyed by `decker.name`, so
   * one cannot hold a mark. Mirrors `TargetCardComponent.availableDeckers`'
   * own guard (host-mark-control-parity-spec.md) for the same reason: this
   * component takes `activeDeckers` as an `@Input` from whoever mounts it, so
   * the guard lives here too rather than trusting every future caller.
   */
  hostAvailableDeckers(host: MatrixHost): MatrixParticipant[] {
    return this.activeDeckers
      .filter(d => (d.name ?? "").trim() !== "")
      .filter(d => (host.marks[d.name] ?? 0) < MARK_CAP);
  }

  dots(count: number): string {
    return "●".repeat(count) + "○".repeat(MARK_CAP - count);
  }

  /**
   * Why the host confirm button is disabled, or `null` when it is usable.
   * Mirrors `TargetCardComponent.addMarkBlockedReason` exactly, reading state
   * out of `hostMarkState` (per-host map entry) rather than a component
   * field (a card is one component per target; this control manages
   * potentially many hosts from one component instance). Wording says
   * "on this host" rather than "on this icon" — this component's own
   * template vocabulary (`hier-host-*` vs. `hier-public-node`) already
   * distinguishes hosts from icons (host-mark-control-parity-spec.md,
   * Open Decision 1).
   */
  hostAddMarkBlockedReason(host: MatrixHost): string | null {
    return this.hostAddMarkBlockedReasonFor(host, this.getHostMarkState(host.id).selectedDeckerId);
  }

  /**
   * Parameterized twin of `hostAddMarkBlockedReason()` — same relationship
   * as `TargetCardComponent.blockedReasonFor()` has to
   * `addMarkBlockedReason`: `hostAddMarkBlockedReason()` delegates here so
   * the two definitions cannot drift (`briefs/mark-counter-control-spec.md`,
   * affected-paths table D). The host's own dot row's decker is fixed by
   * `hostMarkEntries()` and is not necessarily the picker's own
   * `selectedDeckerId`.
   */
  hostAddMarkBlockedReasonFor(host: MatrixHost, deckerId: string): string | null {
    if (!deckerId) return "Pick a decker first";
    if ((host.marks[deckerId] ?? 0) >= MARK_CAP) {
      return `${deckerId} already holds the maximum ${MARK_CAP} marks on this host (p. 236)`;
    }
    return null;
  }

  canConfirmHostAddMark(host: MatrixHost): boolean {
    return this.hostAddMarkBlockedReason(host) === null;
  }

  /**
   * Host dots get the same click/right-click ergonomics as a device's own
   * dot row, with **no** propagation preview — a host is never itself a
   * propagation source (`collectPropagationStops()` only ever emits a host
   * as a destination, never walks upward FROM one; matches
   * `openHostAddMark()`'s existing no-preview behaviour). No-op if blocked
   * elsewhere in the tree (`anyOtherPickerOpen()`) or if this decker is
   * already capped on this host.
   *
   * Round-10 review, Defect 4: excludes `host.id`, matching the template's
   * `[disabled]="anyOtherPickerOpen(host.id)"` (`html:188`) — a card
   * excludes only its own id (`anyOtherPickerOpen(t.id)`), and a host row's
   * dots must do the same, or this host's own OPEN `+Mark` picker would
   * block this host's OWN dots even though nothing else in the tree has a
   * picker open. Passing `null` here (no exclusion) while the template
   * excludes `host.id` would also have desynced the two: the button would
   * render enabled but silently no-op on click.
   */
  onHostDotClick(host: MatrixHost, deckerId: string): void {
    if (this.anyOtherPickerOpen(host.id) || this.hostAddMarkBlockedReasonFor(host, deckerId) !== null) return;
    this.matrixState.addMarkToHost(host, deckerId, 1);
  }

  /** Suppresses the native context menu on this control, then delegates to the existing, unchanged `removeHostMark()`. */
  onHostDotRightClick(event: MouseEvent, host: MatrixHost, deckerId: string): void {
    event.preventDefault();
    this.removeHostMark(host, deckerId);
  }

  /**
   * True when a `+Mark` picker — a card's own, or any host's own — is open
   * and unconfirmed somewhere in the tree other than `excludeTargetId`
   * (Open Decision 2, Option B, `briefs/mark-counter-control-spec.md`).
   * Feeds each card's `dotAddBlocked` @Input (`excludeTargetId = t.id`, so a
   * card's own picker does not block its own dots) and each host row's own
   * dot-disabled state (`excludeTargetId = host.id`, so a host's own open
   * `+Mark` picker does not block that same host's own dots — round-10
   * review, Defect 4; a host never owns an id that could collide with a
   * target's, so excluding `host.id` here is safe even though `hostMarkState`
   * and `markHighlight.target` are keyed from two different id spaces).
   *
   * `markHighlight` is non-null only while some card's own picker is open
   * AND unblocked (`TargetCardComponent.emitHighlight()` emits `null` for a
   * blocked one), which is exactly the "armed, about to commit" state this
   * method exists to guard against.
   */
  anyOtherPickerOpen(excludeTargetId: string | null): boolean {
    if (this.markHighlight && this.markHighlight.target.id !== excludeTargetId) {
      return true;
    }
    for (const [hostId, state] of this.hostMarkState) {
      if (state.open && hostId !== excludeTargetId) {
        return true;
      }
    }
    return false;
  }

  /**
   * N-1 (round-7 review, Xavier's decision, 2026-09-06): the host's own
   * +Mark control used to be a third picker outside the one-picker-at-a-time
   * mechanism Defect 4 built for cards — opening it never closed a card's
   * open picker, and opening a card's picker never closed it either, so both
   * could be open and armed at once with only one highlight visible to warn
   * the GM about either. `closeAllPickersExcept()` now covers both kinds.
   * A card picker carries a live highlight (`markHighlight`) that its own
   * `closePickerSilently()` deliberately does not clear (see that method's
   * doc comment — closing silently is correct for a losing CARD, because the
   * highlight is about to be replaced by the picker that is opening instead);
   * opening the host's own control replaces it with nothing, so this method
   * clears it explicitly.
   */
  openHostAddMark(host: MatrixHost): void {
    this.closeAllPickersExcept({ kind: "host", hostId: host.id });
    if (this.markHighlight) {
      this.onPropagationHighlightChange(null);
    }
    const s = this.getHostMarkState(host.id);
    s.open = true;
    if (!s.selectedDeckerId && this.hostAvailableDeckers(host).length > 0) {
      s.selectedDeckerId = this.hostAvailableDeckers(host)[0].name;
    }
  }

  confirmHostAddMark(host: MatrixHost): void {
    const s = this.getHostMarkState(host.id);
    if (!s.selectedDeckerId) return;
    if ((host.marks[s.selectedDeckerId] ?? 0) >= MARK_CAP) return;
    this.matrixState.addMarkToHost(host, s.selectedDeckerId, 1);
    s.open = false;
  }

  /**
   * Round-8 review, defect 1 (`briefs/host-mark-control-parity-spec.md`):
   * mirrors `TargetCardComponent.ngOnChanges()`'s Path 10 guard (see that
   * method's doc comment) for the host's own +Mark control — closing an
   * armed picker the moment its last available decker disappears, instead
   * of leaving `hostMarkState` stranded `open: true`.
   *
   * The template's outer `@if (hostAvailableDeckers(host).length > 0)`
   * (`html:196`) already removes the whole `+Mark` group from the DOM the
   * instant availability hits zero, but that gate alone does not clear
   * `hostMarkState` — an unrelated later action that brings availability
   * back above zero (e.g. removing a mark on the same decker via the
   * always-visible "×" control) then silently re-admits the gate with the
   * picker still `open: true` and still armed with the same
   * `selectedDeckerId`, ready to place a mark on the very next tap with no
   * fresh GM click on +Mark.
   *
   * Chosen over keeping the control visibly open with a blocked message at
   * zero availability (Option (b) in the spec's round-8 defect list):
   * that option cannot itself prevent the same silent rearm unless it ALSO
   * clears `selectedDeckerId`, which collapses to this same closed-in-
   * substance state while diverging from what `TargetCardComponent`'s own
   * reference picker actually does in this situation (it closes; it never
   * sits open-and-disabled with zero available deckers) — the parity this
   * control exists to match. See that spec's defect 1/2 discussion for the
   * full comparison; AC-7/AC-8 were reworded to describe this instead of
   * claiming the confirm button and blocked-reason element remain in the
   * DOM (merely disabled) once availability reaches zero — they do not.
   *
   * Runs on every `stateChange$` tick (`ngOnInit`) and on every `@Input`
   * change (`ngOnChanges`, round-9), so it also catches an external write
   * that reaches every remaining available decker on a host whose picker is
   * open — the host-control equivalent of `recomputeHighlight()`'s own
   * Defect 7 guard for cards.
   *
   * Round-9 addendum: also drops any `hostMarkState` entry whose host no
   * longer exists at all (deleted host). The original `if (host && ...)`
   * guard above silently short-circuited for that case, leaving the entry
   * in the `Map` forever — not user-visible today, since host ids are
   * random and never reused, but it is the same stale-`hostMarkState`
   * family as the rest of this method. Collects ids to delete first, then
   * deletes after the loop — mutating a `Map` mid-iteration by deleting the
   * CURRENT key is well-defined in JS, but deleting a key other than the
   * one just visited during iteration is not something to rely on, so this
   * stays conservative and two-pass.
   */
  private closeExhaustedHostPickers(): void {
    const deletedHostIds: string[] = [];
    for (const [hostId, s] of this.hostMarkState) {
      const host = this.state.hosts.find(h => h.id === hostId);
      if (!host) {
        deletedHostIds.push(hostId);
        continue;
      }
      if (!s.open) continue;
      if (this.hostAvailableDeckers(host).length === 0) {
        s.open = false;
        s.selectedDeckerId = "";
      }
    }
    for (const hostId of deletedHostIds) {
      this.hostMarkState.delete(hostId);
    }
  }

  removeHostMark(host: MatrixHost, deckerId: string): void {
    this.matrixState.removeMarkFromHost(host, deckerId);
  }

  // ── Noise (GM-set reminder, round-4 D-13) ───────────────────────────────

  /**
   * The Hierarchy editor is the natural home for the noise reminder — it is
   * the GM's one screen for scene-level Matrix state that isn't a decker or
   * a host. `MatrixRunState.noise` initialises to 0 and, before this, had no
   * editor anywhere: `access-host-panel.component.html` only ever *reads*
   * it (`matrixState.state.noise > 0`), so the reminder could never actually
   * appear (brief round-4 defect D-13). Never applied to any dice pool —
   * display only (`SCOPE.md`, Scope Question B).
   */
  onNoiseChanged(value: number): void {
    this.matrixState.setNoise(Number(value) || 0);
  }

  // ── Open-grid parent/child targets (Decision 7b, 2026-09-02) ────────────

  /**
   * Every public-space target directly parented under `parentId` (`null` for
   * the top-level, unparented targets). Used to render public space as a
   * nested tree instead of a flat list, so "a weapon parented to a device"
   * is visibly nested under that device (Xavier, 2026-09-02: "devices on
   * the open grid have other devices like weapons and files parented to
   * it"). Host-contained targets are unaffected — `parentTargetId` is scoped
   * to `context === "public"` targets only; a host-contained target's
   * containment is `linkedHostId`, a different mechanism (Decision 7a).
   */
  childrenOf(parentId: string | null): MatrixTarget[] {
    return this.state.publicTargets.filter(t => (t.parentTargetId ?? null) === parentId);
  }

  /**
   * Warn — never block (Xavier's decision, 2026-09-11, `SCOPE.md`: the
   * tracker helps the GM follow the rules but must stay flexible) — when a
   * public-space device's slaved **device** count exceeds its Device
   * Rating × `DEVICE_SLAVE_CAP_MULTIPLIER` (p. 233). Counts only
   * `type === "device"` children: a file or persona nested under the same
   * master is a location fact, not a PAN slave, and was never eligible to
   * count toward this total in the first place (p. 233, "Only devices can
   * be slaves, masters, or part of a PAN"; `briefs/pan-membership-spec.md`,
   * Xavier's 2026-09-11 answer). `null` when `target` is not a public-space
   * device at all, or is within cap — most devices, most of the time.
   *
   * Host-nested devices are out of scope here: a WAN master (a host) has no
   * printed cap ("practically unlimited," p. 233) and uses `linkedHostId`
   * for its containment, not `parentTargetId` — this only ever evaluates
   * the open-grid PAN-master case.
   *
   * Deliberately does not block anything the GM does — there is no gate
   * here to bypass, only a readout. Rendered with `.hier-slave-cap-warning`
   * (amber), not `.hier-form-error` (red) — this is a warning, never a
   * rejection (Xavier, 2026-09-11).
   */
  slaveCapWarning(target: MatrixTarget): string | null {
    const over = this.overSlaveCap(target);
    if (!over) return null;
    const { slaveCount, cap, deviceRating } = over;
    // Wording (D6, validator round): p. 233 states the × 3 cap for "your
    // commlink (or deck)" specifically, and this app deliberately does not
    // model device sub-types (see the pan-membership-spec.md "commlinks are
    // not mechanically special" discussion) — so the message must cite the
    // general rule the app actually enforces, not imply p. 233 names this
    // exact device. The warning still applies to every device (that follows
    // from not modelling sub-types; warning is safer than silence), only
    // the citation is narrower now.
    return `${slaveCount} slaved devices exceeds the ${cap}-slave cap — PAN masters are capped at Device Rating × 3 (Device Rating ${deviceRating} × 3, p. 233).`;
  }

  /**
   * Short-badge counterpart to `slaveCapWarning()` above
   * (`briefs/pan-membership-spec.md`, Xavier's 2026-09-11 decision "N2":
   * "short badge, detail on hover"). The full sentence `slaveCapWarning()`
   * builds is ~120 characters — printed straight into the tree, it wraps at
   * realistic nesting depths (the tree indents `depth * 18` px and caps
   * names at 120px) and pushes the master's entire subtree down, the same
   * failure mode that got the text-preview version of the mark-propagation
   * highlight removed (`SCOPE.md`). This renders inside `TargetCardComponent`'s
   * `.tc-info-row` instead — the same flex row the "+" add-child button and
   * the ▲/△ propagation marker already occupy — specifically so it is
   * measured against the SAME accepted-cost harness as those two
   * (`N-9`/`N-ADD-CHILD`, `matrix-port-rules-correctness.spec.ts`) rather
   * than exist as an unmeasured new element outside that row. Short and
   * `white-space: nowrap` (`.tc-slave-cap-badge`) so it can never wrap and
   * never adds a line — the row's height is unchanged whether or not this
   * renders (see the `N-SLAVE-CAP-BADGE` regression test). The full
   * sentence, citation included, is not lost — it is the badge's
   * `ngbTooltip`, the same on-hover vocabulary this component already uses
   * elsewhere (e.g. the type icon's tooltip).
   */
  slaveCapBadgeText(target: MatrixTarget): string | null {
    const over = this.overSlaveCap(target);
    if (!over) return null;
    // Leading glyph (Xavier's 2026-09-11 decision "N3"): amber
    // (`.hier-slave-cap-warning`/`.tc-slave-cap-badge`, #ffb340) and red
    // (`.hier-form-error`, #ff8a8a) were a hue-only distinction everywhere
    // else this component pairs "attention" with a second, non-colour cue
    // (a dashed outline, or the ▲/△ marker glyph) — this badge gets one too,
    // so the distinction survives for a colour-blind GM.
    return `⚠ ${over.slaveCount}/${over.cap} slaves`;
  }

  /**
   * Shared over-cap computation behind `slaveCapWarning()` (full sentence,
   * tooltip content) and `slaveCapBadgeText()` (short badge) — one
   * definition of "is this device over its slave cap," so the two render
   * paths can never disagree about when to show something.
   */
  private overSlaveCap(target: MatrixTarget): { slaveCount: number; cap: number; deviceRating: number } | null {
    if (target.type !== "device" || target.context !== "public") return null;
    const slaveCount = this.childrenOf(target.id).filter(c => c.type === "device").length;
    const cap = target.deviceRating * DEVICE_SLAVE_CAP_MULTIPLIER;
    if (slaveCount <= cap) return null;
    return { slaveCount, cap, deviceRating: target.deviceRating };
  }

  /** All ids reachable by walking down from `id` (used to keep the parent picker acyclic). */
  private descendantIds(id: string): Set<string> {
    const result = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const child of this.childrenOf(current)) {
        if (!result.has(child.id)) {
          result.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return result;
  }

  /**
   * `target`'s own id plus every id reachable by walking down from it — the
   * single definition of "would create a cycle if picked as target's own
   * parent," shared by `parentOptionsFor()` (which OFFERS choices excluding
   * this set) and `wouldCreateCycle()` below (which ASKS whether a specific
   * already-chosen id is in it), so the self/descendant rule has exactly one
   * place it is computed (Open Decision 4 — one choke point, not two copies).
   */
  private selfAndDescendantIds(targetId: string): Set<string> {
    const result = this.descendantIds(targetId);
    result.add(targetId);
    return result;
  }

  /**
   * Whether choosing `parentId` as `target`'s parent would create a cycle —
   * the same rule `setParent()`'s guard enforces at commit time, made
   * askable here so `saveTargetForm()` can validate BEFORE writing anything
   * (2026-09-09: a rejected re-parent must say so, not silently drop — see
   * `briefs/parent-picker-into-edit-view-spec.md` AC-8's revised form).
   * Built on `selfAndDescendantIds()`, the same set `parentOptionsFor()`
   * excludes, so this is not a second copy of the self/descendant rule.
   *
   * Asymmetry, noted rather than fixed (review round): unlike
   * `parentOptionsFor()`, this does NOT also require `parentId` to resolve
   * to a `type === "device"` target — it only mirrors the self/descendant
   * half of that method's filtering, not the device-only half. Harmless
   * today only because the one caller (`saveTargetForm()`) always passes a
   * `parentTargetId` that came from this same form's `<select>`, which never
   * offers a non-device option in the first place (`parentOptionsFor()`/
   * `parentOptionsForNewTarget()` both filter to devices before rendering
   * any `<option>`). If a future caller ever calls this with an
   * out-of-band id — bypassing the dropdown — this would silently accept a
   * non-device parent that `parentOptionsFor()` would have refused to offer.
   * Do not assume this is a byte-identical mirror of `parentOptionsFor()`.
   */
  wouldCreateCycle(target: MatrixTarget, parentId: string): boolean {
    return this.selfAndDescendantIds(target.id).has(parentId);
  }

  /**
   * Valid parent choices for `target`: every other public-space **device**,
   * excluding `target` itself and anything already beneath it — picking a
   * descendant as your own parent would create a cycle
   * `MatrixStateService.addMark()`'s propagation walk guards against at
   * runtime, but there is no reason to let the GM create one from this form
   * in the first place.
   *
   * Candidates are filtered through `canBeParent()` (device-only, Xavier's
   * decision 8, 2026-09-03, unchanged by the `pan-membership` widening of
   * `canHaveParent()`): a mark only ever propagates onto a device or a
   * host — never a file, persona, IC, or nested host — so offering one of
   * those as a parent choice would build a link
   * `MatrixStateService.propagateMarkUp()` will never actually walk
   * through. See `MatrixTarget.parentTargetId`'s doc comment for the full
   * citation.
   *
   * Called both from the shared target Edit form and, indirectly via
   * `commitParentField()`, from `saveTargetForm()` at Save time — the latter
   * is what makes the self/descendant guard evaluate against **live**
   * state, not whatever this list looked like when the form was opened
   * (`briefs/parent-picker-into-edit-view-spec.md`, "Critical correctness
   * points", scenario 4).
   */
  parentOptionsFor(target: MatrixTarget): MatrixTarget[] {
    const excluded = this.selfAndDescendantIds(target.id);
    return this.state.publicTargets.filter(t => !excluded.has(t.id) && this.canBeParent(t));
  }

  /**
   * Valid parent choices for a target being **created** (Add flow, Open
   * Decision 2 = "yes", `briefs/parent-picker-into-edit-view-spec.md`). A
   * target with no id yet can have no descendants, so the self/descendant
   * exclusion `parentOptionsFor()` runs does not apply — this is a separate
   * accessor rather than an overload so `parentOptionsFor()`'s contract
   * (always excludes self + descendants of a real target) stays unchanged
   * for its existing caller.
   */
  parentOptionsForNewTarget(): MatrixTarget[] {
    return this.state.publicTargets.filter(t => this.canBeParent(t));
  }

  /**
   * Whether `target` should offer a "Parent" control at all —
   * widened by `briefs/pan-membership-spec.md` from device-only to
   * `PARENTABLE_TYPES` (device/file/persona): a file or persona can now
   * record which device it lives on / runs on, even though (see
   * `canBeParent()` below) it can never itself BE a parent, and never
   * propagates a mark it receives (p. 233 — see `MatrixTarget
   * .parentTargetId`'s doc comment).
   *
   * Also gated on `context === "public"`
   * (`briefs/parent-picker-into-edit-view-spec.md`, Open Decision 3): a
   * target already sitting inside a host uses `linkedHostId` for its
   * containment, not `parentTargetId` (`MatrixTarget.parentTargetId`'s doc
   * comment). This gate was previously enforced only by which template
   * called it — the public-space tree never rendered a host-nested target —
   * but the shared Edit/Add form is reachable for host-nested devices too,
   * so the check now has to say so explicitly.
   *
   * This answers "can THIS target have a parent" — a different question
   * from "can this target BE a parent," which `canBeParent()` answers on
   * its own, narrower terms. Do not widen this method's body without also
   * checking every caller expects the widened set (`briefs
   * /pan-membership-spec.md`, "The load-bearing finding").
   */
  canHaveParent(target: MatrixTarget): boolean {
    return HierarchyEditorComponent.PARENTABLE_TYPES.includes(target.type) && target.context === "public";
  }

  /**
   * Whether `target` can be CHOSEN as another target's parent — device-only
   * (Xavier's decision 8, 2026-09-03), unchanged by the `pan-membership`
   * widening above: only a device ever propagates a mark it receives, so
   * offering a file/persona/IC/nested-host as a parent choice would build a
   * link `MatrixStateService.propagateMarkUp()` will never actually walk
   * through (p. 233 — only a device is ever a PAN master).
   *
   * This is `canHaveParent()`'s OLD body, split out under its own name
   * (`briefs/pan-membership-spec.md`, "The load-bearing finding") once
   * `canHaveParent()` widened to cover files and personas too — those two
   * questions ("can this target have a parent" vs. "can this target BE a
   * parent") happened to share one answer before this feature, and no
   * longer do. Every parent-candidate filter (`parentOptionsFor()`,
   * `parentOptionsForNewTarget()`) and the tree's add-child "+" control
   * (`[canAddChild]`, `hierarchy-editor.component.html`) route through this
   * method, not `canHaveParent()` — binding the "+" to the widened method
   * by mistake would put a working add-child button on every file and
   * persona card, letting a GM nest a device under a file.
   */
  canBeParent(target: MatrixTarget): boolean {
    return target.type === "device" && target.context === "public";
  }

  /**
   * The target Edit/Add form's Parent-row template gate
   * (`hierarchy-editor.component.html`) — built on the same
   * `PARENTABLE_TYPES` constant `canHaveParent()` reads, so the template
   * never carries a third, independent copy of "which types can have a
   * parent" (`briefs/pan-membership-spec.md`: "one constant... one method
   * ... do not leave a third inline copy of either type list anywhere,
   * including in the template"). Also requires `hostId === null`, matching
   * `canHaveParent()`'s own `context === "public"` half — a host-nested
   * target uses `linkedHostId`, not this field.
   */
  get targetFormShowsParentField(): boolean {
    return HierarchyEditorComponent.PARENTABLE_TYPES.includes(this.targetForm.type) && this.targetForm.hostId === null;
  }

  /**
   * The Parent field's label, per-type (D5, `briefs/pan-membership-spec.md`
   * validator round, Xavier's decision). Same control, same options, same
   * `setParent()`/`clearParent()` commit path — label only. A file nested
   * under a device would otherwise look pixel-identical to a slaved device,
   * and Xavier does not want the app implying a file is in a PAN: only a
   * device is ever a PAN slave, master, or member (p. 233). "Lives on" for
   * a file (location fact, p. 219/p. 233), "Runs on" for a persona (the
   * device it runs on, p. 235), "Parent" for a device (the one case that is
   * a real PAN slaving relationship).
   */
  get parentFieldLabel(): string {
    switch (this.targetForm.type) {
      case "file": return "Lives on";
      case "persona": return "Runs on";
      default: return "Parent";
    }
  }

  /**
   * The Parent half of `saveTargetForm()`'s commit (Open Decision 4:
   * delegates to `setParent()`/`clearParent()` rather than reimplementing
   * the self/descendant guard here, so that guard has exactly one choke
   * point). Called for both the edit and create branches, after the rest of
   * the target's fields have already been written/constructed, so `target`
   * reflects this Save's `type`/`context` when `canHaveParent()` is
   * evaluated.
   *
   * If the type no longer supports a parent at all (e.g. the GM switched
   * Type from `device` to `ic` in the same form session), any buffered
   * `parentTargetId` is dropped rather than written: the target ends the
   * save with `parentTargetId === undefined` regardless of what was sitting
   * in the form. Since `briefs/pan-membership-spec.md` widened
   * `canHaveParent()` to `PARENTABLE_TYPES`, switching between `device`,
   * `file` and `persona` no longer triggers this drop — only switching to
   * `ic` (host-only, unreachable in public space anyway) or moving into a
   * host (`hostId !== null`) does.
   */
  private commitParentField(target: MatrixTarget, bufferedParentId: string): void {
    if (this.canHaveParent(target) && bufferedParentId) {
      this.setParent(target, bufferedParentId);
    } else {
      this.clearParent(target);
    }
  }

  /**
   * The form's Parent `<select>` and its ✕ clear button both route through
   * here rather than writing `targetForm.parentTargetId` directly, so that
   * changing the selection also clears any stale `parentError` left over
   * from a previous rejected Save (2026-09-09 decision — "so a stale error
   * can't linger"). Reopening the form clears it too, for free, because
   * `openAddTarget()`/`openEditTarget()`/`closeTargetForm()` all build a
   * fresh `TargetFormState` rather than mutating this one.
   */
  onParentSelectionChange(parentId: string): void {
    this.targetForm.parentTargetId = parentId;
    this.targetForm.parentError = null;
  }

  /**
   * Inline warning for a silent consequence the "+" child-add entry point
   * made newly reachable (`briefs/add-child-button-spec.md`, "One
   * consequence the spec does not fully resolve"): the Type dropdown stays
   * editable even after a form is seeded with a buffered `parentTargetId`
   * (whether from a device's own Edit session or from `openAddChildTarget()`),
   * and `commitParentField()` drops the buffered parent silently at Save
   * time the moment `canHaveParent(target)` goes false.
   *
   * **Currently unreachable through any real UI path
   * (`briefs/pan-membership-spec.md`).** `canHaveParent()` widened from
   * device-only to `PARENTABLE_TYPES` (device/file/persona), so switching
   * Type between those three no longer drops the buffered parent at all —
   * the only type left that fails `PARENTABLE_TYPES` is `"ic"`, and the Type
   * `<select>` never offers `"ic"` while `hostId === null`
   * (`hierarchy-editor.component.html`'s Type field already hides that
   * `<option>` outside a host). So for every session this method can
   * actually observe in the running app, either the buffered parent is kept
   * (device/file/persona) or the Parent row was never showing to begin with
   * (`hostId !== null`). Kept anyway, narrowed to the same
   * `PARENTABLE_TYPES` constant, as cheap defense-in-depth against a future
   * caller that sets `targetForm.type = 'ic'` directly, bypassing the
   * `<select>` — see the regression test that does exactly that.
   *
   * Deliberately not folded into `parentError`: that field reports a
   * REJECTED Save attempt (a cycle) and blocks the whole save until fixed;
   * this is a heads-up about an accepted save's actual outcome, shown before
   * Save is even clicked, and never blocks anything.
   */
  parentDropWarning(): string | null {
    const f = this.targetForm;
    if (HierarchyEditorComponent.PARENTABLE_TYPES.includes(f.type) || f.hostId !== null || !f.parentTargetId) return null;
    const parent = this.state.publicTargets.find(t => t.id === f.parentTargetId);
    const parentName = parent?.name ?? "the selected parent";
    return `Saving as ${this.typeLabel(f.type)} will NOT nest this under ${parentName} — only a device, file, or persona can have a parent. It will appear at the top level.`;
  }

  /**
   * Inline pre-Save warning for the OTHER silent consequence of this same
   * widening: retyping a public-space `device` (that currently has
   * children) to `file` or `persona` makes it fail `canBeParent()` — a
   * device is the only thing that can BE a parent (`canBeParent()`'s own
   * doc comment) — so `saveTargetForm()` re-homes every direct child to top
   * level on that Save (see the `couldBeParentBefore && !this.canBeParent(...)`
   * branch there, which calls `rehomeChildrenOf()`). Before this warning
   * existed, that happened with no on-screen notice: the children stayed
   * visible, just un-indented, easy to miss in a deep tree, and switching
   * the Type back does NOT restore them — `rehomeChildrenOf()` clears
   * `parentTargetId` outright rather than remembering the old value, so
   * "switch back and re-save" (the first recovery anyone would try) does
   * not work (`briefs/pan-membership-spec.md`, Xavier's 2026-09-11 decision,
   * "N1").
   *
   * `deleteTarget()` already confirms this identical outcome — moving a
   * target's children to top level — with a named `window.confirm()`
   * before doing it. That confirm exists because children move, not
   * because something is deleted; Save was producing the same outcome
   * silently. Xavier chose an inline pre-Save message over a second
   * `confirm()` dialog: present tense, names the count and the
   * destination, appears the moment the Type switch makes it true (while
   * Save has not been clicked and the GM can still change their mind), and
   * clears the moment it stops being true (e.g. switching Type back to
   * Device, or to a target with no children) — this is a plain method
   * call read fresh on every change-detection pass, exactly like
   * `parentDropWarning()` above, so no separate "dirty" tracking is needed.
   *
   * Deliberately a SIBLING to `parentDropWarning()`, not a merge into it:
   * that method answers "will THIS target's own parent link survive the
   * Save" (a fact about `target`'s relationship to ITS parent); this method
   * answers "will THIS target's CHILDREN survive the Save nested where they
   * are" (a fact about `target`'s relationship to ITS children). They are
   * gated on different predicates (`canHaveParent()` vs `canBeParent()`)
   * and are true in disjoint form states today (`parentDropWarning()` only
   * reaches its unreachable defense-in-depth case on `type === "ic"`; this
   * only fires on `type === "file" | "persona"` with existing children) —
   * folding them into one method would blur two distinct rules-facts under
   * one name for no shortening in caller code. They share the same
   * template slot (`hierarchy-editor.component.html`, the same
   * `.hier-form-error` `<span>` `parentDropWarning()` already used) because
   * only one can ever be non-null in a given form state, and both are the
   * same kind of thing: a non-blocking heads-up about what THIS Save will
   * silently do.
   *
   * Counts only DIRECT children (`childrenOf()`), matching exactly what
   * `rehomeChildrenOf()` actually re-homes — a child's own descendants stay
   * nested under it; only the direct link to `target` breaks.
   */
  childRehomeWarning(): string | null {
    const f = this.targetForm;
    if (!f.isEditing || !f.target) return null;
    if (!this.canBeParent(f.target)) return null; // wasn't parent-capable before this edit; nothing to lose
    const willStillBeParent = f.type === "device" && f.hostId === null;
    if (willStillBeParent) return null;
    const childCount = this.childrenOf(f.target.id).length;
    if (childCount === 0) return null;
    return `Saving as ${this.typeLabel(f.type)} will move its ${childCount} slaved item(s) to top level.`;
  }

  setParent(target: MatrixTarget, parentId: string): void {
    if (!parentId) {
      this.clearParent(target);
      return;
    }
    if (!this.parentOptionsFor(target).some(t => t.id === parentId)) return; // self/descendant guard
    this.matrixState.updateTarget(target, { parentTargetId: parentId });
  }

  clearParent(target: MatrixTarget): void {
    this.matrixState.updateTarget(target, { parentTargetId: undefined });
  }
}
