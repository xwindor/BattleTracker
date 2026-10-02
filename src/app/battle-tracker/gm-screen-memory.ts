/**
 * What the GM screen remembers in the GM's own browser across a refresh
 * (GM screen overhaul spec #3, "Remembering"; user stories 62-65).
 *
 * Every read and write here is best-effort and never throws: blocked, empty
 * or unreadable storage reads as "nothing remembered", and a failed write is
 * simply dropped, so storage settings can never break the screen (story 65).
 * Later items reuse `readRemembered`/`writeRemembered` under their own keys:
 * whether the bottom strip is shrunk (ticket 03) and the Matrix panel
 * sharing the right-hand slot (ticket 10).
 */

/** Read `key` and hand its parsed JSON to `parse`; null if absent or unusable. */
export function readRemembered<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const text = window.localStorage.getItem(key);
    if (text === null) {
      return null;
    }
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Save `value` under `key`, or forget `key` when `value` is null. */
export function writeRemembered(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Blocked or full storage: the screen just won't remember this.
  }
}

/** The participant panel's tabs, by the id the panel's tab strip uses. */
export const PARTICIPANT_PANEL_TABS = ["condition", "stats", "deck"] as const;
export type ParticipantPanelTab = typeof PARTICIPANT_PANEL_TABS[number];

/**
 * The open participant panel: whose it is (by the participant id that
 * survives a room rejoin) and which tab. Nothing stored means closed.
 */
export interface RememberedParticipantPanel {
  participantId: string;
  tab: ParticipantPanelTab;
}

export const PARTICIPANT_PANEL_MEMORY_KEY = "bt.gmScreen.participantPanel.v1";

function parseParticipantPanel(raw: unknown): RememberedParticipantPanel | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const { participantId, tab } = raw as Record<string, unknown>;
  if (typeof participantId !== "string" || participantId === "") {
    return null;
  }
  if (!PARTICIPANT_PANEL_TABS.includes(tab as ParticipantPanelTab)) {
    return null;
  }
  return { participantId, tab: tab as ParticipantPanelTab };
}

export function readRememberedParticipantPanel(): RememberedParticipantPanel | null {
  return readRemembered(PARTICIPANT_PANEL_MEMORY_KEY, parseParticipantPanel);
}

export function rememberParticipantPanel(panel: RememberedParticipantPanel | null): void {
  writeRemembered(PARTICIPANT_PANEL_MEMORY_KEY, panel);
}

/**
 * Whether the bottom strip is shrunk to one line (ticket 03, story 63).
 * Nothing stored, or anything but `true`, means expanded.
 */
export const BOTTOM_STRIP_MEMORY_KEY = "bt.gmScreen.bottomStripShrunk.v1";

export function readRememberedBottomStripShrunk(): boolean {
  return readRemembered(BOTTOM_STRIP_MEMORY_KEY, raw => raw === true) ?? false;
}

export function rememberBottomStripShrunk(shrunk: boolean): void {
  writeRemembered(BOTTOM_STRIP_MEMORY_KEY, shrunk ? true : null);
}
