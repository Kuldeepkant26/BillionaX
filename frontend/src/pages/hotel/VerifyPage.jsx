import { useState } from "react";
import { verifyVoucher, redeemVoucher } from "../../api/hotel.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Badge, Button, Card, Field, Input, Select } from "../../components/common/index.jsx";
import { formatCoins, formatCurrency, initials, maskPhone } from "../../utils/format.js";

const OUTLETS = ["Restaurant", "Room Service", "Spa", "Bar", "Cafe", "Laundry", "Other"];

/**
 * The redemption console. Two deliberate steps: verify is read-only so a
 * mistyped code never burns a guest's voucher, then redeem commits.
 */
const VerifyPage = () => {
  const [form, setForm] = useState({ code: "", billAmount: "", outlet: "Restaurant" });
  const [checked, setChecked] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () => {
    setForm({ code: "", billAmount: "", outlet: "Restaurant" });
    setChecked(null);
    setReceipt(null);
    setError("");
  };

  const check = async () => {
    if (!form.code.trim()) return setError("Enter the guest's code");

    setBusy(true);
    setError("");
    setReceipt(null);

    try {
      const data = await verifyVoucher({
        code: form.code,
        billAmount: form.billAmount ? Number(form.billAmount) : undefined,
      });
      setChecked(data);
    } catch (err) {
      setChecked(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!form.billAmount || Number(form.billAmount) < 1) {
      return setError("Enter the bill amount before redeeming");
    }

    setBusy(true);
    setError("");

    try {
      const data = await redeemVoucher({
        code: form.code,
        billAmount: Number(form.billAmount),
        outlet: form.outlet,
      });
      setReceipt(data);
      setChecked(null);
      toastSuccess(`${formatCoins(data.coinsApplied)} coins applied`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = checked?.preview;

  return (
    <div>
      <header className="mb-5">
        <div>
          <h1 className="display text-[26px] tracking-[-0.6px]">Verify a code</h1>
          <p className="text-muted text-[12.5px] mt-1">
            Enter the bill first, then the guest's code. Verifying does not deduct anything.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-2 gap-4 items-start">
        <Card title="Guest code">
          <Field label="Bill amount (₹)">
            <Input
              type="number"
              inputMode="numeric"
              value={form.billAmount}
              onChange={change("billAmount")}
              placeholder="2000"
              min={1}
            />
          </Field>

          <Field label="Outlet">
            <Select value={form.outlet} onChange={change("outlet")}>
              {OUTLETS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Voucher code" error={error}>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              error={error}
              placeholder="GW-8KQ2-XP91"
              className="font-display text-lg tracking-[2px] uppercase"
            />
          </Field>

          <div className="flex gap-[9px] [&>*:first-child]:flex-1">
            <Button block onClick={check} disabled={busy}>
              {busy ? "Checking…" : "Verify code"}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          </div>

          <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
            Codes last 10 minutes and work once. If one fails, ask the guest to generate a new code
            in their app.
          </p>
        </Card>

        {receipt ? (
          <Card title="Applied" className="min-h-[220px]">
            <Badge tone="ok">Redeemed</Badge>

            <div className="my-3.5 [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:text-[12.5px] [&>div]:text-muted [&>div]:py-1.5 [&>div>b]:text-ink [&>div>b]:font-semibold [&>div>b]:tabular-nums">
              <div>
                <span>Bill amount</span>
                <b>{formatCurrency(receipt.billAmount)}</b>
              </div>
              <div>
                <span>Coins applied</span>
                <b className="!text-[var(--acc2)]">− {formatCoins(receipt.coinsApplied)}</b>
              </div>
              <div className="!pt-[11px] !text-[13.5px] border-t border-hairline mt-1.5 [&>b]:font-display [&>b]:text-xl">
                <span>Collect from guest</span>
                <b>{formatCurrency(receipt.cashPayable)}</b>
              </div>
            </div>

            <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
              Guest's remaining balance: {formatCoins(receipt.balanceAfter)} coins. Platform fee{" "}
              {formatCurrency(receipt.platformFee)}.
            </p>

            <Button variant="ghost" block onClick={reset}>
              Next guest
            </Button>
          </Card>
        ) : checked ? (
          <Card title="Guest details" className="min-h-[220px]">
            <Badge tone="ok">Valid code</Badge>

            <div className="flex items-center gap-[11px] my-3.5">
              <span className="avatar">{initials(checked.guest.name)}</span>
              <span>
                <b className="block font-display text-base font-semibold">{checked.guest.name}</b>
                <i className="not-italic text-[11.5px] text-muted capitalize">
                  {checked.membership.tier} · {maskPhone(checked.guest.phone)}
                </i>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3.5">
              <span className="bg-chip rounded-token-sm p-[11px]">
                <u className="block no-underline text-[9.5px] tracking-[0.09em] uppercase text-muted font-bold">Balance</u>
                <b className="block font-display text-[21px] font-semibold mt-[3px]">{formatCoins(checked.membership.balance)}</b>
              </span>
              <span className="bg-chip rounded-token-sm p-[11px]">
                <u className="block no-underline text-[9.5px] tracking-[0.09em] uppercase text-muted font-bold">Max discount</u>
                <b className="block font-display text-[21px] font-semibold mt-[3px]">{checked.membership.tierCapPercent}%</b>
              </span>
            </div>

            {preview ? (
              <div className="my-3.5 [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:text-[12.5px] [&>div]:text-muted [&>div]:py-1.5 [&>div>b]:text-ink [&>div>b]:font-semibold [&>div>b]:tabular-nums">
                <div>
                  <span>Bill amount</span>
                  <b>{formatCurrency(Number(form.billAmount))}</b>
                </div>
                <div>
                  <span>Coins to apply</span>
                  <b className="!text-[var(--acc2)]">− {formatCoins(preview.coinsApplied)}</b>
                </div>
                <div className="!pt-[11px] !text-[13.5px] border-t border-hairline mt-1.5 [&>b]:font-display [&>b]:text-xl">
                  <span>Guest pays</span>
                  <b>{formatCurrency(preview.cashPayable)}</b>
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">Enter the bill amount to see the discount.</p>
            )}

            <Button block onClick={commit} disabled={busy || !preview?.coinsApplied}>
              {busy ? "Applying…" : "Confirm and apply"}
            </Button>
          </Card>
        ) : (
          <Card title="Guest details" className="min-h-[220px]">
            <div className="text-center px-2.5 py-[26px]">
              <span className="block w-[46px] h-[46px] rounded-[14px] bg-chip mx-auto" />
              <p>Verify a code to see the guest, their balance and the discount.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VerifyPage;
