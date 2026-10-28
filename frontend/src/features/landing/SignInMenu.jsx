import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "../../constants/routePaths.js";

/**
 * The landing nav's "Sign in": one button, two doors.
 *
 * Members and hotel teams each have their own sign-in screen, and a visitor
 * to the website could be either. A single "Sign in" that went straight to
 * the member form left hotel staff with no way in but the footer.
 *
 * The platform's own admin sign-in is deliberately NOT offered here, or
 * anywhere on the public site — the client asked for it to stay off the
 * website. Admins reach /admin/login directly.
 *
 * A disclosure, not an ARIA menu: the options are ordinary links, so Tab moves
 * through them and screen readers announce them as links. Escape or a click
 * outside closes it; Escape hands focus back to the button.
 */

const OPTIONS = [
  {
    to: ROUTES.LOGIN,
    // Straight to the form — the landing page has already done the welcoming.
    state: { started: true },
    title: "Member",
    note: "Your card, coins and bills",
    icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z",
  },
  {
    to: ROUTES.HOTEL_LOGIN,
    title: "Hotel admin & staff",
    note: "Bills, members and your programme",
    icon: "M3 17V6l7-3.5L17 6v11h-5v-5H8v5zm2-2h1v-3h2v3h1V7.2l-2-1-2 1z",
  },
];

export const SignInMenu = ({ triggerClassName = "" }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        Sign in
        <svg
          viewBox="0 0 20 20"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {/* Hidden with visibility rather than unmounted, so it can fade — and
          visibility also takes the links out of the tab order while closed. */}
      <div
        id={panelId}
        className={`absolute right-0 top-[calc(100%+12px)] z-50 w-[300px] origin-top-right rounded-[22px] border border-hairline bg-canvas p-2 shadow-[0_2px_6px_rgba(15,13,10,0.06),0_24px_48px_-20px_rgba(15,13,10,0.28)] transition-[opacity,transform,visibility] duration-200 ${
          open ? "visible translate-y-0 scale-100 opacity-100" : "invisible -translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        <span className="block px-3 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sign in as
        </span>
        {OPTIONS.map((o) => (
          <Link
            key={o.to}
            to={o.to}
            state={o.state}
            onClick={() => setOpen(false)}
            className="group flex items-center gap-3.5 rounded-[16px] px-3 py-3 text-ink transition-colors duration-150 hover:bg-[var(--soft)] focus-visible:bg-[var(--soft)] focus-visible:outline-none"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--soft)] text-ink">
              <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true">
                <path d={o.icon} />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-semibold leading-tight">{o.title}</b>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{o.note}</span>
            </span>
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5"
            >
              <path d="M4 10h12m-5-5 5 5-5 5" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
};
