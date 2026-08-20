import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { staffLogin } from "../../api/auth.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { homeForRole } from "../../constants/routePaths.js";
import { useThemeRoot } from "../../components/layout/useThemeRoot.js";
import { Button, Field, Input, PasswordInput } from "../../components/common/index.jsx";
import styles from "./StaffLoginPage.module.css";

/** Shared by the hotel and admin panels — same form, different framing. */
const StaffLoginPage = ({ title = "Hotel panel", subtitle = "Sign in to continue" }) => {
  useThemeRoot("ink-minimal");

  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const setAuth = useAppStore((s) => s.setAuth);
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
    <div className="theme-root" data-theme="ink-minimal">
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={submit}>
          <span className={styles.logo} />
          <h1 className={`display ${styles.title}`}>{title}</h1>
          <p className={styles.sub}>{subtitle}</p>

          {message && <div className={styles.alert}>{message}</div>}

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

          <Button type="submit" block size="lg" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default StaffLoginPage;
