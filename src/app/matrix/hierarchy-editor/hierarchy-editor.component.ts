import { Component, ElementRef, Input, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from "@angular/core";
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
import { MatrixStateService, PropagationStop } from "app/services/matrix-state.service";
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
}

const BLANK_HOST_FORM: HostFormState = {
  active: false, isEditing: false, host: null,
  name: "", rating: 4, attack: 4, sleaze: 5, dataProcessing: 6, firewall: 7,
  setActive: true
};

const BLANK_TARGET_FORM: TargetFormState = {
  active: false, isEditing: false, target: null, hostId: null,
  name: "", type: "device", visibility: "hidden",
  deviceRating: 4, linkedParticipantId: ""
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

@Component({
  standalone: true,
  selector: "app-hierarchy-editor",
  templateUrl: "./hierarchy-editor.component.html",
  styleUrls: ["./hierarchy-editor.component.css"],
  imports: [CommonModule, FormsModule, NgbTooltipModule, TargetCardComponent]
})
export class HierarchyEditorComponent implements OnInit, OnDestroy {
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
    this.stateChangeSub = this.matrixState.stateChange$.subscribe(() => this.recomputeHighlight());
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
      linkedParticipantId: target.linkedParticipantId ?? ""
    };
    this.hostForm = { ...BLANK_HOST_FORM };
  }

  closeTargetForm(): void {
    this.targetForm = { ...BLANK_TARGET_FORM };
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

    const host = f.hostId ? (this.state.hosts.find(h => h.id === f.hostId) ?? null) : null;
    const deviceRating = Math.max(1, f.deviceRating);
    // "ic" targets have no Device Rating of their own — they borrow the
    // containing host's Rating (p. 247); fall back to deviceRating only for
    // an "ic" target sitting in public space, which should not happen from
    // this form (IC Target is only offered when a host is selected) but
    // leaves no undefined rating if it ever does.
    const health = calcMatrixHealth(f.type, deviceRating, host?.rating ?? deviceRating) ?? 0;

    if (f.isEditing && f.target) {
      this.matrixState.updateTarget(f.target, {
        name: f.name.trim(),
        type: f.type,
        visibility: f.visibility,
        deviceRating: Math.max(1, Math.min(12, f.deviceRating)),
        linkedParticipantId: f.linkedParticipantId || undefined,
        matrixHealth: health
      });
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
        for (const child of children) {
          this.matrixState.updateTarget(child, { parentTargetId: undefined });
        }
      }
    }
    this.matrixState.removeTarget(host, target);
    if (this.targetForm.target === target) this.targetForm = { ...BLANK_TARGET_FORM };
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

  /** Deckers that can still receive another mark on this host (count < 3). */
  hostAvailableDeckers(host: MatrixHost): MatrixParticipant[] {
    return this.activeDeckers.filter(d => (host.marks[d.name] ?? 0) < 3);
  }

  dots(count: number): string {
    return "●".repeat(count) + "○".repeat(3 - count);
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
    if ((host.marks[s.selectedDeckerId] ?? 0) >= 3) return;
    this.matrixState.addMarkToHost(host, s.selectedDeckerId, 1);
    s.open = false;
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
   * Valid parent choices for `target`: every other public-space **device**,
   * excluding `target` itself and anything already beneath it — picking a
   * descendant as your own parent would create a cycle
   * `MatrixStateService.addMark()`'s propagation walk guards against at
   * runtime, but there is no reason to let the GM create one from this form
   * in the first place.
   *
   * Device-only (Xavier's decision 8, 2026-09-03): a mark only ever
   * propagates onto a device or a host — never a file, persona, IC, or
   * nested host — so offering one of those as a parent choice would build a
   * link `MatrixStateService.propagateMarkUp()` will never actually walk
   * through. See `MatrixTarget.parentTargetId`'s doc comment for the full
   * citation.
   */
  parentOptionsFor(target: MatrixTarget): MatrixTarget[] {
    const excluded = this.descendantIds(target.id);
    excluded.add(target.id);
    return this.state.publicTargets.filter(t => !excluded.has(t.id) && t.type === "device");
  }

  /**
   * Whether `target` should offer a "Parent" control at all — device-only
   * (Xavier's decision 8, 2026-09-03): only a device ever propagates a mark
   * it receives, so parenting a file/persona/IC/nested-host under something
   * else would be a control that can never do anything.
   */
  canHaveParent(target: MatrixTarget): boolean {
    return target.type === "device";
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
