import { useState } from "react";
import { listMembers, allocate, creditMember, recordStay, getSettings } from "../../api/hotel.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  FilterBar,
  Input,
  Modal,
  Pagination,
  PhoneInput,
  Select,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import {
  DEFAULT_NIGHT_THRESHOLDS,
  DEFAULT_TIER_EARN_RATES,
  formatCoins,
  formatCurrency,
  formatDate,
  isValidPhone,
  maskPhone,
  resolveTierByNights,
} from "../../utils/format.js";

const TIER_TONE = { SILVER: undefined, GOLD: "warn", PLATINUM: "ok" };
const QUICK_COINS = [500, 1000, 2500, 5000];

const Alert = ({ children }) => (children ? <div className="notice-bad">{children}</div> : null);

/**
 * Nights still needed for the next tier up, or null once Platinum is reached.
 * Lets the desk answer "how close am I?" without opening anything.
 */
const nextTierFor = (nights, thresholds) => {
  const n = Number(nights) || 0;
  const gold = Number(thresholds?.GOLD);
  const platinum = Number(thresholds?.PLATINUM);

  if (gold > 0 && n < gold) return { tier: "GOLD", remaining: gold - n };
  if (platinum > 0 && n < platinum) return { tier: "PLATINUM", remaining: platinum - n };
  return null;
};

/**
 * One key per opened form, not per click. Both submit handlers reuse it, so a
 * double-click (or a retry after a flaky response) collapses to a single
 * credit server-side instead of charging the hotel's inventory twice.
 */
