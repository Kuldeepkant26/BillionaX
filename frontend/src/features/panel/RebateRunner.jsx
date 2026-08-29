import { useState } from "react";
import { Button, Card, Field, Input } from "../../components/common/index.jsx";
import { runRebate } from "../../api/admin.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { formatCoins } from "../../utils/format.js";

/**
 * Manual trigger for the month-end rebate.
 *
 * The scheduled cron run and this button call exactly the same service, and a
 * hotel already settled for a period is skipped — so clicking twice, or
 * clicking after the cron has already run, cannot pay a hotel twice. That is
 * enforced by a unique index in the database, not by disabling this button.
 *
 * "Preview" runs the same job with dryRun, which writes nothing. It is offered
 * first because this moves real coin inventory.
 */

/** Previous calendar month as YYYY-MM — the usual target, and the API default. */
const defaultPeriod = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const RebateRunner = ({ onDone }) => {
  const [period, setPeriod] = useState(defaultPeriod);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const run = async (dryRun) => {
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const data = await runRebate({ period, dryRun });
      setResult({ ...data, dryRun });
      if (!dryRun) {
        toastSuccess(
          data.settled.length
            ? `${formatCoins(data.totalCredited)} coins credited to ${data.settled.length} hotel(s)`
            : "Nothing to credit — already settled"
        );
        onDone?.();
      }
    } catch (err) {
      setError(err.message || "The rebate could not be run");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Month-end rebate">
      <p className="text-[11.5px] text-muted leading-[1.5] mb-3.5">
        Credits each hotel a share of the coins guests redeemed there, back into its spendable
        inventory. Runs automatically at month end; use this to run a period early, or to re-run one
        after a correction. Already-settled hotels are skipped, so it is safe to repeat.
      </p>

      <Field label="Period" hint="The calendar month to settle">
        <Input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          max={defaultPeriod()}
        />
      </Field>

      <div className="flex flex-wrap gap-2 mt-1">
        <Button variant="ghost" onClick={() => run(true)} disabled={busy || !period}>
          {busy ? "Working…" : "Preview"}
        </Button>
        <Button onClick={() => run(false)} disabled={busy || !period}>
          Credit hotels
        </Button>
      </div>

      {error && (
        <div className="bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] border-l-[3px] border-l-[var(--bad)] rounded-token-sm px-3 py-2.5 text-[12.5px] text-[var(--bad)] mt-3.5">
          {error}
        </div>
      )}

      {result && (
        <div className="border border-[var(--line)] rounded-token-sm px-3 py-2.5 mt-3.5 text-[12.5px]">
          <b className="text-ink">
            {result.dryRun ? "Preview — nothing written" : "Done"}
          </b>
          <p className="text-muted mt-1 leading-[1.5]">
            {result.settled.length
              ? `${formatCoins(result.totalCredited)} coins across ${result.settled.length} hotel(s) at ${result.ratePercent}%.`
              : "No hotels to credit for this period."}
            {result.skipped > 0 && ` ${result.skipped} already settled.`}
          </p>
        </div>
      )}
    </Card>
  );
};

export default RebateRunner;
