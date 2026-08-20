import { useState } from "react";
import { coinBalance, listPurchases, listPacks, buyCoins } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
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
import styles from "./CoinsPage.module.css";

const METHODS = [
  { id: "card", label: "Card", hint: "Visa, Mastercard, Rupay" },
  { id: "upi", label: "UPI", hint: "Any UPI app" },
  { id: "netbanking", label: "Net banking", hint: "All major banks" },
];

const STEP = { PICK: "pick", PAY: "pay", DONE: "done" };

const CoinsPage = () => {
  const balance = useAsync(coinBalance, []);
  // key: "purchases" — bespoke response key kept.
  const purchases = usePaginatedList(listPurchases, { limit: 10, key: "purchases" });
  const packs = useAsync(listPacks, []);

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
        <div className={styles.warn}>
          <b>Your coin inventory is running low.</b> Allocations and welcome credits will start
          failing once it reaches zero.
          <Button size="sm" onClick={openBuy} className={styles.warnBtn}>
            Buy coins
          </Button>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
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
        {message && <div className={styles.alert}>{message}</div>}

        {step === STEP.PICK && (
          <>
            <div className={styles.packs}>
              {packList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.pack} ${selected === p.id ? styles.packOn : ""}`}
                  onClick={() => {
                    setSelected(p.id);
                    setCustom("");
                  }}
                >
                  <span className={styles.packName}>{p.label}</span>
                  <b className={styles.packCoins}>{formatCoins(p.coins)}</b>
                  <span className={styles.packPrice}>{formatCurrency(p.price)}</span>
                  {p.saving && <span className={styles.packSave}>{p.saving}</span>}
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
            <div className={styles.summary}>
              <div>
                <span>Coins</span>
                <b>{formatCoins(chosen.coins)}</b>
              </div>
              <div className={styles.summaryTotal}>
                <span>Total payable</span>
                <b>{formatCurrency(chosen.price)}</b>
              </div>
            </div>

            <span className="label" style={{ marginTop: 4 }}>
              Payment method
            </span>
            <div className={styles.methods}>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.method} ${method === m.id ? styles.methodOn : ""}`}
                  onClick={() => setMethod(m.id)}
                >
                  <b>{m.label}</b>
                  <i>{m.hint}</i>
                </button>
              ))}
            </div>

            <div className={styles.demo}>
              <b>Demo mode</b>
              <span>
                No real payment is taken. Clicking Pay records the purchase and credits your coins
                immediately. A payment gateway drops in here later without changing anything else.
              </span>
            </div>
          </>
        )}

        {step === STEP.DONE && receipt && (
          <div className={styles.done}>
            <span className={styles.tick}>
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

            <b className={styles.doneCoins}>{formatCoins(receipt.purchase.coins)} coins added</b>

            <div className={styles.summary}>
              <div>
                <span>Paid</span>
                <b>{formatCurrency(receipt.purchase.amountPaid)}</b>
              </div>
              <div>
                <span>Reference</span>
                <b>{receipt.purchase.paymentRef}</b>
              </div>
              <div className={styles.summaryTotal}>
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
