import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import styles from "./FaqPage.module.css";

/**
 * The guest's questions, answered in their own numbers.
 *
 * Written as an accordion rather than a wall of prose: a guest opens this with
 * ONE question in mind, and twelve answers stacked open is a page they have to
 * hunt through. Everything starts collapsed so the list of questions IS the
 * navigation.
 *
 * The answers interpolate this guest's actual tier, rate and hotel wherever
 * they can. A FAQ that says "you may save up to 30%" to someone whose account
 * allows 10% is worse than no FAQ — it reads as a promise the app then breaks.
 */

const Chevron = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" className={styles.chevron}>
    <path
      d="M6 8l4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Item = ({ q, a, open, onToggle, id }) => (
  <div className={`${styles.item} ${open ? styles.itemOpen : ""}`}>
    <button
      type="button"
      className={styles.question}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`faq-a-${id}`}
    >
      <span>{q}</span>
      <Chevron />
    </button>

    {/*
      Kept mounted and collapsed with a grid-rows transition rather than
      unmounted, so opening animates smoothly and the answer's own height is
      what drives it — no measuring, no magic max-height that clips long text.
    */}
    <div className={styles.answerWrap} id={`faq-a-${id}`} role="region" hidden={!open}>
      <div className={styles.answerInner}>
        {a.map((line, i) =>
          /*
           * A line can be `{ lead: "..." }` instead of a plain string, which
           * renders it as a statement rather than body copy. Only the brand
           * answer uses it — a tagline set in the same muted grey as the prose
           * above it stops reading as a tagline at all.
           */
          typeof line === "string" ? (
            <p key={i}>{line}</p>
          ) : (
            <p key={i} className={styles.lead}>
              {line.lead}
            </p>
          )
        )}
      </div>
    </div>
  </div>
);

