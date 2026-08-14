import { GlitchLevel, classifyRoll } from "app/shared/roll-utils";

export const LOG_DECODE_DURATION_MS_PER_CHAR = 28;
export const LOG_DECODE_MIN_MS = 420;
export const LOG_DECODE_MAX_MS = 1200;

export const matrixChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%*+-";

export function randomMatrixChar(): string {
  return matrixChars[Math.floor(Math.random() * matrixChars.length)];
}

export function buildDecodeFrame(finalText: string, revealedChars: number): string {
  let frame = "";
  for (let i = 0; i < finalText.length; i++) {
    const ch = finalText[i];
    if (ch === " " || i < revealedChars) {
      frame += ch;
    } else if (/[A-Za-z0-9]/.test(ch)) {
      frame += randomMatrixChar();
    } else {
      frame += ch;
    }
  }
  return frame;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Roll-result vocabulary ────────────────────────────────────────────────
//
// The labels below are the printed rules terms (brief p. 44-45). They are the
// only vocabulary the log uses for a roll outcome; no synonyms.

/** Printed term for "more than half the dice showed a 1" (brief p. 45). */
export const GLITCH_LABEL = "GLITCH";

/** Printed term for a glitch that also produced no hits (brief p. 45). */
export const CRITICAL_GLITCH_LABEL = "CRITICAL GLITCH";

/** Separator between the sub-facts of a single log line. Presentation only. */
const LOG_FACT_SEPARATOR = " · ";

/**
 * Separator between the dice faces and the summary facts of a roll line.
 * Presentation only; also the seam a later entry quotes back from when it
 * needs to name the roll it is talking about.
 */
export const LOG_SUMMARY_SEPARATOR = " — ";

/** Marker on a narration entry naming the roll it annotates. Presentation only. */
export const LOG_REFERENCE_PREFIX = "re: ";

/** Longest fragment of a parent entry quoted back. Presentation only. */
export const LOG_REFERENCE_MAX_LENGTH = 120;

export function getGlitchLabel(level: GlitchLevel): string {
  if (level === "critical") return CRITICAL_GLITCH_LABEL;
  if (level === "glitch") return GLITCH_LABEL;
  return "";
}

/**
 * Canonical one-line rendering of a dice roll.
 *
 * Carries the pool size and the number of 1s alongside the hits so a reader
 * can verify glitch status independently (glitch = more than half the dice
 * show a 1, brief p. 45; hits = dice showing 5 or 6, brief p. 44). Faces are
 * shown high-to-low purely for legibility - same multiset, mirroring the way
 * the book itself prints a roll.
 *
 * A glitch never suppresses the hit count and the hit count never suppresses
 * the glitch: both are always printed (brief p. 45).
 */
export function formatDiceRollLogText(values: readonly number[]): string {
  const outcome = classifyRoll(values);
  const faces = [ ...values ].sort((a, b) => b - a).join(", ");
  const parts = [`${outcome.hits} hit${outcome.hits !== 1 ? "s" : ""}`];
  const label = getGlitchLabel(outcome.glitch);
  if (label) {
    parts.push(`${outcome.ones} one${outcome.ones !== 1 ? "s" : ""} of ${outcome.pool}`);
    parts.push(label);
  }
  return `rolled ${outcome.pool}d6: [${faces}]${LOG_SUMMARY_SEPARATOR}${parts.join(LOG_FACT_SEPARATOR)}`;
}

/**
 * The identifying fragment of an entry: everything after the faces, i.e. the
 * hits / 1s / glitch summary. Entries with no such seam (an action line, an
 * initiative line) are quoted whole.
 */
export function extractLogEntrySummary(text: string): string {
  const seam = text.indexOf(LOG_SUMMARY_SEPARATOR);
  const summary = (seam >= 0 ? text.slice(seam + LOG_SUMMARY_SEPARATOR.length) : text).trim();
  return summary.length > LOG_REFERENCE_MAX_LENGTH
    ? `${summary.slice(0, LOG_REFERENCE_MAX_LENGTH - 1)}…`
    : summary;
}

/**
 * Restate *which* entry a later entry is about, inline in the later entry.
 *
 * The log is a flat list with no turn/pass grouping, so anything can land
 * between a roll and the narration attached to it. Adjacency therefore proves
 * nothing; the narration carries the actor and the roll's own hit/glitch
 * summary so the link is readable on its own.
 */
export function formatLogEntryReference(actor: string, text: string): string {
  const who = (actor || "").trim() || "Unknown";
  return `${LOG_REFERENCE_PREFIX}${who}${LOG_SUMMARY_SEPARATOR}${extractLogEntrySummary(text)}`;
}

/**
 * Initiative Test line: Initiative attribute + the Initiative Dice actually
 * rolled = Initiative Score (brief p. 160). The faces are shown in brackets;
 * their count already signifies how many Initiative Dice were rolled, so no
 * separate subtotal is printed. `total` is printed verbatim, including
 * negative Scores, which are never clamped to 0 (ARCHITECTURE.md §1; brief
 * p. 160).
 */
export function formatInitiativeRollLogText(baseLabel: string, values: readonly number[], total: number): string {
  return `initiative roll: ${baseLabel} + [${values.join(", ")}] = ${total}`;
}

/** Initiative Test entered by hand rather than rolled in the app. */
export function formatManualInitiativeRollLogText(baseLabel: string, rolledTotal: number, total: number): string {
  return `initiative roll: ${baseLabel} + manual(${rolledTotal}) = ${total}`;
}

/**
 * Mid-Combat-Turn Initiative Score change (gained/lost Initiative Dice,
 * augmentation/drug/spell effects, wound modifiers): its own entry, showing
 * the dice rolled for the change and the resulting Score (brief p. 160).
 */
export function formatInitiativeDeltaLogText(values: readonly number[], delta: number, total: number): string {
  const sign = delta >= 0 ? "+" : "-";
  const magnitude = Math.abs(delta);
  const dice = values.length > 0 ? `${sign}[${values.join(", ")}]` : `manual(${sign}${magnitude})`;
  return values.length > 0
    ? `initiative delta: ${dice} = ${sign}${magnitude} → score: ${total}`
    : `initiative delta: ${dice} → score: ${total}`;
}

/**
 * Linked NPC row: a member's wound moved the row's **shared** Initiative Score
 * (brief "NPC Group Initiative" acceptance criterion 5 / Decision 1, house rule
 * against p. 379 / p. 170; `RULINGS.md` 2026-08-01).
 *
 * Scenario S3 requires the log to make it visible both that the group-wide
 * wound-debuff house rule fired and *which* NPC's wound triggered it, because
 * the visible effect (every member of the row slowing down at once) is not
 * what the printed rules would produce and a GM reading back the log would
 * otherwise have no way to tell it from a bug.
 *
 * `woundModifierDelta` is **signed**, as the house rule runs in both
 * directions: a positive delta is a wound (the row's Wound Modifier grew, its
 * shared Score drops) and a negative delta is that penalty coming back off
 * because the NPC was healed or the hit was corrected. A one-way "-N" rendering
 * cannot express the second case, and the GM has to be able to see why a row's
 * shared Score went *up* just as much as why it went down.
 */
export function formatGroupWoundLogText(
  rowName: string,
  memberName: string,
  woundModifierDelta: number,
  scoreAfter: number
): string {
  const row = (rowName || "").trim() || "NPC row";
  const member = (memberName || "").trim() || "a member";
  const magnitude = Math.abs(woundModifierDelta);
  const healing = woundModifierDelta < 0;
  const cause = healing
    ? `${member}'s recovery (+${magnitude})`
    : `${member}'s wound (-${magnitude})`;
  return `group wound (house rule): ${cause} applies to `
    + `all of ${row} → shared initiative score: ${scoreAfter}`;
}

/**
 * Initiative Pass boundary. Every Initiative Pass subtracts 10 from every
 * Initiative Score (brief p. 160); the decay is named in the entry rather
 * than left for the reader to infer from the Score column.
 */
export function formatPassStartLogText(pass: number, decayPerPass: number): string {
  if (pass <= 1) {
    return `Start Initiative Pass ${pass}`;
  }
  return `Start Initiative Pass ${pass} — all Initiative Scores -${decayPerPass}`;
}

export function getLogTextClass(text: string): string {
  if (new RegExp(`${CRITICAL_GLITCH_LABEL}|${GLITCH_LABEL}`).test(text)) {
    return "log-text-glitch";
  }
  if (/Act_Click:|Action_Click:|Interrupt|Free:|Simple:|Complex:|\bAct\b/i.test(text)) {
    return "log-text-action";
  }
  if (/roll/i.test(text)) {
    return "log-text-roll";
  }
  return "log-text-system";
}

/**
 * Highlight the glitch labels wherever they appear in an entry. Applied to
 * every branch of `formatLogText` so a glitch is never dropped by an earlier
 * pattern winning the match (brief p. 45: a glitch stands alongside whatever
 * else the entry says).
 */
function decorateGlitchLabels(formatted: string): string {
  // Single pass with CRITICAL first, so the "GLITCH" inside "CRITICAL GLITCH"
  // is consumed by the critical alternative and never double-wrapped.
  return formatted.replace(
    new RegExp(`${CRITICAL_GLITCH_LABEL}|${GLITCH_LABEL}`, "g"),
    (match) => match === CRITICAL_GLITCH_LABEL
      ? `<span class="log-keyword-critical-glitch">${CRITICAL_GLITCH_LABEL}</span>`
      : `<span class="log-keyword-glitch">${GLITCH_LABEL}</span>`
  );
}

export function formatLogText(text: string): string {
  return decorateGlitchLabels(formatLogTextCore(text));
}

function formatLogTextCore(text: string): string {
  let formatted = escapeHtml(text);
  const rollPattern = /(initiative roll:.*=\s*)(-?\d+)\s*$/i;
  if (rollPattern.test(formatted)) {
    return formatted.replace(rollPattern, `$1<span class="log-keyword-roll">$2</span>`);
  }
  const hitsPattern = /(\d+\s+hits?)/;
  if (hitsPattern.test(formatted)) {
    formatted = formatted.replace(hitsPattern, `<span class="log-keyword-roll">$1</span>`);
  }
  const interruptPattern = /^(Interrupt\s+)(.+)$/i;
  if (interruptPattern.test(formatted)) {
    return formatted.replace(interruptPattern, `$1<span class="log-keyword-action">$2</span>`);
  }
  const categoryPattern = /(Free|Simple|Complex):\s*([^|]+)/gi;
  if (categoryPattern.test(formatted)) {
    return formatted.replace(categoryPattern, (_match, label: string, actions: string) => {
      const highlightedActions = actions
        .split(",")
        .map((a: string) => a.trim())
        .filter((a: string) => a.length > 0)
        .map((a: string) => `<span class="log-keyword-action">${a}</span>`)
        .join(", ");
      return `${label}: ${highlightedActions}`;
    });
  }
  formatted = formatted.replace(/(healed\s+Physical\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
  formatted = formatted.replace(/(healed\s+Stun\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
  formatted = formatted.replace(/(Physical\s+)(\d+)/gi, `$1<span class="log-keyword-physical">$2</span>`);
  formatted = formatted.replace(/(Stun\s+)(\d+)/gi, `$1<span class="log-keyword-stun">$2</span>`);
  return formatted;
}
