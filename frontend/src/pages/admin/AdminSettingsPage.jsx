import { useEffect, useMemo, useState } from "react";
import { getSettings, updateSettings } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Card,
  ErrorState,
  Field,
  Input,
  Loading,
  Slider,
  Toggle,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { ApplyBar } from "../../features/panel/ApplyBar.jsx";
import { CardDesignPicker } from "../../features/panel/CardDesignPicker.jsx";
import { ThemePicker } from "../../features/panel/ThemePicker.jsx";
import { FontPicker } from "../../features/panel/FontPicker.jsx";
import { DEFAULT_CARD_DESIGN } from "../../features/guest/cardDesigns/registry.jsx";
import {
  DEFAULT_ACCENT,
  DEFAULT_CUSTOM_COLOR,
  isValidHex,
  resolveAccent,
} from "../../theme/accentPresets.js";
import { DEFAULT_FONT, resolveFont } from "../../theme/fontPresets.js";

const toForm = (s) => ({
  welcomeCredit: s.welcomeCredit,
  defaultEarnRatePercent: s.defaultEarnRatePercent,
  platformFeePercent: s.platformFeePercent,
  redemptionRebatePercent: s.redemptionRebatePercent,
  settlementDays: s.settlementDays,
  voucherTtlMinutes: s.voucherTtlMinutes,
  silver: s.tierCaps?.SILVER,
  gold: s.tierCaps?.GOLD,
  platinum: s.tierCaps?.PLATINUM,
  cardDesign: s.cardDesign || DEFAULT_CARD_DESIGN,
  themePreset: resolveAccent(s.themePreset || DEFAULT_ACCENT),
  themeCustomColor: isValidHex(s.themeCustomColor) ? s.themeCustomColor : DEFAULT_CUSTOM_COLOR,
  fontPreset: resolveFont(s.fontPreset || DEFAULT_FONT),
  // Boolean, unlike every other field here, and the dirty check below compares
  // with String() — which is why this must be a real boolean rather than
  // undefined on an older payload, or the form reads dirty on arrival.
  feedEnabled: Boolean(s.feedEnabled),
});

const AdminSettingsPage = () => {
  const { data, loading, error, run } = useAsync(getSettings, []);

  if (loading || !data?.settings) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  // Remounting on updatedAt reseeds the form from fresh data after a save,
  // without an effect syncing state.
  return <RulesForm key={data.settings.updatedAt} settings={data.settings} reload={run} />;
};

