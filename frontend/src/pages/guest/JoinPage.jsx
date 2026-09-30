import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { publicConfig, publicHotel, requestOtp, verifyOtp } from "../../api/auth.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { Spinner } from "../../components/common/index.jsx";
import { useAccentStyle, useFontRoot } from "../../components/layout/useThemeRoot.js";
import { WelcomeScreen } from "../../features/guest/WelcomeScreen.jsx";
import styles from "./JoinPage.module.css";

const STEP = { IDENTIFIER: "identifier", OTP: "otp" };

/**
 * The QR landing screen: guest scans at reception, enters their email, gets a
 * code, and lands with a membership card. `slug` is optional — /login reuses
 * this same flow without a hotel context.
 *
 * Two screens: a welcome screen with one "Get started" action, then the
 * sign-in form. Which one shows is carried in the HISTORY ENTRY (location
 * state), not in component state, so the phone's back button walks from the
 * form back to the welcome screen instead of leaving the site — and a refresh
 * on the form stays on the form. The URL itself never changes, so the QR
 * token in `?t=` rides along untouched.
 */

/*
 * Icons. Hand-written paths on a 20x20 box, matching the rest of the app —
 * there is no icon library in the bundle.
 */

const MailIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <rect x="2.2" y="4.4" width="15.6" height="11.2" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="m3 6 6.3 4.4a1.2 1.2 0 0 0 1.4 0L17 6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UserIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="10" cy="6.9" r="3.2" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M3.9 16.7c.9-3.3 3.2-5 6.1-5s5.2 1.7 6.1 5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const KeyIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="6.6" cy="10" r="3.4" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M10 10h7.2M14.6 10v2.6M17.2 10v1.8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const LockIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <rect x="4.2" y="8.6" width="11.6" height="8.2" rx="2.2" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M7 8.6V6.9a3 3 0 0 1 6 0v1.7"
      stroke="currentColor"
      strokeWidth="1.4"
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

const BackIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12.2 4.6 6.8 10l5.4 5.4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A labelled input in the sign-in style: spaced caps label, icon inside a
 * rounded glass box, and one line underneath that is the error when there is
 * one and the hint otherwise.
 *
 * Not the shared Field/Input: this screen's box carries the icon INSIDE the
 * border, and the label is tied to the input by id so a tap on it focuses the
 * field and a screen reader announces it.
 */
