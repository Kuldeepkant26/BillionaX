import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { Hotel } from "../models/hotel.model.js";
import { getPaymentProvider } from "../payments/index.js";

/**
 * Hotel onboarding: KYC, bank verification, and the Route linked account.
 *
 * The rule the whole file exists to enforce: NOTHING an admin typed reaches the
 * payout record. A bank account is verified by a reverse penny drop, and the
 * values that get stored are the ones the bank returned. A transposed digit in
 * an IFSC is invisible until money lands in a stranger's account, and by then
 * it is somebody else's money and not easily recovered.
 */

/**
 * How close two business names are, 0 to 1.
 *
 * Token-based rather than character-based: banks return names in a different
 * word order and with different suffixes ("Taj Hotels Private Limited" vs "TAJ
 * HOTELS PVT LTD"), which a character-distance measure scores terribly and a
 * human would call an obvious match. Common company suffixes are dropped for
 * the same reason.
 */
const NOISE = new Set([
  "pvt", "private", "ltd", "limited", "llp", "inc", "co", "company",
  "the", "and", "hotels", "hotel", "resorts", "resort",
]);

const tokenise = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));

export const nameMatchScore = (typed, returned) => {
  const a = tokenise(typed);
  const b = tokenise(returned);

  if (!a.length || !b.length) return 0;

  const setB = new Set(b);
  const hits = a.filter((token) => setB.has(token)).length;

  // Against the shorter list, so "Taj Hotels" vs "Taj Hotels Delhi Property"
  // scores as the match a human would call it.
  return hits / Math.min(a.length, b.length);
};

/** Below this, activation is blocked and an admin must look at it. */
export const NAME_MATCH_THRESHOLD = 0.6;

/**
 * Starts a reverse penny drop.
 *
 * The hotel owner pays ₹1 from their own UPI app, which proves they control the
 * account in a way that submitting its number does not. It is auto-refunded.
 */
export const startBankVerification = async ({ hotelId, ifsc, accountNumber, beneficiaryName }) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const provider = getPaymentProvider();
  const result = await provider.initiateBankVerification({
    linkedAccountId: hotel.razorpayLinkedAccountId,
    ifsc,
    accountNumber,
    beneficiaryName,
  });

  hotel.bank = {
    ...(hotel.bank?.toObject?.() ?? hotel.bank ?? {}),
    verificationId: result.verificationId,
  };
  await hotel.save();

  logger.info(`Bank verification ${result.verificationId} started for hotel ${hotelId}`);

  // A live penny drop returns PENDING and the QR the owner scans; the demo
  // provider returns VERIFIED immediately, so this path completes either way.
  if (result.status === "VERIFIED") {
    return finishBankVerification({ hotelId, result });
  }

  return {
    status: result.status,
    verificationId: result.verificationId,
    upiLink: result.upiLink || null,
  };
};

/**
 * Records a completed penny drop.
 *
 * A "completed" check does NOT mean a valid account — it means the check
 * finished. The result fields are what matter: a null registered_name or a
 * non-active account is a failure wearing a success's status code.
 */
