/**
 * The invoice template renderer.
 *
 * This is the file in the invoice feature whose failure mode is DANGEROUS
 * rather than merely visible, so it is the one pinned hardest:
 *
 *  - The stored template is authored through a web form and ends up in a
 *    guest's mailbox. If sanitising or escaping regresses, the invoice editor
 *    becomes a way to put script into somebody else's email client, and
 *    nothing about the output would look wrong in review.
 *
 *  - The renderer is deliberately NOT a real template engine, because EJS
 *    evaluates arbitrary JavaScript and Handlebars helpers reach the prototype
 *    chain — either would turn an admin form into code execution. These tests
 *    are what stop someone "upgrading" it to one without noticing why.
 *
 *  - {{#if}} inside {{#each}} is load-bearing in the default invoice, and a
 *    naive single-pass regex silently drops the inner block instead of
 *    erroring, producing an invoice with missing rows.
 *
 * No database: everything here is pure. The Mongo paths need a live server and
 * are covered by the integration flow.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  renderTemplate,
  escapeHtml,
  sanitizeHtml,
  buildInvoiceContext,
  formatPaise,
} from "../src/services/invoiceTemplate.service.js";
import { DEFAULT_INVOICE_HTML } from "../src/config/defaultInvoiceTemplates.js";

/** A settled guest bill, with tax and coins both in play. */
const sampleInvoice = () => ({
  number: "BLX-2026-000001",
  kind: "GUEST_BILL",
  issuedAt: new Date("2026-09-18T10:00:00Z"),
  paymentRef: "pay_X1",
  seller: { name: "Grand <Palace>", address: "12 Marine Dr", taxId: "27AABCU9603R1ZX" },
  buyer: { name: "Aarav", email: "aarav@example.com", phone: "+91 98200 00000" },
  lines: [{ description: "Dinner", qty: 1, unitPricePaise: 340000, amountPaise: 340000 }],
  subtotalPaise: 340000,
  taxPercent: 5,
  taxPaise: 17000,
  totalPaise: 357000,
  coinsApplied: 1500,
  coinsDiscountPaise: 150000,
  amountPaidPaise: 207000,
  branding: { accentColor: "#8d4360", footerNote: "Computer generated.", logoUrl: "" },
});

describe("escaping", () => {
  it("escapes markup", () => {
    assert.equal(escapeHtml("<b>hi</b>"), "&lt;b&gt;hi&lt;/b&gt;");
  });

  it("escapes quotes too, because placeholders sit inside attributes", () => {
    // alt="{{seller.name}}" in the default template: a bare quote here escapes
    // the attribute, which is enough to inject a handler.
    assert.equal(escapeHtml(`a"b'c`), "a&quot;b&#39;c");
  });

  it("renders null as empty rather than the string 'null'", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });
});

describe("renderTemplate", () => {
  it("escapes every substituted value", () => {
    const out = renderTemplate("Hi {{buyer.name}}", {
      buyer: { name: "<img src=x onerror=alert(1)>" },
    });
    assert.equal(out, "Hi &lt;img src=x onerror=alert(1)&gt;");
    assert.ok(!out.includes("<img"));
  });

  it("renders a missing path as empty, not as a crash", () => {
    assert.equal(renderTemplate("[{{a.b.c}}]", {}), "[]");
  });

  it("branches on truthiness", () => {
    assert.equal(renderTemplate("{{#if x}}Y{{/if}}", { x: 1 }), "Y");
    assert.equal(renderTemplate("{{#if x}}Y{{/if}}", { x: 0 }), "");
    assert.equal(renderTemplate("{{#if x}}Y{{/if}}", {}), "");
  });

  it("repeats over a list", () => {
    const out = renderTemplate("{{#each lines}}[{{n}}]{{/each}}", { lines: [{ n: 1 }, { n: 2 }] });
    assert.equal(out, "[1][2]");
  });

  it("renders nothing for a non-array each", () => {
    assert.equal(renderTemplate("{{#each lines}}x{{/each}}", { lines: null }), "");
  });

  it("resolves an #if nested inside an #each", () => {
    // Load-bearing in the default invoice. A single-pass implementation drops
    // the inner block silently.
    const out = renderTemplate("{{#each lines}}{{n}}{{#if hot}}!{{/if}} {{/each}}", {
      lines: [{ n: 1, hot: true }, { n: 2, hot: false }],
    });
    assert.equal(out, "1! 2 ");
  });

  it("lets an each item read the outer context", () => {
    const out = renderTemplate("{{#each lines}}{{cur}}{{n}}{{/each}}", {
      cur: "$",
      lines: [{ n: 5 }],
    });
    assert.equal(out, "$5");
  });

  it("exempts only the named raw path from escaping", () => {
    const out = renderTemplate(
      "{{a.html}}|{{b}}",
      { a: { html: "<i>k</i>" }, b: "<i>k</i>" },
      { raw: "a.html" }
    );
    assert.equal(out, "<i>k</i>|&lt;i&gt;k&lt;/i&gt;");
  });
});

