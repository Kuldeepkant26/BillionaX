import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { publicConfig, publicHotel, requestOtp, verifyOtp } from "../../api/auth.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { Button, Field, Input, Loading } from "../../components/common/index.jsx";
import styles from "./JoinPage.module.css";

const STEP = { IDENTIFIER: "identifier", OTP: "otp" };

/**
 * The QR landing screen: guest scans at reception, enters their number, gets a
 * code, and lands with a membership card. `slug` is optional — /login reuses
 * this same flow without a hotel context.
 */

/** The Billionax monogram: a ring crossed by a vertical stroke. */
const Monogram = (props) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
    <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.4" />
    <path d="M16 2.5v27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/**
 * The four value props along the foot of the brand column. Hand-written paths,
 * like every other icon in the app — there is no icon library in the bundle.
 */
const PILLARS = [
  {
    label: "Premium\nhotels",
    path: "M4 21V6.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1V21M13 21V11h6a1 1 0 0 1 1 1v9M3 21h18M7 9h2M7 13h2M16 15h1",
  },
  { label: "Exclusive\noffers", path: "M12 3.5 21 10l-9 10.5L3 10z M3 10h18M8.5 10 12 3.5 15.5 10" },
  {
    label: "Billionax\ncoins",
    path: "M12 5.5c4 0 7 1 7 2.3s-3 2.2-7 2.2-7-1-7-2.2S8 5.5 12 5.5ZM5 7.8v8c0 1.3 3 2.3 7 2.3s7-1 7-2.3v-8M5 12c0 1.3 3 2.2 7 2.2s7-1 7-2.2",
  },
  { label: "Curated\nexperiences", path: "M12 3.5 14 10l6.5 2-6.5 2-2 6.5-2-6.5L3.5 12 10 10z" },
];

