import mongoose from "mongoose";
import { Invoice } from "../models/invoice.model.js";
import { nextSequence } from "../models/counter.model.js";
import { Bill } from "../models/bill.model.js";
import { CoinPurchase } from "../models/coinPurchase.model.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import {
  INVOICE_KINDS,
  INVOICE_EMAIL_STATUS,
} from "../config/constants.js";
import { getInvoiceTemplate, renderInvoiceEmail, renderInvoiceHtml } from "./invoiceTemplate.service.js";
import { sendEmail, emailEnabled, normalizeEmail } from "./email.service.js";
import { endOfDay } from "../utils/date.util.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

/**
 * Issuing, reading and delivering invoices.
 *
 * THE RULE THIS FILE EXISTS TO PROTECT: issuing an invoice must never fail a
 * payment. By the time anything here runs, money has already moved and the
 * bill is already PAID — so every entry point is wrapped by its caller in a
 * catch that logs and continues. A Brevo outage, a malformed template or a
 * duplicate key must all end with the guest seeing a paid bill.
 *
 * That is also why issuance happens AFTER the settling transaction commits
 * rather than inside it: withTransaction retries on transient errors, and an
 * invoice issued inside the callback would burn a number per attempt and could
 * email the guest more than once.
 */

/* ------------------------------------------------------------------ *
 * numbering
 * ------------------------------------------------------------------ */

/**
 * PREFIX-YYYY-NNNNNN, from the atomic counter.
 *
 * The year is part of the counter KEY, so each year restarts at 1 with no
 * sweep and no chance of a collision across the boundary.
 */
const issueNumber = async (prefix) => {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`invoice:${year}`);
  return `${prefix || "BLX"}-${year}-${String(seq).padStart(6, "0")}`;
};

/**
 * A hotel as a party on an invoice.
 *
 * Prefers the KYC identity over the trading one: `business.legalName` and
 * `business.registeredAddress` are what was verified against the PAN and what
 * belongs on a tax document, while `name` is the brand guests see. Falls back
 * to the trading details for a hotel that has not completed onboarding, so the
 * invoice is never blank-headed.
 */
const hotelParty = (hotel) => {
  const business = hotel?.business || {};
  const registered = [business.registeredAddress, business.city, business.state, business.pincode]
    .filter(Boolean)
    .join(", ");

  return {
    name: business.legalName || hotel?.name || "",
    address: registered || [hotel?.address, hotel?.city].filter(Boolean).join(", "),
    email: hotel?.email || "",
    phone: hotel?.phone || "",
    taxId: business.gstin || "",
  };
};

/* ------------------------------------------------------------------ *
 * issuing
 * ------------------------------------------------------------------ */

/**
 * Writes the invoice, then tries to email it.
 *
 * DUPLICATES ARE A NO-OP, not an error. The unique partial indexes on billId
 * and purchaseId are the guarantee that a retried webhook or a double-tapped
 * settlement cannot produce two invoices for one payment; catching 11000 here
 * is what turns that guarantee into silence rather than a 500 on a payment
 * that already succeeded.
 */
const createInvoice = async (doc) => {
  try {
    return await Invoice.create(doc);
  } catch (err) {
    if (err?.code === 11000) {
      logger.info(`Invoice already issued for ${doc.billId || doc.purchaseId} — skipping`);
      return null;
    }
    throw err;
  }
};

/**
 * The invoice for a settled bill.
 *
 * Called from markBillPaid after the commit. Reads the bill fresh rather than
 * taking the in-memory copy, so the figures on the invoice are the ones that
 * were actually persisted.
 */
