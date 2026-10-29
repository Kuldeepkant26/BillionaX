import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { ROLES } from "../config/constants.js";
import { isValidVpa, normalizeVpa, parseUpiPayload } from "../utils/upi.util.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { destroyAsset, isOwnCloudinaryUrl, publicIdFromUrl } from "./upload.service.js";
import { emailEnabled, sendEmail } from "./email.service.js";
import { paymentAccountChangedEmailTemplate } from "./emailTemplates.js";

/**
 * The UPI accounts a hotel takes bill payments into.
 *
 * Guests pay these DIRECTLY — the platform never holds the money — so the rule
 * this file exists for is that changing where money goes is never quiet:
 *
 *  - writes are manager-only (the routes are adminOnly; staff can only list);
 *  - every write is logged with who made it, and emailed to every manager of
 *    the hotel, so a swapped UPI ID is noticed while it can still be undone;
 *  - a QR whose decoded payee disagrees with the typed UPI ID is refused —
 *    the guest would scan one and the hotel would check the other.
 *
 * Accounts live on the Hotel document (select: false) and every write is a
 * single atomic update on it, so two managers editing at once cannot leave
 * the hotel with two defaults or eleven accounts.
 */

export const MAX_PAYMENT_ACCOUNTS = 10;

const WITH_ACCOUNTS = "name email +paymentAccounts";

/** Public shape. The decoded payload stays server-side; the browser needs only whether it can carry an amount. */
export const shapeAccount = (account) => ({
  id: String(account._id),
  label: account.label,
  vpa: account.vpa,
  payeeName: account.payeeName || null,
  qrImageUrl: account.qrImageUrl || null,
  hasQrPayload: Boolean(account.qrPayload),
  amountLocked: !parseUpiPayload(account.qrPayload)?.signed,
  isDefault: Boolean(account.isDefault),
  createdAt: account.createdAt || account._id?.getTimestamp?.() || null,
  updatedAt: account.updatedAt || null,
});

/**
 * Default first, then oldest — the order the composer's dropdown wants.
 * Oldest by `_id`, which is time-ordered and always present, rather than by a
 * subdocument timestamp an atomic $push may not have written.
 */
const ordered = (accounts = []) =>
  [...accounts].sort(
    (a, b) =>
      Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) ||
      String(a._id).localeCompare(String(b._id))
  );

/**
 * The account a bill should be paid into: the one asked for if it still
 * exists, else the hotel's default, else null.
 *
 * Takes a hotel already loaded with +paymentAccounts, so callers that read the
 * hotel anyway pay no extra round trip.
 */
export const resolvePaymentAccount = (hotel, accountId) => {
  const accounts = hotel?.paymentAccounts || [];
  if (!accounts.length) return null;

  if (accountId) {
    const chosen = accounts.find((a) => String(a._id) === String(accountId));
    if (chosen) return chosen;
  }

  return accounts.find((a) => a.isDefault) || ordered(accounts)[0];
};

const loadHotel = async (hotelId) => {
  const hotel = await Hotel.findById(hotelId).select(WITH_ACCOUNTS).lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");
  return hotel;
};

export const listPaymentAccounts = async ({ hotelId }) => {
  const hotel = await loadHotel(hotelId);
  return { items: ordered(hotel.paymentAccounts).map(shapeAccount) };
};

/**
 * Checks a full candidate account — the merged result on an edit, not just the
 * fields sent — because the dangerous case is a COMBINATION: a new UPI ID next
 * to an old QR that still pays the previous one.
 */