const JoinPage = () => {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const qrToken = params.get("t") || undefined;

  const [hotel, setHotel] = useState(null);
  const [loadingHotel, setLoadingHotel] = useState(!!slug);

  const [step, setStep] = useState(STEP.IDENTIFIER);
  const [form, setForm] = useState({ email: "", name: "", otp: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);
  // Seconds until "Resend code" becomes available again. The API allows only a
  // handful of requests per window, so an impatient tap must not burn them.
  const [cooldown, setCooldown] = useState(0);
  /**
   * How many digits the code has. Read from the server rather than hardcoded,
   * because OTP_LENGTH is configurable — a hardcoded 4 would silently truncate
   * the moment anyone raises it. The default matches the server's own.
   */
  const [otpLength, setOtpLength] = useState(4);

  const setAuth = useAppStore((s) => s.setAuth);
  const setActiveHotel = useAppStore((s) => s.setActiveHotel);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) return;
    publicHotel(slug)
      .then((data) => setHotel(data.hotel))
      .catch(() => setMessage("We could not find that hotel."))
      .finally(() => setLoadingHotel(false));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    publicConfig()
      .then((data) => {
        if (!cancelled && data?.otpLength) setOtpLength(data.otpLength);
      })
      // The default already makes the field usable; a failed config fetch must
      // never block sign-in.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /** Shared by the initial "Get my code" submit and the resend button. */
  const requestCode = async () => {
    // Caught here so the user sees the problem without a network round-trip.
    // The API enforces the same rule regardless. Deliberately loose — the real
    // test of an address is whether the code arrives.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      setErrors({ identifier: "Enter a valid email address" });
      return false;
    }

    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const data = await requestOtp(form.email.trim());
      // Surfaced only while the dev bypass is on, so the flow is testable
      // without an SMS gateway.
      if (data?.devOtp) setDevOtp(data.devOtp);
      setCooldown(30);
      return true;
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async (e) => {
    e.preventDefault();
    if (await requestCode()) setStep(STEP.OTP);
  };

  const resendCode = async () => {
    if (cooldown > 0 || busy) return;
    // The old code is dead the moment a new one is issued, so clear the field
    // rather than leave a stale value that will now be rejected.
    setForm((f) => ({ ...f, otp: "" }));
    if (await requestCode()) setMessage("");
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const data = await verifyOtp({
        identifier: form.email.trim(),
        otp: form.otp,
        name: form.name || undefined,
        hotelSlug: slug,
        qrToken,
      });

      setAuth({ user: data.user, accessToken: data.accessToken });

      if (data.joined) {
        setActiveHotel(data.joined.hotel.id);
        if (data.joined.welcomeCoins > 0) {
          toastSuccess(`${data.joined.welcomeCoins.toLocaleString("en-IN")} welcome coins added`);
        }
      }

      navigate(ROUTES.APP, { replace: true });
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loadingHotel) return <Loading />;

  return (
    /*
     * data-theme is pinned here rather than read from the store: the client's
     * design for this screen is dark whatever theme the network is running.
     * The tokens in themes.css are scoped to [data-theme], so this re-points
     * them for this subtree alone and the store is never written — the app
     * goes back to the configured theme as soon as the guest is signed in.
     */
    <div className={styles.page} data-theme="emerald-noir">
      <div className={styles.shell}>
        {/*
          The wordmark is its own element rather than part of .brandCol: on a
          phone the rest of the brand column moves BELOW the form, and a screen
          whose first item is an unlabelled input reads as broken. This stays on
          top at every width and rejoins the brand column on a desktop.
        */}
        <div className={styles.wordmark}>
          <Monogram className={styles.mark} />
          <span className={styles.wordmarkText}>BILLIONAX</span>
        </div>

        <div className={styles.brandCol}>
          <span className={styles.kicker}>More than a stay</span>

          <h1 className={`${styles.headline} ${styles.pitch}`}>
            It&rsquo;s a world of
            <em>privileges.</em>
          </h1>

          <p className={`${styles.blurb} ${styles.pitchSub}`}>
            Unlock exclusive experiences, earn Billionax Coins and make every stay more rewarding.
          </p>

          <hr className={styles.rule} />

          {/* The membership card and the pull quote are desktop furniture: on a
              phone they are pure height between the guest and the form, so
              .decor drops them there rather than making the page scroll. */}
          <div className={`${styles.cardStack} ${styles.decor}`} aria-hidden="true">
            <div className={styles.card}>
              <span className={styles.shine} />
              <b className={styles.cardName}>BILLIONAX</b>
              <span className={styles.cardFoot}>
                <span />
                <Monogram className={styles.cardMark} />
              </span>
            </div>
          </div>

          <div className={styles.pillars}>
            {PILLARS.map((pillar) => (
              <span key={pillar.label} className={styles.pillar}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d={pillar.path}
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {/* Two lines in the mockup; one line in the compact phone row. */}
                <i className="not-italic">{pillar.label}</i>
              </span>
            ))}
          </div>

          <p className={`${styles.quote} ${styles.decor}`}>
            Luxury isn&rsquo;t a place,
            <br />
            it&rsquo;s a feeling.
          </p>
        </div>

        <div className={styles.formCol}>
          <div className={styles.panel}>
            <span className={styles.kicker}>
              {step === STEP.IDENTIFIER ? "Welcome back" : "Almost there"}
            </span>

            <h2 className={`${styles.headline} ${styles.panelTitle}`}>
              Your stay,
              <em>rewarded.</em>
            </h2>

            {/* First step only: on the OTP step "We sent a code to …" says where
                the guest is, and both lines together repeat themselves in the
                space a phone has for one. */}
            {step === STEP.IDENTIFIER && (
              /* .keep marks the hotel variant: which hotel the guest has just
                 scanned into is the one line worth the height on a short
                 landscape screen, where the generic copy is dropped. */
              <p className={`${styles.blurb} ${styles.panelSub} ${hotel ? styles.keep : ""}`}>
                {hotel
                  ? `You're at ${hotel.name}. Turn every bill here into coins you can spend right away.`
                  : "Sign in with your email address to see your coins and unlock exclusive hotel experiences."}
              </p>
            )}

            {message && <div className={styles.alert}>{message}</div>}

            {step === STEP.IDENTIFIER ? (
              <form onSubmit={sendCode}>
                <Field label="Email address" error={errors.identifier}>
                  <span className={styles.inputWrap}>
                    <svg
                      className={styles.inputIcon}
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <rect
                        x="2.2"
                        y="4.4"
                        width="15.6"
                        height="11.2"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                      <path
                        d="m2.8 5.8 7.2 5 7.2-5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <Input
                      type="email"
                      inputMode="email"
                      value={form.email}
                      onChange={change("email")}
                      error={errors.identifier}
                      placeholder="rohan@example.com"
                      autoComplete="email"
                      className={styles.withIcon}
                      autoFocus
                      required
                    />
                  </span>
                </Field>

                <Field label="Your name" hint="Appears on your membership card" error={errors.name}>
                  <span className={styles.inputWrap}>
                    <svg
                      className={styles.inputIcon}
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="10" cy="7" r="3.1" stroke="currentColor" strokeWidth="1.4" />
                      <path
                        d="M3.9 16.6c.8-3.2 3.2-4.9 6.1-4.9s5.3 1.7 6.1 4.9"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                    <Input
                      value={form.name}
                      onChange={change("name")}
                      error={errors.name}
                      placeholder="Rohan Mehta"
                      autoComplete="name"
                      className={styles.withIcon}
                    />
                  </span>
                </Field>

                <Button type="submit" block size="lg" disabled={busy} className={styles.submit}>
                  {busy ? "Sending…" : "Get my code"}
                  {!busy && (
                    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
                      <path
                        d="M3.5 10h13M11.5 5l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={verify}>
                <p className={styles.sentTo}>
                  We sent a code to <b>{form.email}</b>
                </p>

                {devOtp && (
                  <div className={styles.devNote}>
                    Development mode — any code works. Yours is <b>{devOtp}</b>
                  </div>
                )}

                <Field label="Verification code" error={errors.otp}>
                  <Input
                    inputMode="numeric"
                    // Codes are digits only and exactly otpLength long. maxLength
                    // alone would not be enough: a paste of "code: 1234" still lands
                    // non-digits in the field, so the value is filtered on the way in.
                    pattern="[0-9]*"
                    maxLength={otpLength}
                    value={form.otp}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        otp: e.target.value.replace(/\D/g, "").slice(0, otpLength),
                      }))
                    }
                    error={errors.otp}
                    placeholder={"1".repeat(otpLength)}
                    className="font-display text-[22px] tracking-[6px] text-center"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </Field>

                <Button type="submit" block size="lg" disabled={busy} className={styles.submit}>
                  {busy ? "Verifying…" : "Verify and continue"}
                </Button>

                <button
                  type="button"
                  className={styles.textLink}
                  onClick={resendCode}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
                </button>

                <button
                  type="button"
                  className={styles.textLink}
                  onClick={() => {
                    setStep(STEP.IDENTIFIER);
                    setDevOtp("");
                    setCooldown(0);
                  }}
                >
                  Use a different address
                </button>
              </form>
            )}

            <p className={styles.secure}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect
                  x="4"
                  y="8.6"
                  width="12"
                  height="8.4"
                  rx="1.8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M6.9 8.6V6.8a3.1 3.1 0 0 1 6.2 0v1.8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Your information is secure and protected
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;
