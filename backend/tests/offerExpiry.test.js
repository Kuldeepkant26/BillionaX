/**
 * The two pure functions behind offer expiry.
 *
 * These are the pieces where a mistake is silent and expensive: the cutoff
 * decides what gets permanently deleted, and the visibility clauses decide who
 * can see an offer. Both are tested without Mongo, matching the dependency-free
 * style of the other suites here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { expiryCutoff } from "../src/services/offerExpiry.service.js";
import { offerVisibilityClauses } from "../src/services/content.service.js";
import { OFFER_GRACE_DAYS } from "../src/config/constants.js";

const DAY = 24 * 60 * 60 * 1000;

describe("expiryCutoff", () => {
  it("is the grace period before now", () => {
    const now = new Date("2026-03-20T12:00:00.000Z");
    assert.equal(
      expiryCutoff(now, 7).toISOString(),
      new Date("2026-03-13T12:00:00.000Z").toISOString()
    );
  });

  it("defaults to the configured grace period", () => {
    const now = new Date("2026-03-20T12:00:00.000Z");
    const expected = new Date(now.getTime() - OFFER_GRACE_DAYS * DAY);
    assert.equal(expiryCutoff(now).toISOString(), expected.toISOString());
  });

  it("leaves an offer that expired EXACTLY graceDays ago un-swept", () => {
    // The sweep queries validTo < cutoff, strictly. An offer sitting exactly on
    // the boundary still has its last moment of grace — off-by-one here would
    // delete a day early, and the deletion is permanent.
    const now = new Date("2026-03-20T12:00:00.000Z");
    const cutoff = expiryCutoff(now, 7);
    const expiredExactlyAtBoundary = new Date(now.getTime() - 7 * DAY);

    assert.equal(expiredExactlyAtBoundary < cutoff, false);
  });

  it("sweeps an offer that expired a moment past the boundary", () => {
    const now = new Date("2026-03-20T12:00:00.000Z");
    const cutoff = expiryCutoff(now, 7);
    const justPast = new Date(now.getTime() - 7 * DAY - 1000);

    assert.equal(justPast < cutoff, true);
  });
});

describe("offerVisibilityClauses", () => {
  const now = new Date("2026-03-20T12:00:00.000Z");
  const clauses = offerVisibilityClauses("GOLD", now);

  it("returns the window and the tier gate", () => {
    assert.equal(clauses.length, 3);
  });

  it("treats a missing start date as already started", () => {
    const [validFrom] = clauses;
    assert.deepEqual(validFrom, { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] });
  });

  it("treats a missing deadline as never expiring", () => {
    const [, validTo] = clauses;
    assert.deepEqual(validTo, { $or: [{ validTo: null }, { validTo: { $gte: now } }] });
  });

  it("shows untargeted offers to every tier", () => {
    // Every pre-existing offer has no `tiers` key at all, so the $exists arm is
    // what keeps them visible after this feature ships.
    const [, , tiers] = clauses;
    assert.deepEqual(tiers, {
      $or: [{ tiers: { $exists: false } }, { tiers: { $size: 0 } }, { tiers: "GOLD" }],
    });
  });
});
