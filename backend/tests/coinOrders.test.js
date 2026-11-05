/**
 * Hotels order coins instead of buying them.
 *
 * "Order coins" in the hotel panel hands the order to the Billionax team over
 * WhatsApp, a call or email — contacts the main admin keeps in Platform rules
 * — and the main admin credits the coins with Sell coins. These pin the parts
 * that would fail quietly:
 *
 *  - The self-serve buy endpoint stays gone. It credited coins on a simulated
 *    payment, so leaving it routed would let any hotel admin mint coins.
 *
 *  - Contact numbers normalise to the digits wa.me and tel: take, and a
 *    number the settings form shows back re-saves to the SAME digits — or
 *    every save of Platform rules would quietly rewrite it.
 *
 *  - A blank channel clears to null, which is what hides it from hotels.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { settingsRules, toIntlDigits } from "../src/validators/common.validator.js";
import { PlatformSettings } from "../src/models/platformSettings.model.js";
import { formatIntlPhone } from "../../frontend/src/utils/format.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const runSettings = async (body) => {
  const req = { body: structuredClone(body) };
  const errors = [];
  for (const rule of settingsRules) errors.push(...(await rule.run(req)).array());
  return { errors: errors.map((e) => `${e.path}: ${e.msg}`), body: req.body };
};

describe("contact numbers for coin orders", () => {
  it("reads 10-digit and trunk-0 numbers as Indian", () => {
    assert.equal(toIntlDigits("9876543210"), "919876543210");
    assert.equal(toIntlDigits("098765 43210"), "919876543210");
    assert.equal(toIntlDigits("022 4000 1234"), "912240001234");
  });

  it("keeps the country code of a number typed with + or 00", () => {
    assert.equal(toIntlDigits("+91 98765 43210"), "919876543210");
    assert.equal(toIntlDigits("+44 20 7946 0958"), "442079460958");
    assert.equal(toIntlDigits("0044 20 7946 0958"), "442079460958");
    assert.equal(toIntlDigits("91 98765 43210"), "919876543210");
  });

  it("turns blank into null", () => {
    for (const blank of ["", "   ", null, undefined]) assert.equal(toIntlDigits(blank), null);
  });

  it("re-saves what the settings form shows back to the same digits", () => {
    for (const stored of ["919876543210", "912240001234", "442079460958", "14155550123"]) {
      const shown = formatIntlPhone(stored);
      assert.equal(toIntlDigits(shown), stored, `${stored} shown as "${shown}" drifted on save`);
    }
    assert.equal(formatIntlPhone("919876543210"), "+91 98765 43210");
    assert.equal(formatIntlPhone("912240001234"), "+91 2240001234");
    assert.equal(formatIntlPhone(null), "");
  });
});

describe("coin-order contacts in Platform rules", () => {
  it("defaults to no channels, which hotels see as 'not set up yet'", () => {
    const { whatsapp, phone, email } = new PlatformSettings({}).coinOrderContact;
    assert.deepEqual([whatsapp, phone, email], [null, null, null]);
  });

  it("normalises all three", async () => {
    const { errors, body } = await runSettings({
      coinOrderContact: { whatsapp: "+91 98765 43210", phone: "022 4000 1234", email: " Coins@Billionax.com " },
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(body.coinOrderContact, {
      whatsapp: "919876543210",
      phone: "912240001234",
      email: "coins@billionax.com",
    });
  });

  it("clears a blank channel to null", async () => {
    const { errors, body } = await runSettings({
      coinOrderContact: { whatsapp: "", phone: null, email: "  " },
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(body.coinOrderContact, { whatsapp: null, phone: null, email: null });
  });

  it("refuses a short number or a bad address, on the field itself", async () => {
    const { errors } = await runSettings({
      coinOrderContact: { whatsapp: "12345", phone: "+0 1234 5678", email: "coins@billionax" },
    });
    assert.deepEqual(errors, [
      "coinOrderContact.whatsapp: Enter the number with its country code, like +91 98765 43210",
      "coinOrderContact.phone: Enter the number with its country code, like +91 98765 43210",
      "coinOrderContact.email: Enter an email address",
    ]);
  });

  it("refuses anything but an object", async () => {
    const { errors } = await runSettings({ coinOrderContact: "919876543210" });
    assert.ok(errors.includes("coinOrderContact: Invalid order contact"), errors.join("; "));
  });
});

describe("hotels can no longer buy coins themselves", () => {
  it("has no buy route, controller or simulated purchase", () => {
    assert.doesNotMatch(strip(read("../src/routes/hotel.routes.js")), /coins\/buy|buyCoins/);
    assert.doesNotMatch(strip(read("../src/controllers/hotel.controller.js")), /buyCoins|purchaseCoinPack/);
    assert.doesNotMatch(strip(read("../src/services/coin.service.js")), /purchaseCoinPack|SIM-/);
  });

  it("keeps the main admin's Sell coins as the way coins are credited", () => {
    assert.match(read("../src/routes/admin.routes.js"), /adminController\.sellCoins/);
  });

  it("serves the order contacts with the price list", () => {
    const controller = read("../src/controllers/hotel.controller.js");
    const listPacks = controller.slice(controller.indexOf("export const listPacks"));
    assert.match(listPacks.slice(0, 600), /coinOrderContact/);
    assert.match(listPacks.slice(0, 600), /orderContact: \{/);
  });

  it("offers WhatsApp, Call and Email on the hotel's Coins page, with no buy call", () => {
    const page = strip(read("../../frontend/src/pages/hotel/CoinsPage.jsx"));
    assert.doesNotMatch(page, /buyCoins|Demo mode|Pay \$\{/);
    assert.match(page, /https:\/\/wa\.me\//);
    assert.match(page, /`tel:\+/);
    assert.match(page, /`mailto:/);
    assert.match(page, /socket\.on\("hotel:inventory"/, "the page no longer sees ordered coins land");
  });

  it("sends all three channels from the settings form, so none is dropped", () => {
    const form = strip(read("../../frontend/src/pages/admin/AdminSettingsPage.jsx"));
    assert.match(form, /coinOrderContact: \{\s*whatsapp:[^}]*phone:[^}]*email:[^}]*\}/s);
  });
});
