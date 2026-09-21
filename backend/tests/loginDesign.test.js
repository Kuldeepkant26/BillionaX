/**
 * The sign-in screen design is a contract between two codebases: the API
 * stores a key, the guest app draws it. Same drift risks as the card design
 * and the theme preset — a renamed key, or a design one side ships that the
 * other does not know.
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
  LOGIN_DESIGNS,
  LOGIN_DESIGN_VALUES,
  DEFAULT_LOGIN_DESIGN,
} from "../src/config/constants.js";

const here = dirname(fileURLToPath(import.meta.url));

const REGISTRY = join(here, "../../frontend/src/features/guest/loginDesigns/registry.jsx");

describe("login design constants", () => {
  it("ships the approved designs", () => {
    assert.equal(LOGIN_DESIGN_VALUES.length, 12);
  });

  it("defaults to the signed-off screen", () => {
    assert.equal(DEFAULT_LOGIN_DESIGN, "ATELIER");
    assert.ok(LOGIN_DESIGN_VALUES.includes(DEFAULT_LOGIN_DESIGN));
  });

  it("keys and values match, so a lookup by either works", () => {
    for (const [key, value] of Object.entries(LOGIN_DESIGNS)) assert.equal(key, value);
  });

  it("is frozen — a stray write would change every guest's sign-in screen", () => {
    assert.ok(Object.isFrozen(LOGIN_DESIGNS));
  });
});

describe("API and guest app agree on the design keys", () => {
  const registry = readFileSync(REGISTRY, "utf8");

  // Keys of the exported LOGIN_DESIGNS object literal: `  ATELIER: {`
  const frontendKeys = [...registry.matchAll(/^ {2}([A-Z_]+): \{$/gm)].map((m) => m[1]);

  it("finds the frontend registry", () => {
    assert.ok(frontendKeys.length > 0, "registry keys did not parse — did the file move?");
  });

  it("every design the app draws is one the API will accept", () => {
    // Otherwise the picker offers it but the PATCH 400s, so an admin could
    // never actually select it.
    for (const key of frontendKeys) {
      assert.ok(LOGIN_DESIGN_VALUES.includes(key), `frontend ships ${key}, API rejects it`);
    }
  });

  it("every design the API accepts is one the app can draw", () => {
    // Otherwise a stored key falls back to the default and the admin's choice
    // silently does nothing.
    for (const key of LOGIN_DESIGN_VALUES) {
      assert.ok(frontendKeys.includes(key), `API accepts ${key}, frontend cannot draw it`);
    }
  });

  it("the frontend default matches the API default", () => {
    const match = registry.match(/export const DEFAULT_LOGIN_DESIGN = "([A-Z_]+)"/);
    assert.ok(match, "frontend DEFAULT_LOGIN_DESIGN not found");
    assert.equal(match[1], DEFAULT_LOGIN_DESIGN);
  });
});

/*
 * The picker groups the designs into sections. The grouping is frontend-only
 * (the API stores a flat key), but a design whose `category` names no section
 * would be dropped from the picker — an admin could never select it, and the
 * flat key list would still look correct. This catches that.
 */
describe("every design is reachable in the picker", () => {
  const registry = readFileSync(REGISTRY, "utf8");

  const sections = [...registry.matchAll(/^ {4}key: "([A-Z_]+)",$/gm)].map((m) => m[1]);
  const categories = [...registry.matchAll(/^ {4}category: "([A-Z_]+)",$/gm)].map((m) => m[1]);

  it("declares a category for every design", () => {
    assert.equal(
      categories.length,
      LOGIN_DESIGN_VALUES.length,
      `${categories.length} categories for ${LOGIN_DESIGN_VALUES.length} designs`
    );
  });

  it("every design's category is a section the picker renders", () => {
    for (const category of categories) {
      assert.ok(sections.includes(category), `category ${category} has no section`);
    }
  });

  it("every section has at least one design", () => {
    for (const section of sections) {
      assert.ok(categories.includes(section), `section ${section} is empty`);
    }
  });
});