const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() || `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const MembersPage = ({ canAllocate }) => {
  const [allocOpen, setAllocOpen] = useState(false);
  const [creditFor, setCreditFor] = useState(null);
  const [stayFor, setStayFor] = useState(null);

  const [form, setForm] = useState({ phone: "", name: "", roomAmount: "", nights: "1" });
  const [creditForm, setCreditForm] = useState({ coins: "", note: "" });
  const [stayForm, setStayForm] = useState({ nights: "1", amount: "", note: "" });

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);

  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const list = usePaginatedList(listMembers, {
    limit: 25,
    filters: { tier: "", minBalance: "" },
  });
  const { items, loading, error, run } = list;

  // This hotel's own tier rules, so the stay modal can preview the exact coins
  // and any promotion. Falls back to the model defaults until it resolves.
  const { data: settings } = useAsync(getSettings, []);
  const tierEarnRates = settings?.hotel?.tierEarnRates || DEFAULT_TIER_EARN_RATES;
  const nightThresholds = settings?.hotel?.tierNightThresholds || DEFAULT_NIGHT_THRESHOLDS;

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const resetModalState = () => {
    setErrors({});
    setMessage("");
  };

  // ---- allocate for a stay ----
  const submitAllocate = async () => {
    if (!isValidPhone(form.phone)) {
      return setErrors({ phone: "Enter a valid 10-digit mobile number" });
    }

    setBusy(true);
    resetModalState();

    try {
      const result = await allocate({
        phone: form.phone,
        name: form.name || undefined,
        roomAmount: Number(form.roomAmount),
        nights: Number(form.nights),
        idempotencyKey: idemKey,
      });

      toastSuccess(`${formatCoins(result.coinsAllocated)} coins added`);
      setAllocOpen(false);
      setForm({ phone: "", name: "", roomAmount: "", nights: "1" });
      setIdemKey(newIdempotencyKey());
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- credit coins directly ----
  const openCredit = (member) => {
    setCreditFor(member);
    setCreditForm({ coins: "", note: "" });
    setIdemKey(newIdempotencyKey());
    resetModalState();
  };

  const submitCredit = async () => {
    const coins = Number(creditForm.coins);
    if (!coins || coins < 1) return setErrors({ coins: "Enter how many coins to add" });

    setBusy(true);
    resetModalState();

    try {
      const result = await creditMember(creditFor._id, {
        coins,
        note: creditForm.note || undefined,
        idempotencyKey: idemKey,
      });
      toastSuccess(`${formatCoins(result.coinsCredited)} coins added`);
      setCreditFor(null);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- record a stay (nights + amount) ----
  const openStay = (member) => {
    setStayFor(member);
    setStayForm({ nights: "1", amount: "", note: "" });
    setIdemKey(newIdempotencyKey());
    resetModalState();
  };

  const submitStay = async () => {
    const nights = Number(stayForm.nights);
    const amount = Number(stayForm.amount);

    if (!nights || nights < 1) return setErrors({ nights: "Enter how many nights" });
    if (!amount || amount < 1) return setErrors({ amount: "Enter the total amount for the stay" });

    setBusy(true);
    resetModalState();

    try {
      const result = await recordStay(stayFor._id, {
        nights,
        amount,
        note: stayForm.note || undefined,
        idempotencyKey: idemKey,
      });

      toastSuccess(
        result.tierChanged
          ? `Stay recorded — ${formatCoins(result.coinsCredited)} coins added, now ${result.tier}`
          : `Stay recorded — ${formatCoins(result.coinsCredited)} coins added`
      );
      setStayFor(null);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const allocPreview =
    Number(form.roomAmount) > 0 && Number(form.nights) > 0
      ? Math.floor((Number(form.roomAmount) * Number(form.nights) * 15) / 100)
      : 0;

  // Mirrors the server's recordStay: the rate is the one for the tier the guest
  // holds NOW, since nights are banked only after the coins are credited.
  const stayRate = stayFor ? tierEarnRates[stayFor.tier] ?? 0 : 0;
  const stayCoins =
    Number(stayForm.amount) > 0 ? Math.floor((Number(stayForm.amount) * stayRate) / 100) : 0;

  const stayNightsAfter = (stayFor?.lifetimeNights || 0) + (Number(stayForm.nights) || 0);
  const stayTierAfter = resolveTierByNights(stayNightsAfter, nightThresholds);
  const stayPromotes = stayFor ? stayTierAfter !== stayFor.tier : false;

  return (
    <div>
      <PageHead
        title="Members"
        subtitle="Guests who have joined your loyalty programme"
        actions={
          canAllocate && <Button onClick={() => setAllocOpen(true)}>Add coins for a stay</Button>
        }
      />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Input
          className="filter-search"
          placeholder="Search name, phone or email"
          value={list.q}
          onChange={(e) => list.search(e.target.value)}
        />
        <Select value={list.filters.tier} onChange={(e) => list.setFilter("tier", e.target.value)}>
          <option value="">All tiers</option>
          <option value="SILVER">Silver</option>
          <option value="GOLD">Gold</option>
          <option value="PLATINUM">Platinum</option>
        </Select>
        <Select
          value={list.filters.minBalance}
          onChange={(e) => list.setFilter("minBalance", e.target.value)}
        >
          <option value="">Any balance</option>
          <option value="1">Has coins</option>
          <option value="1000">1,000+</option>
          <option value="5000">5,000+</option>
        </Select>
      </FilterBar>

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={run} />
        ) : (
          <>
          <Table
            loading={loading}
            columns={[
              { label: "Guest" },
              { label: "Member no" },
              { label: "Tier" },
              { label: "Nights", num: true },
              { label: "Joined" },
              { label: "Balance", num: true },
              { label: "Earned", num: true },
              { label: "Redeemed", num: true },
              { label: "" },
            ]}
            rows={items}
            empty={{
              title: list.activeFilterCount ? "No members match" : "No members yet",
              hint: list.activeFilterCount
                ? "Try clearing the filters."
                : "Guests appear here once they scan your QR code.",
            }}
            renderRow={(m) => (
              <tr key={m._id}>
                <td>
                  <b>{m.guestId?.name || "Guest"}</b>
                  <div className="muted text-[11px]">
                    {maskPhone(m.guestId?.phone)}
                    {m.guestId?.email ? ` · ${m.guestId.email}` : ""}
                  </div>
                </td>
                <td>{m.memberNo}</td>
                <td>
                  <Badge tone={TIER_TONE[m.tier]}>{m.tier}</Badge>
                </td>
                <td className="num">
                  <b>{m.lifetimeNights || 0}</b>
                  {nextTierFor(m.lifetimeNights, nightThresholds) && (
                    <div className="muted text-[11px]">
                      {nextTierFor(m.lifetimeNights, nightThresholds).remaining} to{" "}
                      {nextTierFor(m.lifetimeNights, nightThresholds).tier}
                    </div>
                  )}
                </td>
                <td>{formatDate(m.joinedAt)}</td>
                <td className="num">
                  <b>{formatCoins(m.balance)}</b>
                </td>
                <td className="num">{formatCoins(m.lifetimeEarned)}</td>
                <td className="num">{formatCoins(m.lifetimeRedeemed)}</td>
                <td>
                  {canAllocate && (
                    <div className="flex gap-[5px] justify-end">
                      <button
                        className="w-[30px] h-[30px] rounded-lg border border-hairline bg-[var(--panel)] text-muted grid place-items-center cursor-pointer transition-[color,border-color,background] duration-150 hover:text-[var(--acc2)] hover:border-[var(--acc2)] hover:bg-chip"
                        onClick={() => openCredit(m)}
                        title="Add coins"
                        aria-label={`Add coins for ${m.guestId?.name || "guest"}`}
                      >
                        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
                          <circle cx="10" cy="10" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                          <path d="M10 6.4v7.2M6.4 10h7.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </button>
                      <button
                        className="w-[30px] h-[30px] rounded-lg border border-hairline bg-[var(--panel)] text-muted grid place-items-center cursor-pointer transition-[color,border-color,background] duration-150 hover:text-[var(--acc2)] hover:border-[var(--acc2)] hover:bg-chip"
                        onClick={() => openStay(m)}
                        title="Record a stay"
                        aria-label={`Record a stay for ${m.guestId?.name || "guest"}`}
                      >
                        {/* Calendar: nights stayed */}
                        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
                          <rect
                            x="3"
                            y="4.6"
                            width="14"
                            height="12"
                            rx="2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M3 8.4h14M7 3.2v2.6M13 3.2v2.6"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          />
          <Pagination
            page={list.page}
            limit={list.limit}
            total={list.total}
            onPage={list.setPage}
            loading={loading}
          />
          </>
        )}
      </Card>

      {/* ---- allocate ---- */}
      <Modal
        open={allocOpen}
        title="Add coins for a stay"
        onClose={() => setAllocOpen(false)}
        footer={
          <Button block onClick={submitAllocate} disabled={busy}>
            {busy ? "Adding…" : `Add ${allocPreview ? formatCoins(allocPreview) : ""} coins`}
          </Button>
        }
      >
        <Alert>{message}</Alert>

        <Field label="Guest phone" error={errors.phone}>
          <PhoneInput value={form.phone} onChange={change("phone")} error={errors.phone} />
        </Field>

        <Field label="Guest name" hint="Only used if this is a new guest" error={errors.name}>
          <Input value={form.name} onChange={change("name")} placeholder="Rohan Mehta" />
        </Field>

        <Field label="Room amount (₹)" error={errors.roomAmount}>
          <Input
            type="number"
            value={form.roomAmount}
            onChange={change("roomAmount")}
            error={errors.roomAmount}
            placeholder="14000"
          />
        </Field>

        <Field label="Nights" error={errors.nights}>
          <Input type="number" value={form.nights} onChange={change("nights")} min={1} />
        </Field>

        {allocPreview > 0 && (
          <p className="hint">
            Room × nights × your earn rate ≈ <b>{formatCoins(allocPreview)}</b> coins. The exact
            figure uses your hotel's configured rate.
          </p>
        )}
      </Modal>

      {/* ---- credit coins ---- */}
      <Modal
        open={!!creditFor}
        title={`Add coins for ${creditFor?.guestId?.name || "guest"}`}
        onClose={() => setCreditFor(null)}
        footer={
          <Button block onClick={submitCredit} disabled={busy}>
            {busy ? "Adding…" : "Add coins"}
          </Button>
        }
      >
        <Alert>{message}</Alert>

        <p className="text-[12.5px] text-muted mb-3.5 [&>b]:text-ink [&>b]:font-display [&>b]:text-[15px]">
          Current balance: <b>{formatCoins(creditFor?.balance)}</b> coins
        </p>

        <Field label="Coins to add" error={errors.coins}>
          <Input
            type="number"
            value={creditForm.coins}
            onChange={(e) => setCreditForm((f) => ({ ...f, coins: e.target.value }))}
            error={errors.coins}
            placeholder="1000"
            min={1}
            autoFocus
          />
        </Field>

        <div className="flex flex-wrap gap-[7px] -mt-1 mb-4">
          {QUICK_COINS.map((amount) => (
            <button
              key={amount}
              type="button"
              className="bg-chip border border-hairline rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-ink cursor-pointer hover:border-[var(--acc2)] hover:text-[var(--acc2)]"
              onClick={() => setCreditForm((f) => ({ ...f, coins: String(amount) }))}
            >
              {formatCoins(amount)}
            </button>
          ))}
        </div>

        <Field label="Reason" hint="Shows on the guest's history" error={errors.note}>
          <Input
            value={creditForm.note}
            onChange={(e) => setCreditForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Goodwill gesture"
          />
        </Field>

        <p className="hint">These coins come out of your hotel's purchased inventory.</p>
      </Modal>

      {/* ---- record a stay ---- */}
      <Modal
        open={!!stayFor}
        title={`Record a stay for ${stayFor?.guestId?.name || "guest"}`}
        onClose={() => setStayFor(null)}
        footer={
          <Button block onClick={submitStay} disabled={busy}>
            {busy ? "Recording…" : "Record stay"}
          </Button>
        }
      >
        <Alert>{message}</Alert>

        <p className="text-[12.5px] text-muted mb-3.5 [&>b]:text-ink [&>b]:font-display [&>b]:text-[15px]">
          Currently <b>{stayFor?.tier}</b> · {stayFor?.lifetimeNights || 0} nights stayed
        </p>

        <Field label="Nights" error={errors.nights}>
          <Input
            type="number"
            value={stayForm.nights}
            onChange={(e) => setStayForm((f) => ({ ...f, nights: e.target.value }))}
            error={errors.nights}
            min={1}
            autoFocus
          />
        </Field>

        <Field label="Total amount (₹)" error={errors.amount}>
          <Input
            type="number"
            value={stayForm.amount}
            onChange={(e) => setStayForm((f) => ({ ...f, amount: e.target.value }))}
            error={errors.amount}
            placeholder="40000"
            min={1}
          />
        </Field>

        <Field label="Note" hint="Shows on the guest's history" error={errors.note}>
          <Input
            value={stayForm.note}
            onChange={(e) => setStayForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Room 204, 12–15 Aug"
          />
        </Field>

        {stayCoins > 0 && (
          <p className="hint">
            {formatCurrency(Number(stayForm.amount))} × {stayRate}% ({stayFor?.tier} rate) ={" "}
            <b>{formatCoins(stayCoins)}</b> coins. These come out of your hotel's purchased
            inventory.
          </p>
        )}

        {stayPromotes && (
          <p className="hint">
            This stay takes them to <b>{stayNightsAfter}</b> nights — they become{" "}
            <b>{stayTierAfter}</b>. The coins above are credited at their current {stayFor?.tier}{" "}
            rate; the new rate applies from their next stay.
          </p>
        )}
      </Modal>
    </div>
  );
};

export default MembersPage;
