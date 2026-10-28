/**
 * The landing page's hotel enquiry form.
 *
 * The form is the one unauthenticated write the public site makes, so these
 * pin the parts that would fail quietly: a model that lets an incomplete lead
 * through, a validator that rejects a real hotel's landline, the honeypot
 * saving bot rows, and an admin route the badge depends on being shadowed by
 * the :enquiryId param.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

import {
  ENQUIRY_STATUS,
  ENQUIRY_STATUS_VALUES,
  ENQUIRY_ROOM_BANDS,
} from "../src/config/constants.js";
import { PartnerEnquiry } from "../src/models/partnerEnquiry.model.js";
import { partnerEnquiryRules } from "../src/validators/common.validator.js";
import publicRoutes from "../src/routes/public.routes.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { parseRecipients } from "../src/services/enquiry.service.js";
import { partnerEnquiryEmailTemplate } from "../src/services/emailTemplates.js";

const here = dirname(fileURLToPath(import.meta.url));

const VALID = {
  name: "Riya Mehta",
  hotelName: "Casa Solene",
  email: "Riya@CasaSolene.example",
  phone: "+91 22 4000 1234",
  city: "Mumbai",
  rooms: "26-75",
  message: "We have 48 rooms and two restaurants.",
};

/** Runs the rule chain the way express would and returns the failing fields. */
const failingFields = async (body) => {
  const req = { body: { ...body } };
  const errors = [];
  for (const rule of partnerEnquiryRules) {
    const result = await rule.run(req);
    errors.push(...result.array());
  }
  return { fields: [...new Set(errors.map((e) => e.path))], body: req.body };
};

describe("enquiry constants", () => {
  it("has the three inbox states, NEW first", () => {
    assert.deepEqual(ENQUIRY_STATUS_VALUES, ["NEW", "CONTACTED", "CLOSED"]);
  });

  it("is frozen", () => {
    assert.ok(Object.isFrozen(ENQUIRY_STATUS));
    assert.ok(Object.isFrozen(ENQUIRY_ROOM_BANDS));
  });

  it("matches the bands the landing form offers", () => {
    const form = readFileSync(
      join(here, "../../frontend/src/features/landing/PartnerEnquiry.jsx"),
      "utf8"
    );
    for (const band of ENQUIRY_ROOM_BANDS) {
      assert.ok(form.includes(`"${band}"`), `the form does not offer ${band}`);
    }
  });
});

describe("PartnerEnquiry model", () => {
  it("accepts a complete enquiry and starts it as NEW", () => {
    const doc = new PartnerEnquiry(VALID);
    assert.equal(doc.validateSync(), undefined);
    assert.equal(doc.status, ENQUIRY_STATUS.NEW);
    assert.equal(doc.email, "riya@casasolene.example");
  });

  it("requires the five contact fields", () => {
    const err = new PartnerEnquiry({}).validateSync();
    for (const field of ["name", "hotelName", "email", "phone", "city"]) {
      assert.ok(err?.errors?.[field], `${field} was not required`);
    }
  });

  it("leaves the size optional", () => {
    const doc = new PartnerEnquiry({ ...VALID, rooms: undefined });
    assert.equal(doc.validateSync(), undefined);
    assert.equal(doc.rooms, null);
  });

  it("refuses an unknown status or size", () => {
    const err = new PartnerEnquiry({ ...VALID, status: "WON", rooms: "999" }).validateSync();
    assert.ok(err?.errors?.status);
    assert.ok(err?.errors?.rooms);
  });
});

describe("partnerEnquiryRules", () => {
  it("passes a complete enquiry and lower-cases the email", async () => {
    const { fields, body } = await failingFields(VALID);
    assert.deepEqual(fields, []);
    assert.equal(body.email, "riya@casasolene.example");
  });

  it("accepts a landline and a bare mobile alike", async () => {
    for (const phone of ["022 4000 1234", "9876543210", "+44 (20) 7946 0958"]) {
      const { fields } = await failingFields({ ...VALID, phone });
      assert.deepEqual(fields, [], `${phone} was rejected`);
    }
  });

  it("rejects what is not a phone number", async () => {
    for (const phone of ["call me", "12345", "+91 98765 43210 ext 4 please"]) {
      const { fields } = await failingFields({ ...VALID, phone });
      assert.deepEqual(fields, ["phone"], `${phone} was accepted`);
    }
  });

  it("rejects a bad email and an unknown size", async () => {
    const { fields } = await failingFields({ ...VALID, email: "riya@", rooms: "500" });
    assert.deepEqual(fields.sort(), ["email", "rooms"]);
  });

  it("treats an unchosen size as no answer", async () => {
    const { fields } = await failingFields({ ...VALID, rooms: "" });
    assert.deepEqual(fields, []);
  });
});

