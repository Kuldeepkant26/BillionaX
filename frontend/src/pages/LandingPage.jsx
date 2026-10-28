import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore.js";
import { ROUTES, homeForRole } from "../constants/routePaths.js";
import { ScaledCard } from "../features/landing/ScaledCard.jsx";
import { Showcase } from "../features/landing/Showcase.jsx";
import { PartnerEnquiry } from "../features/landing/PartnerEnquiry.jsx";
import { SignInMenu } from "../features/landing/SignInMenu.jsx";
import styles from "./LandingPage.module.css";

/**
 * The public website: what Billionax is, for a curious guest and for a hotel
 * thinking of joining. Signed-in users go straight to their home.
 *
 * Every claim on it is one the product keeps. Tier rates, redemption limits
 * and night thresholds are set per hotel, so the tiers section describes what
 * changes between tiers and never quotes a percentage a given hotel may not
 * honour. The one figure with conditions attached, ₹25,000+, carries its
 * footnote directly beneath it.
 *
 * "Get started" and "Sign in" both open the sign-in form, skipping the
 * welcome screen — the same email-and-code flow creates an account or signs
 * into one, and this page has already done the welcoming. The QR at a
 * hotel's desk remains the way a guest actually joins a property.
 */

const GET_STARTED = { pathname: ROUTES.LOGIN };
const SKIP_WELCOME = { started: true };

// No display here: each use states its own, because the nav's Get started
// needs `hidden sm:inline-flex` and two display utilities on one element
// resolve by stylesheet order, not by the order they are written in.
const pill =
  "items-center justify-center gap-2 rounded-full font-semibold uppercase tracking-[0.18em] transition-[background,color,box-shadow,transform] duration-300";
const pillSolid = `${pill} bg-accent text-accent-fg hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_var(--acc)]`;
const pillLine = `${pill} border-[1.5px] border-ink text-ink hover:bg-ink hover:text-canvas`;

/** Smooth-scrolls to a section, or jumps there when motion is reduced. */
const toSection = (id) => (e) => {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
};

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "membership", label: "Membership" },
  { id: "hotels", label: "For hotels" },
];

const STATS = [
  { value: "₹25,000+", label: "In yearly benefits, for members who make the most of them*" },
  { value: "₹1", label: "Off your bill for every coin you spend" },
  { value: "₹0", label: "To join. Scan at reception and you're a member" },
];

/*
 * Stroke icons on a 24x24 box, hand-written like every icon in the app —
 * there is no icon library in the bundle.
 */
const STEPS = [
  {
    title: "Scan at reception",
    body: "Scan the Billionax QR code at a participating hotel's front desk. There is no app to download.",
    icon: (
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1" />
    ),
  },
  {
    title: "Get your card",
    body: "Sign in with your email and your digital membership card appears, with welcome coins on it.",
    icon: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 9.5h19M6 15h4" />
      </>
    ),
  },
  {
    title: "Pay with coins",
    body: "When the desk sends a bill it lands on your phone. Put coins against it and pay the rest by card or UPI.",
    icon: (
      <>
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <circle cx="12" cy="10.5" r="3" />
        <path d="M10.5 18.5h3" />
      </>
    ),
  },
];

const TIERS = [
  {
    key: "SILVER",
    name: "Silver",
    // What the card shows. Illustrative — a tier is reached by nights stayed,
    // not by balance; these only make the three cards read as cards in use.
    sampleBalance: 2450,
    tagline: "Where every member starts, from the moment you join.",
    lead: null,
    perks: [
      "A digital membership card",
      "Welcome coins when you join",
      "Coins back on every stay",
      "Bills paid from your phone",
      "Member privileges and offers",
    ],
  },
  {
    key: "GOLD",
    name: "Gold",
    sampleBalance: 12450,
    tagline: "For the guests a hotel sees again and again.",
    lead: "Everything in Silver, plus",
    perks: [
      "A higher earn rate on every stay",
      "Coins cover more of each bill",
      "Privileges your hotel reserves for Gold",
    ],
  },
  {
    key: "PLATINUM",
    name: "Platinum",
    sampleBalance: 38900,
    tagline: "A hotel's most valued guests.",
    lead: "Everything in Gold, plus",
    perks: [
      "The highest earn rate",
      "Coins cover the most of each bill",
      "Privileges your hotel reserves for Platinum",
    ],
  },
];

const HOTEL_POINTS = [
  "Enrol guests with a QR code at your front desk",
  "Send bills to a guest's phone, paid by card or UPI",
  "Set your own earn rates, tiers and coin limits for each service",
  "Publish offers, privileges and videos to your members",
  "Talk to your guests directly from your panel",
  "An invoice issued for every paid bill",
];

