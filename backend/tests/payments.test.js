/**
 * Tests for the payment provider boundary.
 *
 * Why these are the pieces worth pinning:
 *
 *  - `verifyPayment` is the only thing standing between a forged callback and
 *    a bill marked PAID. If it ever returns true for a signature it should
 *    reject, anyone who learns a bill's order id can pay nothing and have the
 *    hotel told they paid. Nothing else in the system would notice.
 *
 *  - The demo and live providers must never confirm each other's orders. A
 *    deployment that lost its credentials would otherwise fall back to demo
 *    and start "confirming" real payments for free.
 *
 *  - Mode is chosen by credential presence, never NODE_ENV. Getting that
 *    backwards means a staging box with real keys quietly takes real money,
 *    or a production box without them rejects every payment instead of
 *    degrading to a demo.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const KEY_SECRET = "test-key-secret";
const WEBHOOK_SECRET = "test-webhook-secret";

let demoProvider, razorpayProvider, verifyWebhookSignature, PROVIDER_CONTRACT;
let encryptSecret, decryptSecret, maskSecret;

before(async () => {
  process.env.RAZORPAY_KEY_ID ||= "rzp_test_pinned";
  process.env.RAZORPAY_KEY_SECRET ||= KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET ||= WEBHOOK_SECRET;
  process.env.CREDENTIAL_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");

  ({ default: demoProvider } = await import("../src/payments/demo.provider.js"));
  ({ default: razorpayProvider, verifyWebhookSignature } = await import(
    "../src/payments/razorpay.provider.js"
  ));
  ({ PROVIDER_CONTRACT } = await import("../src/payments/provider.interface.js"));
  ({ encryptSecret, decryptSecret, maskSecret } = await import("../src/utils/crypto.util.js"));
});

const sign = (orderId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

describe("provider contract", () => {
  it("both providers implement every method", () => {
    for (const method of PROVIDER_CONTRACT) {
      assert.equal(typeof demoProvider[method], "function", `demo.${method}`);
      assert.equal(typeof razorpayProvider[method], "function", `razorpay.${method}`);
    }
  });

  it("reports its own mode", () => {
    assert.equal(demoProvider.mode, "DEMO");
    assert.equal(razorpayProvider.mode, "LIVE");
  });
});

describe("razorpay verifyPayment", () => {
  it("accepts a signature made with the key secret", async () => {
    const result = await razorpayProvider.verifyPayment({
      providerOrderId: "order_A",
      providerPaymentId: "pay_A",
      signature: sign("order_A", "pay_A"),
    });
    assert.equal(result.ok, true);
  });

  it("rejects a forged signature", async () => {
    const result = await razorpayProvider.verifyPayment({
      providerOrderId: "order_A",
      providerPaymentId: "pay_A",
      signature: "de".repeat(32),
    });
    assert.equal(result.ok, false);
  });

  it("rejects a signature signed with the wrong secret", async () => {
    const result = await razorpayProvider.verifyPayment({
      providerOrderId: "order_A",
      providerPaymentId: "pay_A",
      signature: sign("order_A", "pay_A", "not-the-secret"),
    });
    assert.equal(result.ok, false);
  });

  it("rejects a wrong-length signature without throwing", async () => {
    // timingSafeEqual throws on unequal lengths, so this must be guarded
    // before the comparison — a crash here would be a 500 on every bad input.
    const result = await razorpayProvider.verifyPayment({
      providerOrderId: "order_A",
      providerPaymentId: "pay_A",
      signature: "abcd",
    });
    assert.equal(result.ok, false);
  });

  it("rejects a valid signature replayed onto a different payment", async () => {
    // The signature covers "<order>|<payment>", so lifting one from a real
    // payment must not confirm another.
    const result = await razorpayProvider.verifyPayment({
      providerOrderId: "order_A",
      providerPaymentId: "pay_DIFFERENT",
      signature: sign("order_A", "pay_A"),
    });
    assert.equal(result.ok, false);
  });

  it("refuses an incomplete confirmation", async () => {
    await assert.rejects(
      () => razorpayProvider.verifyPayment({ providerOrderId: "order_A" }),
      (error) => error.statusCode === 400
    );
  });
});

describe("webhook signatures", () => {
  const body = '{"event":"payment.captured","payload":{}}';

  it("accepts a body signed with the webhook secret", () => {
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    assert.equal(verifyWebhookSignature({ rawBody: body, signature }), true);
  });

  it("rejects a body altered after signing", () => {
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    // One trailing space. This is why the raw body must be verified before
    // express.json() reparses it.
    assert.equal(verifyWebhookSignature({ rawBody: `${body} `, signature }), false);
  });

  it("rejects a missing signature", () => {
    assert.equal(verifyWebhookSignature({ rawBody: body, signature: "" }), false);
  });
});

describe("provider isolation", () => {
  it("demo refuses to verify a live order", async () => {
    // The guard that stops a credential-less deployment from confirming real
    // payments for free.
    await assert.rejects(
      () =>
        demoProvider.verifyPayment({
          providerOrderId: "order_RealLiveId",
          providerPaymentId: "pay_x",
          signature: "x",
        }),
      (error) => error.statusCode === 400
    );
  });

  it("demo verifies its own order regardless of signature", async () => {
    const order = await demoProvider.createOrder({ amountPaise: 100, receipt: "b1" });
    const result = await demoProvider.verifyPayment({
      providerOrderId: order.providerOrderId,
      providerPaymentId: "demo_pay_1",
      signature: "irrelevant",
    });
    assert.equal(result.ok, true);
  });

  it("live cannot verify a demo order", async () => {
    // No secret ever signed a demo order, so no signature can match.
    const order = await demoProvider.createOrder({ amountPaise: 100, receipt: "b1" });
    const result = await razorpayProvider.verifyPayment({
      providerOrderId: order.providerOrderId,
      providerPaymentId: "demo_pay_1",
      signature: "de".repeat(32),
    });
    assert.equal(result.ok, false);
  });
});

describe("demo createOrder", () => {
  it("returns paise unchanged and flags the row as demo", async () => {
    const order = await demoProvider.createOrder({ amountPaise: 450000, receipt: "bill_1" });
    assert.equal(order.amountPaise, 450000);
    assert.equal(order.isDemo, true);
    assert.equal(order.currency, "INR");
    assert.match(order.providerOrderId, /^demo_order_/);
  });

  it("refuses a non-integer or zero amount", async () => {
    for (const amountPaise of [0, -1, 12.5, null]) {
      await assert.rejects(
        () => demoProvider.createOrder({ amountPaise, receipt: "b" }),
        (error) => error.statusCode === 400,
        `should reject ${amountPaise}`
      );
    }
  });
});

describe("credential vault", () => {
  it("round-trips a secret", () => {
    const secret = "rzp_live_AbCdEf123456";
    assert.equal(decryptSecret(encryptSecret(secret)), secret);
  });

  it("produces different ciphertext for the same input", () => {
    // A fresh IV per call. Otherwise anyone reading the collection could tell
    // two hotels share a key without decrypting either.
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), "same");
    assert.equal(decryptSecret(b), "same");
  });

  it("detects tampering via the GCM auth tag", () => {
    const stored = encryptSecret("rzp_live_key");
    const parts = stored.split(":");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 1;
    parts[3] = body.toString("base64url");

    assert.throws(() => decryptSecret(parts.join(":")));
  });

  it("rejects an unknown format version", () => {
    assert.throws(() => decryptSecret("v2:a:b:c"));
  });

  it("passes null through rather than encrypting an empty value", () => {
    assert.equal(encryptSecret(null), null);
    assert.equal(encryptSecret(""), null);
    assert.equal(decryptSecret(null), null);
  });

  it("masks a secret without revealing it", () => {
    const masked = maskSecret("rzp_live_AbCdEf123456");
    assert.ok(!masked.includes("AbCdEf"));
    assert.ok(masked.endsWith("3456"));
    assert.ok(masked.startsWith("rzp_live_"));
  });
});
