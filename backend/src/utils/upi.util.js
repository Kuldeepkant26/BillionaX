/**
 * UPI payment links — the `upi://pay?...` string a QR encodes and a phone's
 * UPI app opens.
 *
 * Pure functions, no I/O, so the link a guest is shown can be pinned in tests.
 *
 * The parameters that matter (NPCI's UPI linking spec):
 *   pa  payee address (the VPA)      pn  payee name
 *   am  amount, rupees, 2 decimals   cu  currency, always INR
 *   tn  transaction note — shown to both sides, and where our bill ref goes
 *
 * `tr` is deliberately NOT set. It is meant for merchant-generated references,
 * and putting one on a payment to a personal VPA is a known way to have some
 * apps decline it. A merchant QR that already carries its own `tr` keeps it.
 */

const VPA_RX = /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,63}$/i;

export const normalizeVpa = (value) => String(value ?? "").trim().toLowerCase();

export const isValidVpa = (value) => VPA_RX.test(normalizeVpa(value));

/**
 * Reads a decoded QR string. Null unless it is a UPI pay link naming a payee.
 *
 * `signed` marks a payload carrying `sign=`: some PSPs sign their merchant QRs,
 * and changing any parameter of a signed payload makes the payer's app reject
 * it. Those are shown exactly as uploaded.
 */
export const parseUpiPayload = (payload) => {
  const raw = String(payload ?? "").trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;

  const params = new URLSearchParams(raw.slice(raw.indexOf("?") + 1));
  const pa = params.get("pa");
  if (!pa) return null;

  return {
    params,
    pa: normalizeVpa(pa),
    pn: params.get("pn")?.trim() || null,
    signed: params.has("sign"),
  };
};

/** Paise are integers, so this is exact: 118000 → "1180.00". */
export const formatUpiAmount = (amountPaise) =>
  (Math.max(0, Math.trunc(Number(amountPaise) || 0)) / 100).toFixed(2);

/**
 * Percent-encodes a value but leaves `@` alone. Every app decodes `%40`
 * correctly in theory; a few older ones fail to match the VPA in practice.
 */
const encode = (value) => encodeURIComponent(value).replace(/%40/g, "@");

const serialize = (params) =>
  `upi://pay?${[...params].map(([k, v]) => `${k}=${encode(v)}`).join("&")}`;

/**
 * The short reference that rides in the payment's note: BX-4F2A9C.
 *
 * The tail of the ObjectId is its per-process counter, so consecutive bills get
 * distinct refs; six hex digits keep it short enough to read off a phone.
 */
export const makePayRef = (billId) => `BX-${String(billId).slice(-6).toUpperCase()}`;

/**
 * The link for one bill: this account, this amount, this reference.
 *
 * Starts from the hotel's own QR parameters when it uploaded one for this same
 * VPA, so merchant fields (mc, mode, orgid, …) survive — a merchant VPA paid
 * with its merchant code is the case UPI apps are least likely to refuse.
 *
 * Returns `amountLocked: false` for a signed QR. That link cannot carry the
 * amount, so the guest is shown the hotel's QR image and the amount to type.
 */
export const buildUpiLink = ({ vpa, payeeName, qrPayload, amountPaise, payRef }) => {
  const parsed = parseUpiPayload(qrPayload);
  const payee = normalizeVpa(vpa);

  if (parsed?.signed && parsed.pa === payee) {
    return { link: String(qrPayload).trim(), amountLocked: false };
  }

  const params = parsed && parsed.pa === payee ? parsed.params : new URLSearchParams();

  params.set("pa", payee);
  const name = String(payeeName ?? "").trim() || parsed?.pn;
  if (name) params.set("pn", name);
  params.set("am", formatUpiAmount(amountPaise));
  params.set("cu", "INR");
  if (payRef) params.set("tn", payRef);

  return { link: serialize(params), amountLocked: true };
};
