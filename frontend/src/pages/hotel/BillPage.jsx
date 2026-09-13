import { useCallback, useMemo, useState } from "react";
import {
  cancelBill,
  createBill,
  listBills,
  listServices,
  revealGuestEmail,
  searchGuests,
} from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useHotelBillRealtime } from "../../hooks/useBillRealtime.js";
import { invalidateCache } from "../../hooks/asyncCache.js";
import { useDebounced } from "../../hooks/useDebounced.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Skeleton,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { BillHistory } from "../../features/panel/BillHistory.jsx";
import { formatCoins, formatPaise, initials, rupeesToPaise, timeAgo } from "../../utils/format.js";
import styles from "./BillPage.module.css";

/**
 * The bill desk: find the guest in front of you, itemise what they owe, send it.
 *
 * Two panes rather than a wizard. Staff work with a guest standing there and
 * often correct a line while the guest watches; a multi-step flow would make
 * every correction a navigation. Search stays visible so switching guest is one
 * click, not a restart.
 */

/**
 * The BILL-LEVEL outlet, which is a separate and older thing from the per-line
 * service picked above it.
 *
 * Still the fixed seven because Bill.outlet is still enum-locked to them: it
 * tags the bill for history and reporting, and has nothing to do with what
 * coins may cover. The per-line Service dropdown is the one that reads this
 * hotel's own list.
 */
const OUTLETS = ["Restaurant", "Room Service", "Spa", "Bar", "Cafe", "Laundry", "Other"];

const TIER_TONE = { SILVER: undefined, GOLD: "warn", PLATINUM: "ok" };

const STATUS_TONE = {
  PENDING: "warn",
  PAID: "ok",
  CANCELLED: undefined,
  EXPIRED: undefined,
};

const blankLine = (service = "") => ({ description: "", service, qty: "1", price: "" });

/**
 * One search result.
 *
 * The email is masked until clicked. Staff read it aloud to confirm they have
 * the right person, and the full address is a deliberate second action rather
 * than something that sits on screen for anyone behind the desk to read.
 */
const GuestCard = ({ guest, selected, onSelect }) => {
  const [email, setEmail] = useState(null);
  const [revealing, setRevealing] = useState(false);

  const reveal = async (event) => {
    event.stopPropagation();
    if (email || revealing) return;
    setRevealing(true);
    try {
      const res = await revealGuestEmail(guest.guestId);
      setEmail(res.email);
    } catch {
      // Leaving the mask in place is the safe failure.
    } finally {
      setRevealing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(guest)}
      className={`${styles.guestCard} ${selected ? styles.guestCardOn : ""}`}
    >
      <span className={styles.avatar} aria-hidden="true">
        {guest.avatarUrl ? <img src={guest.avatarUrl} alt="" /> : initials(guest.name)}
      </span>

      <span className={styles.guestBody}>
        <span className={styles.guestTop}>
          <b>{guest.name}</b>
          <Badge tone={TIER_TONE[guest.tier]}>{guest.tier}</Badge>
        </span>

        <span
          className={styles.email}
          onClick={reveal}
          role="presentation"
          title={email ? "" : "Click to reveal"}
        >
          {revealing ? "Revealing…" : email || guest.maskedEmail || "No email on file"}
        </span>

        <span className={styles.guestMeta}>
          {formatCoins(guest.balance)} coins · member {timeAgo(guest.joinedAt)}
        </span>
      </span>
    </button>
  );
};

