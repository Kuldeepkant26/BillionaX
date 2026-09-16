/**
 * The support chat and the feed switch.
 *
 * Both are contracts between codebases: the API stores a flag and a sender
 * side, and the apps build navigation and bubbles from them. These tests pin
 * the parts that would fail silently rather than loudly — a default that
 * flips, a validator that accepts a string where a boolean is meant, or a
 * message model that would let an unattributed row through.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SUPPORT_SENDERS,
  SUPPORT_SENDER_VALUES,
  SUPPORT_PARTIES,
  SUPPORT_PARTY_VALUES,
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_VALUES,
} from "../src/config/constants.js";
import { PlatformSettings } from "../src/models/platformSettings.model.js";
import { SupportMessage } from "../src/models/supportMessage.model.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("support sender constants", () => {
  it("has exactly two sides", () => {
    assert.deepEqual(SUPPORT_SENDER_VALUES, ["GUEST", "ADMIN"]);
  });

  it("keys and values match, so a lookup by either works", () => {
    for (const [key, value] of Object.entries(SUPPORT_SENDERS)) assert.equal(key, value);
  });

  it("is frozen", () => {
    assert.ok(Object.isFrozen(SUPPORT_SENDERS));
  });

  it("carries a notification kind for an admin's reply", () => {
    // The guest is told about a reply through the ordinary alerts feed, so the
    // kind has to be one the Notification model will accept.
    assert.ok(NOTIFICATION_KIND_VALUES.includes(NOTIFICATION_KINDS.SUPPORT_REPLY));
  });
});

describe("support party constants", () => {
  it("has exactly the two channels", () => {
    assert.deepEqual(SUPPORT_PARTY_VALUES, ["GUEST", "HOTEL"]);
  });

  it("keys and values match, so a lookup by either works", () => {
    for (const [key, value] of Object.entries(SUPPORT_PARTIES)) assert.equal(key, value);
  });

  it("is frozen", () => {
    assert.ok(Object.isFrozen(SUPPORT_PARTIES));
  });
});

describe("support message model", () => {
  const OWNER = "507f1f77bcf86cd799439011";

  it("requires an owner, a side and a body", () => {
    const doc = new SupportMessage({});
    const err = doc.validateSync();

    assert.ok(err.errors.userId, "a message with no owner belongs to no thread");
    assert.ok(err.errors.sender, "a message with no side cannot be drawn");
    assert.ok(err.errors.body, "an empty message is not a message");
  });

  it("defaults to the guest channel, so a row can never be party-less", () => {
    // party is required; the default is what keeps existing guest-side callers
    // working without passing it explicitly.
    const doc = new SupportMessage({
      userId: OWNER,
      sender: SUPPORT_SENDERS.GUEST,
      body: "hello",
    });

    assert.equal(doc.party, SUPPORT_PARTIES.GUEST);
    assert.equal(doc.validateSync(), undefined);
  });

  it("rejects a channel that is neither queue", () => {
    const doc = new SupportMessage({
      userId: OWNER,
      party: "STAFF",
      sender: SUPPORT_SENDERS.GUEST,
      body: "hello",
    });

    assert.ok(doc.validateSync().errors.party);
  });

  it("rejects a sender that is neither side", () => {
    const doc = new SupportMessage({
      userId: OWNER,
      sender: "HOTEL",
      body: "hello",
    });

    assert.ok(doc.validateSync().errors.sender);
  });

  it("caps the body at 2000 characters, matching the validator", () => {
    const doc = new SupportMessage({
      userId: OWNER,
      sender: SUPPORT_SENDERS.GUEST,
      body: "x".repeat(2001),
    });

    assert.ok(doc.validateSync().errors.body);
  });

  it("starts unread — readAt is what both unread counts are derived from", () => {
    const doc = new SupportMessage({
      userId: OWNER,
      sender: SUPPORT_SENDERS.GUEST,
      body: "hello",
    });

    assert.equal(doc.readAt, null);
    assert.equal(doc.validateSync(), undefined);
  });

  it("carries a hotel on a hotel-channel row, for grouping by property", () => {
    const doc = new SupportMessage({
      userId: OWNER,
      party: SUPPORT_PARTIES.HOTEL,
      hotelId: "507f1f77bcf86cd799439022",
      sender: SUPPORT_SENDERS.GUEST,
      body: "our coin balance looks wrong",
    });

    assert.equal(doc.validateSync(), undefined);
    assert.equal(String(doc.hotelId), "507f1f77bcf86cd799439022");
  });

  it("indexes every lookup the two inboxes run", () => {
    const keys = SupportMessage.schema.indexes().map(([spec]) => Object.keys(spec).join(","));

    // The conversation view, oldest first.
    assert.ok(keys.includes("userId,createdAt"));
    // Each inbox's thread list, scoped to one channel.
    assert.ok(keys.includes("party,createdAt"));
    // The partial index behind "how many unread, on which channel, from which side".
    assert.ok(keys.includes("party,sender,userId"));
  });

  it("no index still mentions the pre-rename owner field", () => {
    // The migration drops these from the live collection; this catches a
    // schema that quietly reintroduces one.
    const keys = SupportMessage.schema.indexes().flatMap(([spec]) => Object.keys(spec));
    assert.ok(!keys.includes("guestId"));
  });
});

describe("the feed switch", () => {
  it("is off by default", () => {
    // The network is launching without the feed. A default of true would light
    // it up on any deployment that has never opened the settings page.
    const settings = new PlatformSettings({});
    assert.equal(settings.feedEnabled, false);
  });

  it("is a boolean, so the nav filter can never see a string", () => {
    const settings = new PlatformSettings({ feedEnabled: "false" });
    // Mongoose casts, and a cast "false" string would otherwise arrive at the
    // client as truthy and show a tab the admin switched off.
    assert.equal(typeof settings.feedEnabled, "boolean");
  });

  it("survives a round trip through the settings payload", () => {
    const settings = new PlatformSettings({ feedEnabled: true });
    assert.equal(settings.feedEnabled, true);
  });
});

describe("the validator refuses a non-boolean feed switch", () => {
  const source = readFileSync(join(here, "../src/validators/common.validator.js"), "utf8");

  it("checks feedEnabled strictly rather than coercing it", () => {
    // toBoolean() would turn a typo'd "yes" into false and silently hide the
    // feed, so the rule has to reject anything that is not already a boolean.
    assert.match(source, /body\("feedEnabled"\)\s*\.optional\(\)\s*\.isBoolean\(\{ strict: true \}\)/);
  });

  it("caps a support message at the same length the model does", () => {
    assert.match(source, /isLength\(\{ min: 1, max: 2000 \}\)/);
  });
});

describe("API and guest app agree on the config keys", () => {
  it("the app reads feedEnabled from the public config", () => {
    // The guest shell builds its bottom nav from this key before anyone is
    // signed in, so the two sides have to spell it the same way.
    const routes = readFileSync(join(here, "../src/routes/public.routes.js"), "utf8");
    assert.match(routes, /feedEnabled: settings\.feedEnabled/);

    const sync = readFileSync(
      join(here, "../../frontend/src/hooks/useAccentSync.js"),
      "utf8"
    );
    // `in`, not a truthiness check: false is the value that turns the tab off,
    // and a truthy guard could never deliver it.
    assert.match(sync, /"feedEnabled" in data/);
  });

  it("the guest bootstrap carries it too, so the nav never repaints", () => {
    const controller = readFileSync(
      join(here, "../src/controllers/guest.controller.js"),
      "utf8"
    );
    assert.match(controller, /feedEnabled: settings\.feedEnabled/);

    const hook = readFileSync(
      join(here, "../../frontend/src/hooks/useGuestMemberships.js"),
      "utf8"
    );
    assert.match(hook, /"feedEnabled" in data/);
  });
});

describe("the two channels stay separated", () => {
  const service = readFileSync(join(here, "../src/services/support.service.js"), "utf8");

  it("every owner-side read is scoped by party", () => {
    // A query that forgot `party` would let a hotel admin's id resolve a guest
    // thread, or merge the two queues into one. Each of these four functions
    // filters on it.
    for (const fn of ["listForOwner", "markReadByOwner", "unreadForOwner"]) {
      const body = service.slice(service.indexOf(`export const ${fn}`));
      assert.match(body.slice(0, 500), /party/, `${fn} must filter by party`);
    }
  });

  it("the platform can only open a thread whose owner has the right role", () => {
    // getThread and sendFromPlatform both narrow User by role before doing
    // anything — this is what stops ?party=HOTEL returning a guest's messages.
    assert.match(service, /party === SUPPORT_PARTIES\.HOTEL\s*\?\s*\[ROLES\.HOTEL_ADMIN, ROLES\.HOTEL_STAFF\]\s*:\s*\[ROLES\.GUEST\]/);
  });

  it("only guest replies raise an app notification", () => {
    // A hotel admin has no alerts feed — that collection is the guest app's.
    const reply = service.slice(service.indexOf("export const sendFromPlatform"));
    assert.match(
      reply,
      /if \(party === SUPPORT_PARTIES\.GUEST\) \{\s*await notificationService\.notify/
    );
  });

  it("hotel-side rows carry their property, guest-side rows never do", () => {
    const send = service.slice(service.indexOf("export const sendFromOwner"));
    assert.match(send.slice(0, 700), /party === SUPPORT_PARTIES\.HOTEL && hotelId \? oid\(hotelId\) : null/);
  });
});

describe("the hotel support routes are manager-only", () => {
  const routes = readFileSync(join(here, "../src/routes/hotel.routes.js"), "utf8");

  it("gates all four on adminOnly", () => {
    // HOTEL_STAFF would otherwise give the main admin a queue of front-desk
    // accounts asking questions their own manager should answer.
    for (const path of [
      '"/support/messages", adminOnly',
      '"/support/unread-count", adminOnly',
      '"/support/read", adminOnly',
    ]) {
      assert.ok(routes.includes(path), `${path} must be adminOnly`);
    }
    // The POST spans lines, so it is matched separately.
    assert.match(routes, /"\/support\/messages",\s*\n\s*adminOnly,/);
  });

  it("takes no id in any path — the thread is the signed-in account", () => {
    // Matches the route STRINGS rather than the whole block, which contains
    // colons in its prose. A :param here would be something a caller could
    // tamper with, and there is nothing to tamper with by design.
    const paths = [...routes.matchAll(/router\.(get|post)\(\s*"(\/support[^"]*)"/g)].map(
      (m) => m[2]
    );

    assert.ok(paths.length >= 4, "expected the four hotel support routes");
    for (const path of paths) {
      assert.ok(!path.includes(":"), `${path} must not carry a path param`);
    }
  });
});

describe("a hotel thread is private to its author", () => {
  const service = readFileSync(join(here, "../src/services/support.service.js"), "utf8");
  const realtime = readFileSync(join(here, "../src/realtime/index.js"), "utf8");

  it("never pushes a support message to the hotel room", () => {
    // The hotel room also contains HOTEL_STAFF, who cannot open support at
    // all, and a manager's colleagues, who have their own threads. Delivering
    // there and filtering in the client would put private bodies on the wire
    // for people who may not read them.
    assert.ok(
      !service.includes("emitToHotel"),
      "support messages must not be broadcast to a whole property"
    );
  });

  it("echoes to the author's own room instead", () => {
    assert.match(service, /emitToUser\(userId, "support:message"/);
  });

  it("every account joins a room of its own, named from the token", () => {
    // Not from handshake data — the same rule every other room here follows.
    assert.match(realtime, /socket\.join\(userRoom\(userId\)\)/);
  });
});

describe("marking a thread read returns the fresh badge counts", () => {
  const service = readFileSync(join(here, "../src/services/support.service.js"), "utf8");
  const page = readFileSync(
    join(here, "../../frontend/src/pages/admin/AdminSupportPage.jsx"),
    "utf8"
  );

  it("recounts AFTER the write, on the same request", () => {
    /*
     * The bug this pins: the panel used to fire a separate /unread-count after
     * marking a thread read. Two requests, no ordering guarantee — the count
     * could be computed from a snapshot taken before the write landed, leaving
     * a badge on the rail for a thread the admin had just read.
     */
    const fn = service.slice(
      service.indexOf("export const markReadByPlatform"),
      service.indexOf("export const sendFromPlatform")
    );

    const writeAt = fn.indexOf("updateMany");
    const countAt = fn.indexOf("unreadForPlatform");

    assert.ok(countAt > writeAt, "the recount must come after the write");
    assert.match(fn, /return \{ marked: modifiedCount, \.\.\.counts \}/);
  });

  it("is declared after unreadForPlatform, which it calls", () => {
    // Both are `const` arrow functions, so this is a real ordering constraint
    // rather than a stylistic one — a hoisted function would not care.
    assert.ok(
      service.indexOf("export const unreadForPlatform") <
        service.indexOf("export const markReadByPlatform")
    );
  });

  it("the panel applies what the read returned instead of refetching", () => {
    assert.match(page, /const read = await markSupportThreadRead\(userId, party\)/);
    // Carries the ticket taken before the request went out, so a slower count
    // already in flight cannot overwrite it — see frontend/tests/supportUnread.
    assert.match(page, /if \(read\) applyCounts\(read, readSeq\);/);
  });

  it("does not also fetch the count when a thread is being opened", () => {
    /*
     * The race that kept the badge up: with a thread in the URL, both the
     * standalone count effect and loadThread ran on mount. The standalone one
     * was issued first, so it saw the PRE-read total, and often resolved last.
     */
    assert.match(page, /if \(userId\) return;\s*\n\s*loadCounts\(\);/);
  });

  it("one applier writes both the tab labels and the rail badge", () => {
    // Two writers could disagree about the same number.
    const applier = page.slice(page.indexOf("const applyCounts"), page.indexOf("const loadCounts"));
    assert.match(applier, /setCounts\(/);
    assert.match(applier, /setSupportUnread\(/);
  });
});
