import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getHotel,
  sellCoins,
  reversePurchase,
  createHotelAdmin,
  updateHotel,
  deleteHotel,
} from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Kpi,
  Loading,
  Modal,
  PasswordInput,
  Select,
  Slider,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { HotelOnboarding } from "../../features/panel/HotelOnboarding.jsx";
import { QrCode } from "../../features/panel/QrCode.jsx";
import { ROUTES } from "../../constants/routePaths.js";
import {
  formatCoins,
  formatCurrency,
  formatDate,
  formatDateTime,
  numberInWords,
} from "../../utils/format.js";

/**
 * The coins a credit or a reversal is about, as large as the dialog allows,
 * with the same number in words beneath. Side by side, the two are what make
 * a stray zero visible before it is committed: "Ten lakh" does not read like
 * "One lakh".
 */
const CoinFigure = ({ sign, coins, caption, tone = "acc" }) => (
  <div
    className={`rounded-token border-2 px-4 py-5 text-center ${
      tone === "bad"
        ? "border-bad bg-[color-mix(in_srgb,var(--bad)_7%,transparent)]"
        : "border-accent bg-[var(--soft)]"
    }`}
  >
    <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">{caption}</span>
    <b
      className={`block mt-2 font-display text-[40px] font-semibold leading-none tracking-[-1px] tabular-nums ${
        tone === "bad" ? "text-bad" : "text-ink"
      }`}
    >
      {sign}
      {formatCoins(coins)}
    </b>
    <span className="block mt-2 text-[13px] font-semibold text-muted">
      {numberInWords(coins)} coins
    </span>
  </div>
);

// The label/value rows under a CoinFigure — the same look as the hotel's
// Order coins summary.
const SUMMARY =
  "bg-chip rounded-token-sm p-[13px] mt-3.5 [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:text-[12.5px] [&>div]:text-muted [&>div]:py-[5px] [&>div>b]:text-ink [&>div>b]:font-semibold [&>div>b]:text-right";

/**
 * A nudge, not a rule: packs run ₹0.85–₹1 a coin, so a figure far outside
 * that is more likely a typo in one of the two fields than a real deal.
 */
const rateWarning = (coins, paid) => {
  if (!(coins > 0)) return null;
  if (paid === 0) return "No payment is recorded. Only add free coins on purpose.";
  const perCoin = paid / coins;
  if (perCoin > 1 || perCoin < 0.8) {
    return `That is ₹${perCoin.toFixed(2)} per coin, outside the usual ₹0.85–₹1. Check the coins and the amount.`;
  }
  return null;
};

