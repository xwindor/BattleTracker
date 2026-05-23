import { DeclaredActionItem, REPEATABLE_SIMPLE_ACTIONS } from "app/shared/declared-actions";

export interface DeclaredActionSelection {
  free: string | null;
  simple: string[];
  complex: string | null;
}

const simpleAttackActions = new Set<string>([
  "Quick Draw",
  "Fire Bow",
  "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto",
  "Throw Weapon",
  "Reckless Spellcasting"
]);

const callShotCompatibleActions = new Set<string>([
  "Fire Bow",
  "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto",
  "Throw Weapon",
  "Melee Attack",
  "Cast Spell",
  "Reckless Spellcasting",
  "Quick Draw",
  "Fire Long Burst or Semi-Auto Burst",
  "Fire Full-Auto Weapon",
  "Fire Mounted or Vehicle Weapon",
  "Load and Fire Bow"
]);

const multipleAttackCompatibleActions = new Set<string>([
  "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto",
  "Throw Weapon",
  "Melee Attack",
  "Cast Spell",
  "Reckless Spellcasting",
  "Quick Draw",
  "Fire Long Burst or Semi-Auto Burst",
  "Fire Full-Auto Weapon",
  "Fire Mounted or Vehicle Weapon",
  "Fire Bow",
  "Load and Fire Bow"
]);

const actionConflicts: Record<string, string[]> = {
  "Quick Draw": [ "Ready Weapon", "Fire Bow", "Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto", "Throw Weapon" ],
  "Ready Weapon": [ "Quick Draw" ]
};

const repeatableSimpleActions = new Set<string>(REPEATABLE_SIMPLE_ACTIONS);

export class DeclaredActionEngine {

  static emptySelection(): DeclaredActionSelection {
    return { free: null, simple: [], complex: null };
  }

  static getSelectedActionNames(selection: DeclaredActionSelection): Set<string> {
    const selected = new Set<string>();
    if (selection.free) selected.add(selection.free);
    selection.simple.forEach(a => selected.add(a));
    if (selection.complex) selected.add(selection.complex);
    return selected;
  }

  static getSimpleAttackCount(selection: DeclaredActionSelection): number {
    return selection.simple.filter(a => simpleAttackActions.has(a)).length;
  }

  static getSimpleActionSelectionCount(selection: DeclaredActionSelection, actionName: string): number {
    return selection.simple.filter(a => a === actionName).length;
  }

  static isRepeatableSimpleAction(actionName: string): boolean {
    return repeatableSimpleActions.has(actionName);
  }

  static hasConflictingSelectedAction(selection: DeclaredActionSelection, actionName: string): boolean {
    const selected = DeclaredActionEngine.getSelectedActionNames(selection);
    const conflicts = actionConflicts[actionName] ?? [];
    if ([ ...selected ].some(a => conflicts.includes(a))) return true;
    return [ ...selected ].some(a => (actionConflicts[a] ?? []).includes(actionName));
  }

  static canAddSimpleDuplicate(selection: DeclaredActionSelection, actionName: string): boolean {
    if (!repeatableSimpleActions.has(actionName)) return false;
    if (selection.complex !== null || selection.simple.length >= 2) return false;
    if (DeclaredActionEngine.getSimpleActionSelectionCount(selection, actionName) >= 2) return false;
    if (simpleAttackActions.has(actionName) && DeclaredActionEngine.getSimpleAttackCount(selection) >= 1) return false;
    return !DeclaredActionEngine.hasConflictingSelectedAction(selection, actionName);
  }

  static isDeclaredActionSelected(selection: DeclaredActionSelection, action: DeclaredActionItem): boolean {
    if (action.economy === "free") return selection.free === action.name;
    if (action.economy === "simple") return selection.simple.includes(action.name);
    return selection.complex === action.name;
  }

