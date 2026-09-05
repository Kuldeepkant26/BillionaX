/**
 * The font setting is a contract between two codebases: the API stores a key,
 * the frontend paints it. Same drift risks as the theme and the card design —
 * a renamed key, or a preset one side ships that the other does not know.
 *
 * The frontend registry is parsed as text rather than imported, for the same
 * reason as in cardDesign.test.js: importing across packages would need a
 * build step, and reading the keys catches the drift that matters.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  FONT_PRESETS,
  FONT_PRESET_VALUES,
  DEFAULT_FONT_PRESET,
} from "../src/config/constants.js";

const here = dirname(fileURLToPath(import.meta.url));
const registry = readFileSync(
  join(here, "../../frontend/src/theme/fontPresets.js"),
  "utf8"
);

describe("font preset constants", () => {
  it("ships the approved pairings", () => {
    assert.equal(FONT_PRESET_VALUES.length, 7);
  });

  it("defaults to the pairing the app shipped with", () => {
    assert.equal(DEFAULT_FONT_PRESET, "EDITORIAL");
    assert.ok(FONT_PRESET_VALUES.includes(DEFAULT_FONT_PRESET));
  });

  it("keys and values match, so a lookup by either works", () => {
    for (const [key, value] of Object.entries(FONT_PRESETS)) assert.equal(key, value);
  });

  it("is frozen — a stray write would restyle every surface", () => {
    assert.ok(Object.isFrozen(FONT_PRESETS));
  });
});

describe("API and frontend agree on the preset keys", () => {
  // Keys of the exported FONT_PRESETS object literal: `  EDITORIAL: {`
  const frontendKeys = [...registry.matchAll(/^ {2}([A-Z_]+): \{$/gm)].map((m) => m[1]);

  it("finds the frontend registry", () => {
    assert.ok(frontendKeys.length > 0, "registry keys did not parse — did the file move?");
  });

  it("every pairing the app paints is one the API will accept", () => {
    for (const key of frontendKeys) {
      assert.ok(FONT_PRESET_VALUES.includes(key), `frontend ships ${key}, API rejects it`);
    }
  });

  it("every pairing the API accepts is one the app can paint", () => {
    for (const key of FONT_PRESET_VALUES) {
      assert.ok(frontendKeys.includes(key), `API accepts ${key}, frontend cannot paint it`);
    }
  });

  it("the frontend default matches the API default", () => {
    const match = registry.match(/export const DEFAULT_FONT = "([A-Z_]+)"/);
    assert.ok(match, "frontend DEFAULT_FONT not found");
    assert.equal(match[1], DEFAULT_FONT_PRESET);
  });
});

/*
 * The stacks are applied by styles/fonts.css, keyed on [data-font]. A preset
 * with no block there would silently keep whatever pairing the theme declares
 * — the admin's choice would appear to save and do nothing.
 */
describe("every preset has a stylesheet block", () => {
  const css = readFileSync(
    join(here, "../../frontend/src/styles/fonts.css"),
    "utf8"
  );
  const blocks = new Set([...css.matchAll(/\[data-font="([A-Z_]+)"\]/g)].map((m) => m[1]));

  it("paints every preset the API accepts", () => {
    for (const key of FONT_PRESET_VALUES) {
      assert.ok(blocks.has(key), `${key} has no [data-font] block in fonts.css`);
    }
  });

  it("has no block for a preset that no longer exists", () => {
    for (const key of blocks) {
      assert.ok(FONT_PRESET_VALUES.includes(key), `fonts.css styles ${key}, which is not a preset`);
    }
  });
});

/*
 * The pre-paint script in index.html cannot import the registry — any module
 * import is deferred past first paint. So it carries a HARDCODED copy of the
 * keys, and a preset missing from it silently falls back to the default for
 * one frame on every cold load.
 */
describe("the pre-paint allowlist covers every preset", () => {
  const html = readFileSync(join(here, "../../frontend/index.html"), "utf8");
  const block = html.match(/var fonts = \[([\s\S]*?)\];/);

  it("finds the allowlist", () => {
    assert.ok(block, "fonts allowlist not found — did the script change shape?");
  });

  it("lists exactly the presets the API accepts", () => {
    const listed = [...block[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...listed].sort(), [...FONT_PRESET_VALUES].sort());
  });
});

/*
 * index.html loads the faces with a hardcoded <link> — it must cover every
 * family the registry names, or a preset renders in its fallback stack and the
 * admin's picker previews it wrongly. The registry builds the same URL in
 * FONT_STYLESHEET_HREF; this asserts the two have not drifted.
 */
describe("index.html loads every family the registry names", () => {
  const html = readFileSync(join(here, "../../frontend/index.html"), "utf8");

  it("requests each family", () => {
    const families = [...registry.matchAll(/"([A-Za-z+]+):(?:opsz,)?wght@[^"]+"/g)].map(
      (m) => m[1]
    );
    assert.ok(families.length > 0, "no families parsed from the registry");

    for (const family of new Set(families)) {
      assert.ok(
        html.includes(`family=${family}:`),
        `${family} is in the registry but not requested by index.html`
      );
    }
  });
});

describe("settings model", () => {
  it("enumerates fontPreset, so a bad key cannot be persisted", async () => {
    const { PlatformSettings } = await import("../src/models/platformSettings.model.js");
    const path = PlatformSettings.schema.path("fontPreset");

    assert.ok(path, "fontPreset missing from the schema");
    assert.equal(path.options.default, DEFAULT_FONT_PRESET);
    assert.deepEqual([...path.options.enum].sort(), [...FONT_PRESET_VALUES].sort());
  });

  it("rejects an unknown preset at validation time", async () => {
    const { PlatformSettings } = await import("../src/models/platformSettings.model.js");
    const doc = new PlatformSettings({ fontPreset: "NOT_A_FONT" });

    const err = doc.validateSync();
    assert.ok(err?.errors?.fontPreset, "an unknown preset was accepted");
  });
});
