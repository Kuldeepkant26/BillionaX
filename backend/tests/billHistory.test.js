/**
 * The panel's bill-history query.
 *
 * These run the real service with Bill.aggregate stubbed, so the PIPELINE it
 * builds is asserted without a database. That is where this feature's bugs
 * would live, and every one of them fails silently rather than throwing:
 *
 *  - a hotelId left as a string never matches an ObjectId, so the list comes
 *    back empty and looks like "no bills yet";
 *  - a bare `new Date("2026-09-05")` as an upper bound is MIDNIGHT, so
 *    filtering "today" hides everything filed today;
 *  - joining users before matching this hotel's bills would scan every guest
 *    on the platform, and is the tenant boundary as well as the index story;
 *  - an unescaped search term is a regex, so "a.*b" would match everything.
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { Bill } from "../src/models/bill.model.js";
import * as billService from "../src/services/bill.service.js";
import { endOfDay } from "../src/utils/date.util.js";

const HOTEL = "64b7f0c2f1a2b3c4d5e6f7a8";

let captured = null;
let realAggregate;

before(() => {
  realAggregate = Bill.aggregate;
  Bill.aggregate = async (pipeline) => {
    captured = pipeline;
    return [{ items: [], meta: [] }];
  };
});

beforeEach(() => {
  captured = null;
});

const stage = (name) => captured.find((s) => s[name])?.[name];
const run = (args) => billService.listHotelBills({ hotelId: HOTEL, ...args });

describe("tenant scoping", () => {
  it("casts hotelId to an ObjectId", async () => {
    // A string here matches nothing and reads as an empty hotel, not an error.
    await run({});
    const match = stage("$match");
    assert.ok(match.hotelId instanceof mongoose.Types.ObjectId);
    assert.equal(String(match.hotelId), HOTEL);
  });

  it("matches this hotel BEFORE joining users", async () => {
    await run({ q: "raj" });
    const iMatch = captured.findIndex((s) => s.$match);
    const iLookup = captured.findIndex((s) => s.$lookup);
    assert.ok(iMatch < iLookup, "the users lookup runs before the hotel filter");
  });

  it("projects only the fields the list shows", async () => {
    await run({ q: "raj" });
    const lookup = captured.find((s) => s.$lookup).$lookup;
    assert.equal(lookup.from, "users");
    assert.deepEqual(lookup.pipeline, [{ $project: { name: 1, email: 1 } }]);
  });
});

describe("status filter", () => {
  it("turns an array into $in, for the three terminal states at once", async () => {
    await run({ status: ["PAID", "CANCELLED", "EXPIRED"] });
    assert.deepEqual(stage("$match").status, { $in: ["PAID", "CANCELLED", "EXPIRED"] });
  });

  it("leaves a single status as a scalar, so the pending list is unchanged", async () => {
    await run({ status: "PENDING" });
    assert.equal(stage("$match").status, "PENDING");
  });

  it("omits status entirely when none is given", async () => {
    await run({});
    assert.ok(!("status" in stage("$match")));
  });
});

describe("date range", () => {
  it("covers the WHOLE of the chosen end day", async () => {
    // The bug this exists to prevent: staff filter "today", and a bare
    // midnight upper bound hides every bill they raised today.
    await run({ from: "2026-09-01", to: "2026-09-05" });
    const { createdAt } = stage("$match");

    assert.equal(createdAt.$gte.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(createdAt.$lte.toISOString(), "2026-09-05T23:59:59.999Z");
  });

  it("passes an explicit timestamp through untouched", () => {
    // Only a date-only string is ambiguous; widening a real time would be wrong.
    assert.equal(endOfDay("2026-09-05T10:30:00Z").toISOString(), "2026-09-05T10:30:00.000Z");
  });

  it("adds no date clause when neither end is set", async () => {
    await run({});
    assert.ok(!("createdAt" in stage("$match")));
  });

  it("accepts an open-ended range", async () => {
    await run({ from: "2026-09-01" });
    const { createdAt } = stage("$match");
    assert.ok(createdAt.$gte);
    assert.ok(!("$lte" in createdAt));
  });
});

describe("guest search", () => {
  it("matches name or email, after the join", async () => {
    await run({ q: "raj" });
    const iLookup = captured.findIndex((s) => s.$lookup);
    const search = captured.find((s, i) => i > iLookup && s.$match).$match;

    assert.equal(search.$or.length, 2);
    assert.ok(search.$or[0]["guest.name"]);
    assert.ok(search.$or[1]["guest.email"]);
  });

  it("escapes regex metacharacters", async () => {
    // Unescaped, "a.*b" is a pattern rather than a name and matches far too
    // much — and a pathological one is a CPU denial of service.
    await run({ q: "a.*b" });
    const iLookup = captured.findIndex((s) => s.$lookup);
    const search = captured.find((s, i) => i > iLookup && s.$match).$match;

    assert.equal(search.$or[0]["guest.name"].$regex, "a\\.\\*b");
  });

  it("adds no search stage when q is absent", async () => {
    await run({});
    assert.equal(captured.filter((s) => s.$match).length, 1);
  });
});

describe("result shaping", () => {
  it("keeps a bill whose guest no longer exists", async () => {
    // It is financial history. Dropping it would quietly change the totals.
    await run({});
    assert.equal(stage("$unwind").preserveNullAndEmptyArrays, true);
  });

  it("sorts newest first", async () => {
    await run({});
    assert.equal(stage("$sort").createdAt, -1);
  });

  it("pages inside the facet, counting the total alongside", async () => {
    await run({ page: 3, limit: 10 });
    const facet = stage("$facet");

    assert.equal(facet.items[0].$skip, 20);
    assert.equal(facet.items[1].$limit, 10);
    assert.equal(facet.meta[0].$count, "total");
  });

  it("clamps a hostile page or limit", async () => {
    await run({ page: -5, limit: 9999 });
    const facet = stage("$facet");

    assert.equal(facet.items[1].$limit, 50, "limit is not capped");
    assert.equal(facet.items[0].$skip, 0, "a negative page produced a negative skip");
  });

  it("masks the guest email in the list", async () => {
    Bill.aggregate = async () => [
      {
        items: [
          {
            _id: new mongoose.Types.ObjectId(),
            hotelId: new mongoose.Types.ObjectId(),
            guestId: new mongoose.Types.ObjectId(),
            lineItems: [],
            subtotalPaise: 100,
            taxPercent: 0,
            taxPaise: 0,
            totalPaise: 100,
            coinsApplied: 0,
            coinsDiscountPaise: 0,
            payablePaise: 100,
            tierCapPercent: 10,
            status: "PAID",
            expiresAt: new Date(),
            createdAt: new Date(),
            guest: { name: "Raj Kumar", email: "raj.kumar@example.com" },
          },
        ],
        meta: [{ total: 1 }],
      },
    ];

    const { items } = await run({});

    assert.equal(items[0].guestName, "Raj Kumar");
    assert.ok(
      !items[0].guestMaskedEmail.includes("raj.kumar"),
      "the full address reached the panel list"
    );
    assert.match(items[0].guestMaskedEmail, /@example\.com$/);
  });
});
