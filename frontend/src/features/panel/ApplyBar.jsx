import { Button, Spinner } from "../../components/common/index.jsx";

/**
 * Floating save bar that appears only once something is unsaved.
 *
 * Anchored bottom-right rather than inline at the end of the form: these
 * settings pages are long enough that an inline button sits below the fold
 * while you are editing, and a change you cannot see how to save reads as a
 * change that did not take. Discard sits beside Apply so there is always a
 * way back without reloading.
 *
 * Rendered in the page (not a portal) — it is scoped to one form's state,
 * and the panel content column is already the positioning context it needs.
 */
export const ApplyBar = ({ open, busy, onApply, onDiscard, label = "Unsaved changes" }) => {
  if (!open) return null;

  return (
    <>
    {/* Reserves the height the floating bar occupies, so the last card on the
        page can still be scrolled clear of it. */}
    <div aria-hidden="true" className="h-20" />
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[90] flex items-center gap-3 rounded-full border border-hairline bg-card py-2.5 pl-4 pr-2.5 shadow-[var(--shadow)] [@media(max-width:600px)]:left-4 [@media(max-width:600px)]:justify-between"
      style={{ animation: "apply-in .22s ease" }}
    >
      <span className="flex items-center gap-2 text-[12.5px] font-semibold">
        <i className="block h-2 w-2 flex-none rounded-full bg-[var(--acc)]" aria-hidden="true" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
        <Button size="sm" onClick={onApply} disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Applying…" : "Apply changes"}
        </Button>
      </span>
    </div>
    </>
  );
};
