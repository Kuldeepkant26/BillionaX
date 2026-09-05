import { useMemo, useState } from "react";
import {
  createBill,
  listBills,
  revealGuestEmail,
  searchGuests,
} from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
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

const OUTLETS = ["Restaurant", "Room Service", "Spa", "Bar", "Cafe", "Laundry", "Other"];

const TIER_TONE = { SILVER: undefined, GOLD: "warn", PLATINUM: "ok" };

const STATUS_TONE = {
  PENDING: "warn",
  PAID: "ok",
  CANCELLED: undefined,
  EXPIRED: undefined,
};

const blankLine = () => ({ description: "", qty: "1", price: "" });

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

  // The hotel's own bills, so staff watch them settle. Refreshed live by the
  // socket in useBillRealtime; this is the initial read and the reconnect path.
  const { data: billsData, run: reloadBills } = useAsync(
    () => listBills({ status: "PENDING", limit: 10 }),
    []
  );

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

    return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
  }, [lines, taxPercent]);

  const setLine = (index, patch) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const addLine = () => setLines((current) => [...current, blankLine()]);

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

              <p className={styles.note}>
                {guest.name} can put up to {guest.tier.toLowerCase()}-tier coins against this when
                they pay — the amount they are charged is worked out on their phone.
              </p>

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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default BillPage;
