import { GlitchLevel, classifyRoll } from "app/shared/roll-utils";
import { DECLARED_ACTION_VERB_PHRASES } from "app/shared/declared-actions";

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
 * otherwise have no way to tell it from a bug. This entry is GM-only and
 * carries `SharedLogEntry.houseRule` (brief "Action Log readability"
 * `briefs/action-log-readability-spec.md`), which is what tells the GM apart
 * without the words "house rule" appearing in the text itself; the row's name
 * is not repeated here because it is already the entry's actor.
 *
 * `woundModifierDelta` is **signed**, as the house rule runs in both
 * directions: a positive delta is a wound (the row's Wound Modifier grew, its
 * shared Score drops) and a negative delta is that penalty coming back off
 * because the NPC was healed or the hit was corrected. A one-way "-N" rendering
 * cannot express the second case, and the GM has to be able to see why a row's
 * shared Score went *up* just as much as why it went down.
 */
export function formatGroupWoundLogText(
  memberName: string,
  woundModifierDelta: number,
  scoreAfter: number
): string {
  const member = (memberName || "").trim() || "a member";
  const magnitude = Math.abs(woundModifierDelta);
  const healing = woundModifierDelta < 0;
  return healing
    ? `group recovery from ${member} (+${magnitude}) → shared score ${scoreAfter}`
    : `group wound from ${member} (-${magnitude}) → shared score ${scoreAfter}`;
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

/**
 * Combat Turn boundary: the start line. `turn` is captured by the caller
 * before `startRound()` runs, since `startRound()` can itself cascade
 * straight through to `endCombatTurn()` when nobody can act (brief "Action
 * Log entries for combat structural boundaries").
 */
export function formatTurnStartLogText(turn: number): string {
  return `Start Combat Turn ${turn}`;
}

/**
 * Combat Turn boundary: the end line. `turn` is the turn that just ended, not
 * the incremented value `CombatManager.endCombatTurn()` leaves behind.
 */
export function formatTurnEndLogText(turn: number): string {
  return `End Combat Turn ${turn}`;
}

/**
 * Initiative Pass boundary: the end line. Deliberately does not restate the
 * -10 decay; that is announced on the pass that receives it, at its start
 * (`formatPassStartLogText`), which is where a GM needs it.
 */
export function formatPassEndLogText(pass: number): string {
  return `End Initiative Pass ${pass}`;
}

/** Combat-start structural entry (brief "Action Log entries for combat structural boundaries"). */
export const COMBAT_STARTED_LOG_TEXT = "Combat started";

/** Combat-end structural entry, replacing the former "End Combat" button-label text. */
export const COMBAT_ENDED_LOG_TEXT = "Combat ended";

export function getLogTextClass(text: string): string {
  if (new RegExp(`${CRITICAL_GLITCH_LABEL}|${GLITCH_LABEL}`).test(text)) {
    return "log-text-glitch";
  }
  if (/Act_Click:|Action_Click:|Interrupt|\((?:free|simple|complex)\)|passed their action|Free:|Simple:|Complex:|\bAct\b/i.test(text)) {
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

/** Every `(free|simple|complex)` clause tag emitted by `buildDeclaredActionLog`. */
const ACTION_CLAUSE_TAG_PATTERN = /\((free|simple|complex)\)/gi;

/**
 * Every verb-phrase lead a `buildDeclaredActionLog` clause can ever open
 * with, once its repeat suffix and `(free|simple|complex)` tag are stripped:
 * every value in `DECLARED_ACTION_VERB_PHRASES` (`declared-actions.ts`), plus
 * the literal `"used "` lead its `` `used ${name}` `` fallback always starts
 * with regardless of what unrecognised name follows. This is the *closed*
 * vocabulary the engine can produce - nothing else ever appears at the start
 * of a clause - so it is sorted longest-first only for readability; matching
 * is a plain prefix test and does not depend on the order (a shorter phrase
 * that is itself a prefix of a longer one, e.g. "cast a spell" vs. "cast a
 * spell recklessly", still finds the same start index either way, since the
 * highlighted span always runs from that index to the clause's own tag, not
 * to the end of whichever phrase matched).
 */
const KNOWN_VERB_PHRASE_LEADS: readonly string[] = [
  ...Object.values(DECLARED_ACTION_VERB_PHRASES),
  "used "
];

function clauseStartsWithKnownVerbPhrase(remainder: string): boolean {
  return KNOWN_VERB_PHRASE_LEADS.some(lead => remainder.startsWith(lead));
}

/**
 * Split a single declared-action clause's raw text (everything between the
 * previous clause tag, or the start of the line, and this clause's own tag)
 * into an unhighlighted prefix and the verb phrase to highlight.
 *
 * Round-2 defect D2 (`briefs/action-log-readability-spec.md`): the original
 * heuristic treated the first lowercase-initial token as the start of the
 * verb phrase, on the assumption that a row member's prepended name
 * (`` `${member.name} ${sentence}` ``, `performRowMemberAct`) would always be
 * capitalised. A fully-lowercase or lowercase-initial NPC name ("ork
 * samurai", "the bouncer") broke that assumption and got swallowed into the
 * highlighted span along with the verb phrase.
 *
 * This scans forward for the earliest point at which the *remaining* text
 * starts matching a member of the closed verb-phrase vocabulary
 * (`clauseStartsWithKnownVerbPhrase`) instead of guessing from
 * capitalisation - a structural boundary rather than a refined guess, and one
 * that does not require changing what `text` actually says (the wire shape
 * asserted by AC13/S2 is untouched). Everything before that point - an
 * inter-clause joiner ("and", ",") or a row member's name, in any case - is
 * the unhighlighted prefix.
 *
 * Residual limitation, accepted per the brief ("acceptable to leave... if no
 * clean structural fix is feasible without a larger change" - this one *is*
 * feasible, but is not airtight): an NPC name that itself contains one of the
 * known verb-phrase leads as a substring (e.g. a member literally named "the
 * reloaded guy") can still make the scan stop one token early. This is a
 * presentation-only, cosmetically-visible edge case with no effect on the
 * underlying log text, and is judged rare enough not to warrant a wire-shape
 * change (inserting a real separator into `text` would break the exact
 * strings AC13/S2/npc-row.spec.ts already assert).
 */
function splitActionClausePrefix(rawClause: string): { prefix: string; verb: string } {
  let index = 0;
  while (index < rawClause.length) {
    const remainder = rawClause.slice(index);
    if (clauseStartsWithKnownVerbPhrase(remainder)) {
      break;
    }
    const whitespaceMatch = /^\s+/.exec(remainder);
    if (whitespaceMatch) {
      index += whitespaceMatch[0].length;
      continue;
    }
    const tokenMatch = /^\S+/.exec(remainder);
    if (!tokenMatch) {
      break;
    }
    index += tokenMatch[0].length;
  }
  return { prefix: rawClause.slice(0, index), verb: rawClause.slice(index) };
}

/**
 * Wrap each declared-action/interrupt clause's verb phrase in
 * `log-keyword-action`, leaving its `(free|simple|complex)` tag, any
 * inter-clause connector, and any row-member name prefix unwrapped. Returns
 * `null` (rather than the unmodified text) when the line carries no clause
 * tag at all, so the caller can fall through to the remaining highlight
 * rules.
 */
function highlightActionClauses(formatted: string): string | null {
  const tags = [...formatted.matchAll(ACTION_CLAUSE_TAG_PATTERN)];
  if (tags.length === 0) {
    return null;
  }
  let result = "";
  let cursor = 0;
  for (const tag of tags) {
    const tagStart = tag.index ?? 0;
    // The tag is always preceded by the single space `buildDeclaredActionLog`
    // inserts between the verb phrase and its "(free|simple|complex)" tag;
    // exclude it from the clause so it renders outside the span.
    const clauseEnd = formatted[tagStart - 1] === " " ? tagStart - 1 : tagStart;
    const rawClause = formatted.slice(cursor, clauseEnd);
    const { prefix, verb } = splitActionClausePrefix(rawClause);
    result += `${prefix}<span class="log-keyword-action">${verb}</span>`;
    result += formatted.slice(clauseEnd, tagStart + tag[0].length);
    cursor = tagStart + tag[0].length;
  }
  result += formatted.slice(cursor);
  return result;
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
  const interruptPattern = /^(interrupted,\s+)(.+)$/i;
  if (interruptPattern.test(formatted)) {
    return formatted.replace(interruptPattern, `$1<span class="log-keyword-action">$2</span>`);
  }
  const highlightedClauses = highlightActionClauses(formatted);
  if (highlightedClauses !== null) {
    return highlightedClauses;
  }
  formatted = formatted.replace(/(healed\s+Physical\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
  formatted = formatted.replace(/(healed\s+Stun\s+)(\d+)/gi, `$1<span class="log-keyword-heal">$2</span>`);
  formatted = formatted.replace(/(Physical\s+)(\d+)/gi, `$1<span class="log-keyword-physical">$2</span>`);
  formatted = formatted.replace(/(Stun\s+)(\d+)/gi, `$1<span class="log-keyword-stun">$2</span>`);
  return formatted;
}
