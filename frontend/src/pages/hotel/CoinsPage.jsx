import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { coinBalance, listPurchases, listPacks } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { connectSocket } from "../../realtime/socket.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
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
  Pagination,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import {
  formatCoins,
  formatCurrency,
  formatDate,
  formatIntlPhone,
} from "../../utils/format.js";

/**
 * Coin inventory, and how a hotel gets more.
 *
 * Hotels ORDER coins rather than buy them here: the dialog hands the order to
 * the Billionax team over WhatsApp, a call or email — the contacts the main
 * admin sets in Platform rules — and the main admin credits the coins with
 * Sell coins once payment is in. The page then updates itself off the
 * hotel:inventory event, so whoever placed the order sees the coins land.
 */

const ICONS = {
  whatsapp: (
    <path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.4A8.4 8.4 0 1 1 20.5 11.6zM9 9.2c.2 2.4 2.6 4.9 5.6 5.6l1.2-1.4-1.9-1-.9.7a4.5 4.5 0 0 1-2.2-2.2l.7-.9-1-1.9z" />
  ),
  call: (
    <path d="M5 4h3.6l1.8 4.4-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.4V19a1.5 1.5 0 0 1-1.6 1.5C10.9 20 4 13.1 3.5 5.6A1.5 1.5 0 0 1 5 4z" />
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
};

/** The order as one message — WhatsApp and email both open with it filled in. */
const orderText = ({ hotelName, userName, chosen }) =>
  [
    `Hello Billionax team, I'd like to order coins${hotelName ? ` for ${hotelName}` : ""}.`,
    chosen &&
      `Order: ${chosen.id ? `${chosen.label} pack, ` : ""}${formatCoins(chosen.coins)} coins for ${formatCurrency(chosen.price)}`,
    userName && `Ordered by: ${userName}`,
  ]
    .filter(Boolean)
    .join("\n");

/** The channels the main admin has filled in, as links. Blank ones are left out. */
const orderChannels = (contact, { text, subject }) => {
  if (!contact) return [];
  // Digits only, whatever arrives: these go straight into an href.
  const wa = String(contact.whatsapp || "").replace(/\D/g, "");
  const tel = String(contact.phone || "").replace(/\D/g, "");
  return [
    wa && {
      id: "whatsapp",
      label: "WhatsApp",
      value: formatIntlPhone(wa),
      hint: "Order filled in",
      href: `https://wa.me/${wa}?text=${encodeURIComponent(text)}`,
      external: true,
    },
    tel && { id: "call", label: "Call", value: formatIntlPhone(tel), href: `tel:+${tel}` },
    contact.email && {
      id: "email",
      label: "Email",
      value: contact.email,
      hint: "Order filled in",
      href: `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
    },
  ].filter(Boolean);
};

const CoinsPage = () => {
  const balance = useAsync(coinBalance, [], { cacheKey: "hotel.coinBalance" });
  // key: "purchases" — bespoke response key kept.
  const purchases = usePaginatedList(listPurchases, { limit: 10, key: "purchases" });
  // The price list and the order contacts: near-static, so cached across visits.
  const packs = useAsync(listPacks, [], { cacheKey: "hotel.packs" });

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [custom, setCustom] = useState("");

  const hotelName = useAppStore((s) => s.staffHotel?.name);
  const userName = useAppStore((s) => s.user?.name);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toast = useAppStore((s) => s.toast);

  /*
   * The coins arrive when the main admin records the sale, which reaches this
   * hotel as hotel:inventory. That event also fires on every allocation, so
   * the refresh is silent (run() would swap the page for a spinner each time)
   * and the history reloads only when the purchased total moved — only a
   * purchase, or the main admin reversing one, changes a row there.
   */
  const { setData: setBalance } = balance;
  const { run: reloadPurchases } = purchases;
  const purchasedTotal = balance.data?.totalCoinsPurchased;
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        coinBalance()
          .then((next) => {
            setBalance(next);
            const added = (next?.totalCoinsPurchased ?? 0) - (purchasedTotal ?? 0);
            if (purchasedTotal === undefined || added === 0) return;
            if (added > 0) toastSuccess(`${formatCoins(added)} coins added to your inventory`);
            else toast(`${formatCoins(-added)} coins were reversed by Billionax`);
            reloadPurchases().catch(() => {});
          })
          .catch(() => {
            // The figures on screen stay; the next event or visit corrects them.
          });
      }, 250);
    };

    socket.on("hotel:inventory", refresh);
    return () => {
      clearTimeout(timer);
      socket.off("hotel:inventory", refresh);
    };
  }, [setBalance, reloadPurchases, purchasedTotal, toastSuccess, toast]);

  if (balance.loading) return <Loading />;
  if (balance.error) return <ErrorState error={balance.error} onRetry={balance.run} />;

  const b = balance.data || {};
  const low = b.coinInventory < 10000;
  const packList = packs.data?.packs || [];

  const customCoins = Number(custom) || 0;
  // 1 coin = ₹1 at the current coin value — a quote for the order; the main
  // admin records what was actually paid.
  const customPrice = customCoins;

  const openOrder = () => {
    setSelected(null);
    setCustom("");
    setOpen(true);
  };

  const chosen = selected
    ? packList.find((p) => p.id === selected)
    : customCoins > 0
      ? { id: null, coins: customCoins, price: customPrice, label: "Custom" }
      : null;

  const channels = orderChannels(packs.data?.orderContact, {
    text: orderText({ hotelName, userName, chosen }),
    subject: `Coin order${hotelName ? ` — ${hotelName}` : ""}`,
  });

  return (
    <div>
      <PageHead
        title="Coins"
        subtitle="Order coins to fund guest rewards"
        actions={<Button onClick={openOrder}>Order coins</Button>}
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
          <Button size="sm" onClick={openOrder} className="ml-auto">
            Order coins
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
                hint: "Order your first coin pack to start rewarding guests.",
              }}
              renderRow={(p) => {
                // Reversed by the main admin: kept on the list, struck through,
                // so the hotel can see the credit came and went.
                const void_ = p.status === "VOID";
                return (
                  <tr key={p._id}>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>
                      {p.paymentRef || "—"}
                      {void_ && (
                        <Badge tone="bad" className="ml-2">
                          Reversed
                        </Badge>
                      )}
                    </td>
                    <td className="num">
                      <b className={void_ ? "line-through text-muted" : undefined}>{formatCoins(p.coins)}</b>
                    </td>
                    <td className={`num ${void_ ? "line-through text-muted" : ""}`}>
                      {formatCurrency(p.amountPaid)}
                    </td>
                  </tr>
                );
              }}
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

      <Modal open={open} title="Order coins" onClose={() => setOpen(false)}>
        <p className="text-xs text-muted leading-[1.5] mt-0 mb-3.5">
          Choose a pack or an amount, then send your order to the Billionax team. The coins are
          added to your inventory as soon as your payment is confirmed.
        </p>

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

        <div className="flex justify-between gap-3 bg-chip rounded-token-sm px-[13px] py-[11px] mt-1 mb-4 text-[12.5px]">
          <span className="text-muted">Your order</span>
          <b className={chosen ? "text-ink font-semibold" : "text-muted font-normal"}>
            {chosen
              ? `${formatCoins(chosen.coins)} coins · ${formatCurrency(chosen.price)}`
              : "Choose an amount above"}
          </b>
        </div>

        <span className="label">Place your order</span>
        {!packs.data ? (
          <p className="text-xs text-muted m-0">{packs.error ? "Couldn't load the order details." : "Loading…"}</p>
        ) : channels.length > 0 ? (
          <div className="flex flex-col gap-2">
            {channels.map((c) => (
              <a
                key={c.id}
                href={c.href}
                {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex items-center gap-3 bg-[var(--panel)] border border-hairline rounded-token-sm px-[13px] py-[10px] text-ink no-underline transition-[border-color] duration-150 hover:border-[var(--acc2)]"
              >
                <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-[var(--soft)] text-ink">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[c.id]}
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[12.5px] font-semibold">{c.label}</b>
                  <span className="block text-[11.5px] text-muted truncate tabular-nums">{c.value}</span>
                </span>
                {c.hint && <span className="hidden sm:block text-[11px] text-muted shrink-0">{c.hint}</span>}
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
                  <path d="m8 5 5 5-5 5" />
                </svg>
              </a>
            ))}
          </div>
        ) : (
          <p className="notice-warn text-[12px] m-0">
            Ordering contacts haven&rsquo;t been added yet.{" "}
            <Link to={ROUTES.HOTEL_SUPPORT} className="font-semibold underline">
              Message Billionax support
            </Link>{" "}
            to order coins.
          </p>
        )}
      </Modal>
    </div>
  );
};

export default CoinsPage;