describe("POST /public/enquiries", () => {
  let server;
  let base;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/public", publicRoutes);
    app.use(errorHandler);
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/public`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const post = (body) =>
    fetch(`${base}/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // No database is connected here. A honeypot hit that reached the model would
  // hang on mongoose's buffered write and then fail — answering at once is the
  // proof that nothing was saved.
  it("answers a filled honeypot with success and saves nothing", async () => {
    const res = await post({ ...VALID, website: "https://spam.example" });
    assert.equal(res.status, 201);
  });

  it("refuses an incomplete enquiry with field errors", async () => {
    const res = await post({ name: "R" });
    assert.equal(res.status, 422);
    const json = await res.json();
    const fields = (json.details || []).map((e) => e.field);
    for (const field of ["name", "hotelName", "email", "phone", "city"]) {
      assert.ok(fields.includes(field), `${field} was not reported`);
    }
  });
});

describe("admin enquiry routes", () => {
  it("registers new-count before the :enquiryId param", () => {
    const src = readFileSync(join(here, "../src/routes/admin.routes.js"), "utf8");
    const count = src.indexOf('"/enquiries/new-count"');
    const param = src.indexOf('"/enquiries/:enquiryId"');
    assert.ok(count > -1 && param > -1, "a route is missing");
    assert.ok(count < param, "new-count would be read as an enquiry id");
  });
});

describe("enquiry email", () => {
  it("reads ENQUIRY_EMAIL_TO as a clean list", () => {
    assert.deepEqual(
      parseRecipients(" Partners@Billionax.com, owner@billionax.com ,,partners@billionax.com, not-an-address"),
      ["partners@billionax.com", "owner@billionax.com"]
    );
    assert.deepEqual(parseRecipients(""), []);
    assert.deepEqual(parseRecipients(undefined), []);
  });

  const email = partnerEnquiryEmailTemplate({
    name: "Riya <b>Mehta</b>",
    hotelName: 'Casa "Solene" & Spa',
    email: "riya@casasolene.example",
    phone: "022 4000 1234",
    city: "Mumbai",
    roomsLabel: "26–75 rooms",
    message: "<script>alert(1)</script>\nTwo restaurants.",
    receivedLabel: "28 Oct 2026, 11:40 am",
    inboxUrl: "https://billionax.com/admin/enquiries",
  });

  it("escapes everything the stranger typed in the HTML part", () => {
    assert.ok(!email.html.includes("<script>"), "a script tag reached the HTML");
    assert.ok(!email.html.includes("<b>Mehta</b>"), "markup in the name reached the HTML");
    assert.ok(email.html.includes("Casa &#34;Solene&#34; &#38; Spa"));
  });

  it("carries every field in both parts", () => {
    for (const part of [email.text, email.html]) {
      for (const value of ["022 4000 1234", "Mumbai", "26–75 rooms", "riya@casasolene.example", "https://billionax.com/admin/enquiries"]) {
        assert.ok(part.includes(value), `${value} missing`);
      }
    }
  });

  it("says so when there is no message or size", () => {
    const bare = partnerEnquiryEmailTemplate({
      name: "Riya",
      hotelName: "Casa Solene",
      email: "riya@casasolene.example",
      phone: "9876543210",
      city: "Mumbai",
      roomsLabel: null,
      message: "",
      receivedLabel: "today",
      inboxUrl: "https://billionax.com/admin/enquiries",
    });
    assert.ok(bare.text.includes("(none)"));
    assert.ok(bare.text.includes("Size: Not given"));
    assert.ok(bare.html.includes("No message."));
  });
});
