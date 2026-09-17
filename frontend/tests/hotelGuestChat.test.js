/**
 * The guest-to-hotel support channel.
 *
 * Two things are pinned here, and they failed in different ways.
 *
 * 1. The read-marking 400. `api.post(url, null, { params })` makes axios send
 *    the four characters `null` under a JSON content-type, and express.json()
 *    rejects that as a parse error BEFORE the router runs. The symptom pointed
 *    everywhere except the cause: the request carried ?party=HOTEL, so it
 *    looked like the party validator, which would have returned 422 and never
 *    ran at all. Every POST with no body must therefore send `{}`.
 *
 * 2. Channel separation on the socket. All three channels share one
 *    `support:message` event, and a guest sits in both their own room and
 *    their hotel's delivery path. Without a filter, a message from the front
 *    desk appends itself to the Billionax conversation.
 *
 * Both are asserted against the source rather than a running app: these are
 * one-line mistakes in call sites, and a test that needs a server to catch
 * them is a test nobody runs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

describe("a body-less POST never sends null", () => {
  // Every api.post in the app's four API modules.
  const modules = [
    "../src/api/admin.api.js",
    "../src/api/hotel.api.js",
    "../src/api/guest.api.js",
    "../src/api/auth.api.js",
  ];

  it("passes {} rather than null as the body", () => {
    for (const path of modules) {
      let source;
      try {
        source = read(path);
      } catch {
        continue; // Not every module has to exist for this rule to hold.
      }

      const offenders = [...source.matchAll(/api\.post\([^)]*?,\s*null\s*,/g)];
      assert.equal(
        offenders.length,
        0,
        `${path}: api.post(..., null, ...) is serialised as the string "null" ` +
          `and rejected by express.json() with a 400 before the route runs`
      );
    }
  });

  it("still sends a body on the read endpoints that take none", () => {
    // The specific calls the bug was found on, so a future refactor cannot
    // quietly drop the argument back to null.
    const admin = read("../src/api/admin.api.js");
    assert.match(admin, /support\/\$\{userId\}\/read`,\s*\{\}/);

    const hotel = read("../src/api/hotel.api.js");
    assert.match(hotel, /support\/guests\/\$\{userId\}\/read`,\s*\{\}/);

    const guest = read("../src/api/guest.api.js");
    assert.match(guest, /support\/hotels\/\$\{hotelId\}\/read`,\s*\{\}/);
  });
});

describe("the three channels stay apart on one socket event", () => {
  const hook = read("../src/hooks/useSupportRealtime.js");

  it("the hook can filter by party and hotel", () => {
    assert.match(hook, /useSupportRealtime = \(\{[^}]*party[^}]*\}/s);
    // Compared as strings: an ObjectId arrives serialised, and a mixed-type
    // === would be silently false and drop every message.
    assert.match(hook, /String\(payload\?\.hotelId \|\| ""\) !== String\(want\.hotelId\)/);
  });

  it("treats a party-less payload as the platform guest channel", () => {
    // The field postdates that channel, so its messages arrive without it.
    assert.match(hook, /payload\?\.party \|\| "GUEST"/);
  });

  it("every screen that shows ONE thread declares its channel", () => {
    // A screen that omits this renders another channel's messages. Each of
    // these watches a single conversation, so each must say which.
    const screens = [
      ["../src/pages/guest/SupportChatPage.jsx", 'party: "GUEST"'],
      ["../src/pages/guest/HotelChatPage.jsx", 'party: "HOTEL_GUEST"'],
      ["../src/pages/hotel/HotelSupportPage.jsx", 'party: "HOTEL"'],
      ["../src/pages/hotel/HotelGuestChatsPage.jsx", 'party: "HOTEL_GUEST"'],
    ];

    for (const [path, declaration] of screens) {
      assert.ok(read(path).includes(declaration), `${path} must declare ${declaration}`);
    }
  });

  it("the guest's hotel thread filters by hotel as well as party", () => {
    // Party alone is not enough here: a guest's OTHER hotels are the same
    // channel, so their messages would land in whichever thread is open.
    const page = read("../src/pages/guest/HotelChatPage.jsx");
    const call = page.slice(page.indexOf("useSupportRealtime({"));
    assert.match(call.slice(0, 600), /hotelId,/);
  });

  it("each badge counts only its own channel", () => {
    // Both hotel badges are live in the same panel session, and the guest's
    // Help dot counts only the platform thread. A missing filter here shows a
    // count on the wrong nav item that then vanishes on the next sync.
    const badges = [
      ["../src/hooks/useSupportBadge.js", 'party: "GUEST"'],
      ["../src/hooks/useHotelSupportBadge.js", 'party: "HOTEL"'],
      ["../src/hooks/useHotelGuestChatsBadge.js", 'party: "HOTEL_GUEST"'],
    ];

    for (const [path, declaration] of badges) {
      assert.ok(read(path).includes(declaration), `${path} must declare ${declaration}`);
    }
  });
});

describe("the hotel panel's guest queue is wired up", () => {
  it("mounts its badge hook in the panel shell", () => {
    // A correct hook that nothing calls is how the panel went stale before.
    const layout = read("../src/components/layout/HotelPanelLayout.jsx");
    assert.match(layout, /useHotelGuestChatsBadge\(\)/);
    assert.match(layout, /import \{ useHotelGuestChatsBadge \}/);
  });

  it("gives the rail a count key of its own", () => {
    // Not a second writer of supportUnread: a manager can have an unanswered
    // question with Billionax AND guests waiting, and one number cannot say
    // both.
    const panel = read("../src/components/layout/PanelLayout.jsx");
    assert.match(panel, /guestChats: guestChatsUnread/);

    const slice = read("../src/store/slices/supportSlice.js");
    assert.match(slice, /guestChatsUnread: 0/);
  });
});