const validateAccount = ({ label, vpa, payeeName, qrImageUrl, qrPayload }) => {
  const clean = {
    label: String(label ?? "").trim(),
    vpa: normalizeVpa(vpa),
    payeeName: String(payeeName ?? "").trim() || null,
    qrImageUrl: qrImageUrl || null,
    qrPayload: String(qrPayload ?? "").trim() || null,
  };

  if (!clean.label) throw new ApiError(400, "Give the account a name, such as Front desk");
  if (!isValidVpa(clean.vpa)) {
    throw new ApiError(400, "That is not a valid UPI ID", [
      { field: "vpa", message: "A UPI ID looks like name@bank" },
    ]);
  }

  if (clean.qrImageUrl && !isOwnCloudinaryUrl(clean.qrImageUrl)) {
    throw new ApiError(400, "That image could not be verified", [
      { field: "qrImageUrl", message: "Unrecognised image source" },
    ]);
  }

  if (clean.qrPayload) {
    const parsed = parseUpiPayload(clean.qrPayload);
    if (!parsed) {
      throw new ApiError(400, "That QR is not a UPI payment code", [
        { field: "qrPayload", message: "Upload the QR your UPI app shows for receiving money" },
      ]);
    }
    if (parsed.pa !== clean.vpa) {
      throw new ApiError(400, `The QR you uploaded pays ${parsed.pa}, not ${clean.vpa}`, [
        { field: "qrPayload", message: "The QR and the UPI ID must be the same account" },
      ]);
    }
    clean.payeeName = clean.payeeName || parsed.pn;
  }

  // A QR image with no payload is allowed — not every QR decodes in the
  // browser — but a payload with no image is not something we can show.
  if (clean.qrPayload && !clean.qrImageUrl) clean.qrPayload = null;

  return clean;
};

/** Best-effort, like every other asset removal: an orphan beats a failed save. */
const removeQr = (url) => {
  const publicId = publicIdFromUrl(url);
  if (publicId) destroyAsset(publicId, "image").catch(() => {});
};

/**
 * Makes the oldest account the default when none is. Atomic on its own: the
 * filter only matches a hotel with accounts and no default, so two concurrent
 * callers cannot both promote.
 */
const ensureDefault = async (hotelId) => {
  const hotel = await Hotel.findById(hotelId).select("+paymentAccounts").lean();
  const accounts = hotel?.paymentAccounts || [];
  if (!accounts.length || accounts.some((a) => a.isDefault)) return;

  const [oldest] = [...accounts].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  await Hotel.updateOne(
    { _id: hotelId, "paymentAccounts.isDefault": { $ne: true } },
    { $set: { "paymentAccounts.$[a].isDefault": true } },
    { arrayFilters: [{ "a._id": oldest._id }] }
  );
};

/* ------------------------------------------------------------ the alert -- */

const ACTION_LABELS = {
  created: "A payment account was added",
  updated: "A payment account was changed",
  deleted: "A payment account was removed",
  default: "The default payment account changed",
};

/**
 * Logs the change and emails the hotel's managers.
 *
 * Never awaited by the request and never throws: the change has already been
 * written, and a mail outage must not turn a saved edit into an error the
 * manager retries.
 */
const announceChange = ({ hotel, actor, action, before, after }) => {
  const actorName = actor?.name || "A manager";
  logger.info(
    `Payment account ${action} at hotel ${hotel._id} by ${actor?._id}: ` +
      `${before?.vpa || "—"} → ${after?.vpa || "—"}`
  );

  if (!emailEnabled()) return;

  (async () => {
    const managers = await User.find({
      hotelId: hotel._id,
      role: ROLES.HOTEL_ADMIN,
      isActive: true,
      email: { $type: "string" },
    })
      .select("email")
      .lean();

    const to = [...new Set([hotel.email, ...managers.map((m) => m.email)].filter(Boolean))];
    if (!to.length) return;

    const rows = [
      ["Account", before?.label, after?.label],
      ["UPI ID", before?.vpa, after?.vpa],
      ["Payee name", before?.payeeName, after?.payeeName],
      ["Default", before ? (before.isDefault ? "Yes" : "No") : null, after ? (after.isDefault ? "Yes" : "No") : null],
    ].filter(([, b, a]) => (b ?? "") !== (a ?? "") || action !== "updated");

    const { text, html } = paymentAccountChangedEmailTemplate({
      hotelName: hotel.name,
      actionLabel: ACTION_LABELS[action],
      actorName,
      whenLabel: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      rows,
    });

    await Promise.all(
      to.map((address) =>
        sendEmail({ to: address, subject: `${ACTION_LABELS[action]} — ${hotel.name}`, html, text })
      )
    );
  })().catch((err) => logger.error(`Payment account alert failed for hotel ${hotel._id}: ${err.message}`));
};

/* --------------------------------------------------------------- writes -- */