export const issueInvoiceForBill = async (billId) => {
  const bill = await Bill.findById(billId).lean();
  if (!bill) throw new ApiError(404, "Bill not found");

  const [hotel, guest, template] = await Promise.all([
    Hotel.findById(bill.hotelId).select("name address city email phone logoUrl business").lean(),
    User.findById(bill.guestId).select("name email phone").lean(),
    getInvoiceTemplate(),
  ]);

  const branding = template.branding || {};

  /**
   * The hotel is the SELLER on a guest bill, not the platform: the guest ate
   * at the hotel and the hotel's GSTIN is the one that belongs on the
   * document. The platform's own details are the fallback for a hotel that has
   * not filled its address in, so the invoice is never blank-headed.
   */
  const invoice = await createInvoice({
    number: await issueNumber(branding.numberPrefix),
    kind: INVOICE_KINDS.GUEST_BILL,
    billId: bill._id,
    hotelId: bill.hotelId,
    guestId: bill.guestId,
    issuedAt: bill.paidAt || new Date(),

    seller: hotelParty(hotel),
    buyer: {
      name: guest?.name || "Guest",
      email: guest?.email || "",
      phone: guest?.phone || "",
    },

    lines: (bill.lineItems || []).map((line) => ({
      description: line.service ? `${line.description} (${line.service})` : line.description,
      qty: line.qty,
      unitPricePaise: line.unitPricePaise,
      amountPaise: line.amountPaise,
    })),

    subtotalPaise: bill.subtotalPaise,
    taxPercent: bill.taxPercent || 0,
    taxPaise: bill.taxPaise || 0,
    totalPaise: bill.totalPaise,
    coinsApplied: bill.coinsApplied || 0,
    coinsDiscountPaise: bill.coinsDiscountPaise || 0,
    amountPaidPaise: bill.payablePaise,

    paymentRef: bill.razorpayPaymentId || "",
    // A bill fully covered by coins never opened an order, so there is no
    // gateway payment behind it — saying "Card" there would be a lie on a
    // financial document.
    paymentMethod: bill.payablePaise === 0 ? "Coins" : "Online",
    isDemo: Boolean(bill.isDemo),

    branding: {
      logoUrl: branding.logoUrl,
      accentColor: branding.accentColor,
      footerNote: branding.footerNote,
    },
  });

  if (!invoice) return null;

  logger.info(`Invoice ${invoice.number} issued for bill ${bill._id}`);
  await deliverInvoice(invoice, template);
  return invoice;
};

/**
 * The invoice for a hotel's coin purchase.
 *
 * Here the PLATFORM is the seller and the hotel is the buyer — the mirror of
 * the guest bill above, which is exactly why the two are separate kinds rather
 * than one document with a flag.
 */
export const issueInvoiceForPurchase = async (purchaseId) => {
  const purchase = await CoinPurchase.findById(purchaseId).lean();
  if (!purchase) throw new ApiError(404, "Purchase not found");

  const [hotel, template] = await Promise.all([
    Hotel.findById(purchase.hotelId).select("name address city email phone business").lean(),
    getInvoiceTemplate(),
  ]);

  const branding = template.branding || {};

  // amountPaid is RUPEES on CoinPurchase — see coin.service.js, where it is
  // compared against a rupee `expected`. Everything on an invoice is paise.
  const amountPaise = Math.round(Number(purchase.amountPaid || 0) * 100);

  const invoice = await createInvoice({
    number: await issueNumber(branding.numberPrefix),
    kind: INVOICE_KINDS.COIN_PURCHASE,
    purchaseId: purchase._id,
    hotelId: purchase.hotelId,
    issuedAt: purchase.createdAt || new Date(),

    seller: {
      name: branding.legalName,
      address: branding.address,
      email: branding.supportEmail,
      phone: branding.supportPhone,
      taxId: branding.taxId,
    },
    buyer: hotelParty(hotel),

    lines: [
      {
        description: `Coin inventory — ${purchase.coins.toLocaleString("en-IN")} coins`,
        qty: purchase.coins,
        unitPricePaise: purchase.unitPricePaise || 100,
        amountPaise,
      },
    ],

    subtotalPaise: amountPaise,
    taxPercent: 0,
    taxPaise: 0,
    totalPaise: amountPaise,
    amountPaidPaise: amountPaise,

    paymentRef: purchase.paymentRef || "",
    paymentMethod: "Online",

    branding: {
      logoUrl: branding.logoUrl,
      accentColor: branding.accentColor,
      footerNote: branding.footerNote,
    },
  });

  if (!invoice) return null;

  logger.info(`Invoice ${invoice.number} issued for purchase ${purchase._id}`);
  await deliverInvoice(invoice, template);
  return invoice;
};

