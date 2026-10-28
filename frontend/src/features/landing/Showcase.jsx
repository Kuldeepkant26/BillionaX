import { ScaledCard } from "./ScaledCard.jsx";
import styles from "./Showcase.module.css";

/**
 * The landing page's product shot: the member app, drawn rather than
 * screenshotted.
 *
 * Drawn so it paints in the network's own theme, accent, typeface and card
 * design — a screenshot would show whichever preset was live the day it was
 * taken. The membership card is the real component, so it is the exact card a
 * guest is issued (scaled, not reflowed — see ScaledCard).
 *
 * Everything in it is sample data, and the figures agree with each other:
 * 5,000 welcome + 17,310 earned − 9,860 spent = the 12,450 on the card.
 * The guest and the hotel are invented.
 */

const SAMPLE = {
  guest: "Aanya Kapoor",
  hotel: "Casa Solene",
  membership: { tier: "GOLD", balance: 12450, memberNo: "BX 2041 1873" },
};

// The same glyphs as the guest app's bottom nav, on its 20x20 box.
const RAIL = [
  { label: "Home", icon: "M3 8.5L10 3l7 5.5V17a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1z" },
  { label: "Offers", icon: "M10 2l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L5.5 15.8l.9-5L2.8 7.3l5-.7z" },
  {
    label: "Alerts",
    icon: "M10 2.6a4.6 4.6 0 0 0-4.6 4.6c0 3.5-1.2 4.6-1.2 4.6h11.6s-1.2-1.1-1.2-4.6A4.6 4.6 0 0 0 10 2.6zM8.4 14.4a1.7 1.7 0 0 0 3.2 0z",
  },
  {
    label: "Help",
    icon: "M10 2.6c-3.9 0-7 2.5-7 5.7 0 1.8 1 3.4 2.6 4.4l-.7 2.9 3.1-1.7c.6.1 1.3.2 2 .2 3.9 0 7-2.5 7-5.8s-3.1-5.7-7-5.7z",
  },
  { label: "You", icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z" },
];

const TILES = [
  { label: "Coins earned", value: "17,310", note: "+2,140 from your last stay", good: true },
  { label: "Nights stayed", value: "32", note: "Gold since June" },
  { label: "Saved on bills", value: "₹9,860", note: "Across 11 bills" },
  { label: "Privileges", value: "6", note: "Unlocked at Gold" },
];

const Tag = ({ tone, children }) => (
  <span
    className={`inline-flex items-center h-[24px] px-2.5 rounded-[7px] text-[10.5px] font-semibold uppercase tracking-[0.12em] ${
      tone === "acc"
        ? "bg-accent text-accent-fg"
        : tone === "tier"
          ? styles.tierTag
          : "bg-chip text-muted"
    }`}
  >
    {children}
  </span>
);

const Activity = ({ tags, title, body, meta, action }) => (
  <div className="flex flex-col rounded-[16px] bg-canvas p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_-16px_rgba(0,0,0,0.18)]">
    <div className="flex flex-wrap gap-2">{tags}</div>
    <b className="mt-3.5 font-display text-[17px] font-semibold leading-snug text-ink">{title}</b>
    <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-muted">{body}</p>
    <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-[12.5px] text-muted">
      <span>{meta}</span>
      <span className="font-semibold text-ink">{action}</span>
    </div>
  </div>
);

export const Showcase = () => (
  <figure
    role="img"
    aria-label="A preview of the Billionax member app: a Gold membership card holding 12,450 coins, the member's stays and savings, a dinner bill with coins applied, and a breakfast privilege."
    className={`m-0 overflow-hidden rounded-[22px] border border-hairline bg-canvas text-left sm:rounded-[28px] ${styles.frame}`}
  >
    <div className="grid lg:grid-cols-[212px_minmax(0,1fr)]" aria-hidden="true">
      <aside className="hidden flex-col border-r border-hairline bg-[var(--soft)] lg:flex">
        <div className="flex h-[76px] items-center gap-2.5 border-b border-hairline px-6">
          <img src="/logo.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-[12.5px] uppercase tracking-[0.3em] text-ink">Billionax</span>
        </div>
        <div className="flex flex-col py-4">
          {RAIL.map((item, i) => (
            <span
              key={item.label}
              className={`flex items-center gap-3 px-6 py-3 text-[14px] ${
                i === 0 ? "bg-[var(--soft)] font-semibold text-ink" : "text-muted"
              }`}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                <path d={item.icon} />
              </svg>
              {item.label}
            </span>
          ))}
        </div>
      </aside>

      <div className="p-3.5 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 sm:px-0">
          <div>
            <b className="block font-display text-[21px] font-semibold leading-tight text-ink sm:text-[26px]">
              Good evening, Aanya
            </b>
            <span className="mt-1 block text-[13px] text-muted">
              {SAMPLE.hotel} · Gold member since June
            </span>
          </div>
          <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-fg">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 4.5v11M4.5 10h11" />
            </svg>
            Pay a bill
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
          <ScaledCard
            membership={SAMPLE.membership}
            guestName={SAMPLE.guest}
            hotelName={SAMPLE.hotel}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {TILES.map((t) => (
              <div key={t.label} className="flex flex-col justify-center rounded-[16px] bg-[var(--soft)] p-4 sm:p-5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {t.label}
                </span>
                <b className="mt-2 font-display text-[22px] font-semibold leading-none text-ink tabular-nums sm:text-[28px]">
                  {t.value}
                </b>
                <span className={`mt-2 text-[12px] ${t.good ? "text-ok" : "text-muted"}`}>{t.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-[18px] bg-[var(--soft)] p-3.5 sm:mt-4 sm:p-5">
          <div className="flex items-center justify-between px-1 pb-4 pt-1">
            <b className="text-[15px] font-semibold text-ink">Today at {SAMPLE.hotel}</b>
            <span className="hidden gap-5 text-[13px] text-muted sm:flex">
              <span>Bills</span>
              <span>Privileges</span>
              <span>Offers</span>
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Activity
              tags={
                <>
                  <Tag>Restaurant</Tag>
                  <Tag tone="acc">Awaiting payment</Tag>
                </>
              }
              title="Dinner at The Terrace"
              body="₹4,800 bill with 960 coins applied. The remaining ₹3,840 is paid by card or UPI."
              meta="Front desk · 8:42 pm"
              action="Pay ₹3,840 →"
            />
            <Activity
              tags={
                <>
                  <Tag>Dining</Tag>
                  <Tag tone="tier">Gold</Tag>
                </>
              }
              title="Complimentary breakfast"
              body="Served daily in the main restaurant, for you and one guest, while you hold Gold."
              meta="Member privilege"
              action="Included"
            />
          </div>
        </div>
      </div>
    </div>
  </figure>
);
