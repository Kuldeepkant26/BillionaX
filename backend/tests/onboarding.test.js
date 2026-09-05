/**
 * Tests for the bank-verification name gate.
 *
 * What this protects: a linked account is where a hotel's money is sent. If the
 * account holder is not the business we think we onboarded, every payout goes
 * to a stranger — and nothing downstream would notice, because from Razorpay's
 * side the transfer succeeded.
 *
 * The gate has to be loose enough that "Taj Hotels Private Limited" matching a
 * bank's "TAJ HOTELS PVT LTD" does not need a human, and tight enough that a
 * different company, or a personal account, always does.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let nameMatchScore, NAME_MATCH_THRESHOLD;

before(async () => {
  ({ nameMatchScore, NAME_MATCH_THRESHOLD } = await import(
    "../src/services/onboarding.service.js"
  ));
});

const passes = (typed, returned) => nameMatchScore(typed, returned) >= NAME_MATCH_THRESHOLD;

describe("nameMatchScore", () => {
  it("ignores company-suffix spelling", () => {
    assert.ok(passes("Taj Hotels Private Limited", "TAJ HOTELS PVT LTD"));
    assert.ok(passes("Marigold Residency LLP", "Marigold Residency"));
  });

  it("ignores case and punctuation", () => {
    assert.ok(passes("The Chandratal Palace", "chandratal palace"));
    assert.ok(passes("Oberoi & Sons", "OBEROI AND SONS"));
  });

  it("ignores word order and extra qualifiers", () => {
    // Banks routinely hold a longer or differently ordered version.
    assert.ok(passes("Taj Hotels", "Taj Hotels Delhi Property"));
    assert.ok(passes("Palace Chandratal", "Chandratal Palace"));
  });

  it("BLOCKS a completely different business", () => {
    assert.ok(!passes("Taj Hotels Pvt Ltd", "Sunrise Trading Company"));
  });

  it("BLOCKS a personal account behind a business name", () => {
    // The most likely real fraud, and the most expensive to miss.
    assert.ok(!passes("Chandratal Palace", "Rahul Kumar Sharma"));
  });

  it("BLOCKS a near-miss spelling", () => {
    // "Oberio" vs "Oberoi" — a typo or a lookalike, and either needs a human.
    assert.ok(!passes("Oberoi Group", "Oberio Group"));
  });

  it("scores an empty or missing name as zero rather than matching", () => {
    // A bank that returns no name must never clear the gate by default.
    assert.equal(nameMatchScore("Taj Hotels", ""), 0);
    assert.equal(nameMatchScore("", "Taj Hotels"), 0);
    assert.equal(nameMatchScore(null, undefined), 0);
  });

  it("does not match on company suffixes alone", () => {
    // Both reduce to no meaningful tokens; matching here would clear every
    // pair of limited companies in the country.
    assert.ok(!passes("Private Limited", "Pvt Ltd"));
  });
});
