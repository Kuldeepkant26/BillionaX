/**
 * The redesigned privilege cards on the guest home screen.
 *
 * Two kinds of failure are pinned here, and neither throws:
 *
 *  - A misread privilege. The category decides the card's icon, chip label
 *    and whether it is set dark or cream, all from words a hotel typed. A
 *    wrong match is a spa lotus on a breakfast — so the tie-breaks, the
 *    whole-word rule and the fallback are asserted case by case.
 *
 *  - A class that does not exist. `styles.chipLable` is `undefined` in a CSS
 *    module, which renders as no class at all: no error, no warning, just an
 *    unstyled element. Every class the three components look up is checked
 *    against the stylesheet it comes from, and every icon a category names is
 *    checked against the glyphs that exist.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  PRIVILEGE_CATEGORIES,
  privilegeCategory,
  privilegeCategoryKey,
  privilegeEyebrow,
} from "../src/features/guest/privilegeCategory.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../src/features/guest", path), "utf8");

const key = (title, extra = {}) => privilegeCategoryKey({ title, ...extra });

describe("privilege category", () => {
  it("reads every seeded default the way the client's reference sets it", () => {
    // backend/src/config/defaultContent.js — what every new hotel starts with.
    assert.equal(key("Breakfast", { outlet: "Restaurant" }), "BREAKFAST");
    assert.equal(key("Happy hour", { outlet: "Bar" }), "DINING");
    assert.equal(key("Spa", { outlet: "Spa" }), "WELLNESS");
    assert.equal(key("Late checkout", { outlet: "Rooms" }), "STAY");

    // The reference: bar and room after dark, spa and breakfast in daylight.
    assert.equal(privilegeCategory({ title: "Happy hour" }).tone, "dark");
    assert.equal(privilegeCategory({ title: "Late checkout" }).tone, "dark");
    assert.equal(privilegeCategory({ title: "Spa" }).tone, "light");
    assert.equal(privilegeCategory({ title: "Breakfast" }).tone, "light");
  });

  it("breaks ties by rule order, so the more specific perk wins", () => {
    assert.equal(key("Breakfast at the restaurant"), "BREAKFAST");
    assert.equal(key("Breakfast in bed"), "BREAKFAST");
    assert.equal(key("Pool bar"), "DINING");
    assert.equal(key("Room service"), "DINING");
    assert.equal(key("Steam room"), "WELLNESS");
    assert.equal(key("Spa suite upgrade"), "WELLNESS");
    assert.equal(key("Room upgrade"), "STAY");
  });

  it("matches whole words only", () => {
    assert.equal(key("Barber"), "PERK");
    assert.equal(key("Space to work"), "PERK");
    assert.equal(key("Team building"), "PERK");
    // "minibar" is a room perk in its own right, not the bar.
    assert.equal(key("Complimentary minibar"), "STAY");
  });

  it("folds case, accents and hyphenation", () => {
    assert.equal(key("CAFÉ ACCESS"), "BREAKFAST");
    assert.equal(key("Early check-in"), "STAY");
    assert.equal(key("Late check out"), "STAY");
    assert.equal(key("Airport pick-up"), "TRAVEL");
    assert.equal(key("Chauffeur drop-off"), "TRAVEL");
  });

  it("leaves out the words that would put the wrong icon on a perk", () => {
    // "night", "lounge" and "treatment" are each three different perks.
    assert.equal(key("Ladies' night"), "PERK");
    assert.equal(key("Club lounge access"), "PERK");
    assert.equal(key("VIP treatment"), "PERK");
  });

  it("reads the title first, then the outlet, then the description", () => {
    // The description mentions the stay; the title is still breakfast.
    assert.equal(
      key("Breakfast", { description: "Buffet breakfast for two, every morning of your stay." }),
      "BREAKFAST"
    );
    assert.equal(key("Members' hour", { outlet: "Bar" }), "DINING");
    assert.equal(
      key("Ladies' night", { description: "Two cocktails on the house, Thursdays." }),
      "DINING"
    );
  });

  it("falls back to the neutral PERK for anything it cannot read", () => {
    assert.equal(privilegeCategoryKey({}), "PERK");
    assert.equal(privilegeCategoryKey(null), "PERK");
    assert.equal(privilegeCategoryKey(undefined), "PERK");
    assert.equal(key("निःशुल्क नाश्ता"), "PERK");
    // Unrecognised perks are set dark: a dark ground flatters any photo.
    assert.equal(privilegeCategory({ title: "Kids club" }).tone, "dark");
  });
});

describe("privilege eyebrow", () => {
  it("is the hotel's own value label whenever there is one", () => {
    assert.equal(privilegeEyebrow({ title: "Spa", valueLabel: "20% off" }), "20% off");
    assert.equal(privilegeEyebrow({ title: "Spa", valueLabel: "  Till 8pm  " }), "Till 8pm");
  });

  it("falls back to the category's eyebrow when the label is missing or blank", () => {
    assert.equal(privilegeEyebrow({ title: "Spa" }), "Wellness & spa");
    assert.equal(privilegeEyebrow({ title: "Spa", valueLabel: "   " }), "Wellness & spa");
    assert.equal(privilegeEyebrow({ title: "Spa", valueLabel: null }), "Wellness & spa");
    assert.equal(privilegeEyebrow({ title: "Kids club" }), "Member exclusive");
  });
});

describe("privilege card wiring", () => {
  const glyphs = new Set(
    [...read("PrivilegeIcon.jsx").matchAll(/^\s{2}(\w+): \(/gm)].map((m) => m[1])
  );

  it("draws a glyph for every icon a category names", () => {
    assert.ok(glyphs.size >= 6, `found only ${[...glyphs].join(", ")}`);
    for (const [name, category] of Object.entries(PRIVILEGE_CATEGORIES)) {
      assert.ok(glyphs.has(category.icon), `${name} names a missing icon "${category.icon}"`);
      assert.ok(["dark", "light"].includes(category.tone), `${name} has tone "${category.tone}"`);
      assert.ok(category.chip && category.eyebrow, `${name} is missing chip or eyebrow copy`);
      // Rendered unconditionally and swapped in by a container query, so a
      // missing one is an empty chip on every 360px phone.
      assert.ok(category.short, `${name} is missing its short chip label`);
    }
  });

  /** Every `.name` used as a class selector in a stylesheet. */
  const classesIn = (css) =>
    new Set([...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));

  /** Every `<binding>.name` the component reads off an imported module. */
  const lookups = (jsx, binding) =>
    [...jsx.matchAll(new RegExp(`\\b${binding}\\.([A-Za-z_]\\w*)`, "g"))].map((m) => m[1]);

  const cardCss = classesIn(read("PrivilegeCards.module.css"));
  const sheetCss = classesIn(read("PrivilegeSheet.module.css"));

  it("looks up only classes the card stylesheet defines", () => {
    const used = lookups(read("PrivilegeCards.jsx"), "styles");
    assert.ok(used.length > 10);
    for (const name of used) assert.ok(cardCss.has(name), `PrivilegeCards uses missing .${name}`);
  });

  it("looks up only classes the sheet's two stylesheets define", () => {
    const jsx = read("PrivilegeSheet.jsx");
    for (const name of lookups(jsx, "styles")) {
      assert.ok(sheetCss.has(name), `PrivilegeSheet uses missing .${name}`);
    }
    for (const name of lookups(jsx, "card")) {
      assert.ok(cardCss.has(name), `PrivilegeSheet uses missing card .${name}`);
    }
  });
});
