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
  it("has exactly the three channels", () => {
    assert.deepEqual(SUPPORT_PARTY_VALUES, ["GUEST", "HOTEL", "HOTEL_GUEST"]);
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

  it("hotel-bearing rows carry their property, guest-side rows never do", () => {
    // Both hotel channels store it; the platform GUEST channel cannot, because
    // a guest belongs to several properties and none of them is the subject.
    const send = service.slice(service.indexOf("export const sendFromOwner"));
    assert.match(
      send.slice(0, 900),
      /party === SUPPORT_PARTIES\.HOTEL \|\| isHotelScopedParty\(party\)/
    );
  });

  it("a hotel-scoped thread cannot be named without its property", () => {
    // The disclosure this guards: a guest belongs to many hotels, so a filter
    // that drops hotelId returns their conversations with ALL of them, merged,
    // to whichever property asked — plausible-looking output, wrong audience.
    const filter = service.slice(service.indexOf("const threadFilter"));
    assert.match(filter.slice(0, 600), /isHotelScopedParty\(party\)/);
    assert.match(filter.slice(0, 600), /throw new Error/);
  });

  it("every owner-side read routes through that one filter", () => {
    // Rather than composing { userId, party } inline, where the omission is
    // silent and has to be caught by review at each call site.
    for (const fn of ["listForOwner", "markReadByOwner", "unreadForOwner"]) {
      const body = service.slice(service.indexOf(`export const ${fn}`));
      assert.match(body.slice(0, 400), /threadFilter\(/, `${fn} must use threadFilter`);
    }
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

  it("the platform thread takes no id — it IS the signed-in account", () => {
    // Matches the route STRINGS rather than the whole block, which contains
    // colons in its prose. A :param on THIS channel would be something a
    // caller could tamper with, and there is nothing to tamper with by design.
    //
    // Scoped to the paths that are not the guest queue: that one is addressed
    // by guest, so it necessarily carries an id — see below.
    const paths = [...routes.matchAll(/router\.(get|post)\(\s*"(\/support[^"]*)"/g)]
      .map((m) => m[2])
      .filter((p) => !p.startsWith("/support/guests"));

    assert.ok(paths.length >= 4, "expected the four hotel support routes");
    for (const path of paths) {
      assert.ok(!path.includes(":"), `${path} must not carry a path param`);
    }
  });
});

describe("the hotel's guest queue is open to the desk, not just the manager", () => {
  const routes = readFileSync(join(here, "../src/routes/hotel.routes.js"), "utf8");

  it("does not gate the guest queue on adminOnly", () => {
    // The opposite call from the platform thread above, deliberately: a guest
    // asking about their stay is the front desk's job, and waiting for a
    // manager to relay it is the delay this channel exists to remove.
    //
    // Each REGISTRATION is examined rather than the block's text: the prose
    // above it says "NOT adminOnly", and the /settings routes that follow are
    // adminOnly, so a substring search over the region reports both as hits.
    const calls = [
      ...routes.matchAll(/router\.(get|post)\(\s*"(\/support\/guests[^"]*)"([\s\S]*?)\);/g),
    ];

    assert.equal(calls.length, 5, "expected the five guest-queue routes");
    for (const [, , path, args] of calls) {
      assert.ok(!args.includes("adminOnly"), `${path} must be reachable by HOTEL_STAFF`);
    }
  });

  it("validates the guest id it takes in the path", () => {
    // Client input, unlike the property — which comes from the token via
    // requireSameHotel. Membership is then checked in the service.
    for (const route of [
      '"/support/guests/:userId"',
      '"/support/guests/:userId/read"',
      '"/support/guests/:userId/messages"',
    ]) {
      const at = routes.indexOf(route);
      assert.ok(at > -1, `${route} must exist`);
      assert.match(
        routes.slice(at, at + 200),
        /objectIdParam\("userId"\)/,
        `${route} must validate its id`
      );
    }
  });

  it("registers unread-count before the :userId paths", () => {
    // Otherwise "unread-count" is parsed as a guest id — the same ordering
    // trap as /support/unread-count and /hotels/cities.
    assert.ok(
      routes.indexOf('"/support/guests/unread-count"') <
        routes.indexOf('"/support/guests/:userId"'),
      "unread-count must not be shadowed by the id route"
    );
  });
});

describe("a hotel thread is private to its author", () => {
  const service = readFileSync(join(here, "../src/services/support.service.js"), "utf8");
  const realtime = readFileSync(join(here, "../src/realtime/index.js"), "utf8");

  it("never pushes a PLATFORM hotel thread to the hotel room", () => {
    // The original ban was on emitToHotel outright. It cannot be, now that the
    // HOTEL_GUEST channel legitimately belongs to a whole property — so the
    // invariant is asserted where it actually lives: the branch that handles
    // the per-ACCOUNT channel must echo to the author alone.
    //
    // The reasoning is unchanged. The hotel room holds a manager's colleagues,
    // who have their own separate threads with the platform; delivering there
    // and filtering in the client would put private bodies on the wire for
    // people who have no business reading them.
    const send = service.slice(service.indexOf("export const sendFromOwner"));
    const block = send.slice(0, send.indexOf("/* ---- the hotel's own guest queue"));

    // The else branch — everything that is not GUEST and not hotel-scoped, i.e.
    // the platform HOTEL channel — reaches emitToUser, never emitToHotel.
    const authorEcho = block.slice(block.lastIndexOf("} else {"));
    assert.match(authorEcho, /emitToUser\(userId, "support:message"/);
    assert.ok(
      !authorEcho.includes("emitToHotel"),
      "a manager's own thread must not be broadcast to their colleagues"
    );
  });

  it("only the guest-to-hotel channel may address a whole property", () => {
    // Every emitToHotel in the file must sit on the HOTEL_GUEST path: that
    // channel's thread belongs to the desk rather than to one account, so
    // every reader in the room is an intended one.
    const guestQueue = service.indexOf("/* ---- the hotel's own guest queue");
    const beforeQueue = service.slice(0, guestQueue);
    const ownerSend = beforeQueue.slice(beforeQueue.indexOf("export const sendFromOwner"));

    // The one emit before the queue section is inside isHotelScopedParty.
    const scoped = ownerSend.slice(ownerSend.indexOf("if (isHotelScopedParty(party))"));
    assert.match(scoped.slice(0, 900), /emitToHotel\(hotelId, "support:message"/);
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

/**
 * The guest-to-hotel channel.
 *
 * Its distinguishing property is that a thread is keyed by a PAIR. Every other
 * channel is "this person's conversation"; this one is "this person's
 * conversation with THIS hotel", because a guest belongs to several. A query
 * that drops the hotel does not error — it merges every property's thread and
 * hands the result to whichever hotel asked, which is a disclosure whose
 * output looks entirely ordinary.
 */
describe("the guest-to-hotel channel is scoped to one property", () => {
  const service = readFileSync(join(here, "../src/services/support.service.js"), "utf8");
  const controller = readFileSync(join(here, "../src/controllers/guest.controller.js"), "utf8");

  it("the hotel's own queue never queries without a hotelId", () => {
    // listHotelGuestThreads opens its pipeline on the property. Anything else
    // would return every hotel's conversations to one hotel's panel.
    const fn = service.slice(service.indexOf("export const listHotelGuestThreads"));
    const match = fn.slice(0, fn.indexOf("$group"));
    assert.match(match, /\$match:\s*\{\s*hotelId: oid\(hotelId\)/);
  });

  it("reads and replies check MEMBERSHIP, not just a role", () => {
    /*
     * The guest id is client input. A role check alone would pass for any
     * guest on the platform, letting one hotel read a conversation a guest had
     * with a different property by guessing an id.
     */
    for (const fn of ["export const getHotelGuestThread", "export const sendFromHotel"]) {
      const body = service.slice(service.indexOf(fn));
      assert.match(
        body.slice(0, 900),
        /GuestHotelMembership\.findOne\(\{[\s\S]*?hotelId: oid\(hotelId\)/,
        `${fn} must verify the guest belongs to this hotel`
      );
    }
  });

  it("the guest's own routes verify membership before every call", () => {
    // The mirror of the check above, from the other side: a guest must not be
    // able to open a thread with a hotel they have never joined.
    for (const fn of [
      "export const listHotelChatMessages",
      "export const markHotelChatRead",
      "export const sendHotelChatMessage",
    ]) {
      const body = controller.slice(controller.indexOf(fn));
      assert.match(
        body.slice(0, 400),
        /getMembershipOrFail\(\{ guestId: req\.user\._id, hotelId \}\)/,
        `${fn} must check membership first`
      );
    }
  });

  it("the platform is not a party to it", () => {
    /*
     * These threads never enter the main admin's queue. Emitting to the admin
     * room would put a conversation they cannot open into an inbox that counts
     * it — a badge for a thread with no way to read it.
     */
    const send = service.slice(service.indexOf("export const sendFromOwner"));
    const scoped = send.slice(
      send.indexOf("if (isHotelScopedParty(party))"),
      send.indexOf("} else {")
    );

    // Comments are stripped first: the branch EXPLAINS that it skips
    // emitToAdmins, so a substring search over the raw text finds the word in
    // the prose and reports the opposite of the truth.
    const code = scoped.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!code.includes("emitToAdmins"), "the platform must not receive these threads");
    assert.match(code, /emitToHotel\(hotelId/);
  });

  it("a guest's per-hotel unread counts are totalled across properties", () => {
    // unreadForOwner counts ONE thread, and a guest can have several. The Help
    // screen needs the total and the split, which is one grouped pass.
    const fn = service.slice(service.indexOf("export const unreadFromHotels"));
    assert.match(fn.slice(0, 700), /\$group: \{ _id: "\$hotelId"/);
    assert.match(fn.slice(0, 900), /byHotel/);
  });

  it("the hotel reply tells the guest which property it came from", () => {
    // A guest with threads at several hotels gets one alert feed, so a
    // notification that does not name its thread points at the wrong one.
    const fn = service.slice(service.indexOf("export const sendFromHotel"));
    assert.match(fn.slice(0, 2000), /href: `\/app\/help\/hotel\/\$\{hotelId\}`/);
  });
});

describe("the model can express a per-hotel thread", () => {
  const model = readFileSync(join(here, "../src/models/supportMessage.model.js"), "utf8");

  it("indexes the hotel-led thread key", () => {
    // The party-led index cannot serve "every conversation at this hotel" — it
    // would scan every other property's rows to find one hotel's.
    assert.match(model, /index\(\{ hotelId: 1, party: 1, userId: 1, createdAt: 1 \}\)/);
  });

  it("indexes that queue's unread badge", () => {
    assert.match(model, /\{ hotelId: 1, party: 1, sender: 1 \}/);
  });
});
