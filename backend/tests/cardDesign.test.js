/**
 * The card-design setting is a contract between two codebases: the API stores
 * a key, the guest app draws it. These tests pin the parts that would break
 * silently — a renamed key, or a design the frontend ships that the API would
 * reject.
 *
 * The frontend registry is parsed as text rather than imported: it is JSX in
 * another package, so importing it here would need a build step. Reading the
 * keys is enough to catch the drift that matters.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CARD_DESIGNS,
  CARD_DESIGN_VALUES,
  DEFAULT_CARD_DESIGN,
} from "../src/config/constants.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("card design constants", () => {
  it("ships the eight approved families", () => {
    assert.equal(CARD_DESIGN_VALUES.length, 8);
  });

  it("defaults to brushed steel", () => {
    assert.equal(DEFAULT_CARD_DESIGN, "BRUSHED_STEEL");
    assert.ok(CARD_DESIGN_VALUES.includes(DEFAULT_CARD_DESIGN));
  });

  it("keys and values match, so a lookup by either works", () => {
    for (const [key, value] of Object.entries(CARD_DESIGNS)) assert.equal(key, value);
  });

  it("is frozen — a stray write would change every guest's card", () => {
    assert.ok(Object.isFrozen(CARD_DESIGNS));
  });
});

describe("API and guest app agree on the design keys", () => {
  const registry = readFileSync(
    join(here, "../../frontend/src/features/guest/cardDesigns/registry.jsx"),
    "utf8"
  );

  // Keys of the exported CARD_DESIGNS object literal: `  METALICA: {`
  const frontendKeys = [...registry.matchAll(/^ {2}([A-Z_]+): \{$/gm)].map((m) => m[1]);

  it("finds the frontend registry", () => {
    assert.ok(frontendKeys.length > 0, "registry keys did not parse — did the file move?");
  });

  it("every design the app draws is one the API will accept", () => {
    // The reverse of the usual worry: an admin could never select it, because
    // the picker offers it but the PATCH would 400.
    for (const key of frontendKeys) {
      assert.ok(CARD_DESIGN_VALUES.includes(key), `frontend ships ${key}, API rejects it`);
    }
  });

  it("every design the API accepts is one the app can draw", () => {
    // Otherwise a stored key falls back to the default and the admin's choice
    // silently does nothing.
    for (const key of CARD_DESIGN_VALUES) {
      assert.ok(frontendKeys.includes(key), `API accepts ${key}, frontend cannot draw it`);
    }
  });

  it("the frontend default matches the API default", () => {
    const match = registry.match(/export const DEFAULT_CARD_DESIGN = "([A-Z_]+)"/);
    assert.ok(match, "frontend DEFAULT_CARD_DESIGN not found");
    assert.equal(match[1], DEFAULT_CARD_DESIGN);
  });
});

describe("settings model", () => {
  it("enumerates cardDesign, so a bad key cannot be persisted", async () => {
    const { PlatformSettings } = await import("../src/models/platformSettings.model.js");
    const path = PlatformSettings.schema.path("cardDesign");

    assert.ok(path, "cardDesign missing from the schema");
    assert.equal(path.options.default, DEFAULT_CARD_DESIGN);
    assert.deepEqual([...path.options.enum].sort(), [...CARD_DESIGN_VALUES].sort());
  });

  it("rejects an unknown design at validation time", async () => {
    const { PlatformSettings } = await import("../src/models/platformSettings.model.js");
    const doc = new PlatformSettings({ cardDesign: "NOT_A_DESIGN" });

    const err = doc.validateSync();
    assert.ok(err?.errors?.cardDesign, "an unknown design was accepted");
  });
});