describe("sanitizeHtml", () => {
  it("removes script elements and bare script tags", () => {
    assert.ok(!sanitizeHtml("<p>a</p><script>evil()</script>").includes("evil"));
    assert.ok(!sanitizeHtml('<script src="x.js">').includes("<script"));
  });

  it("removes event handlers, quoted and bare", () => {
    assert.ok(!sanitizeHtml('<img src="a" onerror="evil()">').includes("onerror"));
    assert.ok(!sanitizeHtml("<div onclick=evil()>").includes("onclick"));
    assert.ok(!sanitizeHtml("<div onmouseover='evil()'>").includes("onmouseover"));
  });

  it("neutralises javascript: and data:text/html URLs", () => {
    assert.ok(!sanitizeHtml('<a href="javascript:evil()">x</a>').includes("javascript:"));
    assert.ok(!sanitizeHtml('<img src="data:text/html,<script>">').includes("data:text/html"));
  });

  it("removes framing and form elements", () => {
    assert.ok(!sanitizeHtml("<iframe src='x'></iframe>").includes("<iframe"));
    assert.ok(!sanitizeHtml('<form action="http://evil"><input></form>').includes("<form"));
  });

  it("leaves ordinary styled markup alone", () => {
    // The whole document is inline-styled, so over-eager stripping would blank
    // every invoice.
    const out = sanitizeHtml('<p style="color:red">hi</p>');
    assert.ok(out.includes('style="color:red"'));
    assert.ok(out.includes("hi"));
  });
});

describe("formatPaise", () => {
  it("formats paise as rupees with Indian grouping", () => {
    assert.equal(formatPaise(732000), "₹7,320.00");
    assert.equal(formatPaise(12345678), "₹1,23,456.78");
  });

  it("formats zero and missing as ₹0.00", () => {
    assert.equal(formatPaise(0), "₹0.00");
    assert.equal(formatPaise(null), "₹0.00");
  });
});

describe("the shipped invoice template", () => {
  it("renders with no placeholder left behind", () => {
    const ctx = buildInvoiceContext(sampleInvoice(), {});
    const html = renderTemplate(sanitizeHtml(DEFAULT_INVOICE_HTML), ctx);

    assert.ok(!html.includes("{{"), "an unresolved placeholder would ship to a guest");
    assert.ok(html.includes("BLX-2026-000001"));
    assert.ok(html.includes("Dinner"));
    assert.ok(html.includes("₹2,070.00"));
  });

  it("escapes party names inside the document", () => {
    const ctx = buildInvoiceContext(sampleInvoice(), {});
    const html = renderTemplate(sanitizeHtml(DEFAULT_INVOICE_HTML), ctx);
    assert.ok(html.includes("Grand &lt;Palace&gt;"));
    assert.ok(!html.includes("<Palace>"));
  });

  it("shows the tax and coin rows only when they are non-zero", () => {
    const withBoth = renderTemplate(
      sanitizeHtml(DEFAULT_INVOICE_HTML),
      buildInvoiceContext(sampleInvoice(), {})
    );
    assert.ok(withBoth.includes("Tax (5%)"));
    assert.ok(withBoth.includes("Coins applied (1500)"));

    // A ₹0.00 tax line is noise on a document, and the flags exist because a
    // formatted "₹0.00" string is itself truthy.
    const plain = renderTemplate(
      sanitizeHtml(DEFAULT_INVOICE_HTML),
      buildInvoiceContext(
        { ...sampleInvoice(), taxPaise: 0, taxPercent: 0, coinsApplied: 0, coinsDiscountPaise: 0 },
        {}
      )
    );
    assert.ok(!plain.includes("Tax ("));
    assert.ok(!plain.includes("Coins applied"));
  });

  it("omits the logo block when no logo is configured", () => {
    const html = renderTemplate(
      sanitizeHtml(DEFAULT_INVOICE_HTML),
      buildInvoiceContext(sampleInvoice(), {})
    );
    assert.ok(!html.includes("<img"), "a broken image icon on an invoice reads as a bug");
  });

  it("defangs a template an admin has broken or poisoned", () => {
    const evil = '<div onclick="steal()"><script>steal()</script>{{buyer.name}}</div>';
    const out = renderTemplate(
      sanitizeHtml(evil),
      buildInvoiceContext(sampleInvoice(), {})
    );
    assert.ok(!out.includes("steal"));
    assert.ok(out.includes("Aarav"));
  });
});