/* ------------------------------------------------------------------ *
 * delivery
 * ------------------------------------------------------------------ */

/**
 * Emails the invoice, and records what happened.
 *
 * NEVER THROWS. The invoice is already a durable record and the payment is
 * already settled; a failed send is a note on the document, not an error the
 * caller can act on. The three outcomes are all normal:
 *
 *   SKIPPED — no address. The common case: guests sign up by PHONE, and
 *             user.email is for staff. An invoice with nowhere to go is not a
 *             failure, which is why this is its own status and not FAILED.
 *   SENT    — Brevo accepted it.
 *   FAILED  — it did not. Logged with the reason, visible in the panel.
 */
export const deliverInvoice = async (invoice, template) => {
  const tpl = template || (await getInvoiceTemplate());
  const to = normalizeEmail(invoice.buyer?.email || "");

  const record = (patch) =>
    Invoice.updateOne({ _id: invoice._id }, { $set: { email: patch } }).catch((err) =>
      logger.warn(`Could not record invoice email status: ${err.message}`)
    );

  if (!to || !tpl.emailEnabled || !emailEnabled()) {
    const why = !to
      ? "no email address"
      : !tpl.emailEnabled
        ? "invoice email switched off"
        : "email provider not configured";
    logger.info(`Invoice ${invoice.number} not emailed — ${why}`);
    return record({ status: INVOICE_EMAIL_STATUS.SKIPPED, to: to || undefined });
  }

  try {
    const { subject, html, text } = await renderInvoiceEmail(invoice, tpl);
    await sendEmail({ to, subject, html, text });
    logger.info(`Invoice ${invoice.number} emailed to ${to}`);
    return record({ status: INVOICE_EMAIL_STATUS.SENT, to, sentAt: new Date() });
  } catch (err) {
    logger.error(`Invoice ${invoice.number} email failed: ${err.message}`);
    return record({
      status: INVOICE_EMAIL_STATUS.FAILED,
      to,
      error: String(err.message).slice(0, 500),
    });
  }
};

/** Re-sends an invoice from the panel. The one path an admin can retry on. */
export const resendInvoice = async (invoiceId, { hotelId } = {}) => {
  const invoice = await findInvoice(invoiceId, { hotelId });
  if (!invoice.buyer?.email) {
    throw new ApiError(400, "This invoice has no email address to send to");
  }
  await deliverInvoice(invoice);
  return Invoice.findById(invoice._id).lean();
};

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

/**
 * One invoice, scoped.
 *
 * `hotelId` is passed by the HOTEL panel and omitted by the admin, and it is
 * applied as part of the QUERY rather than checked afterwards — a hotel admin
 * must not be able to learn that an invoice exists by its 404 differing.
 */
export const findInvoice = async (invoiceId, { hotelId } = {}) => {
  if (!mongoose.isValidObjectId(invoiceId)) throw new ApiError(404, "Invoice not found");

  const query = { _id: invoiceId };
  if (hotelId) query.hotelId = new mongoose.Types.ObjectId(String(hotelId));

  const invoice = await Invoice.findOne(query).lean();
  if (!invoice) throw new ApiError(404, "Invoice not found");
  return invoice;
};

/** One invoice, rendered. What the preview popup and the print view show. */
export const getInvoiceHtml = async (invoiceId, { hotelId } = {}) => {
  const invoice = await findInvoice(invoiceId, { hotelId });
  return { invoice, html: await renderInvoiceHtml(invoice) };
};

