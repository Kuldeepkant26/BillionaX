/**
 * The theme setting is a contract between two codebases: the API stores a
 * key, the frontend paints it. Same drift risks as the card design — a
 * renamed key, or a preset one side ships that the other does not know.
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
  THEME_PRESETS,
  THEME_PRESET_VALUES,
  DEFAULT_THEME_PRESET,
} from "../src/config/constants.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("theme preset constants", () => {
  it("ships the approved presets", () => {
    assert.equal(THEME_PRESET_VALUES.length, 27);
  });

  it("defaults to coral", () => {
    assert.equal(DEFAULT_THEME_PRESET, "CORAL");
    assert.ok(THEME_PRESET_VALUES.includes(DEFAULT_THEME_PRESET));
  });

  it("keys and values match, so a lookup by either works", () => {
    for (const [key, value] of Object.entries(THEME_PRESETS)) assert.equal(key, value);
  });

  it("is frozen — a stray write would recolour every dashboard", () => {
    assert.ok(Object.isFrozen(THEME_PRESETS));
  });
});

describe("API and frontend agree on the preset keys", () => {
  const registry = readFileSync(
    join(here, "../../frontend/src/theme/accentPresets.js"),
    "utf8"
  );

  // Keys of the exported ACCENT_PRESETS object literal: `  CORAL: {`
  const frontendKeys = [...registry.matchAll(/^ {2}([A-Z_]+): \{$/gm)].map((m) => m[1]);

  it("finds the frontend registry", () => {
    assert.ok(frontendKeys.length > 0, "registry keys did not parse — did the file move?");
  });

  it("every preset the app paints is one the API will accept", () => {
    for (const key of frontendKeys) {
      assert.ok(THEME_PRESET_VALUES.includes(key), `frontend ships ${key}, API rejects it`);
    }
  });

  it("every preset the API accepts is one the app can paint", () => {
    for (const key of THEME_PRESET_VALUES) {
      assert.ok(frontendKeys.includes(key), `API accepts ${key}, frontend cannot paint it`);
    }
  });

  it("the frontend default matches the API default", () => {
    const match = registry.match(/export const DEFAULT_ACCENT = "([A-Z_]+)"/);
    assert.ok(match, "frontend DEFAULT_ACCENT not found");
    assert.equal(match[1], DEFAULT_THEME_PRESET);
  });
});

/*
 * The pre-paint script in index.html cannot import the registry — any module
 * import is deferred past first paint, which is the whole reason that script
 * exists. So it carries a HARDCODED copy of the preset keys, and a preset
 * missing from it silently falls back to CORAL for one frame on every cold
 * load. That is exactly the kind of drift no one notices in review.
 */
describe("the pre-paint allowlist covers every preset", () => {
  const html = readFileSync(join(here, "../../frontend/index.html"), "utf8");
  const block = html.match(/var accents = \[([\s\S]*?)\];/);

  it("finds the allowlist", () => {
    assert.ok(block, "accents allowlist not found — did the script change shape?");
  });

  it("lists exactly the presets the API accepts", () => {
    const listed = [...block[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...listed].sort(), [...THEME_PRESET_VALUES].sort());
  });
});

describe("settings model", () => {
  it("enumerates themePreset, so a bad key cannot be persisted", async () => {
    const { PlatformSettings } = await import("../src/models/platformSettings.model.js");
    const path = PlatformSettings.schema.path("themePreset");

    assert.ok(path, "themePreset missing from the schema");
    assert.equal(path.options.default, DEFAULT_THEME_PRESET);
    assert.deepEqual([...path.options.enum].sort(), [...THEME_PRESET_VALUES].sort());
  });

  it("rejects an unknown preset at validation time", async () => {
    const { PlatformSettings } = await import("../src/models/platformSettings.model.js");
    const doc = new PlatformSettings({ themePreset: "NOT_A_THEME" });

    const err = doc.validateSync();
    assert.ok(err?.errors?.themePreset, "an unknown preset was accepted");
  });
});
