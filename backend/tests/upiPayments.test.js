/**
 * Direct UPI bill payments.
 *
 * Guests now pay the hotel's own UPI account and the staff member who sent the
 * bill confirms the money arrived. These pin the parts whose failure mode is
 * money going to the wrong place or being recorded wrongly, rather than an
 * error anyone would see:
 *
 *  - The link a guest pays with. A wrong amount format or a dropped merchant
 *    parameter is a payment that fails in the guest's UPI app, at the desk.
 *
 *  - Who may confirm. Only the bill's sender — the client's rule — and the
 *    tenant check must come first so a wrong-hotel id 404s.
 *
 *  - Coin holds. Every path that ends a bill must release or spend its hold,
 *    or the guest's spendable balance is short forever with no error.
 *
 *  - The guest can no longer settle a bill that has money left on it.
 *
 * No database, like billCancel.test.js: the pure helpers are exercised
 * directly and the service contracts are read from source.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildUpiLink,
  formatUpiAmount,
  isValidVpa,
  makePayRef,
  parseUpiPayload,
} from "../src/utils/upi.util.js";
import { UPI_APPS, mobilePlatform, upiAppLink } from "../../frontend/src/utils/upiApps.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

const billService = read("../src/services/bill.service.js");
const accountService = read("../src/services/paymentAccount.service.js");
const hotelRoutes = read("../src/routes/hotel.routes.js");
const hotelController = read("../src/controllers/hotel.controller.js");

/** The body of one exported function, up to the next top-level declaration. */
const fnBody = (src, name) => {
  const start = src.indexOf(`export const ${name}`) >= 0
    ? src.indexOf(`export const ${name}`)
    : src.indexOf(`const ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const next = src.slice(start + 1).search(/\n(export )?const [a-zA-Z]+ = /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
};

const params = (link) => new URLSearchParams(link.slice(link.indexOf("?") + 1));

describe("the UPI link a guest pays with", () => {
  it("carries the payee, the exact amount, INR and the bill reference", () => {
    const { link, amountLocked } = buildUpiLink({
      vpa: "FrontDesk@OKHDFC",
      payeeName: "Taj Palace",
      amountPaise: 118000,
      payRef: "BX-4F2A9C",
    });

    assert.equal(amountLocked, true);
    assert.ok(link.startsWith("upi://pay?"));
    const p = params(link);
    assert.equal(p.get("pa"), "frontdesk@okhdfc");
    assert.equal(p.get("pn"), "Taj Palace");
    assert.equal(p.get("am"), "1180.00");
    assert.equal(p.get("cu"), "INR");
    assert.equal(p.get("tn"), "BX-4F2A9C");
  });

  it("never sets tr, which some apps refuse on a personal VPA", () => {
    const { link } = buildUpiLink({ vpa: "a@okaxis", amountPaise: 100, payRef: "BX-1" });
    assert.equal(params(link).has("tr"), false);
  });

  it("leaves @ unencoded and encodes spaces as %20, not +", () => {
    const { link } = buildUpiLink({ vpa: "a@okaxis", payeeName: "The Grand", amountPaise: 100 });
    assert.match(link, /pa=a@okaxis/);
    assert.match(link, /pn=The%20Grand/);
  });

  it("keeps the hotel's merchant parameters when its QR is for the same VPA", () => {
    const qrPayload = "upi://pay?pa=shop@ybl&pn=Shop&mc=5812&mode=02&purpose=00";
    const { link } = buildUpiLink({ vpa: "shop@ybl", qrPayload, amountPaise: 25050, payRef: "BX-AB" });
    const p = params(link);

    assert.equal(p.get("mc"), "5812");
    assert.equal(p.get("mode"), "02");
    assert.equal(p.get("am"), "250.50");
    assert.equal(p.get("tn"), "BX-AB");
  });

  it("ignores a QR payload for a different VPA rather than paying it", () => {
    const qrPayload = "upi://pay?pa=someone-else@ybl&mc=1111";
    const { link } = buildUpiLink({ vpa: "shop@ybl", qrPayload, amountPaise: 100 });
    const p = params(link);

    assert.equal(p.get("pa"), "shop@ybl");
    assert.equal(p.has("mc"), false);
  });

  it("returns a signed QR untouched, with the amount NOT locked", () => {
    // Changing any parameter of a signed payload makes the payer's app reject
    // it, so the guest is shown the image and types the amount instead.
    const qrPayload = "upi://pay?pa=shop@paytm&pn=Shop&mc=5499&sign=abc123";
    const result = buildUpiLink({ vpa: "shop@paytm", qrPayload, amountPaise: 9900, payRef: "BX-1" });

    assert.equal(result.amountLocked, false);
    assert.equal(result.link, qrPayload);
  });

  it("formats paise exactly", () => {
    assert.equal(formatUpiAmount(118000), "1180.00");
    assert.equal(formatUpiAmount(1), "0.01");
    assert.equal(formatUpiAmount(99999), "999.99");
    assert.equal(formatUpiAmount(-5), "0.00");
  });
});

describe("UPI IDs and QR payloads", () => {
  it("accepts real-looking VPAs, case-insensitively", () => {
    for (const vpa of ["frontdesk@okhdfc", "Hotel.Spa-1@ybl", "9876543210@paytm", "  a_b@oksbi "]) {
      assert.equal(isValidVpa(vpa), true, vpa);
    }
  });

  it("rejects anything that is not name@handle", () => {
    for (const vpa of ["", "frontdesk", "@okhdfc", "a@", "a@1bank", "a b@okhdfc", "a@ok@hdfc"]) {
      assert.equal(isValidVpa(vpa), false, vpa);
    }
  });

  it("only parses upi://pay links that name a payee", () => {
    assert.equal(parseUpiPayload("https://example.com"), null);
    assert.equal(parseUpiPayload("upi://pay?pn=NoPayee"), null);
    assert.equal(parseUpiPayload("upi://pay?pa=Shop@YBL&pn=Shop").pa, "shop@ybl");
    assert.equal(parseUpiPayload("upi://pay?pa=a@ybl&sign=x").signed, true);
  });

  it("refuses a QR that pays a different account from the typed UPI ID", () => {
    const fn = fnBody(accountService, "validateAccount");
    assert.match(fn, /parsed\.pa !== clean\.vpa/);
  });

  it("derives a short, stable pay reference from the bill id", () => {
    assert.equal(makePayRef("65f1c2a9e4b0a1b2c34f2a9c"), "BX-4F2A9C");
  });
});

describe("only the bill's sender may confirm its payment", () => {
  const fn = fnBody(billService, "confirmBillByStaff");

  it("exposes a staff confirm path", () => {
    assert.match(billService, /export const confirmBillByStaff/);
  });

  it("checks the hotel BEFORE the ownership rule", () => {
    const hotelCheck = fn.indexOf("Bill not found");
    const ownerCheck = fn.indexOf("Only the staff member who sent this bill");
    assert.ok(hotelCheck > -1 && ownerCheck > -1, "both checks must exist");
    assert.ok(hotelCheck < ownerCheck, "ownership is checked before the tenant boundary");
  });

  it("has no admin exception", () => {
    // The client's rule: not a colleague, not the manager. An isAdmin escape
    // hatch here would quietly undo it.
    assert.doesNotMatch(fn, /isAdmin/);
    assert.match(fn, /String\(existing\.staffId\) !== String\(staffId\)/);
  });

  it("repeats the sender and the amount in the claim itself", () => {
    // The pre-checks can be raced; the claim's filter is the real guard.
    assert.match(fn, /match: \{\s*hotelId,\s*staffId,/);
    assert.match(fn, /payablePaise: expected/);
  });

  it("takes the confirmer from the token, never the body", () => {
    const handler = fnBody(hotelController, "confirmBill");
    assert.match(handler, /staffId: req\.user\._id/);
  });

  it("is routed, with the amount validated", () => {
    assert.match(hotelRoutes, /"\/bills\/:billId\/confirm",\s*objectIdParam\("billId"\),\s*confirmBillRules/);
  });
});

describe("the guest cannot settle a bill with money left on it", () => {
  const fn = fnBody(billService, "markBillPaid");

  it("refuses when anything is payable", () => {
    assert.match(fn, /!trusted && existing\.payablePaise > 0/);
  });

  it("repeats payablePaise: 0 in the claim, against a coins change mid-call", () => {
    assert.match(fn, /!trusted && \{ payablePaise: 0 \}/);
  });

  it("no longer opens a gateway order for a bill", () => {
    assert.doesNotMatch(billService, /getPaymentProvider\(/);
  });
});

describe("coin holds are released or spent on every exit", () => {
  it("the shared close path zeroes the hold and gives the coins back in one transaction", () => {
    const fn = fnBody(billService, "closeBill");
    assert.match(fn, /withTransaction/);
    assert.match(fn, /coinsReserved: 0/);
    assert.match(fn, /reservedCoins: -before\.coinsReserved/);
    // The pre-flip copy is the only one that knows what was held.
    assert.match(fn, /new: false/);
  });

  it("guest cancel and staff cancel both go through it", () => {
    assert.match(fnBody(billService, "cancelBill"), /closeBill\(/);
    assert.match(fnBody(billService, "cancelBillByStaff"), /closeBill\(/);
  });

  it("the expiry sweep releases holding bills through it, and skips them in the bulk flip", () => {
    const fn = fnBody(billService, "expireStaleBills");
    assert.match(fn, /closeBill\(/);
    assert.match(fn, /coinsReserved: heldFilter\(0\)/);
  });

  it("settling spends the hold in the same update as the debit", () => {
    const fn = fnBody(billService, "settleBill");
    assert.match(fn, /reservedCoins: -held/);
    assert.match(fn, /coinsReserved: 0/);
  });

  it("starting a payment adjusts the hold by the difference, guarded on what is spendable", () => {
    const fn = fnBody(billService, "startBillPayment");
    assert.match(fn, /const delta = coinsApplied - held/);
    assert.match(fn, /\$inc: \{ reservedCoins: delta \}/);
    assert.match(fn, /\$subtract: \["\$balance"/);
  });
});

describe("what a UPI bill is stamped with", () => {
  const fn = fnBody(billService, "createBill");

  it("waives the platform commission", () => {
    assert.match(fn, /platformFeePercent: 0,/);
  });

  it("is never marked demo — it is real money whatever the provider mode", () => {
    assert.match(fn, /isDemo: false,/);
  });

  it("refuses to send a bill with nowhere to pay it", () => {
    assert.match(fn, /resolvePaymentAccount\(hotel, paymentAccountId\)/);
    assert.match(fn, /no UPI account/);
  });
});

describe("payment-account writes are manager-only", () => {
  it("lets staff read the list but guards every write with adminOnly", () => {
    assert.match(hotelRoutes, /router\.get\("\/payment-accounts", hotelController\.listPaymentAccounts\)/);
    for (const route of [
      /router\.post\("\/payment-accounts\/qr-upload", adminOnly/,
      /"\/payment-accounts",\s*adminOnly/,
      /router\.patch\(\s*"\/payment-accounts\/:accountId",\s*adminOnly/,
      /router\.delete\(\s*"\/payment-accounts\/:accountId",\s*adminOnly/,
      /"\/payment-accounts\/:accountId\/default",\s*adminOnly/,
    ]) {
      assert.match(hotelRoutes, route);
    }
  });

  it("announces every kind of change", () => {
    for (const action of ["created", "updated", "deleted", "default"]) {
      assert.match(accountService, new RegExp(`action: "${action}"`), action);
    }
  });
});

describe("the bill history pane refreshes itself", () => {
  const billHistory = read("../../frontend/src/features/panel/BillHistory.jsx");
  const billRealtime = read("../../frontend/src/hooks/useBillRealtime.js");

  it("subscribes to every event that moves a bill into history", () => {
    const hook = fnBody(billRealtime, "useHotelBillSettled");
    for (const event of ["bill:paid", "bill:cancelled", "bill:expired", "connect"]) {
      assert.ok(hook.includes(`"${event}"`), `history ignores ${event}, so it stays stale until a reload`);
    }
  });

  it("is actually CALLED by the history pane", () => {
    // The bug in one assertion: the list loaded once and nothing ever told it
    // to load again. Comments stripped, so a commented-out call cannot pass.
    const code = billHistory.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(code, /import \{[^}]*useHotelBillSettled/s, "hook not imported");
    assert.match(code, /^\s*useHotelBillSettled\(/m, "hook imported but never called");
  });

  it("does not toast, so a payment is not announced twice on the bill page", () => {
    assert.doesNotMatch(fnBody(billRealtime, "useHotelBillSettled"), /toast/);
  });
});

describe("the guest picks which UPI app opens", () => {
  // A bare upi:// link opened WhatsApp: every UPI app claims the scheme, and
  // iOS (or an Android "Always") picks one without asking.
  const { link } = buildUpiLink({
    vpa: "frontdesk@okhdfc",
    payeeName: "Taj Palace",
    amountPaise: 118000,
    payRef: "BX-4F2A9C",
  });
  const payment = [...params(link)].join("&");
  const byId = Object.fromEntries(UPI_APPS.map((app) => [app.id, app]));

  it("offers Google Pay, PhonePe and Paytm, each pinned to a different app", () => {
    assert.deepEqual(Object.keys(byId), ["gpay", "phonepe", "paytm"]);
    assert.equal(byId.gpay.android, "com.google.android.apps.nbu.paisa.user");
    assert.equal(byId.phonepe.android, "com.phonepe.app");
    assert.equal(byId.paytm.android, "net.one97.paytm");
  });

  it("on Android, names the app's package so no other app can take the link", () => {
    for (const app of UPI_APPS) {
      const href = upiAppLink(app, link, "android");
      assert.ok(href.startsWith("intent://pay?"), app.id);
      assert.ok(href.endsWith(`#Intent;scheme=upi;package=${app.android};end`), app.id);
      const query = href.slice("intent://pay?".length, href.indexOf("#Intent"));
      assert.equal([...new URLSearchParams(query)].join("&"), payment, `${app.id} changed the payment`);
    }
  });

  it("on iPhone, uses each app's own scheme, never upi://", () => {
    assert.ok(upiAppLink(byId.gpay, link, "ios").startsWith("tez://upi/pay?"));
    assert.ok(upiAppLink(byId.phonepe, link, "ios").startsWith("phonepe://pay?"));
    assert.ok(upiAppLink(byId.paytm, link, "ios").startsWith("paytmmp://upi/pay?"));
    for (const app of UPI_APPS) {
      assert.equal([...params(upiAppLink(app, link, "ios"))].join("&"), payment, `${app.id} changed the payment`);
    }
  });

  it("builds nothing from a link that is not upi://pay, or on a laptop", () => {
    assert.equal(upiAppLink(byId.gpay, "https://example.com/?pa=x@y", "android"), null);
    assert.equal(upiAppLink(byId.gpay, null, "ios"), null);
    assert.equal(upiAppLink(byId.gpay, link, null), null);
  });

  it("tells Android, iPhone and an iPad on the desktop site apart from a laptop", () => {
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15";
    assert.equal(mobilePlatform({ userAgent: android }), "android");
    assert.equal(mobilePlatform({ userAgent: iphone }), "ios");
    assert.equal(mobilePlatform({ userAgent: mac, maxTouchPoints: 5 }), "ios");
    assert.equal(mobilePlatform({ userAgent: mac, maxTouchPoints: 0 }), null);
    assert.equal(mobilePlatform(undefined), null);
  });

  it("is what the pay sheet actually renders", () => {
    const sheet = read("../../frontend/src/features/guest/UpiPaySheet.jsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.match(sheet, /import \{[^}]*upiAppLink[^}]*\} from "..\/..\/utils\/upiApps.js"/);
    assert.match(sheet, /upiAppLink\(app, upi\.link, platform\)/, "app links built but not rendered");
    assert.doesNotMatch(sheet, /Pay with UPI app/, "the single bare-link button is back");
  });
});
