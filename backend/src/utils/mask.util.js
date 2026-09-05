/**
 * Identity masking for the staff bill screen.
 *
 * The flow this serves: a guest is standing at the desk, staff search for them,
 * and read the masked address aloud to confirm they have the right person
 * before sending a bill. So the mask has to hide enough to be worth masking
 * while leaving enough to be recognisable when spoken.
 *
 * THIS LIVES SERVER-SIDE ON PURPOSE. Masking in the browser would mean the
 * full address was already in the response, the network tab, the disk cache and
 * every logging proxy in between — the mask would be decoration over data that
 * had already left. The list endpoint returns only the masked string; the full
 * address is a separate, deliberate read.
 */

/**
 * "kuldeepkant26@gmail.com" -> "kul•••••••26@gmail.com"
 *
 * Keeps the first three and last two characters of the local part, and the
 * domain intact. The domain is not secret and it is what makes the address
 * recognisable to its owner; the local part is the identifying half.
 *
 * A short local part is masked entirely rather than partially — "ab@x.com"
 * with one character hidden is not masked at all.
 */
export const maskEmail = (email) => {
  if (!email) return null;

  const value = String(email).trim();
  const at = value.lastIndexOf("@");

  // Not an address we recognise. Mask the whole thing rather than guessing —
  // returning it unchanged would leak precisely what this function exists to
  // hide.
  if (at <= 0) return "•".repeat(8);

  const local = value.slice(0, at);
  const domain = value.slice(at);

  if (local.length <= 5) return `${"•".repeat(Math.max(3, local.length))}${domain}`;

  const head = local.slice(0, 3);
  const tail = local.slice(-2);
  const hidden = "•".repeat(Math.max(3, local.length - 5));

  return `${head}${hidden}${tail}${domain}`;
};

/**
 * "9876543210" -> "98••••210"
 *
 * Mirrors maskPhone in the frontend's format.js, so a phone reads the same
 * whichever side rendered it.
 */
export const maskPhone = (phone) => {
  if (!phone) return null;
  const s = String(phone);
  return s.length <= 4 ? s : `${s.slice(0, 2)}••••${s.slice(-3)}`;
};
