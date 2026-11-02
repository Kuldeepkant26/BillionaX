/**
 * Links that open ONE named UPI app, instead of whichever app the phone hands
 * a plain upi:// link to.
 *
 * Every UPI app claims upi://pay, WhatsApp included. On an iPhone, iOS picks
 * one of them itself and never asks; on Android, a guest who once tapped
 * "Always" gets that app every time. Either way the guest wanted Google Pay
 * and landed in WhatsApp.
 *
 * So each app gets its own link carrying the same payee, amount and note:
 *  - Android: a Chrome intent:// URL naming the app's package, so no other
 *    app can take it. When the app is missing, Chrome opens its Play Store
 *    page rather than doing nothing.
 *  - iPhone: the app's own URL scheme, in the formats Razorpay documents for
 *    UPI intent on iOS.
 *
 * Pure, with no browser imports, so the backend tests can import it.
 */
export const UPI_APPS = [
  {
    id: "gpay",
    name: "Google Pay",
    android: "com.google.android.apps.nbu.paisa.user",
    ios: "tez://upi/pay?",
  },
  { id: "phonepe", name: "PhonePe", android: "com.phonepe.app", ios: "phonepe://pay?" },
  { id: "paytm", name: "Paytm", android: "net.one97.paytm", ios: "paytmmp://upi/pay?" },
];

/** "android", "ios", or null on a laptop, where no UPI link opens anything. */
export const mobilePlatform = (nav = globalThis.navigator) => {
  const ua = nav?.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS asks for desktop sites, so an iPad reports itself as a Mac.
  if (/Macintosh/i.test(ua) && nav?.maxTouchPoints > 1) return "ios";
  return null;
};

/** The link that opens `app` with the payment in `upiLink`, or null. */
export const upiAppLink = (app, upiLink, platform) => {
  if (typeof upiLink !== "string" || !upiLink.startsWith("upi://pay?")) return null;
  const query = upiLink.slice("upi://pay?".length);
  if (platform === "android") {
    return `intent://pay?${query}#Intent;scheme=upi;package=${app.android};end`;
  }
  if (platform === "ios") return `${app.ios}${query}`;
  return null;
};
