import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { publicHotel, requestOtp, verifyOtp } from "../../api/auth.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import {
  Button,
  Field,
  Input,
  Loading,
  PhoneInput,
} from "../../components/common/index.jsx";
import { isValidPhone } from "../../utils/format.js";
import styles from "./JoinPage.module.css";

const STEP = { PHONE: "phone", OTP: "otp" };

/**
 * The QR landing screen: guest scans at reception, enters their number, gets a
 * code, and lands with a membership card. `slug` is optional — /login reuses
 * this same flow without a hotel context.
 */
const JoinPage = () => {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const qrToken = params.get("t") || undefined;

  const [hotel, setHotel] = useState(null);
  const [loadingHotel, setLoadingHotel] = useState(!!slug);

  const [step, setStep] = useState(STEP.PHONE);
  const [form, setForm] = useState({ phone: "", name: "", otp: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);

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

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const sendCode = async (e) => {
    e.preventDefault();

    // Caught here so the user sees the problem without a network round-trip.
    // The API enforces the same rule regardless.
    if (!isValidPhone(form.phone)) {
      return setErrors({ phone: "Enter a valid 10-digit mobile number" });
    }

    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const data = await requestOtp(form.phone);
      // Surfaced only while the dev bypass is on, so the flow is testable
      // without an SMS gateway.
      if (data?.devOtp) setDevOtp(data.devOtp);
      setStep(STEP.OTP);
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const data = await verifyOtp({
        phone: form.phone,
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
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <span className={styles.orbA} />
        <span className={styles.orbB} />
        <div className={styles.cards}>
          <div className={`${styles.mini} ${styles.c3}`} />
          <div className={`${styles.mini} ${styles.c2}`} />
          <div className={`${styles.mini} ${styles.c1}`}>
            <span className={styles.shine} />
            <b>WAVE COINS</b>
            <i>BILLIONAX</i>
          </div>
        </div>
      </div>

      <h1 className={`display ${styles.title}`}>
        Your stay, <em>rewarded</em>.
      </h1>

      <p className={styles.sub}>
        {hotel
          ? `You're at ${hotel.name}. Turn every bill here into coins you can spend right away.`
          : "Sign in with your phone number to see your coins."}
      </p>

      {message && <div className={styles.alert}>{message}</div>}

      {step === STEP.PHONE ? (
        <form onSubmit={sendCode} className={styles.form}>
          <Field label="Mobile number" error={errors.phone}>
            <PhoneInput
              value={form.phone}
              onChange={change("phone")}
              error={errors.phone}
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
        <form onSubmit={verify} className={styles.form}>
          <p className={styles.sentTo}>
            We sent a code to <b>{form.phone}</b>
          </p>

          {devOtp && (
            <div className={styles.devNote}>
              Development mode — any code works. Yours is <b>{devOtp}</b>
            </div>
          )}

          <Field label="Verification code" error={errors.otp}>
            <Input
              inputMode="numeric"
              value={form.otp}
              onChange={change("otp")}
              error={errors.otp}
              placeholder="1234"
              className={styles.otpInput}
              autoFocus
              required
            />
          </Field>

          <Button type="submit" block size="lg" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>

          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              setStep(STEP.PHONE);
              setDevOtp("");
            }}
          >
            Use a different number
          </button>
        </form>
      )}
    </div>
  );
};

export default JoinPage;
