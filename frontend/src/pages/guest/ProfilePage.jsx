import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout as logoutApi } from "../../api/auth.api.js";
import { updateProfile } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { GUEST_THEMES } from "../../store/slices/themeSlice.js";
import { Button, Card, Field, Input, Modal, Skeleton } from "../../components/common/index.jsx";
import { AvatarUpload } from "../../features/guest/AvatarUpload.jsx";
import { formatCoins, maskPhone } from "../../utils/format.js";
import styles from "./ProfilePage.module.css";

const ProfilePage = () => {
  const user = useAppStore((s) => s.user);
  const memberships = useAppStore((s) => s.memberships);
  const logout = useAppStore((s) => s.logout);
  const setUser = useAppStore((s) => s.setUser);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const guestTheme = useAppStore((s) => s.guestTheme);
  const setGuestTheme = useAppStore((s) => s.setGuestTheme);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const totalCoins = memberships.reduce((sum, m) => sum + (m.balance || 0), 0);

  const openEdit = () => {
    setForm({ name: user?.name || "", email: user?.email || "" });
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return setErrors({ name: "Enter your name" });

    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const result = await updateProfile({ name: form.name, email: form.email || "" });
      setUser(result.user);
      toastSuccess("Details updated");
      setOpen(false);
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await logoutApi();
    } catch {
      // Local sign-out matters more than the server round-trip.
    }
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div>
      <h1 className={`display ${styles.title}`}>Your account</h1>

      <Card className={styles.card}>
        <div className={styles.identity}>
          <AvatarUpload user={user} />
          <span className="grow">
            <b>{user?.name}</b>
            <i>{user?.email || maskPhone(user?.phone)}</i>
          </span>
          <Button size="sm" variant="ghost" onClick={openEdit}>
            Edit
          </Button>
        </div>
      </Card>

      {/* Identity comes from the persisted store and paints instantly, but
          memberships arrive over the network — so only these two tiles wait.
          Rendering 0 hotels and 0 coins mid-flight reads as data loss. */}
      {memberships.length ? (
        <div className={styles.stats}>
          <span className={styles.stat}>
            <u>Hotels</u>
            <b>{memberships.length}</b>
          </span>
          <span className={styles.stat}>
            <u>Total coins</u>
            <b>{formatCoins(totalCoins)}</b>
          </span>
        </div>
      ) : (
        <div className={styles.stats}>
          <Skeleton h={58} />
          <Skeleton h={58} />
        </div>
      )}

      <Card title="Appearance" className={styles.card}>
        {/* A segmented control rather than a switch: "on" has no obvious
            meaning for a theme, but Light/Dark is unambiguous. */}
        <div className={styles.themeRow} role="group" aria-label="Theme">
          {[
            { value: GUEST_THEMES.LIGHT, label: "Light" },
            { value: GUEST_THEMES.DARK, label: "Dark" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.themeBtn} ${guestTheme === option.value ? styles.themeOn : ""}`}
              aria-pressed={guestTheme === option.value}
              onClick={() => setGuestTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Your memberships" className={styles.card}>
        {memberships.map((m) => (
          <div key={m._id} className={styles.row}>
            <span className={styles.meta}>
              <b>{m.hotelId?.name}</b>
              <i>
                {m.tier.toLowerCase()} · {m.memberNo}
              </i>
            </span>
            <span className={styles.bal}>{formatCoins(m.balance)}</span>
          </div>
        ))}
      </Card>

      <Button variant="ghost" block onClick={signOut}>
        Sign out
      </Button>

      <Modal
        open={open}
        title="Your details"
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        {message && <div className={styles.alert}>{message}</div>}

        <Field label="Your name" error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
            autoFocus
          />
        </Field>

        <Field label="Email" hint="Optional — for receipts and updates" error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Mobile number"
          hint="This is how you sign in, so it can't be changed here. Ask the hotel if you need it updated."
        >
          <Input value={user?.phone || ""} disabled />
        </Field>
      </Modal>
    </div>
  );
};

export default ProfilePage;
