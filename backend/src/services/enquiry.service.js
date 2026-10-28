import { PartnerEnquiry } from "../models/partnerEnquiry.model.js";
import { User } from "../models/user.model.js";
import { ENQUIRY_STATUS, ROLES } from "../config/constants.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { emailEnabled, sendEmail } from "./email.service.js";
import { partnerEnquiryEmailTemplate } from "./emailTemplates.js";

const ROOM_LABELS = {
  "1-25": "Up to 25 rooms",
  "26-75": "26–75 rooms",
  "76-150": "76–150 rooms",
  "150+": "More than 150 rooms",
};

/** ENQUIRY_EMAIL_TO as a clean, de-duplicated list of addresses. */
export const parseRecipients = (raw = "") => [
  ...new Set(
    String(raw)
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
  ),
];

/**
 * Who hears about a new enquiry: the configured list, or — when none is set —
 * every active main admin, so a deployment that never set the variable still
 * gets its leads rather than silently dropping them.
 */
const enquiryRecipients = async () => {
  const configured = parseRecipients(env.email.enquiryTo);
  if (configured.length) return configured;

  const admins = await User.find({ role: ROLES.MAIN_ADMIN, isActive: true }).select("email").lean();
  return parseRecipients(admins.map((a) => a.email).join(","));
};

/**
 * Emails the team about a saved enquiry.
 *
 * Called AFTER the row is saved and never awaited by the request: the enquiry
 * is already safe in the inbox, so a slow or failing mail provider must not
 * hold up — or fail — the hotel's submission. Reply-To is the hotel's
 * address, so answering the email answers them.
 */
export const notifyEnquiry = async (enquiry) => {
  if (!emailEnabled()) return;

  const recipients = await enquiryRecipients();
  if (!recipients.length) {
    logger.warn("[ENQUIRY] no recipient to email — set ENQUIRY_EMAIL_TO");
    return;
  }

  const { text, html } = partnerEnquiryEmailTemplate({
    name: enquiry.name,
    hotelName: enquiry.hotelName,
    email: enquiry.email,
    phone: enquiry.phone,
    city: enquiry.city,
    roomsLabel: ROOM_LABELS[enquiry.rooms] || null,
    message: enquiry.message,
    receivedLabel: new Date(enquiry.createdAt || Date.now()).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }),
    inboxUrl: `${env.clientUrl.replace(/\/$/, "")}/admin/enquiries`,
  });

  // Saved rows are already one line (createEnquiry); collapsed again here so
  // the subject header is safe whatever row this is handed.
  const subject = `New hotel enquiry: ${oneLine(enquiry.hotelName)}, ${oneLine(enquiry.city)}`;

  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendEmail({ to, subject, html, text, replyTo: { email: enquiry.email, name: oneLine(enquiry.name) } })
    )
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.error(`[ENQUIRY] email to ${recipients[i]} failed: ${r.reason?.message || r.reason}`);
    }
  });
};

/** One line, for the fields a form gives a single-line input — see below. */
const oneLine = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Saves a partnership enquiry from the landing page.
 *
 * The single-line fields are collapsed to one line: the form cannot send a
 * newline in them, but a direct API call can, and these values go on to an
 * email subject and an inbox row. Only the message keeps its line breaks.
 */
export const createEnquiry = async ({ name, hotelName, email, phone, city, rooms, message }) => {
  const enquiry = await PartnerEnquiry.create({
    name: oneLine(name),
    hotelName: oneLine(hotelName),
    email,
    phone: oneLine(phone),
    city: oneLine(city),
    rooms: rooms || null,
    message: message || "",
  });
  return enquiry;
};

export const listEnquiries = async ({ status, page = 1, limit = 25 } = {}) => {
  const filter = status ? { status } : {};
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    PartnerEnquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("statusChangedBy", "name")
      .lean(),
    PartnerEnquiry.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

/** What the admin nav badge counts: enquiries nobody has picked up yet. */
export const countNewEnquiries = () =>
  PartnerEnquiry.countDocuments({ status: ENQUIRY_STATUS.NEW });

export const updateEnquiryStatus = async ({ enquiryId, status, actingUserId }) => {
  const enquiry = await PartnerEnquiry.findByIdAndUpdate(
    enquiryId,
    { $set: { status, statusChangedBy: actingUserId, statusChangedAt: new Date() } },
    { new: true }
  ).populate("statusChangedBy", "name");

  if (!enquiry) throw new ApiError(404, "Enquiry not found");
  return enquiry;
};