const RulesForm = ({ settings, reload }) => {
  const initial = useMemo(() => toForm(settings), [settings]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const setAccent = useAppStore((s) => s.setAccent);
  const setFont = useAppStore((s) => s.setFont);
  const run = reload;

  // Every value is a scalar, so a shallow compare is enough to know whether
  // anything is unsaved — and it stays honest if the admin edits a field back
  // to its original value.
  const dirty = Object.keys(initial).some((key) => String(form[key]) !== String(initial[key]));

  // Selecting a theme tile previews it live across the whole panel; leaving
  // this page (or a save-remount) snaps back to the server's choice, so an
  // unsaved preview can never stick. The remount after a save runs this
  // cleanup with the OLD server value and then the new instance's effect with
  // the NEW one, which lands in the right place.
  const serverPreset = resolveAccent(settings.themePreset || DEFAULT_ACCENT);
  const serverCustom = isValidHex(settings.themeCustomColor)
    ? settings.themeCustomColor
    : DEFAULT_CUSTOM_COLOR;
  const serverFont = resolveFont(settings.fontPreset || DEFAULT_FONT);
  useEffect(() => {
    setAccent(serverPreset, serverCustom);
    setFont(serverFont);
    return () => {
      setAccent(serverPreset, serverCustom);
      setFont(serverFont);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const discard = () => {
    setForm(initial);
    setErrors({});
    setAccent(serverPreset, serverCustom);
    setFont(serverFont);
  };

  const save = async () => {
    setBusy(true);
    setErrors({});

    try {
      await updateSettings({
        welcomeCredit: Number(form.welcomeCredit),
        defaultEarnRatePercent: Number(form.defaultEarnRatePercent),
        platformFeePercent: Number(form.platformFeePercent),
        redemptionRebatePercent: Number(form.redemptionRebatePercent),
        settlementDays: Number(form.settlementDays),
        voucherTtlMinutes: Number(form.voucherTtlMinutes),
        tierCaps: {
          SILVER: Number(form.silver),
          GOLD: Number(form.gold),
          PLATINUM: Number(form.platinum),
        },
        cardDesign: form.cardDesign,
        feedEnabled: form.feedEnabled,
        themePreset: form.themePreset,
        themeCustomColor: form.themeCustomColor,
        fontPreset: form.fontPreset,
      });
      toastSuccess("Settings saved");
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      toastError(err.message);
      // The save failed, so the server still holds the old theme — put the
      // preview back rather than leaving the panel painted in a colour that
      // was never stored.
      setAccent(serverPreset, serverCustom);
      setFont(serverFont);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Platform rules" subtitle="These apply across every hotel on the network" />

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-2 gap-4 items-start">
        <Card title="Coins">
          <Field
            label="Welcome credit"
            hint="Granted once per guest, network-wide, funded by the first hotel they join"
            error={errors.welcomeCredit}
          >
            <Input type="number" value={form.welcomeCredit} onChange={change("welcomeCredit")} />
          </Field>

          <Field
            label="Default earn rate"
            hint="Used when a hotel has not set its own"
            error={errors.defaultEarnRatePercent}
          >
            <Slider
              min={0}
              max={100}
              unit="%"
              value={form.defaultEarnRatePercent}
              onChange={change("defaultEarnRatePercent")}
              error={errors.defaultEarnRatePercent}
            />
          </Field>

          <Field
            label="Voucher lifetime"
            hint="How long a guest's code stays valid"
            error={errors.voucherTtlMinutes}
          >
            <Slider
              min={1}
              max={120}
              unit="min"
              value={form.voucherTtlMinutes}
              onChange={change("voucherTtlMinutes")}
              error={errors.voucherTtlMinutes}
            />
          </Field>
        </Card>

        <Card title="Commercials">
          <Field
            label="Platform fee"
            hint="Taken on the cash a guest actually pays"
            error={errors.platformFeePercent}
          >
            <Slider
              min={0}
              max={100}
              unit="%"
              value={form.platformFeePercent}
              onChange={change("platformFeePercent")}
              error={errors.platformFeePercent}
            />
          </Field>

          <Field
            label="Redemption rebate"
            hint="Share of coins redeemed at a hotel that is credited back to its inventory at month end"
            error={errors.redemptionRebatePercent}
          >
            <Slider
              min={0}
              max={100}
              unit="%"
              value={form.redemptionRebatePercent}
              onChange={change("redemptionRebatePercent")}
              error={errors.redemptionRebatePercent}
            />
          </Field>

          <Field label="Settlement cycle" error={errors.settlementDays}>
            <Slider
              min={0}
              max={60}
              unit="days"
              value={form.settlementDays}
              onChange={change("settlementDays")}
              error={errors.settlementDays}
            />
          </Field>
        </Card>
      </div>

      <Card title="Redemption caps" className="my-4">
        <p className="text-xs text-muted leading-[1.5] mb-3.5">
          The largest share of any bill a guest can settle with coins. Raising a cap increases the
          discount hotels absorb on every member bill.
        </p>

        {/* Stacked on a shared 0–100 scale so the tier ladder reads at a
            glance — Platinum's bar should visibly sit above Gold's. */}
        <div className="flex flex-col gap-1 max-w-[560px]">
          <Field label="Silver" error={errors["tierCaps.SILVER"]}>
            <Slider
              min={0}
              max={100}
              unit="%"
              value={form.silver}
              onChange={change("silver")}
              error={errors["tierCaps.SILVER"]}
            />
          </Field>
          <Field label="Gold" error={errors["tierCaps.GOLD"]}>
            <Slider
              min={0}
              max={100}
              unit="%"
              value={form.gold}
              onChange={change("gold")}
              error={errors["tierCaps.GOLD"]}
            />
          </Field>
          <Field label="Platinum" error={errors["tierCaps.PLATINUM"]}>
            <Slider
              min={0}
              max={100}
              unit="%"
              value={form.platinum}
              onChange={change("platinum")}
              error={errors["tierCaps.PLATINUM"]}
            />
          </Field>
        </div>
      </Card>

      <Card title="Guest app" className="my-4">
        <Toggle
          label="Social feed"
          hint="Adds a Feed tab to the guest app's bottom bar, and the Feed pages to this panel and the hotel panels. Existing posts are kept while it is off — switching it back on restores them untouched."
          checked={form.feedEnabled}
          onChange={(feedEnabled) => setForm((f) => ({ ...f, feedEnabled }))}
        />
      </Card>

      <Card title="Dashboard & app theme" className="my-4">
        <ThemePicker
          value={form.themePreset}
          customColor={form.themeCustomColor}
          onChange={(themePreset) => {
            setForm((f) => ({ ...f, themePreset }));
            setAccent(themePreset, form.themeCustomColor);
          }}
          onCustomColorChange={(themeCustomColor) => {
            setForm((f) => ({ ...f, themeCustomColor }));
            setAccent(form.themePreset, themeCustomColor);
          }}
        />
      </Card>

      <Card title="App typeface" className="my-4">
        <FontPicker
          value={form.fontPreset}
          onChange={(fontPreset) => {
            setForm((f) => ({ ...f, fontPreset }));
            setFont(fontPreset);
          }}
        />
      </Card>

      <Card title="Membership card design" className="my-4">
        <CardDesignPicker
          value={form.cardDesign}
          onChange={(cardDesign) => setForm((f) => ({ ...f, cardDesign }))}
        />
      </Card>

      <ApplyBar open={dirty} busy={busy} onApply={save} onDiscard={discard} />
    </div>
  );
};

export default AdminSettingsPage;
