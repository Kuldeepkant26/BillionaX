import { useState } from "react";
import { coinBalance, listPurchases, listPacks, buyCoins } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { invalidateCache } from "../../hooks/asyncCache.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Kpi,
  Loading,
  Modal,
  Pagination,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatCoins, formatCurrency, formatDate } from "../../utils/format.js";

const METHODS = [
  { id: "card", label: "Card", hint: "Visa, Mastercard, Rupay" },
  { id: "upi", label: "UPI", hint: "Any UPI app" },
  { id: "netbanking", label: "Net banking", hint: "All major banks" },
];

const STEP = { PICK: "pick", PAY: "pay", DONE: "done" };

const CoinsPage = () => {
  const balance = useAsync(coinBalance, [], { cacheKey: "hotel.coinBalance" });
  // key: "purchases" — bespoke response key kept.
  const purchases = usePaginatedList(listPurchases, { limit: 10, key: "purchases" });
  // Coin packs are near-static reference data, so this is the clearest win:
  // it is fetched once and then read from cache on every later visit.
  const packs = useAsync(listPacks, [], { cacheKey: "hotel.packs" });

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(STEP.PICK);
  const [selected, setSelected] = useState(null);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState("card");
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);

  if (balance.loading) return <Loading />;
  if (balance.error) return <ErrorState error={balance.error} onRetry={balance.run} />;

  const b = balance.data || {};
  const low = b.coinInventory < 10000;
  const packList = packs.data?.packs || [];

  const customCoins = Number(custom) || 0;
  // 1 coin = ₹1 at the current coin value; the API re-checks this server-side.
  const customPrice = customCoins;

  const openBuy = () => {
    setStep(STEP.PICK);
    setSelected(null);
    setCustom("");
    setMethod("card");
    setReceipt(null);
    setMessage("");
    setOpen(true);
  };

  const chosen = selected
    ? packList.find((p) => p.id === selected)
    : customCoins > 0
      ? { id: null, coins: customCoins, price: customPrice, label: "Custom" }
      : null;

  const pay = async () => {
    setBusy(true);
    setMessage("");

    try {
      const result = await buyCoins(
        selected
          ? { packId: selected, paymentMethod: method }
          : { coins: customCoins, price: customPrice, paymentMethod: method }
      );

      setReceipt(result);
      setStep(STEP.DONE);
      toastSuccess(`${formatCoins(result.purchase.coins)} coins added`);
      balance.run();
      purchases.run();
      // Inventory changed, so the dashboard's cached figures are stale.
      invalidateCache("hotel.dashboard");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        title="Coins"
        subtitle="Buy coins to fund guest rewards"
        actions={<Button onClick={openBuy}>Buy coins</Button>}
      />

      <div className="kpis">
        <Kpi
          label="Available inventory"
          value={formatCoins(b.coinInventory)}
          delta={low ? "Running low" : "Healthy"}
          tone={low ? "bad" : "ok"}
        />
        <Kpi label="Total purchased" value={formatCoins(b.totalCoinsPurchased)} />
        <Kpi label="Allocated to guests" value={formatCoins(b.totalCoinsAllocated)} />
        <Kpi label="Redeemed by guests" value={formatCoins(b.totalCoinsRedeemed)} />
      </div>

      {low && (
        <div className="flex items-center gap-3 flex-wrap bg-chip border-l-[3px] border-l-[var(--bad)] rounded-token-sm px-3.5 py-3 text-[12.5px] mt-4">
          <b>Your coin inventory is running low.</b> Allocations and welcome credits will start
          failing once it reaches zero.
          <Button size="sm" onClick={openBuy} className="ml-auto">
            Buy coins
          </Button>
        </div>
      )}

      <div className="mt-4">
        <Card title="Purchase history">
          {(
            <>
            <Table
              loading={purchases.loading}
              columns={[
                { label: "Date" },
                { label: "Reference" },
                { label: "Coins", num: true },
                { label: "Amount paid", num: true },
              ]}
              rows={purchases.items}
              empty={{
                title: "No purchases yet",
                hint: "Buy your first coin pack to start rewarding guests.",
              }}
              renderRow={(p) => (
                <tr key={p._id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{p.paymentRef || "—"}</td>
                  <td className="num">
                    <b>{formatCoins(p.coins)}</b>
                  </td>
                  <td className="num">{formatCurrency(p.amountPaid)}</td>
                </tr>
              )}
            />
            <Pagination
              page={purchases.page}
              limit={purchases.limit}
              total={purchases.total}
              onPage={purchases.setPage}
              loading={purchases.loading}
            />
            </>
          )}
        </Card>
      </div>

      <Modal
        open={open}
        title={step === STEP.DONE ? "Payment successful" : "Buy coins"}
        onClose={() => setOpen(false)}
        footer={
          step === STEP.PICK ? (
            <Button block disabled={!chosen} onClick={() => setStep(STEP.PAY)}>
              {chosen ? `Continue · ${formatCurrency(chosen.price)}` : "Choose an amount"}
            </Button>
          ) : step === STEP.PAY ? (
            <Button block onClick={pay} disabled={busy}>
              {busy ? "Processing…" : `Pay ${formatCurrency(chosen.price)}`}
            </Button>
          ) : (
            <Button block onClick={() => setOpen(false)}>
              Done
            </Button>
          )
        }
      >
        {message && <div className="notice-bad">{message}</div>}

        {step === STEP.PICK && (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-[18px]">
              {packList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`relative text-left bg-[var(--panel)] border rounded-token p-3.5 cursor-pointer text-ink transition-[border-color,background] duration-150 hover:border-[var(--acc2)] ${
                    selected === p.id ? "border-accent bg-[var(--soft)]" : "border-hairline"
                  }`}
                  onClick={() => {
                    setSelected(p.id);
                    setCustom("");
                  }}
                >
                  <span className="block text-[9.5px] tracking-[0.1em] uppercase text-muted font-bold">{p.label}</span>
                  <b className="block font-display text-[21px] font-semibold mt-[5px] tracking-[-0.5px]">
                    {formatCoins(p.coins)}
                  </b>
                  <span className="block text-xs text-muted mt-0.5">{formatCurrency(p.price)}</span>
                  {p.saving && (
                    <span className="absolute top-2.5 right-2.5 text-[9.5px] font-bold bg-[var(--acc2)] text-white px-[7px] py-0.5 rounded-full">
                      {p.saving}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <Field label="Or enter a custom amount" hint="1 coin = ₹1">
              <Input
                type="number"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setSelected(null);
                }}
                placeholder="25000"
                min={1}
              />
            </Field>
          </>
        )}

        {step === STEP.PAY && (
          <>
            <div className="bg-chip rounded-token-sm p-[13px] mb-4 [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:text-[12.5px] [&>div]:text-muted [&>div]:py-[5px] [&>div>b]:text-ink [&>div>b]:font-semibold">
              <div>
                <span>Coins</span>
                <b>{formatCoins(chosen.coins)}</b>
              </div>
              <div className="!pt-2.5 border-t border-hairline mt-[5px] [&>b]:font-display [&>b]:text-lg">
                <span>Total payable</span>
                <b>{formatCurrency(chosen.price)}</b>
              </div>
            </div>

            <span className="label mt-1">
              Payment method
            </span>
            <div className="flex flex-col gap-2 mb-4">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`text-left bg-[var(--panel)] border rounded-token-sm px-[13px] py-[11px] cursor-pointer text-ink hover:border-[var(--acc2)] ${
                    method === m.id ? "border-accent bg-[var(--soft)]" : "border-hairline"
                  }`}
                  onClick={() => setMethod(m.id)}
                >
                  <b className="block text-[12.5px] font-semibold">{m.label}</b>
                  <i className="not-italic text-[11px] text-muted">{m.hint}</i>
                </button>
              ))}
            </div>

            <div className="bg-chip border border-dashed border-hairline rounded-token-sm px-[13px] py-[11px] text-[11.5px] leading-[1.5] text-muted">
              <b className="block text-[var(--acc2)] mb-[3px]">Demo mode</b>
              <span>
                No real payment is taken. Clicking Pay records the purchase and credits your coins
                immediately. A payment gateway drops in here later without changing anything else.
              </span>
            </div>
          </>
        )}

        {step === STEP.DONE && receipt && (
          <div className="text-center">
            <span className="w-[54px] h-[54px] rounded-full bg-[var(--soft)] text-[var(--ok)] grid place-items-center mx-auto mb-3.5">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path
                  d="M4 12.5l5 5L20 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>

            <b className="block font-display text-[19px] font-semibold mb-4">{formatCoins(receipt.purchase.coins)} coins added</b>

            <div className="bg-chip rounded-token-sm p-[13px] mb-4 [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:text-[12.5px] [&>div]:text-muted [&>div]:py-[5px] [&>div>b]:text-ink [&>div>b]:font-semibold text-left">
              <div>
                <span>Paid</span>
                <b>{formatCurrency(receipt.purchase.amountPaid)}</b>
              </div>
              <div>
                <span>Reference</span>
                <b>{receipt.purchase.paymentRef}</b>
              </div>
              <div className="!pt-2.5 border-t border-hairline mt-[5px] [&>b]:font-display [&>b]:text-lg">
                <span>New inventory</span>
                <b>{formatCoins(receipt.coinInventory)}</b>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CoinsPage;
