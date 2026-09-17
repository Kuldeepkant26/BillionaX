/**
 * Which badge moves when a message arrives.
 *
 * This pins a bug that was invisible in casual testing: a guest got a reply
 * from their hotel and NOTHING in the bottom nav changed. The socket delivered
 * it, the filter correctly rejected it as another channel, and no hook was
 * listening for that channel at all — the guest app had one support badge and
 * it counted the platform thread.
 *
 * It looked half-working, which is why it survived. `sendFromHotel` also
 * writes a notification row, so the Alerts badge DID move; the tab the
 * conversation actually lives behind stayed dark.
 *
 * The delivery matrix below is the real one, taken from support.service.js.
 * Every row is a payload the server genuinely emits, into the room it genuinely
 * emits it to, and the assertions say which badge must move and — just as
 * importantly — which must stay still.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  createSupportSlice,
  selectHotelUnreadTotal,
} from "../src/store/slices/supportSlice.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const makeStore = () => {
  let state = {};
  const set = (patch) =>
    (state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) });
  state = createSupportSlice(set, () => state);
  return () => state;
};

/**
 * The filter from useSupportRealtime, kept in step with it by the assertions
 * in the last block. A copy is used rather than importing the hook, which
 * would pull React and the socket singleton into a plain node test.
 */
const passesFilter = (want, payload) => {
  if (!want.party) return true;
  const got = payload?.party || "GUEST";
  if (got !== want.party) return false;
  if (want.hotelId && String(payload?.hotelId || "") !== String(want.hotelId)) return false;
  return true;
};

const GUEST = "g1";
const HOTEL = "h1";
const MANAGER = "m1";

/* The four badge listeners, exactly as their hooks define them. */
const BADGES = {
  guestPlatform: {
    rooms: ["guest:g1"],
    want: { party: "GUEST" },
    counts: (p, path) =>
      p?.message?.sender === "ADMIN" && !path.startsWith("/app/help/chat"),
  },
  guestHotel: {
    rooms: ["guest:g1"],
    want: { party: "HOTEL_GUEST" },
    counts: (p, path) =>
      p?.message?.sender === "ADMIN" && path !== `/app/help/hotel/${p.hotelId}`,
  },
  deskPlatform: {
    rooms: ["user:m1", "hotel:h1"],
    want: { party: "HOTEL" },
    counts: (p, path) =>
      p?.message?.sender === "ADMIN" &&
      (!p.userId || p.userId === MANAGER) &&
      !path.startsWith("/hotel/support"),
  },
  deskGuests: {
    rooms: ["user:m1", "hotel:h1"],
    want: { party: "HOTEL_GUEST" },
    counts: (p, path) =>
      p?.message?.sender === "GUEST" && !path.startsWith("/hotel/messages"),
  },
};

/** Which badges move for one emitted event, given where the viewer is. */
const badgesMovedBy = ({ room, payload }, path = "/elsewhere") =>
  Object.entries(BADGES)
    .filter(([, b]) => b.rooms.includes(room))
    .filter(([, b]) => passesFilter(b.want, payload))
    .filter(([, b]) => b.counts(payload, path))
    .map(([name]) => name);

/* The payloads support.service.js actually emits. */
const PLATFORM_TO_GUEST = { room: "guest:g1", payload: { message: { sender: "ADMIN" } } };
const HOTEL_TO_GUEST = {
  room: "guest:g1",
  payload: { party: "HOTEL_GUEST", hotelId: HOTEL, message: { sender: "ADMIN" } },
};
const GUEST_OWN_ECHO = {
  room: "guest:g1",
  payload: { party: "HOTEL_GUEST", hotelId: HOTEL, message: { sender: "GUEST" } },
};
const GUEST_TO_DESK = {
  room: "hotel:h1",
  payload: {
    userId: GUEST,
    party: "HOTEL_GUEST",
    hotelId: HOTEL,
    message: { sender: "GUEST" },
  },
};
const DESK_REPLY_ECHO = {
  room: "hotel:h1",
  payload: {
    userId: GUEST,
    party: "HOTEL_GUEST",
    hotelId: HOTEL,
    message: { sender: "ADMIN" },
  },
};
const PLATFORM_TO_MANAGER = {
  room: "user:m1",
  payload: { userId: MANAGER, party: "HOTEL", message: { sender: "ADMIN" } },
};

describe("a reply moves exactly one badge", () => {
  it("a HOTEL reply reaches the guest's Help dot", () => {
    // THE REPORTED BUG. Before useGuestHotelChatBadge existed this returned
    // [] — the message arrived and nothing in the nav moved.
    assert.deepEqual(badgesMovedBy(HOTEL_TO_GUEST), ["guestHotel"]);
  });

  it("a PLATFORM reply reaches the guest's Help dot", () => {
    assert.deepEqual(badgesMovedBy(PLATFORM_TO_GUEST), ["guestPlatform"]);
  });

  it("a guest's message reaches the desk's queue badge", () => {
    assert.deepEqual(badgesMovedBy(GUEST_TO_DESK), ["deskGuests"]);
  });

  it("a platform reply reaches the manager's Billionax badge", () => {
    assert.deepEqual(badgesMovedBy(PLATFORM_TO_MANAGER), ["deskPlatform"]);
  });

  it("a hotel message never lands on the manager's Billionax badge", () => {
    // Both live in the hotel room, so only the party filter separates them.
    assert.ok(!badgesMovedBy(GUEST_TO_DESK).includes("deskPlatform"));
  });

  it("a hotel reply never lands on the guest's platform dot", () => {
    assert.ok(!badgesMovedBy(HOTEL_TO_GUEST).includes("guestPlatform"));
  });
});