const Check = ({ className = "" }) => (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

const Wordmark = ({ className = "" }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
    <span className="text-[14px] uppercase tracking-[0.32em]">Billionax</span>
  </span>
);

/**
 * A section heading: spaced uppercase in the display face.
 *
 * Tracking sits on an inner span, never the h2 — the LUXE preset sets
 * letter-spacing on h1-h3 with a selector that outranks a single class.
 */
const Heading = ({ kicker, children, sub, align = "center" }) => (
  <div className={align === "center" ? "mx-auto max-w-[820px] text-center" : ""} data-reveal="">
    {kicker && (
      <span className="mb-4 block text-[11.5px] font-semibold uppercase tracking-[0.24em] text-muted">
        {kicker}
      </span>
    )}
    <h2 className="m-0 font-display text-[clamp(1.75rem,3.6vw,3rem)] font-semibold uppercase leading-[1.05] text-ink">
      <span className="tracking-[-0.01em]">{children}</span>
    </h2>
    {sub && (
      <p className={`m-0 mt-5 text-[16px] leading-relaxed text-muted sm:text-[17px] ${align === "center" ? "mx-auto max-w-[580px]" : "max-w-[520px]"}`}>
        {sub}
      </p>
    )}
  </div>
);

const LandingPage = () => {
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  const rootRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  // The nav is transparent over the hero and frosts once the page moves under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /*
   * Sections rise into place as they scroll into view.
   *
   * A layout effect, so the "ready" flag lands before the first paint: set
   * after it, the hero would paint, vanish, and fade back in. The flag is what
   * hides anything — without JS or IntersectionObserver the page simply shows
   * everything, and reduced motion is handled in the CSS.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return undefined;

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-shown", "");
          io.unobserve(entry.target);
        }),
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );

    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    root.setAttribute("data-reveal-ready", "");
    return () => io.disconnect();
  }, []);

  if (isAuthenticated) return <Navigate to={homeForRole(user?.role)} replace />;

  const year = new Date().getFullYear();

  return (
    <div ref={rootRef} className={`min-h-svh overflow-x-clip bg-canvas text-ink ${styles.root}`}>
      {/* ---------- nav ---------- */}
      <header
        className={`sticky top-0 z-50 border-b transition-[background,border-color,backdrop-filter] duration-300 ${
          scrolled ? "border-hairline bg-canvas/80 backdrop-blur-xl" : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-6 px-4 sm:px-8">
          <Link to={ROUTES.HOME} aria-label="Billionax home" className="text-ink">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-10 md:flex" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={toSection(s.id)}
                className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-ink transition-opacity duration-200 hover:opacity-60"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-6">
            {/* A pill on a phone, where it is the only action in the bar; plain
                text beside the Get started pill from sm up. */}
            <SignInMenu
              triggerClassName="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-accent-fg transition-opacity duration-200 hover:opacity-90 sm:h-auto sm:bg-transparent sm:px-0 sm:text-[12.5px] sm:text-ink sm:hover:opacity-60"
            />
            <Link to={GET_STARTED} state={SKIP_WELCOME} className={`${pillSolid} hidden h-11 px-6 text-[11.5px] sm:inline-flex`}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- hero ---------- */}
        <section className="relative isolate px-4 pt-20 sm:px-8 sm:pt-28">
          <div className={styles.heroGlow} aria-hidden="true" />

          <div className="mx-auto max-w-[1240px] text-center">
            <h1
              className="m-0 font-display text-[clamp(2.1rem,6.4vw,5rem)] font-semibold uppercase leading-[1] text-ink"
              data-reveal=""
            >
              <span className="block tracking-[-0.015em] text-muted">Luxury for everyone.</span>
              <span className="block tracking-[-0.015em]">Privileges for members.</span>
            </h1>

            <p
              className="mx-auto mb-0 mt-7 max-w-[720px] text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-muted"
              data-reveal=""
              style={{ "--reveal-delay": "160ms" }}
            >
              Earn Billionax Coins every time you stay, and use them to take money off your bill — dining,
              wellness, upgrades and more. One membership, recognised across participating hotels.
            </p>

            <div
              className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4"
              data-reveal=""
              style={{ "--reveal-delay": "240ms" }}
            >
              <Link to={GET_STARTED} state={SKIP_WELCOME} className={`${pillSolid} inline-flex h-[56px] px-10 text-[12.5px]`}>
                Get started
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10h12m-5-5 5 5-5 5" />
                </svg>
              </Link>
              <a href="#hotels" onClick={toSection("hotels")} className={`${pillLine} inline-flex h-[56px] px-10 text-[12.5px]`}>
                Partner with us
              </a>
            </div>

            <ul
              className="m-0 mt-8 flex list-none flex-wrap items-center justify-center gap-x-6 gap-y-2 p-0 text-[13px] text-muted"
              data-reveal=""
              style={{ "--reveal-delay": "300ms" }}
            >
              {["Free to join", "No app to download"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="text-ink" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* The product shot. The outer box rises in like everything else;
              the inner one settles from a tilt as it scrolls up the screen. */}
          <div className={`relative mx-auto mt-16 max-w-[1180px] sm:mt-20 ${styles.stage}`} data-reveal="" style={{ "--reveal-delay": "360ms" }}>
            <div className={styles.tilt}>
              <Showcase />
            </div>
          </div>
        </section>

        {/* ---------- the numbers ---------- */}
        <section className="px-4 pt-28 sm:px-8 sm:pt-36">
          <div className="mx-auto max-w-[1240px]">
            <Heading>Built for the way you stay</Heading>

            <div className="mt-14 grid gap-4 md:grid-cols-3 md:gap-6">
              {STATS.map((s, i) => (
                <div
                  key={s.value}
                  className="flex flex-col items-center rounded-[28px] bg-[var(--soft)] px-8 py-14 text-center sm:py-16"
                  data-reveal=""
                  style={{ "--reveal-delay": `${i * 90}ms` }}
                >
                  <b className="font-display text-[clamp(3.25rem,6vw,5.25rem)] font-normal leading-none tabular-nums text-ink">
                    <span className="tracking-[-0.03em]">{s.value}</span>
                  </b>
                  <span className="mt-6 max-w-[250px] text-[16px] leading-snug text-ink">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Directly under the figure it qualifies, not in the footer: the
                asterisk and its terms have to read as one statement. */}
            <p className="mx-auto mb-0 mt-6 max-w-[760px] text-center text-[12px] leading-relaxed text-muted">
              *Indicative annual value based on typical member earning and redemption across participating
              hotels. Actual benefits vary by property, tier and usage.
            </p>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section id="how" className="scroll-mt-20 px-4 pt-28 sm:px-8 sm:pt-36">
          <div className="mx-auto max-w-[1240px]">
            <Heading kicker="How it works" sub="Three steps from the front desk to money off your bill.">
              From reception to rewards
            </Heading>

            <ol className="m-0 mt-14 grid list-none gap-4 p-0 md:grid-cols-3 md:gap-6">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="flex flex-col rounded-[28px] border border-hairline p-8 sm:p-10"
                  data-reveal=""
                  style={{ "--reveal-delay": `${i * 90}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--soft)] text-ink">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {step.icon}
                      </svg>
                    </span>
                    <span className="font-display text-[15px] font-semibold tabular-nums text-muted">0{i + 1}</span>
                  </div>
                  <b className="mt-10 font-display text-[23px] font-semibold leading-tight text-ink">{step.title}</b>
                  <p className="m-0 mt-3 text-[15px] leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- tiers ---------- */}
        <section id="membership" className="scroll-mt-20 px-4 pt-28 sm:px-8 sm:pt-36">
          <div className="mx-auto max-w-[1240px]">
            <Heading
              kicker="Membership"
              sub="Everyone starts at Silver. The nights you stay with a hotel move you up to Gold, then Platinum."
            >
              One membership. Three tiers.
            </Heading>

            <div
              className="mt-14 grid divide-y divide-hairline overflow-hidden rounded-[28px] bg-[var(--soft)] lg:grid-cols-3 lg:divide-x lg:divide-y-0"
              data-reveal=""
            >
              {TIERS.map((tier) => (
                <div key={tier.key} className="flex flex-col p-7 sm:p-10">
                  <div className="w-full max-w-[300px]">
                    <ScaledCard
                      membership={{ tier: tier.key, balance: tier.sampleBalance, memberNo: "BX 0000 0000" }}
                      guestName="Your name"
                      hotelName=""
                    />
                  </div>

                  <h3 className="m-0 mt-9 font-display text-[30px] font-semibold leading-none text-ink">{tier.name}</h3>
                  <p className="m-0 mt-3 text-[15px] leading-relaxed text-muted">{tier.tagline}</p>

                  {tier.lead && <p className="m-0 mt-7 text-[13px] font-semibold text-ink">{tier.lead}</p>}
                  <ul className={`m-0 list-none space-y-3 p-0 ${tier.lead ? "mt-3" : "mt-7"}`}>
                    {tier.perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2.5 text-[15px] leading-snug text-ink">
                        <Check className="mt-[3px] text-muted" />
                        {perk}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-10">
                    {tier.key === "SILVER" ? (
                      <Link to={GET_STARTED} state={SKIP_WELCOME} className={`${pillLine} flex h-[52px] w-full text-[12px]`}>
                        Get started
                      </Link>
                    ) : (
                      // Not a button: Gold and Platinum cannot be bought,
                      // only stayed into, and a button would promise otherwise.
                      <span className="flex h-[52px] items-center justify-center gap-2 rounded-full border border-dashed border-hairline text-[12px] font-semibold uppercase tracking-[0.18em] text-muted">
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10 16V4m-5 5 5-5 5 5" />
                        </svg>
                        Earned by staying
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="mx-auto mb-0 mt-6 max-w-[760px] text-center text-[12px] leading-relaxed text-muted">
              Each hotel sets its own earn rates, how much of a bill coins can cover, and the nights it takes
              to reach Gold and Platinum. Buying coins never changes your tier — staying does.
            </p>
          </div>
        </section>

        {/* ---------- for hotels ---------- */}
        <section id="hotels" className="scroll-mt-20 px-4 py-28 sm:px-8 sm:py-36">
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-20">
            <div>
              <Heading
                align="left"
                kicker="For hotels"
                sub="Give your property a members' programme that guests join at your front desk and carry on their phone."
              >
                An end-to-end loyalty programme for your hotel
              </Heading>

              <ul className="m-0 mt-9 list-none space-y-4 p-0" data-reveal="" style={{ "--reveal-delay": "80ms" }}>
                {HOTEL_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3.5 text-[16px] leading-snug text-ink">
                    <span className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--soft)]">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div data-reveal="" style={{ "--reveal-delay": "120ms" }}>
              <PartnerEnquiry />
            </div>
          </div>
        </section>
      </main>

      {/* ---------- footer ----------
          Always dark, whichever theme the page is in — so its colours are
          fixed rather than tokens, which would flip with the theme. */}
      <footer className="relative overflow-hidden border-t border-white/10 bg-[#0b0a08] text-[#f5f1e8]">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <div className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="max-w-[340px]">
              <Wordmark />
              <p className="m-0 mt-7 font-display text-[21px] leading-snug">
                Luxury for everyone.
                <br />
                Privileges for members.
              </p>
              <p className="m-0 mt-4 text-[14.5px] leading-relaxed text-[#9a948a]">
                One membership across participating hotels. Earn coins on every stay and spend them at the desk.
              </p>
            </div>

            <FooterColumn title="Members">
              <a href="#how" onClick={toSection("how")}>How it works</a>
              <a href="#membership" onClick={toSection("membership")}>Membership tiers</a>
              <Link to={GET_STARTED} state={SKIP_WELCOME}>Member sign in</Link>
            </FooterColumn>

            <FooterColumn title="Hotels">
              <a href="#hotels" onClick={toSection("hotels")}>Partner with us</a>
              <Link to={ROUTES.HOTEL_LOGIN}>Hotel admin &amp; staff sign in</Link>
            </FooterColumn>
            {/* No platform-admin link, here or in the Sign in menu: the client
                keeps the admin sign-in off the public site. */}
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 py-7 text-[13.5px] text-[#9a948a] sm:flex-row sm:items-center sm:justify-between">
            <span>© {year} Billionax. All rights reserved.</span>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
              }}
              className="inline-flex items-center gap-2 transition-colors duration-200 hover:text-[#f5f1e8]"
            >
              Back to top
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 16V4m-5 5 5-5 5 5" />
              </svg>
            </a>
          </div>
        </div>

        {/* SVG rather than vw-sized type: textLength stretches the spacing so
            the word spans the width exactly in every font preset, where a
            vw size tuned for one face overflows in a wider one. */}
        <svg viewBox="0 0 1000 124" className={styles.giant} aria-hidden="true">
          <defs>
            <linearGradient id="landing-giant-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f5f1e8" stopOpacity="0.15" />
              <stop offset="0.9" stopColor="#f5f1e8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <text x="500" y="122" textAnchor="middle" textLength="972" lengthAdjust="spacing" fill="url(#landing-giant-fade)">
            BILLIONAX
          </text>
        </svg>
      </footer>
    </div>
  );
};

const FooterColumn = ({ title, children }) => (
  <div>
    <span className="block text-[12px] font-semibold uppercase tracking-[0.22em]">{title}</span>
    <div className="mt-6 flex flex-col items-start gap-4 text-[15px] text-[#9a948a] [&>a]:transition-colors [&>a]:duration-200 [&>a:hover]:text-[#f5f1e8]">
      {children}
    </div>
  </div>
);

export default LandingPage;
