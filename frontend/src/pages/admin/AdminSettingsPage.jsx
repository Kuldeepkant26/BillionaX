import { useState } from "react";
import { getSettings, updateSettings } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Button, Card, ErrorState, Field, Input, Loading } from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import styles from "./AdminSettingsPage.module.css";

const toForm = (s) => ({
  welcomeCredit: s.welcomeCredit,
  defaultEarnRatePercent: s.defaultEarnRatePercent,
  platformFeePercent: s.platformFeePercent,
  settlementDays: s.settlementDays,
  voucherTtlMinutes: s.voucherTtlMinutes,
  silver: s.tierCaps?.SILVER,
  gold: s.tierCaps?.GOLD,
  platinum: s.tierCaps?.PLATINUM,
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
  const [form, setForm] = useState(() => toForm(settings));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const run = reload;

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setErrors({});

    try {
      await updateSettings({
        welcomeCredit: Number(form.welcomeCredit),
        defaultEarnRatePercent: Number(form.defaultEarnRatePercent),
        platformFeePercent: Number(form.platformFeePercent),
        settlementDays: Number(form.settlementDays),
        voucherTtlMinutes: Number(form.voucherTtlMinutes),
        tierCaps: {
          SILVER: Number(form.silver),
          GOLD: Number(form.gold),
          PLATINUM: Number(form.platinum),
        },
      });
      toastSuccess("Settings saved");
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Platform rules" subtitle="These apply across every hotel on the network" />

      <div className={styles.cols}>
        <Card title="Coins">
          <Field
            label="Welcome credit"
            hint="Granted once per guest, network-wide, funded by the first hotel they join"
            error={errors.welcomeCredit}
          >
            <Input type="number" value={form.welcomeCredit} onChange={change("welcomeCredit")} />
          </Field>

          <Field
            label="Default earn rate (%)"
            hint="Used when a hotel has not set its own"
            error={errors.defaultEarnRatePercent}
          >
            <Input
              type="number"
              value={form.defaultEarnRatePercent}
              onChange={change("defaultEarnRatePercent")}
            />
          </Field>

          <Field
            label="Voucher lifetime (minutes)"
            hint="How long a guest's code stays valid"
            error={errors.voucherTtlMinutes}
          >
            <Input
              type="number"
              value={form.voucherTtlMinutes}
              onChange={change("voucherTtlMinutes")}
            />
          </Field>
        </Card>

        <Card title="Commercials">
          <Field
            label="Platform fee (%)"
            hint="Taken on the cash a guest actually pays"
            error={errors.platformFeePercent}
          >
            <Input
              type="number"
              value={form.platformFeePercent}
              onChange={change("platformFeePercent")}
            />
          </Field>

          <Field label="Settlement cycle (days)" error={errors.settlementDays}>
            <Input type="number" value={form.settlementDays} onChange={change("settlementDays")} />
          </Field>
        </Card>
      </div>

      <Card title="Redemption caps" className={styles.spaced}>
        <p className={styles.note}>
          The largest share of any bill a guest can settle with coins. Raising a cap increases the
          discount hotels absorb on every member bill.
        </p>

        <div className={styles.caps}>
          <Field label="Silver (%)" error={errors["tierCaps.SILVER"]}>
            <Input type="number" value={form.silver} onChange={change("silver")} />
          </Field>
          <Field label="Gold (%)" error={errors["tierCaps.GOLD"]}>
            <Input type="number" value={form.gold} onChange={change("gold")} />
          </Field>
          <Field label="Platinum (%)" error={errors["tierCaps.PLATINUM"]}>
            <Input type="number" value={form.platinum} onChange={change("platinum")} />
          </Field>
        </div>
      </Card>

      <Button onClick={save} disabled={busy} size="lg">
        {busy ? "Saving…" : "Save platform rules"}
      </Button>
    </div>
  );
};

export default AdminSettingsPage;