describe("your own message never badges you", () => {
  it("the guest's echo of their own message is silent", () => {
    // Echoed back so a second device stays in step. Counting it would dot the
    // tab for something the guest just typed.
    assert.deepEqual(badgesMovedBy(GUEST_OWN_ECHO), []);
  });

  it("the desk's own reply, echoed to colleagues, is silent", () => {
    assert.deepEqual(badgesMovedBy(DESK_REPLY_ECHO), []);
  });
});

describe("reading a thread suppresses only that thread's badge", () => {
  it("a reply from the hotel being read is not counted", () => {
    assert.deepEqual(badgesMovedBy(HOTEL_TO_GUEST, `/app/help/hotel/${HOTEL}`), []);
  });

  it("a reply from ANOTHER hotel still is", () => {
    // The guard is scoped to the property, not the route prefix: reading
    // hotel A must not silence hotel B.
    assert.deepEqual(badgesMovedBy(HOTEL_TO_GUEST, "/app/help/hotel/other"), [
      "guestHotel",
    ]);
  });

  it("reading the platform thread does not silence a hotel reply", () => {
    assert.deepEqual(badgesMovedBy(HOTEL_TO_GUEST, "/app/help/chat"), ["guestHotel"]);
  });
});

describe("the guest's per-hotel counts", () => {
  it("totals across every hotel for the nav dot", () => {
    const s = makeStore();
    s().setHotelUnread({ h1: 2, h2: 3 });
    assert.equal(selectHotelUnreadTotal(s()), 5);
  });

  it("is zero when the guest has no hotel threads", () => {
    assert.equal(selectHotelUnreadTotal(makeStore()()), 0);
  });

  it("raises one property without touching another", () => {
    const s = makeStore();
    s().setHotelUnread({ h1: 1, h2: 1 });
    s().bumpHotelUnread("h2");

    assert.equal(s().hotelUnread.h1, 1);
    assert.equal(s().hotelUnread.h2, 2);
  });

  it("clears one property without touching another", () => {
    // Reading hotel A's thread must leave hotel B's dot alone.
    const s = makeStore();
    s().setHotelUnread({ h1: 4, h2: 2 });
    s().clearHotelUnread("h1");

    assert.equal(s().hotelUnread.h1, undefined);
    assert.equal(s().hotelUnread.h2, 2);
    assert.equal(selectHotelUnreadTotal(s()), 2);
  });

  it("keeps the hotel counts out of the platform count", () => {
    // Two different conversations. Merging them would mean reading one clears
    // a dot belonging to the other.
    const s = makeStore();
    s().setSupportUnread(3);
    s().setHotelUnread({ h1: 2 });

    assert.equal(s().supportUnread, 3);
    assert.equal(selectHotelUnreadTotal(s()), 2);

    s().clearSupportUnread();
    assert.equal(selectHotelUnreadTotal(s()), 2, "a hotel dot must survive reading the platform thread");
  });

  it("a bump with no hotel id is ignored rather than creating an undefined key", () => {
    const s = makeStore();
    s().bumpHotelUnread(undefined);
    assert.deepEqual(s().hotelUnread, {});
  });
});

describe("the badge wiring is actually mounted", () => {
  it("the guest shell mounts the hotel badge hook", () => {
    // The whole bug was a channel with no listener. A correct hook that
    // nothing calls is the same failure in a different place.
    const layout = read("../src/components/layout/GuestLayout.jsx");
    assert.match(layout, /import \{ useGuestHotelChatBadge \}/);

    // Comments are stripped first. A plain substring search passes happily on
    // `// useGuestHotelChatBadge();`, which is precisely the dead-code state
    // this test exists to catch.
    const code = layout.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(code, /^\s*useGuestHotelChatBadge\(\);/m, "the hook must actually be called");
  });

  it("the Help dot counts both of the guest's channels", () => {
    const layout = read("../src/components/layout/GuestLayout.jsx");
    assert.match(layout, /supportUnread \+ hotelUnread/);
    assert.match(layout, /item\.supportBadge && helpUnread > 0/);
  });

  it("the Help screen reads the live store rather than fetching once", () => {
    // It used to fetch on mount with no subscription, so a reply arriving
    // while the guest sat on the screen moved nothing.
    const page = read("../src/pages/guest/HelpPage.jsx");
    assert.match(page, /useAppStore\(\(s\) => s\.hotelUnread\)/);
    assert.ok(
      !page.includes("hotelChatUnreadCount("),
      "the Help screen must not race the shell's hook for the same key"
    );
  });

  it("opening a hotel thread clears that hotel's dot optimistically", () => {
    const page = read("../src/pages/guest/HotelChatPage.jsx");
    assert.match(page, /clearHotelUnread\(hotelId\);\s*\n\s*markHotelChatRead\(hotelId\)/);
  });

  it("the door badges the hotel it opens, not the total", () => {
    // Badging it with the total pointed the guest at the wrong conversation
    // when a DIFFERENT hotel had replied.
    const page = read("../src/pages/guest/HelpPage.jsx");
    assert.match(page, /const targetUnread = hotelUnread\[String\(targetId\)\] \|\| 0/);
    assert.match(page, /const otherUnread = hotelUnreadTotal - targetUnread/);
  });
});

describe("the copied filter still matches the hook", () => {
  const hook = read("../src/hooks/useSupportRealtime.js");

  it("defaults an absent party to the platform guest channel", () => {
    assert.match(hook, /payload\?\.party \|\| "GUEST"/);
  });

  it("compares hotel ids as strings", () => {
    assert.match(hook, /String\(payload\?\.hotelId \|\| ""\) !== String\(want\.hotelId\)/);
  });

  it("treats a missing party as 'listen to everything'", () => {
    // The admin badge relies on this: it counts both platform queues and so
    // must refetch for either.
    assert.match(hook, /if \(want\.party\) \{/);
  });
});
