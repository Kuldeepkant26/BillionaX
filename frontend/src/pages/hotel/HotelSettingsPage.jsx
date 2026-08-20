import { useState } from "react";
import { getSettings, updateSettings, createLogoUpload } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Button, ErrorState, Input, Loading } from "../../components/common/index.jsx";
import { LogoUpload } from "../../features/panel/LogoUpload.jsx";
import styles from "./HotelSettingsPage.module.css";

const toForm = (hotel) => ({
  name: hotel.name || "",
  city: hotel.city || "",
  address: hotel.address || "",
  phone: hotel.phone || "",
  email: hotel.email || "",
  logoUrl: hotel.logoUrl || "",
  earnRatePercent: hotel.earnRatePercent ?? 15,

  goldNights: hotel.tierNightThresholds?.GOLD ?? 30,
  platinumNights: hotel.tierNightThresholds?.PLATINUM ?? 75,

  silverRate: hotel.tierEarnRates?.SILVER ?? 15,
  goldRate: hotel.tierEarnRates?.GOLD ?? 20,
  platinumRate: hotel.tierEarnRates?.PLATINUM ?? 30,
});

const HotelSettingsPage = () => {
  const { data, loading, error, run } = useAsync(getSettings, []);

  if (loading || !data?.hotel) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  // Remounts when the fetched hotel changes, so the form seeds from fresh data
  // without an effect syncing state.
  return <SettingsForm key={data.hotel.id} data={data} reload={run} />;
};

/** Label + control on one row, so a field costs ~40px instead of ~80px. */
const Row = ({ label, hint, error, children }) => (
  <div className={styles.row}>
    <span className={styles.rowLabel}>
      {label}
      {hint && <i>{hint}</i>}
    </span>
    <span className={styles.rowControl}>
      {children}
      {error && <em className={styles.err}>{error}</em>}
    </span>
  </div>
);

const Section = ({ title, description, children, aside }) => (
  <section className={styles.section}>
    <header className={styles.sectionHead}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </header>
    <div className={styles.sectionBody}>{children}</div>
  </section>
);

const SettingsForm = ({ data, reload }) => {
  const [form, setForm] = useState(() => toForm(data.hotel));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setBusy(true);
    setErrors({});

    // Caught here as well as server-side, so the message lands on the field
    // the manager actually needs to fix.
    if (Number(form.platinumNights) <= Number(form.goldNights)) {
      setBusy(false);
      return setErrors({
        "tierNightThresholds.PLATINUM": "Platinum must need more nights than Gold",
      });
    }

    const { goldNights, platinumNights, silverRate, goldRate, platinumRate, ...details } = form;

    try {
      await updateSettings({
        ...details,
        earnRatePercent: Number(details.earnRatePercent),
        tierNightThresholds: { GOLD: Number(goldNights), PLATINUM: Number(platinumNights) },
        tierEarnRates: {
          SILVER: Number(silverRate),
          GOLD: Number(goldRate),
          PLATINUM: Number(platinumRate),
        },
      });
      toastSuccess("Settings saved");
      reload();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const joinUrl = `${window.location.origin}/join/${data.qr?.slug}`;
  const example = (rate) => Math.floor((40000 * Number(rate || 0)) / 100).toLocaleString("en-IN");

  return (
    <div className={styles.page}>
      {/* One save for the whole page, pinned to the header — the old layout
          repeated the same button under three cards, which made it look like
          each section saved separately. */}
      <header className={styles.head}>
        <div>
          <h1 className="display">Settings</h1>
          <p>Your hotel's details, tiers and guest QR code</p>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </header>

      <div className={styles.grid}>
        <div className={styles.col}>
          <Section title="Hotel details">
            <div className={styles.logoRow}>
              <LogoUpload
                value={form.logoUrl}
                name={form.name}
                onChange={set("logoUrl")}
                getSignature={createLogoUpload}
              />
            </div>

            <Row label="Name" error={errors.name}>
              <Input value={form.name} onChange={change("name")} error={errors.name} />
            </Row>
            <Row label="City" error={errors.city}>
              <Input value={form.city} onChange={change("city")} />
            </Row>
            <Row label="Address" error={errors.address}>
              <Input value={form.address} onChange={change("address")} />
            </Row>
            <Row label="Phone" error={errors.phone}>
              <Input value={form.phone} onChange={change("phone")} />
            </Row>
            <Row label="Email" error={errors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={change("email")}
                error={errors.email}
              />
            </Row>
          </Section>

          <Section
            title="Tiers"
            description="Nights a guest must stay with you to reach each tier. Changing these re-ranks your existing members straight away."
          >
            <Row label="Silver" hint="Where everyone starts">
              <Input value="0 nights" disabled />
            </Row>
            <Row
              label="Gold"
              hint="Default 30"
              error={errors["tierNightThresholds.GOLD"]}
            >
              <Input
                type="number"
                value={form.goldNights}
                onChange={change("goldNights")}
                error={errors["tierNightThresholds.GOLD"]}
                min={1}
              />
            </Row>
            <Row
              label="Platinum"
              hint="Default 75"
              error={errors["tierNightThresholds.PLATINUM"]}
            >
              <Input
                type="number"
                value={form.platinumNights}
                onChange={change("platinumNights")}
                error={errors["tierNightThresholds.PLATINUM"]}
                min={1}
              />
            </Row>
          </Section>
        </div>

        <div className={styles.col}>
          <Section
            title="Coins per stay"
            description="Share of a recorded stay credited as coins, by the guest's tier."
          >
            <div className={styles.rates}>
              {[
                ["Silver", "silverRate", "tierEarnRates.SILVER"],
                ["Gold", "goldRate", "tierEarnRates.GOLD"],
                ["Platinum", "platinumRate", "tierEarnRates.PLATINUM"],
              ].map(([label, key, errKey]) => (
                <label key={key} className={styles.rate}>
                  <span>{label}</span>
                  <Input
                    type="number"
                    value={form[key]}
                    onChange={change(key)}
                    error={errors[errKey]}
                    min={0}
                    max={100}
                  />
                  <i>{example(form[key])} coins</i>
                </label>
              ))}
            </div>
            <p className={styles.note}>Per ₹40,000 stay.</p>

            {/* Still the fallback rate for the older "Add coins for a stay"
                flow on the Members tab, so it stays editable. */}
            <div className={styles.legacy}>
              <Row
                label="Legacy earn rate"
                hint="Room × nights × this %"
                error={errors.earnRatePercent}
              >
                <Input
                  type="number"
                  value={form.earnRatePercent}
                  onChange={change("earnRatePercent")}
                  error={errors.earnRatePercent}
                  min={0}
                  max={100}
                />
              </Row>
            </div>
          </Section>

          <Section
            title="Guest QR link"
            description="Print this as a QR code for reception, rooms and outlets."
          >
            <div className={styles.url}>{joinUrl}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(joinUrl).then(
                  () => toastSuccess("Link copied"),
                  () => toastError("Could not copy")
                );
              }}
            >
              Copy link
            </Button>
          </Section>

          <Section title="Redemption caps" description="Most of a bill payable with coins. Set by Billionax.">
            <div className={styles.caps}>
              {Object.entries(data.hotel?.tierCaps || {}).map(([tier, pct]) => (
                <div key={tier} className={styles.cap}>
                  <div className="between">
                    <span>{tier}</span>
                    <b>{pct}%</b>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default HotelSettingsPage;