  static canUseDeclaredAction(selection: DeclaredActionSelection, action: DeclaredActionItem): boolean {
    if (action.economy !== "simple" && DeclaredActionEngine.isDeclaredActionSelected(selection, action)) {
      return true;
    }
    if (action.economy === "free") {
      return !DeclaredActionEngine.hasConflictingSelectedAction(selection, action.name);
    }
    if (action.economy === "simple") {
      if (DeclaredActionEngine.getSimpleActionSelectionCount(selection, action.name) > 0) return true;
      if (simpleAttackActions.has(action.name) && DeclaredActionEngine.getSimpleAttackCount(selection) >= 1) return false;
      if (DeclaredActionEngine.hasConflictingSelectedAction(selection, action.name)) return false;
      return selection.complex === null && selection.simple.length < 2;
    }
    if (DeclaredActionEngine.hasConflictingSelectedAction(selection, action.name)) return false;
    return selection.simple.length === 0 && selection.complex === null;
  }

  static toggleDeclaredAction(selection: DeclaredActionSelection, action: DeclaredActionItem): DeclaredActionSelection {
    const next: DeclaredActionSelection = { free: selection.free, simple: [ ...selection.simple ], complex: selection.complex };
    if (action.economy === "free") {
      next.free = next.free === action.name ? null : action.name;
      return next;
    }
    if (action.economy === "simple") {
      const simpleCount = DeclaredActionEngine.getSimpleActionSelectionCount(selection, action.name);
      if (simpleCount > 0) {
        if (DeclaredActionEngine.canAddSimpleDuplicate(selection, action.name)) {
          next.simple = [ ...selection.simple, action.name ];
        } else if (repeatableSimpleActions.has(action.name)) {
          next.simple = selection.simple.filter(a => a !== action.name);
        } else {
          next.simple = DeclaredActionEngine.removeOneSimpleAction(selection.simple, action.name);
        }
      } else {
        next.simple = [ ...selection.simple, action.name ];
      }
      return next;
    }
    next.complex = next.complex === action.name ? null : action.name;
    if (next.complex !== null) next.simple = [];
    return next;
  }

  static formatActionListWithCounts(actions: string[]): string[] {
    const counts = new Map<string, number>();
    const ordered: string[] = [];
    for (const action of actions) {
      if (!counts.has(action)) ordered.push(action);
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
    return ordered.map(action => {
      const count = counts.get(action) ?? 0;
      return count > 1 ? `${action} x${count}` : action;
    });
  }

  static buildDeclaredActionLog(selection: DeclaredActionSelection): string | null {
    const parts: string[] = [];
    if (selection.free) parts.push(`Free: ${selection.free}`);
    if (selection.simple.length > 0) {
      parts.push(`Simple: ${DeclaredActionEngine.formatActionListWithCounts(selection.simple).join(", ")}`);
    }
    if (selection.complex) parts.push(`Complex: ${selection.complex}`);
    return parts.length === 0 ? null : parts.join(" | ");
  }

  static getValidationResult(selection: DeclaredActionSelection): { valid: boolean; message: string } {
    const selected = DeclaredActionEngine.getSelectedActionNames(selection);
    if (!selection.free && selection.simple.length === 0 && !selection.complex) {
      return { valid: false, message: "Select at least one action to submit." };
    }
    if (selection.complex && selection.simple.length > 0) {
      return { valid: false, message: "Complex and Simple actions cannot be combined." };
    }
    if (DeclaredActionEngine.getSimpleAttackCount(selection) > 1) {
      return { valid: false, message: "Only one Simple attack action can be selected per Action Phase." };
    }
    if (selected.has("Call a Shot") && !DeclaredActionEngine.hasAny(selected, callShotCompatibleActions)) {
      return { valid: false, message: "Call a Shot requires a compatible attack action." };
    }
    if (selected.has("Multiple Attacks") && !DeclaredActionEngine.hasAny(selected, multipleAttackCompatibleActions)) {
      return { valid: false, message: "Multiple Attacks requires a compatible attack action." };
    }
    if (selection.simple.length > 2) {
      return { valid: false, message: "You can select at most 2 Simple actions." };
    }
    return { valid: true, message: "Valid action set. Ready to submit." };
  }

  private static removeOneSimpleAction(actions: string[], actionName: string): string[] {
    const next = [ ...actions ];
    const index = next.indexOf(actionName);
    if (index !== -1) next.splice(index, 1);
    return next;
  }

  private static hasAny(selected: Set<string>, candidates: Set<string>): boolean {
    for (const action of selected) {
      if (candidates.has(action)) return true;
    }
    return false;
  }
}
