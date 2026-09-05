import { useMemo, useState } from "react";
import { getSettings, updateSettings, createLogoUpload } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Button, ErrorState, Input, Loading, Slider } from "../../components/common/index.jsx";
import { LogoUpload } from "../../features/panel/LogoUpload.jsx";
import { QrCode } from "../../features/panel/QrCode.jsx";
import { ApplyBar } from "../../features/panel/ApplyBar.jsx";

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
  <div className="grid grid-cols-1 gap-1.5 [@media(min-width:561px)]:grid-cols-[minmax(150px,34%)_1fr] [@media(min-width:561px)]:gap-3.5 items-center py-[9px] border-b border-hairline last:border-b-0 last:pb-0">
    <span className="text-[12.5px] font-medium text-ink leading-[1.3] [&>i]:block [&>i]:not-italic [&>i]:text-[10.5px] [&>i]:text-muted [&>i]:mt-px">
      {label}
      {hint && <i>{hint}</i>}
    </span>
    <span className="min-w-0 w-full [&_.input]:w-full">
      {children}
      {error && <em className="block not-italic text-[11px] text-[var(--bad)] mt-1">{error}</em>}
    </span>
  </div>
);

// Hairline sections rather than boxed cards: five bordered panels stacked on
// one screen is what made the old page feel heavy.
const Section = ({ title, description, children, aside }) => (
  <section className="bg-[var(--panel)] border border-hairline rounded-token px-4 pt-[15px] pb-4">
    <header className="flex items-start justify-between gap-3 pb-3 border-b border-hairline mb-1 [&>div>h2]:font-display [&>div>h2]:text-[14.5px] [&>div>h2]:font-semibold [&>div>h2]:tracking-[-0.1px] [&>div>p]:text-[11.5px] [&>div>p]:text-muted [&>div>p]:leading-[1.5] [&>div>p]:mt-[3px] [&>div>p]:max-w-[46ch]">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </header>
    <div className="flex flex-col">{children}</div>
  </section>
);

const SettingsForm = ({ data, reload }) => {
  const initial = useMemo(() => toForm(data.hotel), [data.hotel]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  // Shallow compare over scalar fields: enough to know whether anything is
  // unsaved, and it clears itself if a value is edited back to the original.
  const dirty = Object.keys(initial).some((key) => String(form[key]) !== String(initial[key]));

  const discard = () => {
    setForm(initial);
    setErrors({});
  };

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
    <div className="max-w-[1040px]">
      <header className="static [@media(min-width:901px)]:sticky top-0 z-20 flex items-center justify-between gap-4 pt-1 pb-3.5 mb-1 bg-canvas border-b border-hairline [&>div>h1]:text-[22px] [&>div>h1]:tracking-[-0.4px] [&>div>p]:text-xs [&>div>p]:text-muted [&>div>p]:mt-0.5">
        <div>
          <h1 className="display">Settings</h1>
          <p>Your hotel's details, tiers and guest QR code</p>
        </div>
      </header>

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[1.15fr_1fr] gap-[18px] items-start">
        <div className="flex flex-col gap-[18px] min-w-0">
          <Section title="Hotel details">
            <div className="pt-0.5 pb-3.5 border-b border-hairline mb-1">
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

        <div className="flex flex-col gap-[18px] min-w-0">
          <Section
            title="Coins per stay"
            description="Share of a recorded stay credited as coins, by the guest's tier."
          >
            <div className="grid grid-cols-3 gap-2.5 pt-3">
              {[
                ["Silver", "silverRate", "tierEarnRates.SILVER"],
                ["Gold", "goldRate", "tierEarnRates.GOLD"],
                ["Platinum", "platinumRate", "tierEarnRates.PLATINUM"],
              ].map(([label, key, errKey]) => (
                <label
                  key={key}
                  className="[&>span]:block [&>span]:text-[10px] [&>span]:font-bold [&>span]:tracking-[0.08em] [&>span]:uppercase [&>span]:text-muted [&>span]:mb-[5px] [&>i]:block [&>i]:not-italic [&>i]:text-[10.5px] [&>i]:text-muted [&>i]:mt-[5px]"
                >
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
            <p className="text-[11px] text-muted mt-2.5">Per ₹40,000 stay.</p>

            {/* Still the fallback rate for the older "Add coins for a stay"
                flow on the Members tab, so it stays editable. */}
            <div className="mt-3 pt-1 border-t border-hairline">
              <Row
                label="Legacy earn rate"
                hint="Room × nights × this %"
                error={errors.earnRatePercent}
              >
                <Slider
                  min={0}
                  max={100}
                  unit="%"
                  value={form.earnRatePercent}
                  onChange={change("earnRatePercent")}
                  error={errors.earnRatePercent}
                />
              </Row>
            </div>
          </Section>

          <Section
            title="Guest QR link"
            description="Print this as a QR code for reception, rooms and outlets."
          >
            <div className="mt-3 mb-2.5">
              <QrCode value={joinUrl} />
            </div>
            <div className="bg-chip rounded-token-sm px-[11px] py-[9px] text-[11.5px] break-all mb-2.5 font-mono">
              {joinUrl}
            </div>
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
        </div>
      </div>
      <ApplyBar open={dirty} busy={busy} onApply={save} onDiscard={discard} />
    </div>
  );
};

export default HotelSettingsPage;