export const finishBankVerification = async ({ hotelId, result }) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const verified = result?.verified;

  if (!verified || !verified.registeredName || !verified.accountStatus) {
    hotel.linkedAccountStatus = "failed";
    hotel.linkedAccountNote = "The bank did not confirm this account.";
    await hotel.save();
    throw new ApiError(400, "That account could not be verified. Check the details and retry.");
  }

  if (verified.accountStatus !== "active") {
    hotel.linkedAccountStatus = "failed";
    hotel.linkedAccountNote = `The bank reports this account as "${verified.accountStatus}".`;
    await hotel.save();
    throw new ApiError(400, `That account is ${verified.accountStatus}, not active.`);
  }

  const claimed = hotel.business?.legalName || verified.beneficiaryName;
  const score =
    typeof verified.nameMatchScore === "number"
      ? verified.nameMatchScore
      : nameMatchScore(claimed, verified.registeredName);

  // STORE WHAT THE BANK SAID, not what was typed.
  hotel.bank = {
    accountNumber: verified.accountNumber,
    ifsc: verified.ifsc,
    beneficiaryName: verified.registeredName,
    registeredName: verified.registeredName,
    bankName: verified.bankName,
    accountStatus: verified.accountStatus,
    nameMatchScore: score,
    verifiedAt: new Date(),
    verificationId: result.verificationId,
  };

  if (score < NAME_MATCH_THRESHOLD) {
    // Not an error: a legitimate hotel can trade under a name its bank does not
    // hold. It just cannot be activated automatically.
    hotel.linkedAccountStatus = "needs_clarification";
    hotel.linkedAccountNote =
      `The account is held by "${verified.registeredName}", which does not match ` +
      `"${claimed}". Confirm this is the right account before activating.`;
    await hotel.save();

    logger.warn(`Name mismatch for hotel ${hotelId}: ${score.toFixed(2)}`);

    return {
      status: "needs_clarification",
      nameMatchScore: score,
      registeredName: verified.registeredName,
      claimedName: claimed,
      note: hotel.linkedAccountNote,
    };
  }

  hotel.linkedAccountStatus = "pending";
  hotel.linkedAccountNote = null;
  await hotel.save();

  logger.info(`Bank verified for hotel ${hotelId} (name match ${score.toFixed(2)})`);
  return { status: "verified", nameMatchScore: score, bank: hotel.bank };
};

/**
 * Creates the Route linked account, using the VERIFIED bank details.
 *
 * Refuses to run before verification: an account created from typed details is
 * exactly the failure the penny drop exists to prevent.
 */
export const createLinkedAccount = async ({ hotelId, force = false }) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  if (!hotel.bank?.verifiedAt) {
    throw new ApiError(400, "Verify the bank account before creating a payout account");
  }

  if (hotel.linkedAccountStatus === "needs_clarification" && !force) {
    throw new ApiError(
      400,
      "The account holder's name does not match this business. Review it, then confirm to override."
    );
  }

  if (!hotel.business?.legalName || !hotel.business?.pan) {
    throw new ApiError(400, "Business name and PAN are required before onboarding");
  }

  if (!hotel.agreement?.acceptedAt) {
    throw new ApiError(400, "The platform terms must be accepted first");
  }

  const provider = getPaymentProvider();

  const result = await provider.createLinkedAccount({
    hotelId: String(hotel._id),
    name: hotel.business.legalName,
    email: hotel.stakeholder?.email || hotel.email,
    phone: hotel.stakeholder?.phone || hotel.phone,
    businessType: hotel.business.type,
    // The bank's values, never the typed ones.
    ifsc: hotel.bank.ifsc,
    accountNumber: hotel.bank.accountNumber,
    beneficiaryName: hotel.bank.beneficiaryName,
  });

  hotel.razorpayLinkedAccountId = result.linkedAccountId;
  hotel.linkedAccountStatus = result.status;
  hotel.linkedAccountNote = null;
  await hotel.save();

  logger.info(`Linked account ${result.linkedAccountId} for hotel ${hotelId}: ${result.status}`);

  return {
    linkedAccountId: result.linkedAccountId,
    status: result.status,
  };
};

/** Saves the KYC form. Bank details here are candidates, not payout details. */
export const saveOnboarding = async ({ hotelId, business, stakeholder, agreement, userId, ip }) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  if (business) hotel.business = { ...(hotel.business?.toObject?.() ?? {}), ...business };
  if (stakeholder) {
    hotel.stakeholder = { ...(hotel.stakeholder?.toObject?.() ?? {}), ...stakeholder };
  }

  // Stamped server-side: an acceptance record whose timestamp came from the
  // client is worth nothing.
  if (agreement?.accepted && !hotel.agreement?.acceptedAt) {
    hotel.agreement = { acceptedAt: new Date(), acceptedIp: ip, acceptedBy: userId };
  }

  await hotel.save();
  return hotel;
};

/** Whether this hotel may accept payments right now. */
export const canAcceptPayments = (hotel) => hotel?.linkedAccountStatus === "activated";
