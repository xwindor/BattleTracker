"use strict";

/**
 * Pure validation for the `session:update-gm-state` payload (brief "GM
 * reconnect state loss").
 *
 * Extracted out of `server.js` (review round 2026-08-19, defect D4) the same
 * way `room-guards.js`/`session-store.js` already are: the transport wiring
 * (socket, `reject()`, `touchSession()`, `getOrCreateSession()`) stays in
 * `server.js`; this module only decides whether a payload is acceptable and,
 * for the size cap, what "acceptable" means - so that decision is testable
 * directly, without booting a server, the same way `authorizeRoomPacket()`
 * and `isSharedState`'s size cap are.
 */

/**
 * Size cap for one `gmState` payload (brief AC 21). Same bound as
 * `session:update-state`'s `state` - `gmState` is roughly the same shape,
 * doubled per participant at most, and 50 participants' worth is still well
 * under this.
 */
const GM_STATE_MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * Schema check for the GM-only rehydration payload. Deliberately shallow,
 * matching `isSharedState`'s own depth in `server.js` - this server never
 * interprets the contents, only stores and returns them verbatim to the GM's
 * own socket.
 */
function isGmState(v) {
  return v && typeof v === "object"
    && Array.isArray(v.participants);
}

/**
 * Decide what one `session:update-gm-state` packet's `gmState` earns.
 *
 * `{ ok: true }` - the payload is well-shaped and under the size cap; the
 * caller should store it verbatim.
 *
 * `{ ok: false, reason }` - refused (bad shape, or over the cap). The caller
 * must still emit `session:error` with `reason` (unchanged), and - fix round
 * 2026-08-19, review defect D7 - must CLEAR the room's previously stored
 * `gmState` to `null` rather than leaving it in place. A refused push must
 * not let `session.gmState` sit there looking valid while `session.state`
 * keeps moving out from under it: that is "quietly wrong", a state the
 * restore path (`restoreFromSharedState`) has no way to detect. A `null`
 * `gmState` is a state it already handles correctly and safely - "lost", the
 * same as a legacy room or a deploy-skew gap - so clearing on rejection turns
 * an undetectable failure mode into the one this whole channel was already
 * built to degrade into.
 */
function validateGmStatePayload(gmState, maxBytes = GM_STATE_MAX_PAYLOAD_BYTES) {
  if (!isGmState(gmState)) {
    return { ok: false, reason: "invalid-payload: gmState" };
  }
  if (JSON.stringify(gmState).length > maxBytes) {
    return { ok: false, reason: "payload-too-large: gmState" };
  }
  return { ok: true };
}

module.exports = { isGmState, validateGmStatePayload, GM_STATE_MAX_PAYLOAD_BYTES };