const BillPage = () => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);

  const [guest, setGuest] = useState(null);
  const [lines, setLines] = useState([blankLine()]);
  const [taxPercent, setTaxPercent] = useState("");
  const [outlet, setOutlet] = useState("");
  const [sending, setSending] = useState(false);
  // The bill currently being voided, so only its own row shows a busy state
  // rather than every button in the list going dead at once.
  const [cancelling, setCancelling] = useState(null);

  // The hotel's own bills, so staff watch them settle. This is the initial
  // read and the reconnect path; the socket subscription below is what keeps
  // it current while the page is open.
  const { data: billsData, run: reloadBills } = useAsync(
    () => listBills({ status: "PENDING", limit: 10 }),
    []
  );

  // The outlets this hotel bills to, for the per-line picker. Read once: the
  // list changes when a manager edits it, not while a bill is being composed.
  const { data: servicesData } = useAsync(() => listServices({ limit: 100 }), []);

  const services = useMemo(
    () => (servicesData?.items || []).filter((s) => s.isActive),
    [servicesData]
  );

  // Every service, INCLUDING hidden ones — a line already naming a service that
  // was just hidden must still preview at the rate the hotel set, which is what
  // the server will resolve.
  const capByService = useMemo(
    () => new Map((servicesData?.items || []).map((s) => [s.name.toLowerCase(), s.coinCaps || {}])),
    [servicesData]
  );

  // The fallback for a line with no service on it. Comes from the search
  // result so it is the same number createBill resolves.
  const tierCap = guest?.tierCapPercent ?? 0;

  // Which of a service's three rates this guest gets. Hoisted to a plain value
  // so the memo below can depend on it directly.
  const tier = guest?.tier || null;

  /*
   * Subscribes to this hotel's bill events.
   *
   * Without this the list only ever changed when staff sent a bill: the server
   * emitted bill:paid and bill:cancelled to the hotel room, and nothing in the
   * panel was listening, so a guest could pay at the desk and the screen would
   * still show the bill as pending until a manual reload.
   *
   * useCallback so the identity is stable — the hook re-subscribes whenever
   * `onChange` changes, and an inline arrow would tear down and re-open the
   * listeners on every render.
   */
  const onBillChange = useCallback(() => reloadBills(), [reloadBills]);
  useHotelBillRealtime(onBillChange);

  const term = debouncedQ.trim();
  const active = term.length >= 2;

  /**
   * useAsync rather than a hand-rolled effect: it already discards a slow
   * earlier response that lands after a newer one, which is exactly the bug a
   * fast typist would otherwise hit.
   */
  const { data: results, loading: searching } = useAsync(
    () => (active ? searchGuests({ q: term, limit: 8 }) : Promise.resolve(null)),
    [term, active]
  );

  // Below two characters there is nothing to show, however stale `results` is.
  const shown = active ? results : null;

  /**
   * Priced in the browser from the same rules the server uses, so the total
   * updates on every keystroke without a round trip. The server prices it again
   * on send and its answer is the one that is stored — this is a preview.
   */
  const totals = useMemo(() => {
    const subtotalPaise = lines.reduce((sum, line) => {
      const qty = Math.max(0, Math.trunc(Number(line.qty) || 0));
      return sum + qty * rupeesToPaise(line.price);
    }, 0);

    const percent = Math.max(0, Number(taxPercent) || 0);
    const taxPaise = Math.floor((subtotalPaise * percent) / 100);
    const totalPaise = subtotalPaise + taxPaise;

    /**
     * What coins may cover, previewed the same way computeCoinAllowance
     * resolves it: each line's own share of its PRE-TAX amount, summed, then
     * grossed up by tax once.
     *
     * `?? tierCap`, never `|| tierCap` — a service set to 0% means coins are
     * refused there, and `||` would show staff the guest's full tier allowance
     * on a bill the server will price at nothing.
     */
    const base = lines.reduce((sum, line) => {
      const qty = Math.max(0, Math.trunc(Number(line.qty) || 0));
      const amount = qty * rupeesToPaise(line.price);
      // This guest's own tier rate at that service, mirroring priceBill.
      const caps = line.service ? capByService.get(line.service.toLowerCase()) : null;
      const raw = tier ? caps?.[tier] : null;
      const pct = Math.min(100, Math.max(0, Number(raw ?? tierCap) || 0));
      return sum + Math.floor((amount * pct) / 100);
    }, 0);

    const allowancePaise = Math.min(base + Math.floor((base * percent) / 100), totalPaise);

    return { subtotalPaise, taxPaise, totalPaise, allowancePaise };
  }, [lines, taxPercent, capByService, tierCap, tier]);

  const setLine = (index, patch) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  // Carries the previous line's service forward: five restaurant items should
  // need the picker touched once, not five times.
  const addLine = () =>
    setLines((current) => [...current, blankLine(current[current.length - 1]?.service || "")]);

  const removeLine = (index) =>
    setLines((current) => (current.length === 1 ? [blankLine()] : current.filter((_, i) => i !== index)));

  const reset = () => {
    setLines([blankLine()]);
    setTaxPercent("");
    setOutlet("");
  };

  const usableLines = lines.filter(
    (line) => line.description.trim() && Number(line.qty) > 0 && Number(line.price) > 0
  );

  const send = async () => {
    if (!guest || !usableLines.length || sending) return;

    setSending(true);
    try {
      await createBill({
        guestId: guest.guestId,
        outlet: outlet || undefined,
        taxPercent: Number(taxPercent) || 0,
        lineItems: usableLines.map((line) => ({
          description: line.description.trim(),
          service: line.service || undefined,
          qty: Math.trunc(Number(line.qty)),
          unitPricePaise: rupeesToPaise(line.price),
        })),
      });

      toastSuccess(`Bill sent to ${guest.name}`);
      reset();
      reloadBills();
    } catch (err) {
      toastError(err.message || "Could not send that bill");
    } finally {
      setSending(false);
    }
  };

  /**
   * Voids a bill from the panel — the mis-typed-total case, which previously
   * had no fix at all: staff could only tell the guest to ignore it, leaving
   * it pending until it expired.
   *
   * No confirm dialog: the bill is unpaid by definition, voiding is logged
   * with the staff id, and a second one can be sent in seconds. A modal here
   * would cost more at a busy desk than the mistake it prevents.
   */
  const voidBill = async (bill) => {
    if (cancelling) return;
    setCancelling(bill.id);

    try {
      await cancelBill(bill.id);
      toastSuccess("Bill cancelled");
      // The bill's own detail is cached (a settled bill is immutable), and
      // cancelling is the one thing that changes its status after the fact —
      // so drop it, or the history dialog would still call it pending.
      invalidateCache("hotel.bill");
      // The socket also fires bill:cancelled for everyone else in this hotel;
      // this reload is what updates the staff member who pressed the button,
      // whose own action does not come back to them as a push.
      reloadBills();
    } catch (err) {
      toastError(err.message || "Could not cancel that bill");
    } finally {
      setCancelling(null);
    }
  };

  const bills = billsData?.items || [];

  return (
    <div>
      <PageHead
        title="Bill a guest"
        subtitle="Find the guest, itemise what they owe, and send it to their phone."
      />

      {/*
        A numbered two-step layout rather than two equal cards. Staff do this
        with a guest standing in front of them, and the numbers say where they
        are in the task without anyone having to work it out. Step 2 stays
        visible but muted until a guest is chosen, so the shape of the job is
        obvious from the first glance.
      */}
      <div className={styles.layout}>
        <section className={styles.pane}>
          <header className={styles.paneHead}>
            <span className={styles.stepNo}>1</span>
            <div>
              <b>Find the guest</b>
              <i>Search by name or email, then read the masked address back to them.</i>
            </div>
          </header>

          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 20 20"
              width="15"
              height="15"
              aria-hidden="true"
              fill="none"
            >
              <circle cx="9" cy="9" r="5.4" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="m13.2 13.2 3.3 3.3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              className={styles.search}
              placeholder="Search name or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            {q && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => setQ("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {q.trim().length > 0 && q.trim().length < 2 && (
            <p className={styles.hint}>Keep typing — two characters minimum.</p>
          )}

          {searching && (
            <div className={styles.results}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skeleton} aria-hidden="true">
                  <Skeleton w={40} h={40} radius={999} />
                  <span className="flex-1">
                    <Skeleton w="45%" h={11} />
                    <div className="h-2" />
                    <Skeleton w="70%" h={9} />
                  </span>
                </div>
              ))}
            </div>
          )}

          {!searching && shown && shown.items.length === 0 && (
            <div className={styles.stateBox}>
              <b>No guest matched "{term}"</b>
              <p>Check the spelling, or ask which email they joined with.</p>
            </div>
          )}

          {!searching && !shown && (
            <div className={styles.stateBox}>
              <span className={styles.stateIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                  <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="m15.8 15.8 3.7 3.7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <b>Search for a guest</b>
              <p>Two characters of their name or email is enough.</p>
            </div>
          )}

          {!searching && shown?.items?.length > 0 && (
            <div className={styles.results}>
              {shown.items.map((item) => (
                <GuestCard
                  key={item.guestId}
                  guest={item}
                  selected={guest?.guestId === item.guestId}
                  onSelect={setGuest}
                />
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.pane} ${!guest ? styles.paneIdle : ""}`}>
          <header className={styles.paneHead}>
            <span className={styles.stepNo}>2</span>
            <div>
              <b>{guest ? `Bill ${guest.name}` : "Build the bill"}</b>
              <i>
                {guest
                  ? `${guest.tier} member · ${formatCoins(guest.balance)} coins`
                  : "Add each item, apply tax, then send it."}
              </i>
            </div>
            {guest && (
              <button type="button" className={styles.changeGuest} onClick={() => setGuest(null)}>
                Change
              </button>
            )}
          </header>

          {!guest ? (
            <div className={styles.stateBox}>
              <span className={styles.stateIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                  <path
                    d="M6 3.5h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path d="M8.5 12h7M8.5 15.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <b>Pick a guest first</b>
              <p>The bill goes straight to their phone once you send it.</p>
            </div>
          ) : (
            <>
              <div className={styles.lineHead}>
                <span>Item</span>
                <span>Service</span>
                <span>Qty</span>
                <span>Price</span>
                <span />
              </div>

              <div className={styles.lines}>
                {lines.map((line, index) => (
                  <div key={index} className={styles.line}>
                    <Input
                      placeholder="Dinner, spa, room service…"
                      value={line.description}
                      onChange={(e) => setLine(index, { description: e.target.value })}
                    />
                    {/* Per line, not per bill: what coins may cover is decided
                        service by service, so a spa treatment on a restaurant
                        bill is capped at the spa's rate. */}
                    <Select
                      value={line.service}
                      onChange={(e) => setLine(index, { service: e.target.value })}
                      aria-label={`Service for item ${index + 1}`}
                    >
                      <option value="">Not set</option>
                      {services.map((s) => {
                        // The rate THIS guest gets, not a range: staff are
                        // billing one person, and three numbers in a dropdown
                        // would be noise at the counter.
                        const pct = tier ? s.coinCaps?.[tier] : null;
                        return (
                          <option key={s._id} value={s.name}>
                            {s.name}
                            {pct == null ? "" : pct > 0 ? ` · ${pct}%` : " · no coins"}
                          </option>
                        );
                      })}
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={line.qty}
                      onChange={(e) => setLine(index, { qty: e.target.value })}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="₹0.00"
                      value={line.price}
                      onChange={(e) => setLine(index, { price: e.target.value })}
                    />
                    <button
                      type="button"
                      className={styles.removeLine}
                      onClick={() => removeLine(index)}
                      aria-label="Remove item"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className={styles.addLine} onClick={addLine}>
                + Add another item
              </button>

              <div className={styles.meta}>
                <Field label="Tax %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                  />
                </Field>
                <Field label="Outlet">
                  <Select value={outlet} onChange={(e) => setOutlet(e.target.value)}>
                    <option value="">Not set</option>
                    {OUTLETS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className={styles.totals}>
                <div>
                  <span>Subtotal</span>
                  <b>{formatPaise(totals.subtotalPaise)}</b>
                </div>
                {totals.taxPaise > 0 && (
                  <div>
                    <span>Tax</span>
                    <b>{formatPaise(totals.taxPaise)}</b>
                  </div>
                )}
                <div className={styles.grand}>
                  <span>Total</span>
                  <b>{formatPaise(totals.totalPaise)}</b>
                </div>
              </div>

              {/* The real figure, not the vague prose this replaced. Staff get
                  asked "how much can I use my coins for?" across the desk and
                  could not answer it before. */}
              {totals.allowancePaise > 0 ? (
                <p className={styles.note}>
                  Up to <b>{formatPaise(totals.allowancePaise)}</b> of this bill can be paid with
                  coins.{" "}
                  {guest.balance * 100 < totals.allowancePaise
                    ? `${guest.name} holds ${formatCoins(guest.balance)}, so that is their limit.`
                    : `${guest.name} chooses how many to use when they pay.`}
                </p>
              ) : (
                <p className={styles.note}>
                  Coins can&rsquo;t be used on this bill — none of these services accept them.
                </p>
              )}

              <Button block onClick={send} disabled={!usableLines.length || sending}>
                {sending ? "Sending…" : `Send bill · ${formatPaise(totals.totalPaise)}`}
              </Button>
            </>
          )}
        </section>
      </div>

      {/* ---- live status ---- */}
      <section className={styles.pane} style={{ marginTop: 14 }}>
        <header className={styles.paneHead}>
          <span className={`${styles.stepNo} ${styles.stepLive}`} aria-hidden="true">
            <i className={styles.pulse} />
          </span>
          <div>
            <b>Awaiting payment</b>
            <i>Updates the moment a guest pays or cancels.</i>
          </div>
        </header>

        {!bills.length ? (
          <div className={styles.stateBox}>
            <b>Nothing outstanding</b>
            <p>Bills you send appear here until they settle.</p>
          </div>
        ) : (
          <ul className={styles.billList}>
            {bills.map((bill) => (
              <li key={bill.id}>
                <span className={styles.billAvatar} aria-hidden="true">
                  {initials(bill.guestName)}
                </span>
                <span className={styles.billBody}>
                  <b>{bill.guestName}</b>
                  <i>
                    {bill.lineItems.length} item{bill.lineItems.length === 1 ? "" : "s"} ·{" "}
                    {timeAgo(bill.createdAt)}
                  </i>
                </span>
                <span className={styles.billAmount}>{formatPaise(bill.totalPaise)}</span>
                <Badge tone={STATUS_TONE[bill.status]}>{bill.status}</Badge>
                <button
                  type="button"
                  className={styles.voidBtn}
                  onClick={() => voidBill(bill)}
                  disabled={cancelling === bill.id}
                  title="Cancel this bill"
                >
                  {cancelling === bill.id ? "…" : "Cancel"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        Settled bills, under the live list.
        The pane above answers "what is outstanding"; this answers "what
        happened to that charge" — the question staff get asked at the desk,
        usually with the guest standing there. Same page because it is the same
        object at a different point in its life.
      */}
      <section className={styles.pane} style={{ marginTop: 14 }}>
        <header className={styles.paneHead}>
          <span className={styles.stepNo} aria-hidden="true">
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M10 6v4.3l2.7 1.6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <b>History</b>
            <i>Every settled bill. Click one to see the full record.</i>
          </div>
        </header>

        <BillHistory />
      </section>
    </div>
  );
};

export default BillPage;
