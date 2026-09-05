/**
 * The bill-history filter bar.
 *
 * Two things are pinned here, both of which fail quietly rather than throwing:
 *
 *  - The date-range logic. The preset dropdown OWNS from/to, so the two can
 *    never disagree — except for "custom", which must leave the range already
 *    in force alone. Getting that backwards throws the dates away at the exact
 *    moment someone chose to edit them.
 *
 *  - The bar stays ONE line. The shared .input class is width:100% with form
 *    padding; used on a toolbar it makes every control claim the full width
 *    and the bar wraps onto three ragged rows. That is a layout regression a
 *    build never catches, so the structure is asserted from the source.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(join(here, "../src/features/panel/BillHistory.jsx"), "utf8");
const css = readFileSync(join(here, "../src/features/panel/BillHistory.module.css"), "utf8");

/** Mirrors the component's range handling. Kept honest by the source checks. */
const NOW = new Date("2026-09-05T12:00:00Z");

const rangeToDates = (key) => {
  if (!key) return { from: "", to: "" };
  const iso = (d) => d.toISOString().slice(0, 10);
  if (key === "today") return { from: iso(NOW), to: iso(NOW) };
  const days = key === "7d" ? 7 : 30;
  return { from: iso(new Date(NOW.getTime() - days * 864e5)), to: iso(NOW) };
};

const makeBar = () => {
  const state = { range: "", q: "", page: 3, filters: { status: "", outlet: "", from: "", to: "" } };

  const setFilter = (name, value) => {
    state.page = 1;
    state.filters = { ...state.filters, [name]: value };
  };

  return {
    state,
    setRangePreset(key) {
      state.range = key;
      if (key === "custom") return;
      const { from, to } = rangeToDates(key);
      setFilter("from", from);
      setFilter("to", to);
    },
    setFilter,
    clearAll() {
      state.range = "";
      state.q = "";
      state.page = 1;
      state.filters = { status: "", outlet: "", from: "", to: "" };
    },
  };
};

let bar;
beforeEach(() => { bar = makeBar(); });

describe("date range presets", () => {
  it("sets both ends from one choice", () => {
    bar.setRangePreset("today");
    assert.equal(bar.state.filters.from, "2026-09-05");
    assert.equal(bar.state.filters.to, "2026-09-05");
  });

  it("spans the right number of days", () => {
    bar.setRangePreset("7d");
    assert.equal(bar.state.filters.from, "2026-08-29");
    assert.equal(bar.state.filters.to, "2026-09-05");
  });

  it("returns to page 1, so a narrowed range cannot land on an empty page", () => {
    bar.setRangePreset("30d");
    assert.equal(bar.state.page, 1);
  });

  it("clears both ends on Any time", () => {
    bar.setRangePreset("7d");
    bar.setRangePreset("");
    assert.equal(bar.state.filters.from, "");
    assert.equal(bar.state.filters.to, "");
  });
});

describe("custom range", () => {
  it("keeps the dates already in force", () => {
    // The bug: treating "custom" as another preset wipes from/to at the exact
    // moment the user asked to edit them.
    bar.setRangePreset("7d");
    const before = { ...bar.state.filters };

    bar.setRangePreset("custom");

    assert.equal(bar.state.filters.from, before.from);
    assert.equal(bar.state.filters.to, before.to);
  });

  it("stays selected so the inputs remain visible while editing", () => {
    bar.setRangePreset("custom");
    bar.setFilter("from", "2026-08-01");

    assert.equal(bar.state.range, "custom");
    assert.equal(bar.state.filters.from, "2026-08-01");
  });

  it("still has the early return in the SOURCE, not just in this model", () => {
    // The model above proves the behaviour is right; this proves the component
    // implements it. Without this, deleting the guard from BillHistory.jsx
    // leaves every test above green while the bug is back.
    const fn = jsx.slice(
      jsx.indexOf("const setRangePreset"),
      jsx.indexOf("const clearAll")
    );
    assert.match(
      fn,
      /if \(key === "custom"\) return;/,
      "choosing Custom now clears the range being edited"
    );
  });
});

describe("clear", () => {
  it("resets the dropdown, the dates and the search together", () => {
    bar.setRangePreset("7d");
    bar.setFilter("status", "PAID");
    bar.state.q = "raj";

    bar.clearAll();

    assert.equal(bar.state.range, "");
    assert.equal(bar.state.q, "");
    assert.deepEqual(bar.state.filters, { status: "", outlet: "", from: "", to: "" });
  });
});

describe("the bar stays one compact line", () => {
  const barJsx = jsx.slice(
    jsx.indexOf("<div className={styles.filters}>"),
    jsx.indexOf("{/* Only when Custom")
  );

  it("carries exactly four controls", () => {
    const labels = [...barJsx.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(labels.length, 4, `expected search + 3 selects, got ${labels.join(", ")}`);
    for (const label of ["Date range", "Status", "Outlet"]) {
      assert.ok(labels.some((l) => l.includes(label)), `missing the ${label} control`);
    }
  });

  it("keeps native date pickers off the main bar", () => {
    // Two of them took more width than everything else combined.
    assert.equal((barJsx.match(/type="date"/g) || []).length, 0);
  });

  it("puts exactly two date inputs behind Custom", () => {
    const custom = jsx.slice(jsx.indexOf('range === "custom"'));
    assert.equal((custom.match(/type="date"/g) || []).length, 2);
  });

  it("does not use the full-width form components on the bar", () => {
    // <Input> and <Select> render the shared .input class — width:100%.
    assert.ok(!/<Input\b|<Select\b/.test(barJsx), "a form-sized control is back on the bar");
  });

  it("lays the bar out as a flex row whose controls do not stretch", () => {
    assert.match(css, /\.filters \{[^}]*display: flex/s);
    assert.match(css, /\.control \{[^}]*width: auto/s);
    assert.match(css, /\.searchWrap \{[^}]*flex: 1/s, "search should take the slack");
  });

  it("has a deliberate small-screen layout rather than a ragged wrap", () => {
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});
