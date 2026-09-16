/**
 * The support unread badge.
 *
 * This pins the bug where a thread stayed badged in the admin rail no matter
 * how many times it was read — the count only ever went up.
 *
 * Every individual piece looked right, which is why it survived a first fix.
 * The cause was that FOUR different things write this one number — a page
 * load, a tab focus, a socket nudge, and the response to marking a thread read
 * — and their requests finish out of order. On mount the inbox fired
 * /unread-count and, a moment later, the mark-read that supersedes it. The
 * count had been ISSUED first (so it saw the pre-read total) but often
 * RESOLVED last, writing the stale number over the fresh one.
 *
 * The fix is a monotonic ticket rather than a clock. Two requests issued in
 * the same millisecond are indistinguishable by time, and an earlier attempt
 * using Infinity as "this always wins" froze the badge permanently — a later
 * legitimate fetch could never beat it. Test 5 pins that regression
 * specifically.
 *
 * The slice is a plain factory with no React or zustand in it, so it is driven
 * here against a minimal set/get pair.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSupportSlice } from "../src/store/slices/supportSlice.js";

/** The slice, wired to a bare store — the same contract zustand gives it. */
const makeStore = () => {
  let state = {};
  const set = (patch) =>
    (state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) });
  state = createSupportSlice(set, () => state);
  return () => state;
};

describe("support unread count", () => {
  it("drops a stale count that resolves after a fresher one", () => {
    const s = makeStore();

    // Exactly the mount sequence: the inbox asks for the count, then opens a
    // thread and marks it read. The read is issued SECOND.
    const countSeq = s().nextSupportSeq();
    const readSeq = s().nextSupportSeq();

    s().setSupportUnread(1, readSeq); // the read resolves first
    s().setSupportUnread(2, countSeq); // the pre-read count lands last

    assert.equal(s().supportUnread, 1, "the stale count must not resurrect the badge");
  });

  it("applies counts that arrive in order", () => {
    const s = makeStore();

    s().setSupportUnread(5, s().nextSupportSeq());
    s().setSupportUnread(3, s().nextSupportSeq());

    assert.equal(s().supportUnread, 3);
  });

  it("raises the badge on a push", () => {
    const s = makeStore();
    s().bumpSupportUnread();
    assert.equal(s().supportUnread, 1);
  });

  it("does not let a count already in flight erase a later push", () => {
    const s = makeStore();

    const inFlight = s().nextSupportSeq(); // a fetch that will return 0
    s().bumpSupportUnread(); // a message arrives while it is out
    s().setSupportUnread(0, inFlight); // the stale zero lands

    assert.equal(s().supportUnread, 1, "a message that arrived is not unread-zero");
  });

  it("still accepts a fetch issued after a local event", () => {
    /*
     * The regression an earlier fix introduced.
     *
     * Marking local events with Infinity made them beat every in-flight count,
     * which was the goal — but nothing could ever beat them afterwards, so the
     * badge froze at whatever the last push left. A ticket that merely
     * increments keeps the first property and drops the second.
     */
    const s = makeStore();

    s().bumpSupportUnread();
    s().setSupportUnread(7, s().nextSupportSeq());

    assert.equal(s().supportUnread, 7, "the badge must not freeze after a push");
  });

  it("keeps a thread read, until a genuinely newer count says otherwise", () => {
    const s = makeStore();

    const inFlight = s().nextSupportSeq();
    s().clearSupportUnread();
    s().setSupportUnread(4, inFlight);
    assert.equal(s().supportUnread, 0, "a stale count must not un-read a thread");

    s().setSupportUnread(4, s().nextSupportSeq());
    assert.equal(s().supportUnread, 4, "a later count is real news");
  });

  it("never goes negative", () => {
    const s = makeStore();
    s().setSupportUnread(-3, s().nextSupportSeq());
    assert.equal(s().supportUnread, 0);
  });

  it("accepts a write with no ticket, for one-off callers", () => {
    const s = makeStore();
    s().setSupportUnread(9);
    assert.equal(s().supportUnread, 9);
  });

  it("hands out a strictly increasing ticket", () => {
    const s = makeStore();
    const a = s().nextSupportSeq();
    const b = s().nextSupportSeq();
    const c = s().nextSupportSeq();
    assert.ok(a < b && b < c, "tickets must order the writes that take them");
  });
});