/** `notify: false` is for seed scripts only — demo hotels have made-up addresses. */
export const createPaymentAccount = async ({ hotelId, actor, input, notify = true }) => {
  const clean = validateAccount(input);
  const _id = new mongoose.Types.ObjectId();

  // The cap is in the filter, so it holds under concurrent adds.
  const res = await Hotel.updateOne(
    { _id: hotelId, [`paymentAccounts.${MAX_PAYMENT_ACCOUNTS - 1}`]: { $exists: false } },
    {
      $push: {
        paymentAccounts: { _id, ...clean, isDefault: false, createdBy: actor?._id, updatedBy: actor?._id },
      },
    }
  );

  if (!res.matchedCount) {
    await loadHotel(hotelId);
    throw new ApiError(400, `A hotel can have at most ${MAX_PAYMENT_ACCOUNTS} payment accounts`);
  }

  await ensureDefault(hotelId);

  const hotel = await loadHotel(hotelId);
  const account = hotel.paymentAccounts.find((a) => String(a._id) === String(_id));
  if (notify) announceChange({ hotel, actor, action: "created", before: null, after: account });

  return shapeAccount(account);
};

export const updatePaymentAccount = async ({ hotelId, accountId, actor, input }) => {
  const hotel = await loadHotel(hotelId);
  const before = hotel.paymentAccounts.find((a) => String(a._id) === String(accountId));
  if (!before) throw new ApiError(404, "Payment account not found");

  // Uploading a new QR replaces the payload with it; removing the image
  // (qrImageUrl: null) drops the payload too.
  const replacingQr = input.qrImageUrl !== undefined;
  const clean = validateAccount({
    label: input.label ?? before.label,
    vpa: input.vpa ?? before.vpa,
    payeeName: input.payeeName !== undefined ? input.payeeName : before.payeeName,
    qrImageUrl: replacingQr ? input.qrImageUrl : before.qrImageUrl,
    qrPayload: replacingQr ? input.qrPayload : before.qrPayload,
  });

  const set = Object.fromEntries(
    Object.entries({ ...clean, updatedBy: actor?._id, updatedAt: new Date() }).map(([k, v]) => [
      `paymentAccounts.$.${k}`,
      v,
    ])
  );

  const res = await Hotel.updateOne({ _id: hotelId, "paymentAccounts._id": before._id }, { $set: set });
  if (!res.matchedCount) throw new ApiError(404, "Payment account not found");

  if (before.qrImageUrl && publicIdFromUrl(before.qrImageUrl) !== publicIdFromUrl(clean.qrImageUrl)) {
    removeQr(before.qrImageUrl);
  }

  const after = { ...before, ...clean };
  announceChange({ hotel, actor, action: "updated", before, after });

  return shapeAccount(after);
};

/**
 * Removes an account. A bill already sent to it falls back to the default the
 * next time its guest opens the payment details — see resolvePaymentAccount.
 */
export const deletePaymentAccount = async ({ hotelId, accountId, actor }) => {
  const hotel = await loadHotel(hotelId);
  const before = hotel.paymentAccounts.find((a) => String(a._id) === String(accountId));
  if (!before) throw new ApiError(404, "Payment account not found");

  await Hotel.updateOne({ _id: hotelId }, { $pull: { paymentAccounts: { _id: before._id } } });
  await ensureDefault(hotelId);

  removeQr(before.qrImageUrl);
  announceChange({ hotel, actor, action: "deleted", before, after: null });

  return { id: String(before._id), deleted: true };
};

/** One update that clears every other default and sets this one — never two defaults, even briefly. */
export const setDefaultPaymentAccount = async ({ hotelId, accountId, actor }) => {
  const hotel = await loadHotel(hotelId);
  const target = hotel.paymentAccounts.find((a) => String(a._id) === String(accountId));
  if (!target) throw new ApiError(404, "Payment account not found");
  if (target.isDefault) return shapeAccount(target);

  await Hotel.updateOne(
    { _id: hotelId, "paymentAccounts._id": target._id },
    {
      $set: {
        "paymentAccounts.$[other].isDefault": false,
        "paymentAccounts.$[target].isDefault": true,
      },
    },
    { arrayFilters: [{ "other._id": { $ne: target._id } }, { "target._id": target._id }] }
  );

  const previous = hotel.paymentAccounts.find((a) => a.isDefault);
  announceChange({
    hotel,
    actor,
    action: "default",
    before: previous ? { ...previous } : null,
    after: { ...target, isDefault: true },
  });

  return shapeAccount({ ...target, isDefault: true });
};
