import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { publicConfig, publicHotel, requestOtp, verifyOtp } from "../../api/auth.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { Button, Field, Input, Loading } from "../../components/common/index.jsx";
import {
  DEFAULT_LOGIN_DESIGN,
  resolveLoginDesign,
} from "../../features/guest/loginDesigns/registry.jsx";
import { useLoginTheme } from "../../features/guest/loginDesigns/useLoginTheme.js";
import styles from "./JoinPage.module.css";

const STEP = { IDENTIFIER: "identifier", OTP: "otp" };

/**
 * The QR landing screen: guest scans at reception, enters their number, gets a
 * code, and lands with a membership card. `slug` is optional — /login reuses
 * this same flow without a hotel context.
 */

/*
 * Icons. Hand-written paths on a 20x20 box, matching the rest of the app —
 * there is no icon library in the bundle.
 */

const MailIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <rect x="2.2" y="4.4" width="15.6" height="11.2" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="m3 6 6.3 4.4a1.2 1.2 0 0 0 1.4 0L17 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UserIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="10" cy="6.9" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M3.9 16.7c.9-3.3 3.2-5 6.1-5s5.2 1.7 6.1 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const LockIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <rect x="4.2" y="8.6" width="11.6" height="8.2" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M7 8.6V6.9a3 3 0 0 1 6 0v1.7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const AlertIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="10" cy="10" r="7.4" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 6.2v4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="13.4" r="0.9" fill="currentColor" />
  </svg>
);

const ArrowIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.8 10h12.4M11.2 5.2 16.2 10l-5 4.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
  /**
   * The public config: which design to draw, and the sign-in screen's own
   * palette and ground. Held whole rather than picked apart into three
   * useStates — they arrive together in one response and are consumed
   * together by useLoginTheme.
   *
   * Starts empty, which resolves to the house default design inheriting the
   * network accent — so the first paint is never blank and never wrong for a
   * network that has not touched these settings.
   */
  const [config, setConfig] = useState(null);
  const designKey = config?.loginDesign || DEFAULT_LOGIN_DESIGN;

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
        if (cancelled) return;
        if (data?.otpLength) setOtpLength(data.otpLength);
        // The design, palette and ground the main admin chose. All of it
        // rides the SAME public config call the OTP length already uses —
        // this screen must not make a second request to know how it looks.
        setConfig(data || null);
      })
      // The default already makes the field usable; a failed config fetch must
      // never block sign-in. The design falls back to the house default for
      // the same reason: a settings outage must not close the front door.
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

  /*
   * The sign-in screen's own palette and ground. Called before the
   * loadingHotel guard below so it sits with the other hooks and can never
   * end up behind a conditional return.
   */
  const themeProps = useLoginTheme(config);

  if (loadingHotel) return <Loading />;

  const isIdentifier = step === STEP.IDENTIFIER;

  /*
   * The admin's chosen design, resolved to its chrome. This decides the frame
   * only — the backdrop art, where the brand sits, and how the sheet meets the
   * band. The form below is one implementation shared by every design; see the
   * note at the top of the registry for why that split is deliberate.
   */
  const { chrome } = resolveLoginDesign(designKey);
  const Art = chrome.art;

  const bandClass = {
    none: styles.bandNone,
    short: styles.bandShort,
    mid: styles.bandMid,
    tall: styles.bandTall,
  }[chrome.band];

  const joinClass = {
    arc: styles.joinArc,
    bevel: styles.joinBevel,
    straight: styles.joinStraight,
  }[chrome.join];

  /*
   * The MINIMAL family is a different composition, not a shorter band: no
   * band, no join, and the brand stacked directly above the form, the whole
   * thing centred in the viewport.
   *
   * It is one class on the page rather than a second JSX branch on purpose —
   * the markup is identical, only the layout differs, and a branch here would
   * be a second place for the form to drift out of step. The stylesheet
   * neutralises the band and join rules under .stack.
   */
  const stacked = chrome.band === "none";

  return (
    /*
     * No data-theme here on purpose. GuestLayout already puts the guest's own
     * theme and the network accent on an ancestor, so this screen inherits
     * both: it renders light on lumen and dark on emerald-noir, and re-skins
     * itself when the main admin changes the accent. Pinning a theme here (an
     * earlier version pinned emerald-noir) is what made the screen ignore the
     * network's colours.
     */
    <div className={`${styles.page} ${stacked ? styles.stack : ""}`} {...themeProps}>
      {/* The MINIMAL family's ground, sized to the page rather than a band.
          It sits behind everything and is decorative by the same contract. */}
      {stacked && (
        <span className={styles.pageArt} aria-hidden="true">
          <Art />
        </span>
      )}

      <header
        className={[
          styles.header,
          bandClass,
          joinClass,
          chrome.onDark ? styles.onDark : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* The design's backdrop. Decorative and non-interactive by contract —
            see the note in artwork.jsx.

            Skipped for the MINIMAL family: their art is a whole-page ground
            rather than a band backdrop, so it is rendered on the page below
            instead. Painting it here too would clip it to a band that these
            designs do not have. */}
        {!stacked && <Art />}

        <div
          className={`${styles.brand} ${chrome.brand === "center" ? styles.brandCenter : ""}`}
        >
          {/* The real Billionax mark from public/logo.png, the same asset the
              panel rail and the favicon use — not a drawn stand-in. */}
          <span
            className={`${styles.logoTile} ${chrome.onDark ? "" : styles.logoTilePlain}`}
            aria-hidden="true"
          >
            <img src="/logo.png" alt="" className={styles.logoMark} />
          </span>
          <span>
            <b className={styles.brandName}>Billionax</b>
            <small className={styles.brandTag}>Luxury stays, rewarded</small>
          </span>
        </div>
      </header>

      <div className={`${styles.sheet} ${joinClass}`}>
        <div
          className={`${styles.body} ${chrome.align === "left" ? styles.alignLeft : ""}`}
        >
          <h1 className={styles.title}>{isIdentifier ? "Sign in" : "Verify it's you"}</h1>

          {isIdentifier && (
            <p className={styles.sub}>
              {hotel
                ? `You're at ${hotel.name}. Turn every bill here into coins you can spend right away.`
                : "Enter your email and we'll send you a code — no password to remember."}
            </p>
          )}

          {!isIdentifier && (
            <p className={styles.sentTo}>
              We sent a code to <b>{form.email}</b>
            </p>
          )}

          {message && (
            <div className={styles.alert} role="alert">
              <AlertIcon />
              <span>{message}</span>
            </div>
          )}

          {isIdentifier ? (
            <form onSubmit={sendCode} className={styles.form}>
              <Field label="Email address" error={errors.identifier}>
                <span className={styles.inputWrap}>
                  <MailIcon className={styles.inputIcon} />
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
                  <UserIcon className={styles.inputIcon} />
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
                {!busy && <ArrowIcon width="17" height="17" />}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className={styles.form}>
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
                  className={styles.otpInput}
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
                className={`${styles.textLink} ${styles.textLinkQuiet}`}
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
            <LockIcon />
            Your information is secure and protected
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;
