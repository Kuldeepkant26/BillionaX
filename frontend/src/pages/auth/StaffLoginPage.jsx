import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { staffLogin } from "../../api/auth.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { homeForRole } from "../../constants/routePaths.js";
import { useThemeRoot, useAccentStyle, useFontRoot } from "../../components/layout/useThemeRoot.js";
import { useAccentSync } from "../../hooks/useAccentSync.js";
import { Button, Field, Input, PasswordInput, Spinner } from "../../components/common/index.jsx";
import styles from "./StaffLoginPage.module.css";

/**
 * Shared by the hotel and admin panels — same form, different framing.
 *
 * The left panel is a full-bleed brand surface painted from `--hero`, so it
 * follows the admin's chosen theme instead of carrying a palette of its own.
 * Its decoration is CSS: no image to load, nothing to go stale.
 */

const check = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M8.2 13.6 4.9 10.3l1.3-1.3 2 2 5.6-5.6 1.3 1.3z" />
  </svg>
);

// Decorative streaks, bottom-left. Position/size in percentages so the layer
// scales with the panel at any viewport.
const STREAKS = [
  { left: "-4%", top: "58%", width: "34%", height: "13px" },
  { left: "12%", top: "70%", width: "22%", height: "9px" },
  { left: "-8%", top: "80%", width: "44%", height: "17px" },
  { left: "28%", top: "62%", width: "16%", height: "7px" },
  { left: "34%", top: "84%", width: "30%", height: "12px" },
  { left: "56%", top: "72%", width: "20%", height: "9px" },
  { left: "48%", top: "92%", width: "26%", height: "14px" },
];

const StaffLoginPage = ({
  title = "Hotel panel",
  subtitle = "Sign in to manage your loyalty programme",
  headline = "Run your loyalty programme with confidence.",
  blurb = "Track members, issue rewards and settle bills — all from one place.",
  points = ["Live coin and revenue reporting", "Verify guest codes in seconds", "Built for front-desk speed"],
}) => {
  useThemeRoot("ink-minimal");
  // Login renders before any token exists, so the accent arrives via the
  // public config endpoint; the persisted store value covers repeat visits.
  useAccentSync();
  const accentStyle = useAccentStyle();
  const font = useFontRoot();

  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const setAuth = useAppStore((s) => s.setAuth);
  const accent = useAppStore((s) => s.accent);
  const toast = useAppStore((s) => s.toast);
  const navigate = useNavigate();

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const data = await staffLogin(form);
      setAuth({ user: data.user, accessToken: data.accessToken });
      navigate(homeForRole(data.user.role), { replace: true });
    } catch (err) {
      // fieldErrors comes from the API's 422 details, preserved by the
      // axios interceptor so validation lands on the right input.
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="theme-root" data-theme="ink-minimal" data-accent={accent} data-font={font} style={accentStyle}>
      <div className={styles.wrap}>
        <aside className={styles.brand}>
          <span className={styles.streaks} aria-hidden="true">
            {STREAKS.map((s, i) => (
              <i key={i} style={s} />
            ))}
          </span>

          <span className={styles.mark}>
            <img src="/logo.png" alt="" />
          </span>

          <div>
            <h2 className={styles.headline}>{headline}</h2>
            <p className={styles.blurb}>{blurb}</p>
            <ul className={styles.points}>
              {points.map((point) => (
                <li key={point}>
                  {check}
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <span className={styles.foot}>Billionax</span>
        </aside>

        <div className={styles.formSide}>
          <form className={styles.form} onSubmit={submit}>
            <span className={`${styles.mark} ${styles.formMark}`}>
              <img src="/logo.png" alt="" />
            </span>

            <span className={styles.kicker}>{title}</span>
            <h1 className={`display ${styles.title}`}>Sign in</h1>
            <p className={styles.sub}>{subtitle}</p>

            {message && (
              <div className={styles.alert} role="alert">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm.9 12H9.1v-1.8h1.8zm0-3.2H9.1V5.6h1.8z" />
                </svg>
                <span>{message}</span>
              </div>
            )}

            <Field label="Email address" error={errors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={change("email")}
                error={errors.email}
                placeholder="you@hotel.com"
                autoComplete="email"
                autoFocus
                required
              />
            </Field>

            <Field label="Password" error={errors.password}>
              <PasswordInput
                value={form.password}
                onChange={change("password")}
                error={errors.password}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>

            <div className={styles.row}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              {/* Self-service reset does not exist yet, so this points at the
                  path that actually works rather than a dead link. */}
              <button
                type="button"
                className={styles.link}
                onClick={() =>
                  toast("Contact your Billionax administrator to reset your password.")
                }
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" block size="lg" disabled={busy}>
              {busy && <Spinner />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>

            <p className={styles.hint}>Staff access only. Guests sign in from the Billionax app.</p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffLoginPage;