const LoginField = ({ id, label, icon: Icon, error, hint, className = "", ...input }) => {
  const note = error || hint;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <span className={`${styles.control} ${error ? styles.controlErr : ""}`}>
        {Icon && <Icon className={styles.controlIcon} />}
        <input
          id={id}
          className={`${styles.input} ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          {...input}
        />
      </span>
      {note && (
        <span id={`${id}-note`} className={error ? styles.err : styles.hint}>
          {note}
        </span>
      )}
    </div>
  );
};

const JoinPage = () => {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const qrToken = params.get("t") || undefined;
  const location = useLocation();
  // Which screen: see the note at the top. Only "Get started" ever sets it.
  const started = !!location.state?.started;

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
  const accent = useAppStore((s) => s.accent);
  const accentStyle = useAccentStyle();
  const font = useFontRoot();
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

  // Each screen starts at its top. The welcome screen's action sits at the
  // bottom, so without this the form would open scrolled past its heading.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [started, step]);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Caught here so the user sees the problem without a network round-trip.
  // The API enforces the same rule regardless. Deliberately loose — the real
  // test of an address is whether the code arrives.
  const emailIsValid = () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());

  /** Shared by the initial "Get my code" submit and the resend button. */
  const requestCode = async () => {
    if (!emailIsValid()) {
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

  /**
   * "Already have a code?" — straight to the code field WITHOUT issuing a new
   * one. A guest whose browser reloaded mid-flow still holds a live code, and
   * requesting another would kill it and spend one of their few sends.
   */
  const enterExistingCode = () => {
    if (!emailIsValid()) {
      setErrors({ identifier: "Enter the address your code was sent to" });
      return;
    }
    setErrors({});
    setMessage("");
    setDevOtp("");
    setCooldown(0);
    setStep(STEP.OTP);
  };

  const resendCode = async () => {
    if (cooldown > 0 || busy) return;
    // The old code is dead the moment a new one is issued, so clear the field
    // rather than leave a stale value that will now be rejected.
    setForm((f) => ({ ...f, otp: "" }));
    if (await requestCode()) setMessage("");
  };

  const changeAddress = () => {
    setStep(STEP.IDENTIFIER);
    setErrors({});
    setMessage("");
    setDevOtp("");
    setCooldown(0);
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
   * Pushes the form as its own history entry (see the note at the top).
   * Existing state is kept: a guard's redirect leaves `from` in it.
   */
  const getStarted = () =>
    navigate(
      { pathname: location.pathname, search: location.search },
      { state: { ...location.state, started: true } }
    );

  // On the code step, back means "change the address"; on the address step
  // it pops the entry getStarted pushed, which is the welcome screen.
  const goBack = () => (step === STEP.OTP ? changeAddress() : navigate(-1));

  const isIdentifier = step === STEP.IDENTIFIER;

  let screen;
  if (loadingHotel) {
    screen = (
      <div className="flex-1 grid place-items-center">
        <Spinner />
      </div>
    );
  } else if (!started) {
    screen = (
      <WelcomeScreen
        hotel={hotel}
        action={
          <button type="button" className={styles.cta} onClick={getStarted}>
            Get started
            <ArrowIcon className={styles.ctaArrow} />
          </button>
        }
      />
    );
  } else {
    screen = (
      <section className="flex flex-col flex-1 px-6 pt-6 pb-9">
        <div className="grid grid-cols-[40px_1fr_40px] items-center">
          <button
            type="button"
            className={styles.back}
            onClick={goBack}
            aria-label={isIdentifier ? "Back" : "Use a different address"}
          >
            <BackIcon />
          </button>
          <span className="flex items-center justify-center gap-2.5">
            <img src="/logo.png" alt="" className="w-7 h-7 object-contain brightness-135" />
            <span className={styles.wordmark}>Billionax</span>
          </span>
        </div>

        <p className={styles.kicker}>
          {isIdentifier ? (hotel ? hotel.name : "Welcome back") : "One last step"}
        </p>

        <h1 className={styles.title}>
          {isIdentifier ? (
            <>
              Your stay, <em>rewarded.</em>
            </>
          ) : (
            <>
              Check your <em>inbox.</em>
            </>
          )}
        </h1>

        <p className={styles.sub}>
          {isIdentifier ? (
            hotel ? (
              `You're at ${hotel.name}. Sign in with your email to turn every bill here into coins you can spend right away.`
            ) : (
              "Sign in with your email address to see your coins and unlock exclusive hotel experiences."
            )
          ) : (
            <>
              Enter the {otpLength}-digit code we sent to <b>{form.email.trim()}</b>
            </>
          )}
        </p>

        {message && (
          <div className={styles.alert} role="alert">
            <AlertIcon />
            <span>{message}</span>
          </div>
        )}

        {isIdentifier ? (
          <form onSubmit={sendCode} className="flex flex-col gap-6 mt-9" noValidate>
            <LoginField
              id="login-email"
              label="Email address"
              icon={MailIcon}
              type="email"
              inputMode="email"
              value={form.email}
              onChange={change("email")}
              error={errors.identifier}
              placeholder="rohan@example.com"
              autoComplete="email"
              autoFocus
              required
            />

            <LoginField
              id="login-name"
              label="Your name"
              icon={UserIcon}
              value={form.name}
              onChange={change("name")}
              error={errors.name}
              hint="Appears on your membership card"
              placeholder="Rohan Mehta"
              autoComplete="name"
            />

            <button type="submit" className={`${styles.cta} mt-3`} disabled={busy}>
              {busy ? "Sending…" : "Get my code"}
              {!busy && <ArrowIcon className={styles.ctaArrow} />}
            </button>

            <p className="text-center text-[14.5px] text-ink">
              Already have a code?{" "}
              <button type="button" className={styles.link} onClick={enterExistingCode}>
                Sign in
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-6 mt-9">
            {devOtp && (
              <div className={styles.devNote}>
                Development mode — any code works. Yours is <b>{devOtp}</b>
              </div>
            )}

            <LoginField
              id="login-otp"
              label="Verification code"
              icon={KeyIcon}
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
              placeholder={"•".repeat(otpLength)}
              className={styles.otpInput}
              autoComplete="one-time-code"
              autoFocus
              required
            />

            <button type="submit" className={`${styles.cta} mt-3`} disabled={busy}>
              {busy ? "Verifying…" : "Verify and continue"}
              {!busy && <ArrowIcon className={styles.ctaArrow} />}
            </button>

            <div className="flex flex-col items-center gap-3.5">
              <button
                type="button"
                className={styles.link}
                onClick={resendCode}
                disabled={busy || cooldown > 0}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
              </button>
              <button
                type="button"
                className={`${styles.link} ${styles.linkQuiet}`}
                onClick={changeAddress}
              >
                Use a different address
              </button>
            </div>
          </form>
        )}

        <p className={styles.secure}>
          <LockIcon />
          <span>
            Your information is secure
            <br />
            and protected
          </span>
        </p>
      </section>
    );
  }

  return (
    /*
     * Always the dark ground, whatever the guest's own toggle says: this is
     * the brand's front door, built for a dark room. The ACCENT and FONT still
     * come from the network — they are re-stated here beside data-theme
     * because the dark-mode accent corrections in themes.css are compound
     * [data-theme][data-accent] selectors, and the font tokens are declared
     * per theme block. Without both on this element the screen would lose the
     * admin's colour and typeface.
     *
     * Nothing is persisted: the guest's stored theme is untouched, and the
     * app returns to it the moment they are signed in.
     */
    <div
      className={styles.page}
      data-theme="emerald-noir"
      data-accent={accent}
      data-font={font}
      style={accentStyle}
    >
      <span className={styles.backdrop} aria-hidden="true" />
      <div key={started ? step : "welcome"} className={styles.screen}>
        {screen}
      </div>
    </div>
  );
};

export default JoinPage;
