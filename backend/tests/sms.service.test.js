/**
 * Tests for the local -> international phone conversion.
 *
 * Why this is the piece worth pinning: guests are stored as bare 10-digit
 * numbers so that "+91 98765 43210", "09876543210" and "9876543210" all resolve
 * to ONE account (normalizePhone). Every SMS gateway, smsmode included, wants
 * the full international form. That conversion happens in exactly one place,
 * and getting it wrong does not throw — it silently texts the wrong person, or
 * nobody at all.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.SMSMODE_API_KEY ||= "test-key";
process.env.OTP_COUNTRY_CODE ||= "91";

let toInternational, smsEnabled, normalizePhone;

before(async () => {
  ({ toInternational, smsEnabled } = await import("../src/services/sms.service.js"));
  ({ normalizePhone } = await import("../src/services/otp.service.js"));
});

describe("toInternational", () => {
  it("prepends the country code to a bare 10-digit number", () => {
    assert.equal(toInternational("9876543210"), "919876543210");
  });

  it("strips separators and the leading +", () => {
    assert.equal(toInternational("+91 98765 43210"), "919876543210");
  });

  it("leaves an already-international number alone", () => {
    // Not 91 + 919876543210 — that would be an unroutable 14-digit number.
    assert.equal(toInternational("919876543210"), "919876543210");
  });

  it("does not force 91 onto a foreign number", () => {
    assert.equal(toInternational("447911123456"), "447911123456");
  });

  it("honours a different country code", () => {
    assert.equal(toInternational("7911123456", "44"), "447911123456");
  });

  it("returns empty for input with no digits", () => {
    assert.equal(toInternational("not a phone"), "");
  });
});

describe("normalizePhone -> toInternational round trip", () => {
  /**
   * The real path: whatever the guest types is normalized for storage, then
   * expanded again at send time. Every input spelling of one number must reach
   * the same handset.
   */
  const spellings = ["9876543210", "+91 98765 43210", "09876543210", "91-98765-43210"];

  for (const input of spellings) {
    it(`"${input}" reaches 919876543210`, () => {
      assert.equal(toInternational(normalizePhone(input)), "919876543210");
    });
  }
});

describe("smsEnabled", () => {
  it("is true once an API key is present", () => {
    assert.equal(smsEnabled(), true);
  });
});
