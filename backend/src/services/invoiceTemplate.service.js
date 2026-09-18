import { InvoiceTemplate } from "../models/invoiceTemplate.model.js";
import { INVOICE_KINDS } from "../config/constants.js";
import {
  DEFAULT_INVOICE_HTML,
  DEFAULT_INVOICE_EMAIL_HTML,
  DEFAULT_INVOICE_EMAIL_TEXT,
} from "../config/defaultInvoiceTemplates.js";

/**
 * Turning the stored templates into finished documents.
 *
 * Three jobs live here, in order of how much they matter:
 *
 *   1. SANITISING admin-authored HTML before it is rendered. See sanitizeHtml.
 *   2. ESCAPING every value substituted into a template, so a guest's name or
 *      a line-item description cannot inject markup.
 *   3. A deliberately tiny placeholder renderer.
 *
 * WHY A HAND-WRITTEN RENDERER rather than Handlebars or EJS. A real engine is
 * a scripting language: EJS evaluates arbitrary JavaScript in its tags, and
 * Handlebars helpers reach into the prototype chain. The thing being rendered
 * here is a blob a web form can write, so an engine that can execute would
 * turn the invoice editor into remote code execution on the API server. This
 * renderer can substitute, branch on truthiness and repeat over one list. It
 * cannot call anything, and that is the entire point — the feature does not
 * need more, and anything more would have to be defended.
 */

const CACHE_TTL_MS = 60_000;

let cached = null;
let cachedAt = 0;

/** Invalidate after a template write, mirroring invalidateSettingsCache. */
export const invalidateInvoiceTemplateCache = () => {
  cached = null;
  cachedAt = 0;
};

/** The singleton, memoised for a minute. Created on first read. */
export const getInvoiceTemplate = async ({ fresh = false } = {}) => {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  let template = await InvoiceTemplate.findOne({ key: "GLOBAL" });
  if (!template) template = await InvoiceTemplate.create({ key: "GLOBAL" });

  cached = template;
  cachedAt = Date.now();
  return template;
};

export const updateInvoiceTemplate = async (patch, userId) => {
  const template = await InvoiceTemplate.findOneAndUpdate(
    { key: "GLOBAL" },
    { ...patch, updatedBy: userId },
    { new: true, upsert: true, runValidators: true }
  );
  invalidateInvoiceTemplateCache();
  return template;
};

/** The shipped defaults, for the editor's Reset action. */
export const DEFAULT_HTML = Object.freeze({
  invoiceHtml: DEFAULT_INVOICE_HTML,
  emailHtml: DEFAULT_INVOICE_EMAIL_HTML,
  emailText: DEFAULT_INVOICE_EMAIL_TEXT,
});

/* ------------------------------------------------------------------ *
 * escaping and sanitising
 * ------------------------------------------------------------------ */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Every substituted value goes through this.
 *
 * Quotes included, not just angle brackets: placeholders appear inside
 * attributes in the default template (`alt="{{seller.name}}"`), and a bare
 * quote there escapes the attribute and is enough to inject a handler.
 */
export const escapeHtml = (value) => {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
};

/**
 * Strips the ways a stored template could execute script in a reader's client.
 *
 * Applied ON READ, never on write. Sanitising at the point of storage would
 * mean anything written before a rule existed stays trusted forever, and it
 * would also destroy the admin's source: they would open the editor and find
 * their own markup altered. Storing exactly what was typed and cleaning it at
 * every render keeps the editor honest and makes a tightened rule retroactive.
 *
 * This is a denylist over a constrained input — the admin is authenticated as
 * MAIN_ADMIN, so it defends against a compromised admin session and against an
 * admin pasting something careless, not against an arbitrary attacker. The
 * preview iframe is sandboxed as the second layer, because a denylist over
 * HTML is never something to rely on alone.
 */
export const sanitizeHtml = (html) => {
  if (!html) return "";

  return (
    String(html)
      // Script and style-adjacent elements that can carry executable payloads.
      .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, "")
      .replace(/<\s*script\b[^>]*>/gi, "")
      .replace(/<\s*iframe\b[\s\S]*?<\s*\/\s*iframe\s*>/gi, "")
      .replace(/<\s*(object|embed|form|base|link)\b[^>]*>/gi, "")
      // on* handlers, quoted or bare.
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      // javascript: and data: URLs in href/src.
      .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
      .replace(/(href|src)\s*=\s*"\s*data:text\/html[^"]*"/gi, '$1="#"')
  );
};

/* ------------------------------------------------------------------ *
 * the renderer
 * ------------------------------------------------------------------ */

/** Walks a dotted path. Returns undefined rather than throwing on a bad path. */
const lookup = (context, path) => {
  if (path === ".") return context;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), context);
};

/**
 * Substitutes {{path}} and resolves {{#if}} / {{#each}} blocks.
 *
 * `raw` names the one path whose value is inserted unescaped — the rendered
 * invoice being embedded into the email body. Nothing else is ever exempt, and
 * the value behind it has already been escaped during its own render.
 *
 * Blocks are resolved innermost-first by running the regexes to a fixed point,
 * which is what lets an {{#if}} sit inside an {{#each}} in the default
 * template. Iteration is bounded: a malformed template must not spin forever
 * on a request thread.
 */
