import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout as logoutApi } from "../../api/auth.api.js";
import { updateProfile } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { GUEST_THEMES } from "../../store/slices/themeSlice.js";
import { Button, Card, Field, Input, Modal, Skeleton } from "../../components/common/index.jsx";
import { AvatarUpload } from "../../features/guest/AvatarUpload.jsx";
import { formatCoins, maskPhone } from "../../utils/format.js";

// Shared by the two stat tiles below.
const statLabel = "block no-underline text-[9.5px] tracking-[0.08em] uppercase text-muted";
const statValue = "block font-display text-[19px] font-semibold mt-1";

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
      <h1 className="display text-[22px] mb-[18px]">Your account</h1>

      <Card className="mb-3.5">
        <div className="flex items-center gap-[13px]">
          <AvatarUpload user={user} />
          <span className="grow">
            <b className="block font-display text-[17px] font-semibold">{user?.name}</b>
            <i className="not-italic text-xs text-muted">{user?.email || maskPhone(user?.phone)}</i>
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
        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <span className="bg-card border border-hairline rounded-token-sm p-[13px] text-center">
            <u className={statLabel}>Hotels</u>
            <b className={statValue}>{memberships.length}</b>
          </span>
          <span className="bg-card border border-hairline rounded-token-sm p-[13px] text-center">
            <u className={statLabel}>Total coins</u>
            <b className={statValue}>{formatCoins(totalCoins)}</b>
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <Skeleton h={58} />
          <Skeleton h={58} />
        </div>
      )}

      <Card title="Appearance" className="mb-3.5">
        {/* A segmented control rather than a switch: "on" has no obvious
            meaning for a theme, but Light/Dark is unambiguous. */}
        <div className="flex gap-1.5 bg-chip rounded-full p-1" role="group" aria-label="Theme">
          {[
            { value: GUEST_THEMES.LIGHT, label: "Light" },
            { value: GUEST_THEMES.DARK, label: "Dark" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex-1 px-3 py-2 rounded-full border-0 font-[inherit] text-[12.5px] font-semibold cursor-pointer transition-[background,color] duration-150 ${
                guestTheme === option.value
                  ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                  : "bg-transparent text-muted"
              }`}
              aria-pressed={guestTheme === option.value}
              onClick={() => setGuestTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Your memberships" className="mb-3.5">
        {memberships.map((m) => (
          <div
            key={m._id}
            className="flex items-center gap-[11px] py-[11px] border-b border-hairline last:border-b-0"
          >
            <span className="flex-1 min-w-0">
              <b className="block text-[12.5px] font-semibold">{m.hotelId?.name}</b>
              <i className="not-italic text-[10.5px] text-muted capitalize">
                {m.tier.toLowerCase()} · {m.memberNo}
              </i>
            </span>
            <span className="font-display text-[15px] font-semibold">{formatCoins(m.balance)}</span>
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
        {message && (
          <div className="bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] border-l-[3px] border-l-[var(--bad)] rounded-token-sm px-3 py-2.5 text-[12.5px] text-[var(--bad)] mb-3.5">
            {message}
          </div>
        )}

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
