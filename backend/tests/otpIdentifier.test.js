/**
 * Tests for identifier normalization across both login channels.
 *
 * Why this is the piece worth pinning: the normalized identifier IS the account
 * key. If "Rohan@Gmail.com " and "rohan@gmail.com" do not reduce to the same
 * string, one person silently ends up with two accounts and a split coin
 * balance — the exact failure normalizePhone was written to prevent on the
 * phone side, now with a second channel to get wrong.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.BREVO_API_KEY ||= "test-key";
process.env.EMAIL_FROM ||= "test@example.com";

let normalizePhone, normalizeIdentifier, normalizeEmail;

before(async () => {
  ({ normalizePhone, normalizeIdentifier } = await import("../src/services/otp.service.js"));
  ({ normalizeEmail } = await import("../src/services/email.service.js"));
});

describe("normalizeEmail", () => {
  it("lowercases, so case cannot fork an account", () => {
    assert.equal(normalizeEmail("Rohan@Gmail.COM"), "rohan@gmail.com");
  });

  it("trims surrounding whitespace from a paste or autofill", () => {
    assert.equal(normalizeEmail("  rohan@gmail.com  "), "rohan@gmail.com");
  });

  it("is idempotent — normalizing twice changes nothing", () => {
    const once = normalizeEmail(" Rohan@Gmail.com ");
    assert.equal(normalizeEmail(once), once);
  });
});

describe("normalizeIdentifier", () => {
  it("routes the email channel through email rules", () => {
    assert.equal(normalizeIdentifier(" Rohan@Gmail.com ", "email"), "rohan@gmail.com");
  });

  it("routes the phone channel through phone rules", () => {
    assert.equal(normalizeIdentifier("+91 98765 43210", "phone"), "9876543210");
  });

  it("does not strip an email down to digits", () => {
    // The bug this guards: running an address through the phone normalizer
    // yields "" or a nonsense number, and every guest collides on it.
    assert.notEqual(normalizeIdentifier("rohan99@gmail.com", "email"), "");
    assert.match(normalizeIdentifier("rohan99@gmail.com", "email"), /@/);
  });
});

describe("normalizePhone stays intact for the phone channel", () => {
  const spellings = ["9876543210", "+91 98765 43210", "09876543210", "91-98765-43210"];

  for (const input of spellings) {
    it(`"${input}" reduces to 9876543210`, () => {
      assert.equal(normalizePhone(input), "9876543210");
    });
  }
});
