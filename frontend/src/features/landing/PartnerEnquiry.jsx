import { useState } from "react";
import { sendPartnerEnquiry } from "../../api/auth.api.js";

/**
 * The hotel partnership form at the foot of the landing page.
 *
 * Enquiries land in the main admin's Enquiries inbox (with a nav badge) — the
 * page never emails anyone, so there is no address here to scrape.
 *
 * Validation is the server's: the form sends what was typed and shows the
 * field errors that come back, so the rules live in one place
 * (partnerEnquiryRules) rather than drifting apart in two.
 */

const BLANK = {
  name: "",
  hotelName: "",
  email: "",
  phone: "",
  city: "",
  rooms: "",
  message: "",
  // The honeypot. Hidden from people, so only a bot fills it — see the API.
  website: "",
};

// Values are the API's ENQUIRY_ROOM_BANDS; tests/partnerEnquiry.test.js keeps
// the two lists in step.
const ROOM_BANDS = [
  ["1-25", "Up to 25 rooms"],
  ["26-75", "26 to 75 rooms"],
  ["76-150", "76 to 150 rooms"],
  ["150+", "More than 150 rooms"],
];

const control =
  "block w-full rounded-[14px] border bg-canvas px-4 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted focus:border-[var(--acc)] focus:shadow-[0_0_0_4px_var(--acc-soft)]";

const Field = ({ id, label, error, className = "", children }) => (
  <div className={className}>
    <label htmlFor={id} className="sr-only">
      {label}
    </label>
    {children}
    {error && (
      <p id={`${id}-error`} className="m-0 mt-1.5 px-1 text-[12.5px] text-bad">
        {error}
      </p>
    )}
  </div>
);

const pill =
  "inline-flex h-[52px] flex-1 items-center justify-center rounded-full text-[12px] font-semibold uppercase tracking-[0.18em] transition-[background,color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-60";

export const PartnerEnquiry = () => {
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Who it was from, once sent — the thank-you names them and the address
  // the reply will go to, so a typo there is caught while they are still here.
  const [sent, setSent] = useState(null);

  const change = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    // Clear a field's error as it is corrected, not only on the next submit.
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const clear = () => {
    setForm(BLANK);
    setErrors({});
    setMessage("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await sendPartnerEnquiry(form);
      setSent({ name: form.name.trim().split(/\s+/)[0], email: form.email.trim(), hotel: form.hotelName.trim() });
      setForm(BLANK);
    } catch (err) {
      const fieldErrors = err.fieldErrors || {};
      setErrors(fieldErrors);
      // Field errors speak for themselves beside their fields; only a failure
      // that belongs to no field (rate limit, network) needs a line of its own.
      if (!Object.keys(fieldErrors).length) setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const attrs = (key) => ({
    id: `enquiry-${key}`,
    value: form[key],
    onChange: change(key),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `enquiry-${key}-error` : undefined,
  });

  const border = (key) => (errors[key] ? "border-bad" : "border-transparent");

  if (sent) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[28px] bg-chip px-8 py-14 text-center" role="status">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-fg">
          <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        </span>
        <b className="mt-6 font-display text-[26px] font-semibold text-ink">Thank you, {sent.name}.</b>
        <p className="m-0 mt-3 max-w-[360px] text-[15px] leading-relaxed text-muted">
          We have received the enquiry for {sent.hotel}. The Billionax team will contact you at{" "}
          <span className="text-ink">{sent.email}</span>.
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-8 text-[13px] font-semibold text-ink underline underline-offset-4"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative rounded-[28px] bg-chip p-5 sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Field id="enquiry-name" label="Your name" error={errors.name}>
          <input {...attrs("name")} autoComplete="name" placeholder="Your name*" className={`${control} ${border("name")} h-[54px]`} />
        </Field>
        <Field id="enquiry-hotelName" label="Hotel name" error={errors.hotelName}>
          <input {...attrs("hotelName")} autoComplete="organization" placeholder="Hotel name*" className={`${control} ${border("hotelName")} h-[54px]`} />
        </Field>
        <Field id="enquiry-email" label="Work email" error={errors.email} className="sm:col-span-2">
          <input {...attrs("email")} type="email" autoComplete="email" placeholder="Work email*" className={`${control} ${border("email")} h-[54px]`} />
        </Field>
        <Field id="enquiry-phone" label="Phone number" error={errors.phone} className="sm:col-span-2">
          <input {...attrs("phone")} type="tel" autoComplete="tel" placeholder="Phone number*" className={`${control} ${border("phone")} h-[54px]`} />
        </Field>
        <Field id="enquiry-rooms" label="Number of rooms" error={errors.rooms}>
          <select {...attrs("rooms")} className={`${control} ${border("rooms")} h-[54px] ${form.rooms ? "" : "text-muted"}`}>
            <option value="">Number of rooms</option>
            {ROOM_BANDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="enquiry-city" label="City" error={errors.city}>
          <input {...attrs("city")} autoComplete="address-level2" placeholder="City*" className={`${control} ${border("city")} h-[54px]`} />
        </Field>
        <Field id="enquiry-message" label="Anything we should know" error={errors.message} className="sm:col-span-2">
          <textarea
            {...attrs("message")}
            rows={4}
            maxLength={1000}
            placeholder="Tell us about your property — outlets, guest volume, anything we should know."
            className={`${control} ${border("message")} resize-y py-3.5 leading-relaxed`}
          />
        </Field>
      </div>

      {/* Off-screen rather than display:none — some bots skip fields that
          are not rendered at all. Out of the tab order and the accessibility
          tree, so no person ever lands in it. */}
      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={change("website")} />
        </label>
      </div>

      {message && (
        <p className="m-0 mt-4 px-1 text-[13px] text-bad" role="alert">
          {message}
        </p>
      )}

      <div className="mt-5 flex gap-3 sm:gap-4">
        <button type="button" onClick={clear} disabled={busy} className={`${pill} border-[1.5px] border-ink text-ink hover:bg-ink hover:text-canvas`}>
          Clear
        </button>
        <button type="submit" disabled={busy} className={`${pill} bg-accent text-accent-fg hover:opacity-90`}>
          {busy ? "Sending…" : "Send enquiry"}
        </button>
      </div>

      <p className="m-0 mt-4 px-1 text-center text-[12px] leading-relaxed text-muted">
        We use these details only to contact you about joining Billionax.
      </p>
    </form>
  );
};
