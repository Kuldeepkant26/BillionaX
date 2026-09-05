/**
 * Tests for identity masking on the staff bill screen.
 *
 * The failure these guard against is a mask that does not mask: an address
 * short enough that hiding "the middle" hides nothing, or an input shape the
 * parser does not recognise being passed through untouched. Both look fine in a
 * screenshot and leak the address in production.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let maskEmail, maskPhone;

before(async () => {
  ({ maskEmail, maskPhone } = await import("../src/utils/mask.util.js"));
});

describe("maskEmail", () => {
  it("keeps a recognisable head, tail and domain", () => {
    const masked = maskEmail("kuldeepkant26@gmail.com");
    assert.ok(masked.startsWith("kul"));
    assert.ok(masked.endsWith("26@gmail.com"));
    assert.ok(!masked.includes("kuldeepkant"));
  });

  it("hides the middle of the local part", () => {
    const masked = maskEmail("picasuplayers@gmail.com");
    assert.ok(!masked.includes("asuplaye"));
    assert.ok(masked.includes("•"));
  });

  it("masks a short local part entirely", () => {
    // "ab@x.com" with one character hidden would not be masked at all.
    const masked = maskEmail("ab@x.com");
    assert.equal(masked, "•••@x.com");
    assert.ok(!masked.includes("ab"));
  });

  it("masks a five-character local part entirely", () => {
    const masked = maskEmail("priya@taj.in");
    assert.ok(!masked.includes("priya"));
    assert.ok(masked.endsWith("@taj.in"));
  });

  it("masks an unrecognised value rather than returning it unchanged", () => {
    // Passing it through is the one outcome that defeats the whole function.
    assert.equal(maskEmail("notanemail"), "••••••••");
    assert.equal(maskEmail("@nolocal.com"), "••••••••");
  });

  it("uses the LAST @, so a local part containing one cannot smuggle a domain", () => {
    const masked = maskEmail("we@ird@gmail.com");
    assert.ok(masked.endsWith("@gmail.com"));
  });

  it("returns null for an absent address", () => {
    assert.equal(maskEmail(null), null);
    assert.equal(maskEmail(""), null);
  });
});

describe("maskPhone", () => {
  it("matches the frontend's shape so a number reads the same either side", () => {
    assert.equal(maskPhone("9876543210"), "98••••210");
  });

  it("leaves a very short value alone", () => {
    assert.equal(maskPhone("123"), "123");
  });

  it("returns null for an absent number", () => {
    assert.equal(maskPhone(null), null);
  });
});
