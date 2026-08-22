/**
 * Types for `server/gm-state-channel.js`.
 *
 * The module itself is plain CommonJS because `server.js` requires it
 * directly. This declaration exists so the Karma specs (the only test
 * runner this repo has) can import and exercise it. See
 * `briefs/gm-reconnect-state-loss-spec.md`, AC 14/21 (review round
 * 2026-08-19, defect D4).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const GM_STATE_MAX_PAYLOAD_BYTES: number;

export function isGmState(v: unknown): boolean;

export interface GmStateValidation {
  ok: boolean;
  reason?: string;
}

export function validateGmStatePayload(gmState: unknown, maxBytes?: number): GmStateValidation;