export const renderTemplate = (template, context, { raw = null } = {}) => {
  let out = String(template ?? "");

  // #each — the innermost blocks match first, since [\s\S]*? is non-greedy and
  // the inner block contains no further {{#each}} to terminate early.
  for (let pass = 0; pass < 10; pass += 1) {
    const before = out;
    out = out.replace(
      /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match, path, body) => {
        const list = lookup(context, path);
        if (!Array.isArray(list)) return "";
        return list
          .map((item) => renderTemplate(body, { ...context, ...item }, { raw }))
          .join("");
      }
    );
    if (out === before) break;
  }

  // #if — truthiness only. No comparisons, no else.
  for (let pass = 0; pass < 10; pass += 1) {
    const before = out;
    out = out.replace(
      /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_match, path, body) => (lookup(context, path) ? body : "")
    );
    if (out === before) break;
  }

  // Plain substitution, escaped unless this is the one raw path.
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path) => {
    const value = lookup(context, path);
    if (value == null) return "";
    return path === raw ? String(value) : escapeHtml(value);
  });

  return out;
};

/* ------------------------------------------------------------------ *
 * the render context
 * ------------------------------------------------------------------ */

/** ₹1,23,456.78 — Indian grouping, from an integer paise value. */
export const formatPaise = (paise) => {
  const value = Number(paise || 0) / 100;
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * The context every template is rendered against.
 *
 * Built from the INVOICE, never from the bill or the live template — an
 * invoice must render the same way in a year's time, and the only way to
 * guarantee that is to read nothing that can change. The one exception is the
 * document title, which is cosmetic and comes from the current template so a
 * relabel applies to the archive too.
 */
export const buildInvoiceContext = (invoice, template) => {
  const branding = invoice.branding || {};
  const isGuestBill = invoice.kind === INVOICE_KINDS.GUEST_BILL;

  return {
    invoice: {
      number: invoice.number,
      issuedAt: formatDate(invoice.issuedAt),
      paymentRef: invoice.paymentRef || "",
      paymentMethod: invoice.paymentMethod || "",
      title: isGuestBill
        ? template?.branding?.guestBillTitle || "TAX INVOICE"
        : template?.branding?.coinPurchaseTitle || "TAX INVOICE",
    },
    seller: invoice.seller || {},
    buyer: invoice.buyer || {},
    branding: {
      logoUrl: branding.logoUrl || "",
      accentColor: branding.accentColor || "#8d4360",
      footerNote: branding.footerNote || "",
    },
    lines: (invoice.lines || []).map((line) => ({
      description: line.description,
      qty: line.qty,
      unitPrice: formatPaise(line.unitPricePaise),
      amount: formatPaise(line.amountPaise),
    })),
    totals: {
      subtotal: formatPaise(invoice.subtotalPaise),
      // Flags rather than the values themselves: a 0% tax row reading "₹0.00"
      // is noise on a document, and {{#if}} tests truthiness, which a
      // formatted "₹0.00" string would always pass.
      hasTax: invoice.taxPaise > 0,
      taxPercent: invoice.taxPercent,
      tax: formatPaise(invoice.taxPaise),
      hasCoins: invoice.coinsApplied > 0,
      coinsApplied: invoice.coinsApplied,
      coinsDiscount: formatPaise(invoice.coinsDiscountPaise),
      total: formatPaise(invoice.totalPaise),
      amountPaid: formatPaise(invoice.amountPaidPaise),
    },
  };
};

/** The invoice document itself, ready to display, print or embed. */
export const renderInvoiceHtml = async (invoice, template) => {
  const tpl = template || (await getInvoiceTemplate());
  const context = buildInvoiceContext(invoice, tpl);
  return renderTemplate(sanitizeHtml(tpl.invoiceHtml || DEFAULT_INVOICE_HTML), context);
};

/**
 * The email, with the invoice embedded in it.
 *
 * The subject and prose are themselves templates, so an admin can write
 * "Your invoice {{invoice.number}}" in a form field. They are rendered against
 * the same context and then folded in as `email.*`.
 */
export const renderInvoiceEmail = async (invoice, template) => {
  const tpl = template || (await getInvoiceTemplate());
  const context = buildInvoiceContext(invoice, tpl);
  const copy = tpl.emailCopy || {};

  const emailContext = {
    ...context,
    email: {
      heading: renderTemplate(copy.heading, context),
      intro: renderTemplate(copy.intro, context),
      signoff: renderTemplate(copy.signoff, context),
    },
  };

  const invoiceHtml = renderTemplate(
    sanitizeHtml(tpl.invoiceHtml || DEFAULT_INVOICE_HTML),
    context
  );

  return {
    // Rendered against the plain context: the subject is a header, and the
    // email.* values are prose that has no business appearing in it.
    subject: renderTemplate(copy.subject, context),
    html: renderTemplate(
      sanitizeHtml(tpl.emailHtml || DEFAULT_INVOICE_EMAIL_HTML),
      { ...emailContext, invoice: { ...emailContext.invoice, html: invoiceHtml } },
      { raw: "invoice.html" }
    ),
    // Never sanitised or escaped as markup — it is not markup. Placeholders
    // still resolve so the two parts say the same thing.
    text: renderTemplate(tpl.emailText || DEFAULT_INVOICE_EMAIL_TEXT, emailContext),
  };
};
