import { useEffect, useState } from "react";
import { createVoucher, getActiveVoucher, cancelVoucher } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useCountdown } from "../../hooks/useCountdown.js";
import { Button, Empty, Field, Input } from "../../components/common/index.jsx";
import { RedeemSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins, mmss } from "../../utils/format.js";

const RedeemPage = () => {
  const memberships = useAppStore((s) => s.memberships);
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));
  const balance = active?.balance || 0;

  const [coins, setCoins] = useState("");
  const [voucher, setVoucher] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seconds = useCountdown(voucher?.expiresAt);
  const expired = voucher && seconds <= 0;

  // Restore an in-flight voucher, so a refresh mid-transaction doesn't
  // strand the guest at the desk with a code they can no longer see.
  useEffect(() => {
    if (!activeHotelId) return;
    getActiveVoucher(activeHotelId)
      .then((data) => setVoucher(data?.voucher || null))
      .catch(() => {});
  }, [activeHotelId]);

  const generate = async () => {
    const amount = Number(coins);
    if (!amount || amount < 1) return setError("Enter how many coins to use");
    if (amount > balance) return setError(`You only have ${formatCoins(balance)} coins here`);

    setBusy(true);
    setError("");

    try {
      const data = await createVoucher({ hotelId: activeHotelId, coins: amount });
      setVoucher(data);
      toastSuccess("Show this code at the desk");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!voucher?.id) return setVoucher(null);
    try {
      await cancelVoucher(voucher.id);
      setVoucher(null);
      setCoins("");
    } catch (err) {
      toastError(err.message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.code);
      toastSuccess("Code copied");
    } catch {
      toastError("Could not copy — read it out instead");
    }
  };

  // An empty store means the shell's fetch has not landed yet, which is not
  // the same as having no memberships — showing "No hotel selected" during
  // that window tells the guest something untrue.
  if (!memberships.length) return <RedeemSkeleton />;

  if (!active) {
    return <Empty title="No hotel selected" hint="Join a hotel to redeem your coins." />;
  }

  return (
    <div>
      <h1 className="display text-[22px]">Use your coins</h1>
      <p className="text-muted text-[13px] leading-[1.55] mt-2 mb-5">
        You have <b className="text-ink">{formatCoins(balance)}</b> coins at {active.hotelId?.name}. Generate a code and
        show it to the staff before they settle your bill.
      </p>

      {voucher && !expired ? (
        <div className="bg-card border border-hairline rounded-token p-[18px] text-center">
          <span className="kicker">One-time code</span>
          <div className="font-display text-[27px] font-semibold tracking-[3px] mt-2.5 text-[var(--acc2)] break-all">
            {voucher.code}
          </div>

          <div className="h-1.5 rounded-full bg-chip overflow-hidden mt-4">
            <i
              className="block h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(100, (seconds / 600) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10.5px] text-muted mt-[7px]">
            <span>
              Expires in <b className="text-[var(--acc2)] tabular-nums">{mmss(seconds)}</b>
            </span>
            <span>Works once</span>
          </div>

          <div className="text-[11.5px] text-muted leading-[1.5] mt-3.5 text-left">
            Worth up to <b className="text-ink">{formatCoins(voucher.coinsRequested)}</b> coins. The final discount
            depends on your tier's cap and the bill amount.
          </div>

          <div className="flex gap-[9px] mt-4">
            <Button variant="ghost" block onClick={copy}>
              Copy code
            </Button>
            <Button variant="ghost" block onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {expired && (
            <div className="bg-[var(--soft)] border-l-[3px] border-l-[var(--warn)] rounded-token-sm px-[13px] py-[11px] text-[12.5px] text-[var(--warn)] mb-4">
              That code expired. Generate a new one when you're ready to pay.
            </div>
          )}

          <div className="mt-1">
            <Field label="Coins to use" error={error}>
              <Input
                type="number"
                inputMode="numeric"
                value={coins}
                onChange={(e) => setCoins(e.target.value)}
                error={error}
                placeholder="1500"
                min={1}
                max={balance}
              />
            </Field>

            <div className="flex flex-wrap gap-[7px] -mt-1 mb-[18px]">
              {[500, 1000, 2500].map(
                (amount) =>
                  amount <= balance && (
                    <button
                      key={amount}
                      className="bg-chip border border-hairline rounded-full px-[13px] py-[7px] text-[11.5px] font-semibold text-ink cursor-pointer hover:border-accent hover:text-accent"
                      onClick={() => setCoins(String(amount))}
                    >
                      {formatCoins(amount)}
                    </button>
                  )
              )}
              <button
                className="bg-chip border border-hairline rounded-full px-[13px] py-[7px] text-[11.5px] font-semibold text-ink cursor-pointer hover:border-accent hover:text-accent"
                onClick={() => setCoins(String(balance))}
              >
                All {formatCoins(balance)}
              </button>
            </div>

            <Button block size="lg" onClick={generate} disabled={busy || !balance}>
              {busy ? "Generating…" : "Generate code"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default RedeemPage;