const FaqPage = () => {
  const navigate = useNavigate();
  const memberships = useAppStore((s) => s.memberships);
  const activeHotelId = useAppStore((s) => s.activeHotelId);

  const active =
    memberships.find((m) => String(m.hotelId?._id || m.hotelId) === String(activeHotelId)) ||
    memberships[0];

  const hotelName = active?.hotelId?.name || "your hotel";
  const tier = active?.tier ? active.tier.charAt(0) + active.tier.slice(1).toLowerCase() : null;
  const earnRate = active?.hotelId?.tierEarnRates?.[active?.tier] ?? active?.hotelId?.earnRatePercent;
  // The same figure the home screen quotes — resolved server-side as the best
  // rate this guest can actually reach, not the tier fallback.
  const maxSave = active?.maxSavePercent;

  const [openId, setOpenId] = useState(null);

  const sections = [
    {
      // First, and deliberately so: it answers WHY before the rest of the page
      // answers how. It is also the one answer on this page with no numbers in
      // it — everything below is mechanics, this is the reason for them.
      title: "About Billionax",
      items: [
        {
          q: "Why Billionax exists",
          a: [
            "Most people dream of luxury experiences but receive little recognition for their loyalty.",
            "Billionax was built to bridge the gap between aspiration and access.",
            "We believe luxury shouldn't be reserved for a select few people with elite status. It should be earned through meaningful experiences.",
            { lead: "Luxury for everyone.\nPrivileges for members." },
          ],
        },
        {
          q: "What makes Billionax different?",
          a: [
            "Most hotel loyalty programs lock rewards inside one hotel brand.",
            "Billionax is designed as a multi-hotel luxury ecosystem where one membership can unlock rewards and privileges across participating hospitality partners.",
          ],
        },
      ],
    },
    {
      title: "Coins",
      items: [
        {
          q: "What are Billionax coins?",
          a: [
            "Coins are the reward you earn for staying. One coin is worth ₹1 off a bill at the hotel that gave it to you.",
            "They are not cash and cannot be withdrawn or transferred — they come off what you owe when you pay through the app.",
          ],
        },
        {
          q: "How do I earn them?",
          a: [
            earnRate
              ? `Stay at ${hotelName} and ${earnRate}% of what you spend on the room comes back to you in coins, at your ${tier || "current"} tier.`
              : `Stay at ${hotelName} and a share of what you spend on the room comes back to you in coins.`,
            "Reception records the stay, and the coins appear in your account the moment they do. You do not have to ask.",
          ],
        },
        {
          q: "Do my coins expire?",
          a: ["No. Coins stay in your account until you spend them."],
        },
        {
          q: "Can I use coins at a different hotel?",
          a: [
            "No. Coins are earned and spent at the same property — the hotel that gave them to you is the hotel that honours them.",
            "If you are a member at several, each keeps its own balance. Your account page lists them all.",
          ],
        },
      ],
    },
    {
      title: "Paying with coins",
      items: [
        {
          q: "How much of a bill can coins cover?",
          a: [
            maxSave
              ? `Up to ${maxSave}% at ${hotelName}, depending on what you are buying.`
              : "It depends on what you are buying.",
            "Each hotel sets its own share for each of its services — a restaurant might accept coins on a fifth of the bill while the spa accepts none. When the desk sends you a bill, the app shows exactly how many coins you can put against that one.",
          ],
        },
        {
          q: "Why can't I use coins on this bill?",
          a: [
            "The hotel has set that service to accept no coins. It is their choice, and it applies to every guest.",
            "The bill will say so rather than simply hiding the option.",
          ],
        },
        {
          q: "How do I pay?",
          a: [
            "When reception sends you a bill it appears on your phone straight away, wherever you are in the app.",
            "Choose how many coins to put against it, then pay the rest by card or UPI. The coins come off before you are charged.",
          ],
        },
        {
          q: "What happens if I don't pay a bill?",
          a: [
            "Nothing is taken from your account. A bill you ignore expires on its own and no coins move.",
            "You can also decline it outright, and the desk will see that you did.",
          ],
        },
      ],
    },
    {
      title: "Your tier",
      items: [
        {
          q: tier ? `What does ${tier} mean?` : "What are tiers?",
          a: [
            "Tiers are how a hotel recognises its regulars: Silver, Gold, then Platinum.",
            "The higher your tier, the more you earn on each stay and the more of a bill your coins can cover.",
          ],
        },
        {
          q: "How do I move up?",
          a: [
            "By staying. Each hotel sets how many nights it takes to reach Gold and Platinum with them, so your tier can differ from one property to another.",
            "Buying coins does not move you up — nights do.",
          ],
        },
      ],
    },
    {
      title: "Your account",
      items: [
        {
          q: "Why should I add my mobile number?",
          a: [
            "Hotels award coins against the number you give at reception. If that number is not on your account, those coins are sitting somewhere you cannot see them.",
            "Adding it brings them across at once. You can do it from Your account, and it is set only once.",
          ],
        },
        {
          q: "Is my information shared with hotels?",
          a: [
            "A hotel you are a member of sees your name, your tier and your balance with them — what they need to bill you and honour your coins.",
            "Your email is masked at the desk and only revealed when staff deliberately ask for it to confirm who you are.",
          ],
        },
        {
          q: "How do I get help with a charge?",
          a: [
            `Speak to the desk at ${hotelName} first — they raised the bill and they can void it.`,
            "Every bill you have paid is listed under History with its full breakdown, so you can show them exactly what you were charged.",
          ],
        },
      ],
    },
  ];

  let counter = 0;

  /*
   * An ILLUSTRATIVE redemption table, not this guest's own figures.
   *
   * Every other number on this page is resolved from the guest's membership;
   * these are not, because the per-service breakdown is not in the guest
   * payload — memberships carry only `maxSavePercent`, the single best rate.
   * The real per-outlet caps live in HotelService.coinCaps, which no guest
   * endpoint exposes today.
   *
   * So the heading says "example", the rows are generic, and the note beneath
   * points at the two places that ARE authoritative: the bill itself, which is
   * priced from the hotel's own caps at bill time (bill.service.js), and the
   * guest's Max discount tile on home. If this table is ever to show real
   * numbers, the fix is a guest-facing services endpoint — not hardcoding a
   * different set of constants here.
   */
  const exampleRows = [
    ["Restaurant bill", "Up to 30% of bill"],
    ["Spa & wellness", "Up to 30% of bill"],
    ["Bar & beverages", "Up to 25% of bill"],
    ["Room upgrade", "Subject to availability"],
    ["Final check-out bill", "Up to 20% of bill"],
  ];

  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} className={styles.back}>
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l-6 6 6 6" />
        </svg>
        Your account
      </button>

      <header className={styles.head}>
        <h1>Questions</h1>
        {/* "What Billionax is" as well as how it works, since the first
            section now answers the why before the mechanics start. */}
        <p>What Billionax is, and how coins, bills and tiers work{active ? ` at ${hotelName}` : ""}.</p>
      </header>

      {sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <span className="kicker">{section.title}</span>
          <div className={styles.card}>
            {section.items.map((item) => {
              const id = counter++;
              return (
                <Item
                  key={item.q}
                  id={id}
                  q={item.q}
                  a={item.a}
                  open={openId === id}
                  // One at a time: the page is a phone screen, and two long
                  // answers open at once buries the questions between them.
                  onToggle={() => setOpenId((current) => (current === id ? null : id))}
                />
              );
            })}
          </div>
        </section>
      ))}

      <section className={styles.section}>
        <span className="kicker">Redemption privileges</span>

        <div className={styles.card}>
          <div className={styles.tableHead}>
            {/* "Example" in the heading, not only in the note below it: the
                heading is the part a guest scanning the page actually reads,
                and these are not their own hotel's numbers. */}
            <b>Example redemption limits</b>
            <span>
              How much of a bill coins may cover, by outlet. Your hotel sets its own limits.
            </span>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Experience</th>
                <th scope="col">Maximum coins redeemable</th>
              </tr>
            </thead>
            <tbody>
              {exampleRows.map(([experience, limit]) => (
                <tr key={experience}>
                  <th scope="row">{experience}</th>
                  <td>{limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.tableNote}>
          Illustrative only. {hotelName === "your hotel" ? "Your hotel" : hotelName} sets its own
          limit for each outlet and tier
          {maxSave ? `, and yours currently reach ${maxSave}%` : ""}. Every bill shows exactly how
          many coins you can put against it before you pay.
        </p>
      </section>

      <p className={styles.foot}>
        Still stuck? The desk at {hotelName} can see every bill and every coin on your account.
      </p>

      <button type="button" className={styles.home} onClick={() => navigate(ROUTES.APP)}>
        Back to home
      </button>
    </div>
  );
};

export default FaqPage;
