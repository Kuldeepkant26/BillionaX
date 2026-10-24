/**
 * The top of the guest home screen: the tier label over the card, and the one
 * row of tiles under it.
 *
 * Pinned from the source, the way billFilters.test.js pins its toolbar,
 * because these are layout facts a build never checks:
 *
 *  - the row is FOUR tiles — Pay, History, Earned, Redeemed. It used to be two
 *    rows of seven, and a fifth tile squeezed back in would wrap the grid;
 *  - the grid's columns are minmax(0, 1fr). A bare 1fr lets a long figure
 *    widen its own column and squash the other three;
 *  - the figures switch to a short form at a lakh, with the exact number kept
 *    for a screen reader.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { formatCoins, formatCoinsCompact, tierLabel, tierName } from "../src/utils/format.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../src", path), "utf8");

const jsx = read("pages/guest/GuestHomePage.jsx");
const css = read("pages/guest/GuestHomePage.module.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** Everything inside the quick-actions row, comments stripped. */
const row = (() => {
  const start = jsx.indexOf("<div className={styles.actions}>");
  const end = jsx.indexOf("<HotelShowcase", start);
  assert.ok(start > -1 && end > start, "could not find the actions row");
  return jsx.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
})();

describe("tierName", () => {
  it("turns the stored tier into a word", () => {
    assert.equal(tierName("SILVER"), "Silver");
    assert.equal(tierName("GOLD"), "Gold");
    assert.equal(tierName("PLATINUM"), "Platinum");
    assert.equal(tierName("gold"), "Gold");
  });

  it("is empty rather than 'Undefined' for no tier", () => {
    assert.equal(tierName(undefined), "");
    assert.equal(tierName(null), "");
    assert.equal(tierName(""), "");
  });

  it("leaves tierLabel saying what it always said", () => {
    assert.equal(tierLabel(["GOLD", "PLATINUM"]), "Gold & Platinum");
    assert.equal(tierLabel(["SILVER", "GOLD", "PLATINUM"]), "Silver, Gold & Platinum");
    assert.equal(tierLabel(["PLATINUM"]), "Platinum only");
    assert.equal(tierLabel([]), null);
    assert.equal(tierLabel(undefined), null);
  });
});

describe("the tier label over the card", () => {
  it("names the card by the active membership's tier", () => {
    assert.match(jsx, /Your <span[^>]*>\{tierName\(active\.tier\)\}<\/span> card/);
  });

  it("comes before the card, and only once the tier is known", () => {
    const label = jsx.indexOf("tierName(active.tier)");
    const card = jsx.indexOf("<CardCarousel");
    assert.ok(label > -1 && label < card, "the label is not above the card");
    assert.match(jsx, /\{active\?\.tier && \(\s*<span className="kicker/);
  });
});

describe("the row under the card", () => {
  it("is Pay, History, Earned and Redeemed, in that order", () => {
    const captions = [...row.matchAll(/<b>(\w+)<\/b>|<CoinStat label="(\w+)"/g)].map((m) => m[1] || m[2]);
    assert.deepEqual(captions, ["Pay", "History", "Earned", "Redeemed"]);
  });

  it("no longer carries Offers, You or the max discount", () => {
    assert.doesNotMatch(row, /Offers|APP_OFFERS/);
    assert.doesNotMatch(row, /<b>You<\/b>|APP_PROFILE/);
    assert.doesNotMatch(jsx, /Max discount/);
  });

  it("still feeds the cap to the explainer that quotes it", () => {
    // Only the TILE went. HowItWorks still says "benefits worth up to 30%" —
    // and, since the Member Privileges redesign, names the guest's tier too.
    const tag = /<HowItWorks\b[^>]*\/>/.exec(jsx)?.[0] || "";
    assert.match(tag, /rate=\{earnRate\}/);
    assert.match(tag, /cap=\{cap\}/);
    assert.match(tag, /tier=\{active\?\.tier\}/);
  });

  it("colours the Pay and History icons alike", () => {
    // History used to keep the neutral chip while Pay wore the accent, which
    // read as History being disabled.
    const accented = row.match(/\$\{styles\.actionIcon\} \$\{styles\.actionAccent\}/g) || [];
    assert.equal(accented.length, 2);
    assert.doesNotMatch(row, /className=\{styles\.actionIcon\}/);
    assert.match(css, /\.actionAccent\s*\{[^}]*background:\s*var\(--acc\)/);
  });

  it("lays four columns that a long figure cannot widen", () => {
    const actions = /\.actions\s*\{([^}]*)\}/.exec(css)?.[1] || "";
    assert.match(actions, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("gives both kinds of tile one shared box", () => {
    // Declared together, so an action and a figure cannot drift apart.
    assert.match(css, /\.action,\s*\.stat\s*\{[^}]*padding:[^}]*border:[^}]*\}/);
  });
});

describe("a lifetime figure", () => {
  it("switches to the short form at a lakh", () => {
    assert.match(jsx, /const COMPACT_FROM = 100_000;/);
    // The last figure shown in full and the first shown short.
    assert.equal(formatCoins(99999), "99,999");
    assert.equal(formatCoinsCompact(100000), "1.0L");
    assert.equal(formatCoinsCompact(123456), "1.2L");
  });

  it("keeps the exact number for a screen reader when it does", () => {
    assert.match(jsx, /\{compact && <span className="sr-only">\{full\}<\/span>\}/);
    assert.match(jsx, /aria-hidden=\{compact \|\| undefined\}/);
  });
});
