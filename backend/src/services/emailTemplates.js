/**
 * Email bodies.
 *
 * Deliberately hand-written, table-free, inline-styled HTML: mail clients strip
 * <style> blocks and understand almost no modern CSS, so a templating engine
 * would buy nothing here. Every message ships a plain-text part too — clients
 * that refuse HTML need it, and its absence is a mild spam signal.
 */

const BRAND = "#8d4360";

/** Codes are read and retyped by hand, so they are spaced for legibility. */
export const otpEmailTemplate = (otp, expiresMinutes) => ({
  text:
    `${otp} is your BillionaX verification code.\n\n` +
    `It expires in ${expiresMinutes} minutes. ` +
    `If you did not try to sign in, you can ignore this email — nobody can use the code without it.\n`,

  html: `<div style="margin:0;padding:32px 16px;background:#f6f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:14px;padding:36px 32px;">
    <div style="font-size:11px;letter-spacing:2.4px;color:${BRAND};font-weight:700;">BILLIONAX</div>

    <h1 style="margin:18px 0 8px;font-size:21px;line-height:1.3;color:#1a1418;font-weight:600;">
      Your verification code
    </h1>
    <p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#6b6169;">
      Enter this code to sign in. It expires in ${expiresMinutes} minutes.
    </p>

    <div style="background:#faf7f8;border:1px solid #ece4e8;border-radius:10px;padding:20px;text-align:center;">
      <span style="font-size:31px;letter-spacing:9px;font-weight:700;color:#1a1418;">${otp}</span>
    </div>

    <p style="margin:26px 0 0;font-size:12.5px;line-height:1.6;color:#8b8189;">
      If you did not try to sign in, you can ignore this email — the code is
      useless to anyone who does not have it. Never share it with anyone.
    </p>
  </div>
</div>`,
});
