import { useState } from "react";
import { verifyVoucher, redeemVoucher } from "../../api/hotel.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Badge, Button, Card, Field, Input, Select } from "../../components/common/index.jsx";
import { formatCoins, formatCurrency, initials, maskPhone } from "../../utils/format.js";
import styles from "./VerifyPage.module.css";

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
      <header className={styles.head}>
        <div>
          <h1 className={`display ${styles.title}`}>Verify a code</h1>
          <p className={styles.sub}>
            Enter the bill first, then the guest's code. Verifying does not deduct anything.
          </p>
        </div>
      </header>

      <div className={styles.cols}>
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
              className={styles.codeInput}
            />
          </Field>

          <div className={styles.actions}>
            <Button block onClick={check} disabled={busy}>
              {busy ? "Checking…" : "Verify code"}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          </div>

          <p className={styles.note}>
            Codes last 10 minutes and work once. If one fails, ask the guest to generate a new code
            in their app.
          </p>
        </Card>

        {receipt ? (
          <Card title="Applied" className={styles.result}>
            <Badge tone="ok">Redeemed</Badge>

            <div className={styles.lines}>
              <div>
                <span>Bill amount</span>
                <b>{formatCurrency(receipt.billAmount)}</b>
              </div>
              <div>
                <span>Coins applied</span>
                <b className={styles.discount}>− {formatCoins(receipt.coinsApplied)}</b>
              </div>
              <div className={styles.total}>
                <span>Collect from guest</span>
                <b>{formatCurrency(receipt.cashPayable)}</b>
              </div>
            </div>

            <p className={styles.note}>
              Guest's remaining balance: {formatCoins(receipt.balanceAfter)} coins. Platform fee{" "}
              {formatCurrency(receipt.platformFee)}.
            </p>

            <Button variant="ghost" block onClick={reset}>
              Next guest
            </Button>
          </Card>
        ) : checked ? (
          <Card title="Guest details" className={styles.result}>
            <Badge tone="ok">Valid code</Badge>

            <div className={styles.who}>
              <span className="avatar">{initials(checked.guest.name)}</span>
              <span>
                <b>{checked.guest.name}</b>
                <i>
                  {checked.membership.tier} · {maskPhone(checked.guest.phone)}
                </i>
              </span>
            </div>

            <div className={styles.kpis}>
              <span className={styles.kpi}>
                <u>Balance</u>
                <b>{formatCoins(checked.membership.balance)}</b>
              </span>
              <span className={styles.kpi}>
                <u>Max discount</u>
                <b>{checked.membership.tierCapPercent}%</b>
              </span>
            </div>

            {preview ? (
              <div className={styles.lines}>
                <div>
                  <span>Bill amount</span>
                  <b>{formatCurrency(Number(form.billAmount))}</b>
                </div>
                <div>
                  <span>Coins to apply</span>
                  <b className={styles.discount}>− {formatCoins(preview.coinsApplied)}</b>
                </div>
                <div className={styles.total}>
                  <span>Guest pays</span>
                  <b>{formatCurrency(preview.cashPayable)}</b>
                </div>
              </div>
            ) : (
              <p className={styles.note}>Enter the bill amount to see the discount.</p>
            )}

            <Button block onClick={commit} disabled={busy || !preview?.coinsApplied}>
              {busy ? "Applying…" : "Confirm and apply"}
            </Button>
          </Card>
        ) : (
          <Card title="Guest details" className={styles.result}>
            <div className={styles.placeholder}>
              <span className={styles.ph} />
              <p>Verify a code to see the guest, their balance and the discount.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VerifyPage;
