/**
 * The invoice and invoice-email bodies, as shipped.
 *
 * These are the RECOVERABLE DEFAULTS behind the admin's raw-HTML editors: the
 * stored template starts as a copy of these, and "Reset to default" copies
 * them again. That is what makes handing an admin a code editor survivable —
 * a broken edit is always one button from working, and nothing about the
 * recovery path depends on the broken value being parseable.
 *
 * Hand-written, table-free, inline-styled HTML for the same reason
 * emailTemplates.js is: mail clients strip <style> blocks and understand
 * almost no modern CSS. The invoice document itself has one concession — a
 * <style> block holding @page and a print rule — because it is also rendered
 * in a browser and printed to PDF, where those DO apply. Every visual style is
 * still inline so the emailed copy survives Gmail stripping that block.
 *
 * PLACEHOLDERS are {{dotted.path}}, substituted by renderTemplate() in
 * invoiceTemplate.service.js. Every value is HTML-escaped on the way in.
 * {{#if x}}...{{/if}} and {{#each lines}}...{{/each}} are the only two blocks
 * supported; see that file for exactly what the mini-renderer does, because
 * these defaults are the thing that has to keep working under it.
 */

/** The invoice document. Shown in the preview popup, printed, and emailed. */
export const DEFAULT_INVOICE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice {{invoice.number}}</title>
<style>
  @page { size: A4; margin: 14mm; }
  @media print { .no-print { display: none !important; } body { background: #fff !important; } }
</style>
</head>
<body style="margin:0;padding:24px;background:#f6f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1418;">
<div style="max-width:780px;margin:0 auto;background:#ffffff;border-radius:14px;padding:40px;">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;">
    <div>
      <!-- alt is deliberately EMPTY. A dead logo URL would otherwise print the
           seller's name a second time next to a broken-image icon, and the
           name is already the line directly below. An onerror handler would be
           the usual fix and is not available here: sanitizeHtml strips every
           on* attribute, which is exactly the rule that keeps this editor from
           becoming a way to run script in a guest's mail client. -->
      {{#if branding.logoUrl}}<img src="{{branding.logoUrl}}" alt="" style="height:44px;width:auto;display:block;margin-bottom:12px;">{{/if}}
      <div style="font-size:11px;letter-spacing:2.4px;color:{{branding.accentColor}};font-weight:700;">{{seller.name}}</div>
      {{#if seller.address}}<div style="margin-top:8px;font-size:12.5px;line-height:1.6;color:#6b6169;white-space:pre-line;">{{seller.address}}</div>{{/if}}
      {{#if seller.taxId}}<div style="margin-top:6px;font-size:12.5px;color:#6b6169;">GSTIN: {{seller.taxId}}</div>{{/if}}
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0 0 10px;font-size:23px;font-weight:600;">{{invoice.title}}</h1>
      <div style="font-size:13px;color:#6b6169;line-height:1.8;">
        <div><b style="color:#1a1418;">{{invoice.number}}</b></div>
        <div>{{invoice.issuedAt}}</div>
        {{#if invoice.paymentRef}}<div>Ref: {{invoice.paymentRef}}</div>{{/if}}
      </div>
    </div>
  </div>

  <div style="margin:30px 0 22px;padding:18px 20px;background:#faf7f8;border:1px solid #ece4e8;border-radius:10px;">
    <div style="font-size:11px;letter-spacing:1.4px;color:#8b8189;font-weight:700;">BILLED TO</div>
    <div style="margin-top:8px;font-size:15px;font-weight:600;">{{buyer.name}}</div>
    {{#if buyer.address}}<div style="margin-top:4px;font-size:12.5px;line-height:1.6;color:#6b6169;white-space:pre-line;">{{buyer.address}}</div>{{/if}}
    {{#if buyer.email}}<div style="margin-top:4px;font-size:12.5px;color:#6b6169;">{{buyer.email}}</div>{{/if}}
    {{#if buyer.phone}}<div style="margin-top:2px;font-size:12.5px;color:#6b6169;">{{buyer.phone}}</div>{{/if}}
    {{#if buyer.taxId}}<div style="margin-top:2px;font-size:12.5px;color:#6b6169;">GSTIN: {{buyer.taxId}}</div>{{/if}}
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
    <thead>
      <tr>
        <th style="text-align:left;padding:10px 8px;border-bottom:2px solid #ece4e8;font-size:11px;letter-spacing:1.2px;color:#8b8189;">DESCRIPTION</th>
        <th style="text-align:right;padding:10px 8px;border-bottom:2px solid #ece4e8;font-size:11px;letter-spacing:1.2px;color:#8b8189;">QTY</th>
        <th style="text-align:right;padding:10px 8px;border-bottom:2px solid #ece4e8;font-size:11px;letter-spacing:1.2px;color:#8b8189;">RATE</th>
        <th style="text-align:right;padding:10px 8px;border-bottom:2px solid #ece4e8;font-size:11px;letter-spacing:1.2px;color:#8b8189;">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #f2ecef;">{{description}}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #f2ecef;text-align:right;color:#6b6169;">{{qty}}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #f2ecef;text-align:right;color:#6b6169;">{{unitPrice}}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #f2ecef;text-align:right;">{{amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div style="margin-top:22px;display:flex;justify-content:flex-end;">
    <div style="width:100%;max-width:320px;font-size:13.5px;">
      <div style="display:flex;justify-content:space-between;padding:7px 0;color:#6b6169;">
        <span>Subtotal</span><span>{{totals.subtotal}}</span>
      </div>
      {{#if totals.hasTax}}
      <div style="display:flex;justify-content:space-between;padding:7px 0;color:#6b6169;">
        <span>Tax ({{totals.taxPercent}}%)</span><span>{{totals.tax}}</span>
      </div>
      {{/if}}
      {{#if totals.hasCoins}}
      <div style="display:flex;justify-content:space-between;padding:7px 0;color:{{branding.accentColor}};">
        <span>Coins applied ({{totals.coinsApplied}})</span><span>−{{totals.coinsDiscount}}</span>
      </div>
      {{/if}}
      <div style="display:flex;justify-content:space-between;padding:13px 0 0;margin-top:7px;border-top:2px solid #ece4e8;font-size:16px;font-weight:700;">
        <span>Amount paid</span><span>{{totals.amountPaid}}</span>
      </div>
    </div>
  </div>

  {{#if branding.footerNote}}
  <div style="margin-top:34px;padding-top:20px;border-top:1px solid #f2ecef;font-size:12px;line-height:1.7;color:#8b8189;white-space:pre-line;">{{branding.footerNote}}</div>
  {{/if}}

  <div style="margin-top:18px;font-size:11.5px;color:#a49aa1;">
    {{#if seller.email}}{{seller.email}}{{/if}}{{#if seller.phone}} · {{seller.phone}}{{/if}}
  </div>

</div>
</body>
</html>`;

/**
 * The email the invoice arrives in.
 *
 * Carries the invoice INLINE rather than as an attachment: there is no PDF
 * binary to attach — the document is HTML end to end, so the guest reads it in
 * the mail body and the same markup prints from the panel. {{invoice.html}} is
 * the ONLY placeholder that is not escaped, because it is the rendered invoice
 * itself; everything reaching it has already been escaped on its own way in.
 */
export const DEFAULT_INVOICE_EMAIL_HTML = `<div style="margin:0;padding:32px 16px;background:#f6f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;">

    <div style="background:#ffffff;border-radius:14px;padding:32px;margin-bottom:18px;">
      {{#if branding.logoUrl}}<img src="{{branding.logoUrl}}" alt="" style="height:38px;width:auto;display:block;margin-bottom:16px;">{{/if}}
      <h1 style="margin:0 0 10px;font-size:20px;line-height:1.35;color:#1a1418;font-weight:600;">{{email.heading}}</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#6b6169;white-space:pre-line;">{{email.intro}}</p>
      <div style="padding:14px 16px;background:#faf7f8;border:1px solid #ece4e8;border-radius:10px;font-size:13.5px;color:#6b6169;">
        <b style="color:#1a1418;">{{invoice.number}}</b> · {{invoice.issuedAt}} · <b style="color:#1a1418;">{{totals.amountPaid}}</b>
      </div>
    </div>

    {{invoice.html}}

    <p style="margin:18px 4px 0;font-size:12px;line-height:1.65;color:#8b8189;white-space:pre-line;">{{email.signoff}}</p>
  </div>
</div>`;

/** The plain-text part. Never optional — see the spam note in email.service.js. */
export const DEFAULT_INVOICE_EMAIL_TEXT = `{{email.heading}}

{{email.intro}}

Invoice {{invoice.number}}
Issued {{invoice.issuedAt}}
Amount paid {{totals.amountPaid}}

{{email.signoff}}`;

/** Seed values for the branding and copy fields the admin edits as a form. */
export const DEFAULT_INVOICE_BRANDING = Object.freeze({
  numberPrefix: "BLX",
  legalName: "BillionaX",
  address: "",
  taxId: "",
  supportEmail: "",
  supportPhone: "",
  logoUrl: "",
  accentColor: "#8d4360",
  footerNote: "This is a computer-generated invoice and does not require a signature.",
  guestBillTitle: "TAX INVOICE",
  coinPurchaseTitle: "TAX INVOICE",
});

export const DEFAULT_INVOICE_EMAIL_COPY = Object.freeze({
  subject: "Your invoice {{invoice.number}} from {{seller.name}}",
  heading: "Thank you for your payment",
  intro:
    "Hi {{buyer.name}}, we have received your payment. Your invoice is below — keep it for your records.",
  signoff: "If anything looks wrong, just reply to this email and we will sort it out.",
});