/**
 * Invoices for a list view.
 *
 * Mirrors listTransactions' filter shape so the Transactions tab can drive
 * both from one set of controls.
 */
export const listInvoices = async ({
  hotelId,
  guestId,
  kind,
  from,
  to,
  q,
  page = 1,
  limit = 25,
}) => {
  const filter = {};
  if (hotelId) filter.hotelId = new mongoose.Types.ObjectId(String(hotelId));
  if (guestId) filter.guestId = new mongoose.Types.ObjectId(String(guestId));
  if (kind) filter.kind = kind;

  // Invoice numbers are what people quote when they ask about a charge, so the
  // search is anchored on them rather than being a broad text scan.
  if (q) filter.number = { $regex: String(q).trim(), $options: "i" };

  if (from || to) {
    filter.issuedAt = {};
    if (from) filter.issuedAt.$gte = new Date(from);
    if (to) filter.issuedAt.$lte = endOfDay(to);
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .populate("hotelId", "name")
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

/**
 * The invoices belonging to a set of bills, keyed by bill id.
 *
 * This is what lets the Transactions tables show an eye icon on the rows that
 * have one, in a single extra query rather than one per row. Returns a plain
 * object because it is serialised to the client as JSON.
 */
export const invoiceIdsForBills = async (billIds = []) => {
  const ids = billIds.filter((id) => id && mongoose.isValidObjectId(id));
  if (!ids.length) return {};

  const invoices = await Invoice.find({ billId: { $in: ids } })
    .select("_id number billId")
    .lean();

  return invoices.reduce((acc, inv) => {
    acc[String(inv.billId)] = { id: String(inv._id), number: inv.number };
    return acc;
  }, {});
};

/** The same, for coin purchases on the hotel's Coins page. */
export const invoiceIdsForPurchases = async (purchaseIds = []) => {
  const ids = purchaseIds.filter((id) => id && mongoose.isValidObjectId(id));
  if (!ids.length) return {};

  const invoices = await Invoice.find({ purchaseId: { $in: ids } })
    .select("_id number purchaseId")
    .lean();

  return invoices.reduce((acc, inv) => {
    acc[String(inv.purchaseId)] = { id: String(inv._id), number: inv.number };
    return acc;
  }, {});
};

/**
 * A throwaway invoice for the template editor's live preview.
 *
 * Never saved and never numbered from the counter — a preview must not consume
 * an invoice number, because the series is expected to be gapless and an admin
 * fiddling with the editor would otherwise eat hundreds of them.
 */
export const buildSampleInvoice = (template) => {
  const branding = template?.branding || {};

  return {
    _id: "sample",
    number: `${branding.numberPrefix || "BLX"}-${new Date().getFullYear()}-000001`,
    kind: INVOICE_KINDS.GUEST_BILL,
    issuedAt: new Date(),
    seller: {
      name: "The Grand Palace",
      address: "12 Marine Drive, Mumbai",
      email: branding.supportEmail || "stay@grandpalace.example",
      phone: branding.supportPhone || "+91 22 4000 1000",
      taxId: "27AABCU9603R1ZX",
    },
    buyer: {
      name: "Aarav Sharma",
      email: "aarav@example.com",
      phone: "+91 98200 00000",
    },
    lines: [
      { description: "Dinner for two (Restaurant)", qty: 1, unitPricePaise: 340000, amountPaise: 340000 },
      { description: "Spa — Deep tissue massage", qty: 2, unitPricePaise: 250000, amountPaise: 500000 },
    ],
    subtotalPaise: 840000,
    taxPercent: 5,
    taxPaise: 42000,
    totalPaise: 882000,
    coinsApplied: 1500,
    coinsDiscountPaise: 150000,
    amountPaidPaise: 732000,
    paymentRef: "pay_SAMPLE0001",
    paymentMethod: "Online",
    branding: {
      logoUrl: branding.logoUrl,
      accentColor: branding.accentColor,
      footerNote: branding.footerNote,
    },
  };
};