/** "17h left" / "42m left" for the Reverse countdown. */
const timeLeft = (ms) => {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h left` : `${minutes}m left`;
};

const HotelDetailPage = () => {
  const { hotelId } = useParams();
  const { data, loading, error, run } = useAsync(() => getHotel(hotelId), [hotelId]);

  const [sellOpen, setSellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    city: "",
    address: "",
    phone: "",
    email: "",
    earnRatePercent: 15,
    isActive: true,
  });
  const [sellForm, setSellForm] = useState({ coins: "", amountPaid: "", paymentRef: "" });
  // Add coins is two steps: the form, then a review of exactly what will land.
  const [sellStep, setSellStep] = useState("form");
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseReason, setReverseReason] = useState("");
  // Ticks the Reverse countdowns; the server re-checks the window regardless.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "HOTEL_ADMIN",
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const hotel = data?.hotel || {};
  const joinUrl = `${window.location.origin}/join/${data?.qr?.slug}`;

  const doSell = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await sellCoins(hotelId, {
        coins: Number(sellForm.coins),
        amountPaid: Number(sellForm.amountPaid),
        paymentRef: sellForm.paymentRef || undefined,
      });
      toastSuccess(`${formatCoins(Number(sellForm.coins))} coins added to ${hotel.name}`);
      setSellOpen(false);
      setSellForm({ coins: "", amountPaid: "", paymentRef: "" });
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
      // Back to the fields, where a field error has somewhere to show.
      setSellStep("form");
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    setSellStep("form");
    setErrors({});
    setMessage("");
    setSellOpen(true);
  };

  const openReverse = (purchase) => {
    setReverseTarget(purchase);
    setReverseReason("");
    setMessage("");
  };

  const doReverse = async () => {
    setBusy(true);
    setMessage("");

    try {
      await reversePurchase(hotelId, reverseTarget._id, reverseReason.trim());
      toastSuccess(`${formatCoins(reverseTarget.coins)} coins taken back from ${hotel.name}`);
      setReverseTarget(null);
      run();
    } catch (err) {
      // Usually the hotel has spent into the credit, or the window closed.
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reversalMs = (data?.reversalHours ?? 24) * 60 * 60 * 1000;
  const sellCoinsNum = Number(sellForm.coins) || 0;
  const sellPaidNum = sellForm.amountPaid === "" ? null : Number(sellForm.amountPaid);
  const canReview = sellCoinsNum > 0 && Number.isInteger(sellCoinsNum) && sellPaidNum !== null && sellPaidNum >= 0;
  const reverseShort = reverseTarget && hotel.coinInventory < reverseTarget.coins;

  const doCreateUser = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await createHotelAdmin(hotelId, userForm);
      toastSuccess("Account created");
      setUserOpen(false);
      setUserForm({ name: "", email: "", password: "", role: "HOTEL_ADMIN" });
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setEditForm({
      name: hotel.name || "",
      city: hotel.city || "",
      address: hotel.address || "",
      phone: hotel.phone || "",
      email: hotel.email || "",
      earnRatePercent: hotel.earnRatePercent ?? 15,
      isActive: hotel.isActive,
    });
    setErrors({});
    setMessage("");
    setEditOpen(true);
  };

  const doUpdate = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await updateHotel(hotelId, {
        ...editForm,
        earnRatePercent: Number(editForm.earnRatePercent),
        email: editForm.email || undefined,
      });
      toastSuccess("Hotel updated");
      setEditOpen(false);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteHotel(hotelId);
      toastSuccess("Hotel removed");
      navigate(ROUTES.ADMIN_HOTELS);
    } catch (err) {
      // Refused while guests still hold coins there — show why.
      toastError(err.message);
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const alert = message && (
    <div className="notice-bad">{message}</div>
  );

  return (
    <div>
      <Link
        to={ROUTES.ADMIN_HOTELS}
        className="inline-block text-xs text-muted hover:text-ink mb-3"
      >
        ← All hotels
      </Link>

      <PageHead
        title={hotel.name}
        subtitle={`${hotel.city || "—"} · joined ${formatDate(hotel.createdAt)}`}
        actions={
          <>
            <Button variant="ghost" onClick={startEdit}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setUserOpen(true)}>
              Add account
            </Button>
            <Button onClick={openAdd}>Add coins</Button>
          </>
        }
      />

      <div className="kpis">
        <Kpi
          label="Coin inventory"
          value={formatCoins(hotel.coinInventory)}
          delta={hotel.coinInventory < 10000 ? "Running low" : "Healthy"}
          tone={hotel.coinInventory < 10000 ? "bad" : "ok"}
        />
        <Kpi label="Total purchased" value={formatCoins(hotel.totalCoinsPurchased)} />
        <Kpi label="Allocated" value={formatCoins(hotel.totalCoinsAllocated)} />
        <Kpi label="Redeemed" value={formatCoins(hotel.totalCoinsRedeemed)} />
      </div>

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[1.3fr_1fr] gap-4 mt-4 items-start">
        <Card title="Purchase history">
          <Table
            columns={[
              { label: "Date" },
              { label: "Reference" },
              { label: "Coins", num: true },
              { label: "Paid", num: true },
              { label: "" },
            ]}
            rows={data?.purchases || []}
            empty={{ title: "No purchases yet", hint: "Add this hotel's first coins." }}
            renderRow={(p) => {
              const void_ = p.status === "VOID";
              const left = new Date(p.createdAt).getTime() + reversalMs - now;
              return (
                <tr key={p._id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{p.paymentRef || "—"}</td>
                  <td className="num">
                    <b className={void_ ? "line-through text-muted" : undefined}>{formatCoins(p.coins)}</b>
                  </td>
                  <td className={`num ${void_ ? "line-through text-muted" : ""}`}>
                    {formatCurrency(p.amountPaid)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {void_ ? (
                      <Badge tone="bad">Reversed</Badge>
                    ) : left > 0 ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[11px] text-muted">{timeLeft(left)}</span>
                        <Button size="sm" variant="ghost" onClick={() => openReverse(p)}>
                          Reverse
                        </Button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            }}
          />
        </Card>

        <div>
          <Card title="Accounts">
            <Table
              columns={[{ label: "Name" }, { label: "Access" }, { label: "Status" }]}
              rows={data?.staff || []}
              empty={{ title: "No accounts", hint: "Create the hotel's first manager login." }}
              renderRow={(u) => (
                <tr key={u._id}>
                  <td>
                    <b>{u.name}</b>
                    <div className="muted text-[11px]">
                      {u.email}
                    </div>
                  </td>
                  <td>
                    <Badge tone={u.role === "HOTEL_ADMIN" ? "acc" : undefined}>
                      {u.role === "HOTEL_ADMIN" ? "Manager" : "Front desk"}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={u.isActive ? "ok" : undefined}>
                      {u.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                </tr>
              )}
            />
          </Card>

          <Card title="Guest QR link" className="mt-4">
            <div className="flex items-start gap-4 flex-wrap">
              <QrCode value={joinUrl} />
              <div className="flex-1 min-w-[200px]">
                <div className="bg-chip rounded-token-sm p-3 text-xs break-all font-mono">
                  {joinUrl}
                </div>
                <p className="text-[11.5px] text-muted leading-[1.5] mt-2.5">
                  The hotel prints this QR code for reception, rooms and outlets.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <HotelOnboarding hotel={hotel} onChange={run} />

      <Modal
        open={sellOpen}
        title={sellStep === "review" ? "Check before adding" : `Add coins to ${hotel.name}`}
        onClose={() => setSellOpen(false)}
        footer={
          sellStep === "review" ? (
            <div className="flex items-center gap-[9px]">
              <Button variant="ghost" block onClick={() => setSellStep("form")} disabled={busy}>
                Back
              </Button>
              <Button block onClick={doSell} disabled={busy}>
                {busy ? "Adding…" : `Add ${formatCoins(sellCoinsNum)} coins`}
              </Button>
            </div>
          ) : (
            <Button block onClick={() => setSellStep("review")} disabled={!canReview}>
              {canReview ? "Review" : "Enter the coins and the amount paid"}
            </Button>
          )
        }
      >
        {alert}

        {sellStep === "form" ? (
          <>
            <Field
              label="Coins to add"
              hint={sellCoinsNum > 0 ? `${numberInWords(sellCoinsNum)} coins` : undefined}
              error={errors.coins}
            >
              <Input
                type="number"
                min={1}
                value={sellForm.coins}
                onChange={(e) => setSellForm((f) => ({ ...f, coins: e.target.value }))}
                error={errors.coins}
                placeholder="100000"
                autoFocus
              />
            </Field>
            <Field
              label="Amount paid (₹)"
              hint={sellPaidNum > 0 ? `${numberInWords(sellPaidNum)} rupees` : undefined}
              error={errors.amountPaid}
            >
              <Input
                type="number"
                min={0}
                value={sellForm.amountPaid}
                onChange={(e) => setSellForm((f) => ({ ...f, amountPaid: e.target.value }))}
                error={errors.amountPaid}
                placeholder="95000"
              />
            </Field>
            <Field label="Payment reference" hint="UTR, cheque number, or a note" error={errors.paymentRef}>
              <Input
                value={sellForm.paymentRef}
                onChange={(e) => setSellForm((f) => ({ ...f, paymentRef: e.target.value }))}
              />
            </Field>
          </>
        ) : (
          <>
            <CoinFigure sign="+" coins={sellCoinsNum} caption={`Adding to ${hotel.name}`} />
            <div className={SUMMARY}>
              <div>
                <span>Amount paid</span>
                <b>
                  {formatCurrency(sellPaidNum)}
                  {sellPaidNum > 0 && (
                    <span className="block text-[11px] font-normal text-muted">
                      ₹{(sellPaidNum / sellCoinsNum).toFixed(2)} per coin
                    </span>
                  )}
                </b>
              </div>
              <div>
                <span>Reference</span>
                <b>{sellForm.paymentRef.trim() || "—"}</b>
              </div>
              <div className="!pt-2.5 border-t border-hairline mt-[5px]">
                <span>Inventory</span>
                <b className="tabular-nums">
                  {formatCoins(hotel.coinInventory)} → {formatCoins(hotel.coinInventory + sellCoinsNum)}
                </b>
              </div>
            </div>
            {rateWarning(sellCoinsNum, sellPaidNum) && (
              <div className="notice-warn mt-3 text-[12px]">{rateWarning(sellCoinsNum, sellPaidNum)}</div>
            )}
            <p className="hint mt-3">
              You can reverse this from Purchase history for {data?.reversalHours ?? 24} hours, as
              long as {hotel.name} hasn&rsquo;t used the coins.
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(reverseTarget)}
        title="Reverse this credit?"
        onClose={() => !busy && setReverseTarget(null)}
        footer={
          <div className="flex items-center gap-[9px]">
            <Button variant="ghost" block onClick={() => setReverseTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" block onClick={doReverse} disabled={busy || reverseShort}>
              {busy ? "Reversing…" : `Reverse ${formatCoins(reverseTarget?.coins)} coins`}
            </Button>
          </div>
        }
      >
        {alert}
        {reverseTarget && (
          <>
            <CoinFigure
              sign="−"
              coins={reverseTarget.coins}
              caption={`Taking back from ${hotel.name}`}
              tone="bad"
            />
            <div className={SUMMARY}>
              <div>
                <span>Added</span>
                <b>{formatDateTime(reverseTarget.createdAt)}</b>
              </div>
              <div>
                <span>Amount paid</span>
                <b>{formatCurrency(reverseTarget.amountPaid)}</b>
              </div>
              <div>
                <span>Reference</span>
                <b>{reverseTarget.paymentRef || "—"}</b>
              </div>
              <div className="!pt-2.5 border-t border-hairline mt-[5px]">
                <span>Inventory</span>
                <b className="tabular-nums">
                  {formatCoins(hotel.coinInventory)} →{" "}
                  {reverseShort ? "—" : formatCoins(hotel.coinInventory - reverseTarget.coins)}
                </b>
              </div>
            </div>

            {reverseShort ? (
              <div className="notice-bad mt-3 text-[12px]">
                {hotel.name} has already used some of these coins — {formatCoins(hotel.coinInventory)}{" "}
                left of the {formatCoins(reverseTarget.coins)} added — so this credit can&rsquo;t be
                reversed.
              </div>
            ) : (
              <>
                <div className="mt-3.5">
                  <Field label="Reason (optional)">
                    <Input
                      value={reverseReason}
                      maxLength={200}
                      onChange={(e) => setReverseReason(e.target.value)}
                      placeholder="Wrong amount entered"
                    />
                  </Field>
                </div>
                <p className="hint">
                  The coins leave {hotel.name}&rsquo;s inventory and this credit&rsquo;s invoice is
                  marked void. This can&rsquo;t be undone.
                </p>
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={userOpen}
        title="Create hotel account"
        onClose={() => setUserOpen(false)}
        footer={
          <Button block onClick={doCreateUser} disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        }
      >
        {alert}
        <Field label="Name" error={errors.name}>
          <Input
            value={userForm.name}
            onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            value={userForm.email}
            onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters" error={errors.password}>
          <PasswordInput
            value={userForm.password}
            onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
          />
        </Field>
        <Field label="Access level">
          <Select
            value={userForm.role}
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="HOTEL_ADMIN">Manager — full panel</option>
            <option value="HOTEL_STAFF">Front desk — verify only</option>
          </Select>
        </Field>
      </Modal>

      <Modal
        open={editOpen}
        title="Edit hotel"
        onClose={() => setEditOpen(false)}
        footer={
          <Button block onClick={doUpdate} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        {alert}
        <Field label="Hotel name" error={errors.name}>
          <Input
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
            autoFocus
          />
        </Field>
        <Field label="City" error={errors.city}>
          <Input
            value={editForm.city}
            onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
          />
        </Field>
        <Field label="Address" error={errors.address}>
          <Input
            value={editForm.address}
            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
          />
        </Field>
        <Field
          label="Earn rate"
          hint="Coins = room amount × nights × this percentage"
          error={errors.earnRatePercent}
        >
          <Slider
            min={0}
            max={100}
            unit="%"
            value={editForm.earnRatePercent}
            onChange={(e) => setEditForm((f) => ({ ...f, earnRatePercent: e.target.value }))}
            error={errors.earnRatePercent}
          />
        </Field>
        <label className="flex items-center gap-[9px] text-[13px] cursor-pointer">
          <input
            type="checkbox"
            checked={editForm.isActive}
            onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Hotel is live
        </label>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Remove this hotel?"
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="flex items-center gap-[9px]">
            <Button variant="ghost" block onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" block onClick={doDelete} disabled={busy}>
              {busy ? "Removing…" : "Remove hotel"}
            </Button>
          </div>
        }
      >
        <p className="confirm-text">
          <b>{hotel.name}</b>, its staff accounts, content and memberships will be removed. This
          cannot be undone.
        </p>
        <div className="notice-warn mt-3.5">
          If guests still hold coins at this hotel the removal is refused — those coins are a
          liability the hotel has already paid for. Deactivate it instead if you only want to pause
          it.
        </div>
      </Modal>
    </div>
  );
};

export default HotelDetailPage;
