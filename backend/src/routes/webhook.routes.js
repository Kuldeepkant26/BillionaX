import { Router } from "express";
import express from "express";
import { logger } from "../utils/logger.js";
import { isWebhookConfigured } from "../config/env.js";
import { verifyWebhookSignature } from "../payments/razorpay.provider.js";
import { Bill } from "../models/bill.model.js";
import { BILL_STATUS } from "../config/constants.js";
import { markBillPaid } from "../services/bill.service.js";

/**
 * Razorpay webhooks — the authority on whether a payment succeeded.
 *
 * MOUNTED BEFORE express.json(), and that ordering is load-bearing. The
 * signature is an HMAC over the EXACT bytes Razorpay sent; a parsed body
 * re-serialised loses key order and whitespace, and the signature then never
 * matches. express.raw() here keeps the original buffer.
 *
 * The browser's own callback also confirms payments, and usually arrives
 * first. This exists because that callback can be lost — the guest closes the
 * tab, the tunnel drops — and the money has still moved. Both paths end in the
 * same markBillPaid, whose status-flip mutex makes the second one a no-op.
 *
 * Always answers 200 once the signature checks out, even when the event is one
 * we ignore. A non-2xx makes Razorpay retry for hours over something we
 * deliberately did nothing about.
 */

const router = Router();

router.post(
  "/razorpay",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    if (!isWebhookConfigured) {
      // Nothing to verify against, so nothing here can be trusted. 503 rather
      // than 200: this is a misconfiguration to fix, not an event to drop.
      logger.warn("Razorpay webhook received but no webhook secret is configured");
      return res.status(503).json({ received: false });
    }

    const signature = req.get("x-razorpay-signature");
    const rawBody = req.body; // a Buffer, thanks to express.raw

    if (!verifyWebhookSignature({ rawBody, signature })) {
      logger.warn("Rejected a Razorpay webhook with a bad signature");
      return res.status(400).json({ received: false });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ received: false });
    }

    // Acknowledged immediately. Razorpay's delivery timeout is short, and a
    // slow database write must not turn a processed event into a retried one.
    res.status(200).json({ received: true });

    try {
      await handleEvent(event);
    } catch (error) {
      logger.error(`Razorpay webhook ${event?.event} failed: ${error.message}`);
    }
  }
);

/**
 * Applies one event.
 *
 * Idempotent by construction rather than by a processed-events table: every
 * write below is a conditional update that matches only a bill still in the
 * state being moved out of. A replayed event finds nothing to change.
 */
const handleEvent = async (event) => {
  const type = event?.event;
  const payment = event?.payload?.payment?.entity;

  logger.info(`Razorpay webhook: ${type} (${event?.id || "no id"})`);

  if (type === "payment.captured" && payment) {
    const bill = await Bill.findOne({ razorpayOrderId: payment.order_id }).lean();

    if (!bill) {
      logger.warn(`Captured payment ${payment.id} matched no bill`);
      return;
    }

    if (bill.status === BILL_STATUS.PAID) return; // Already settled.

    // Skips signature verification: the webhook's own HMAC has already proved
    // this came from Razorpay, which is a stronger guarantee than the
    // browser-supplied signature that path checks.
    await markBillPaid({
      billId: bill._id,
      guestId: bill.guestId,
      providerPaymentId: payment.id,
      signature: null,
      trusted: true,
    });
    return;
  }

  if (type === "payment.failed" && payment) {
    // The bill stays PENDING on purpose so the guest can simply try again.
    logger.warn(`Payment failed for order ${payment.order_id}: ${payment.error_description}`);
    return;
  }

  if (type === "transfer.processed" || type === "transfer.settled") {
    const transfer = event?.payload?.transfer?.entity;
    if (!transfer) return;

    await Bill.updateOne(
      { razorpayTransferId: transfer.id },
      { $set: { transferStatus: transfer.status } }
    );
  }
};

export default router;
