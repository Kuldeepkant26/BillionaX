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
// The three fanned cards share every rule but their offset and depth.
const mini = "absolute w-[190px] h-[116px] rounded-[15px] p-[13px] overflow-hidden text-white";

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
    <div className={styles.page}>
      {/*
        No margin escape here any more — .page handles it. The hero used to pull
        itself out of <main>'s padding with -mt-5 -mx-[18px]; keeping the -mx on
        top of .page's own negative margin shifted it a second 18px and made the
        row 36px too wide, which is what pushed the form off the right edge.
      */}
      <div className={`relative h-[210px] mb-[22px] overflow-hidden ${styles.hero}`}>
        <span className={styles.orbA} />
        <span className={styles.orbB} />
        <div className="absolute inset-0">
          <div className={`${mini} top-[30px] -ml-7 opacity-[0.42] z-[1] ${styles.mini}`} />
          <div className={`${mini} top-[52px] -ml-3.5 opacity-70 z-[2] ${styles.mini}`} />
          <div className={`${mini} top-[74px] z-[3] ${styles.mini}`}>
            <span className={styles.shine} />
            <b className="text-[8.5px] tracking-[0.16em] font-bold opacity-[0.92]">WAVE COINS</b>
            <i className="absolute left-[13px] bottom-[13px] not-italic text-[9px] tracking-[0.14em] opacity-[0.78]">
              BILLIONAX
            </i>
          </div>
        </div>
      </div>

      <h1 className="display text-[27px] leading-[1.14]">
        Your stay, <em className="italic text-accent">rewarded</em>.
      </h1>

      <p className="text-muted text-[13px] leading-[1.55] mt-[9px] mb-5">
        {hotel
          ? `You're at ${hotel.name}. Turn every bill here into coins you can spend right away.`
          : "Sign in with your email address to see your coins."}
      </p>

      {message && (
        <div className="bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] border-l-[3px] border-l-[var(--bad)] rounded-token-sm px-3 py-2.5 text-[12.5px] text-[var(--bad)] mb-4">
          {message}
        </div>
      )}

      {step === STEP.IDENTIFIER ? (
        <form onSubmit={sendCode} className="mt-1">
          <Field label="Email address" error={errors.identifier}>
            <Input
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
          </Field>

          <Field label="Your name" hint="Appears on your membership card" error={errors.name}>
            <Input
              value={form.name}
              onChange={change("name")}
              error={errors.name}
              placeholder="Rohan Mehta"
              autoComplete="name"
            />
          </Field>

          <Button type="submit" block size="lg" disabled={busy}>
            {busy ? "Sending…" : "Get my code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-1">
          <p className="text-[13px] text-muted mb-3.5">
            We sent a code to <b className="text-ink">{form.email}</b>
          </p>

          {devOtp && (
            <div className="bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--warn)_45%,transparent)] rounded-token-sm px-3 py-2.5 text-xs text-[var(--warn)] mb-3.5">
              Development mode — any code works. Yours is{" "}
              <b className="font-display text-[15px] tracking-[2px]">{devOtp}</b>
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

          <Button type="submit" block size="lg" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>

          <button
            type="button"
            className="block w-full bg-none border-0 text-muted enabled:hover:text-ink text-[12.5px] mt-3.5 cursor-pointer underline disabled:cursor-default disabled:opacity-60 disabled:no-underline"
            onClick={resendCode}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
          </button>

          <button
            type="button"
            className="block w-full bg-none border-0 text-muted hover:text-ink text-[12.5px] mt-2.5 cursor-pointer underline"
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
    </div>
  );
};

export default JoinPage;
