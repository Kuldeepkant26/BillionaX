import mongoose from "mongoose";
import {
  DEFAULT_INVOICE_HTML,
  DEFAULT_INVOICE_EMAIL_HTML,
  DEFAULT_INVOICE_EMAIL_TEXT,
  DEFAULT_INVOICE_BRANDING,
  DEFAULT_INVOICE_EMAIL_COPY,
} from "../config/defaultInvoiceTemplates.js";

/**
 * What every invoice is rendered from. Singleton, enforced by the unique
 * `key`, exactly like platformSettings.model.js next door.
 *
 * SEPARATE FROM PlatformSettings deliberately. That document is read on the
 * redeem path and memoised for a minute; this one holds two multi-kilobyte
 * HTML blobs that only the invoice path ever needs. Folding them in would put
 * the template's weight behind every settings read on the platform.
 *
 * THREE EDITING LEVELS, narrowest to widest:
 *
 *   1. `branding` and `emailCopy` — plain form fields. An admin cannot break
 *      the document with these, so they carry no recovery story.
 *   2. `html` blobs — a code editor. An admin CAN break these, which is why
 *      every one of them has a shipped default in config/ that Reset copies
 *      back. The defaults are module constants, not DB rows, so recovery works
 *      even if this document is the thing that is wrong.
 *
 * NOTHING HERE IS TRUSTED AS MARKUP UNTIL IT IS SANITISED. The stored HTML is
 * admin-authored and lands in a guest's mailbox, so invoiceTemplate.service.js
 * strips <script>, event handlers and javascript: URLs on the way OUT rather
 * than on the way in — sanitising on write would leave anything stored before
 * the rule existed permanently trusted.
 */
const invoiceTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, default: "GLOBAL", unique: true },

    /**
     * Issuer identity and look. Copied onto each invoice at issue time, never
     * read back when rendering an OLD invoice — see the freezing note in
     * invoice.model.js.
     */
    branding: {
      /** The series, e.g. "BLX" in BLX-2026-000412. */
      numberPrefix: {
        type: String,
        default: DEFAULT_INVOICE_BRANDING.numberPrefix,
        trim: true,
        maxlength: 8,
        // Ends up inside an invoice number that must stay filename- and
        // URL-safe, so the character set is closed rather than trimmed.
        match: [/^[A-Za-z0-9-]{1,8}$/, "Use 1-8 letters, digits or hyphens"],
      },
      legalName: { type: String, default: DEFAULT_INVOICE_BRANDING.legalName, trim: true, maxlength: 200 },
      address: { type: String, default: DEFAULT_INVOICE_BRANDING.address, trim: true, maxlength: 500 },
      taxId: { type: String, default: DEFAULT_INVOICE_BRANDING.taxId, trim: true, maxlength: 60 },
      supportEmail: { type: String, default: DEFAULT_INVOICE_BRANDING.supportEmail, trim: true, maxlength: 200 },
      supportPhone: { type: String, default: DEFAULT_INVOICE_BRANDING.supportPhone, trim: true, maxlength: 40 },
      logoUrl: { type: String, default: DEFAULT_INVOICE_BRANDING.logoUrl, trim: true, maxlength: 500 },
      // Pattern-validated like themeCustomColor: this string is interpolated
      // straight into the document's inline styles.
      accentColor: {
        type: String,
        default: DEFAULT_INVOICE_BRANDING.accentColor,
        match: [/^#[0-9a-fA-F]{6}$/, "Enter a 6-digit hex colour"],
      },
      footerNote: { type: String, default: DEFAULT_INVOICE_BRANDING.footerNote, trim: true, maxlength: 1000 },
      /** The heading on the document itself, per kind. */
      guestBillTitle: { type: String, default: DEFAULT_INVOICE_BRANDING.guestBillTitle, trim: true, maxlength: 60 },
      coinPurchaseTitle: { type: String, default: DEFAULT_INVOICE_BRANDING.coinPurchaseTitle, trim: true, maxlength: 60 },
    },

    /** Subject and prose of the invoice email. Placeholders allowed. */
    emailCopy: {
      subject: { type: String, default: DEFAULT_INVOICE_EMAIL_COPY.subject, trim: true, maxlength: 200 },
      heading: { type: String, default: DEFAULT_INVOICE_EMAIL_COPY.heading, trim: true, maxlength: 200 },
      intro: { type: String, default: DEFAULT_INVOICE_EMAIL_COPY.intro, trim: true, maxlength: 2000 },
      signoff: { type: String, default: DEFAULT_INVOICE_EMAIL_COPY.signoff, trim: true, maxlength: 2000 },
    },

    /** The raw documents. Reset copies the config/ defaults back over these. */
    invoiceHtml: { type: String, default: DEFAULT_INVOICE_HTML, maxlength: 60_000 },
    emailHtml: { type: String, default: DEFAULT_INVOICE_EMAIL_HTML, maxlength: 60_000 },
    emailText: { type: String, default: DEFAULT_INVOICE_EMAIL_TEXT, maxlength: 20_000 },

    /**
     * Whether an invoice email goes out at all.
     *
     * Gates DELIVERY only, never issuance: an invoice is a financial record
     * and is always written, the same way feedEnabled hides the feed's door
     * without touching its data. Turning this off must not leave a paid bill
     * with no invoice behind it.
     */
    emailEnabled: { type: Boolean, default: true },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const InvoiceTemplate = mongoose.model("InvoiceTemplate", invoiceTemplateSchema);
