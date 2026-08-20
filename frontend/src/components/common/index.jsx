import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../../store/useAppStore.js";

export const Button = ({ variant = "primary", size, block, className = "", ...props }) => {
  const classes = [
    "btn",
    variant === "ghost" && "btn-ghost",
    variant === "danger" && "btn-danger",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    block && "btn-block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type="button" className={classes} {...props} />;
};

export const Card = ({ title, action, children, className = "", ...rest }) => (
  <section className={`card ${className}`} {...rest}>
    {(title || action) && (
      <header className="card-hd">
        <b>{title}</b>
        {action}
      </header>
    )}
    {children}
  </section>
);

export const Field = ({ label, error, hint, children }) => (
  <div className="field">
    {label && <label className="label">{label}</label>}
    {children}
    {error && <span className="err">{error}</span>}
    {!error && hint && <span className="hint">{hint}</span>}
  </div>
);

export const Input = ({ error, className = "", ...props }) => (
  <input className={`input ${error ? "input-err" : ""} ${className}`} {...props} />
);

/** Password field with a show/hide toggle. */
export const PasswordInput = ({ error, className = "", ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span className="input-wrap">
      <input
        type={visible ? "text" : "password"}
        className={`input input-adorned ${error ? "input-err" : ""} ${className}`}
        {...props}
      />
      <button
        type="button"
        className="input-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? (
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <path
              d="M3 3l14 14M8.2 8.3a2.5 2.5 0 003.5 3.5M6.1 6.2C4.3 7.3 2.9 8.9 2 10c1.6 2.9 4.6 5 8 5 1.3 0 2.6-.3 3.7-.9M11.2 5.2A8.7 8.7 0 0110 5c-.4 0-.8 0-1.2.1M18 10c-.7-1.2-1.7-2.4-3-3.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <path
              d="M2 10c1.6-2.9 4.6-5 8-5s6.4 2.1 8 5c-1.6 2.9-4.6 5-8 5s-6.4-2.1-8-5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </button>
    </span>
  );
};

/**
 * 10-digit Indian mobile input. Strips non-digits and anything beyond 10 as the
 * user types, so a pasted "+91 98765 43210" becomes "9876543210" — matching how
 * the API normalises it, and preventing one person from creating two accounts.
 */
export const PhoneInput = ({ error, value, onChange, className = "", ...props }) => {
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, "");

    // A pasted "+919876543210" should keep the LAST 10 digits (dropping the
    // country code), but typing must keep the leading digits — otherwise each
    // keystroke past the 10th would silently shift the number. Only treat it
    // as a country-code paste when the extra digits arrive at once.
    const next =
      digits.length > 10
        ? digits.length - String(value || "").replace(/\D/g, "").length > 1
          ? digits.slice(-10) // pasted
          : digits.slice(0, 10) // typed past the limit
        : digits;

    onChange?.({ ...e, target: { ...e.target, value: next } });
  };

  return (
    <span className="input-wrap">
      <span className="input-prefix">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        onChange={handle}
        className={`input input-prefixed ${error ? "input-err" : ""} ${className}`}
        placeholder="98765 43210"
        {...props}
      />
    </span>
  );
};

export const Select = ({ error, className = "", children, ...props }) => (
  <select className={`input ${error ? "input-err" : ""} ${className}`} {...props}>
    {children}
  </select>
);

export const Badge = ({ tone, className = "", children }) => (
  <span className={`badge ${tone ? `badge-${tone}` : ""} ${className}`}>{children}</span>
);

export const Spinner = () => <span className="spinner" aria-label="Loading" />;

export const Loading = () => (
  <div className="center-load">
    <Spinner />
  </div>
);

/**
 * A single shimmering block.
 *
 * Skeletons stand in for content that is ABOUT to arrive, so each one should
 * echo the shape of the thing it replaces — a spinner tells the guest to wait,
 * a skeleton tells them what they are waiting for and stops the page jumping
 * when it lands.
 *
 * `w`/`h` accept any CSS length; `radius` defaults to the theme's small
 * radius so a block matches the card it is standing in for.
 */
export const Skeleton = ({ w = "100%", h = 14, radius, className = "", style }) => (
  <span
    className={`skeleton ${className}`}
    aria-hidden="true"
    style={{
      display: "block",
      width: typeof w === "number" ? `${w}px` : w,
      height: typeof h === "number" ? `${h}px` : h,
      ...(radius ? { borderRadius: typeof radius === "number" ? `${radius}px` : radius } : null),
      ...style,
    }}
  />
);

/**
 * Wraps a loading skeleton with the announcement a screen reader needs — the
 * blocks themselves are aria-hidden, so without this the page would go silent
 * while it loads.
 */
export const SkeletonScreen = ({ label = "Loading", children }) => (
  <div role="status" aria-busy="true" aria-label={label}>
    {children}
  </div>
);

export const Empty = ({ title = "Nothing here yet", hint }) => (
  <div className="empty">
    <b>{title}</b>
    {hint && <span>{hint}</span>}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="empty">
    <b>Could not load this</b>
    <span>{error?.message || "Something went wrong"}</span>
    {onRetry && (
      <div style={{ marginTop: 14 }}>
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )}
  </div>
);

export const Avatar = ({ children, className = "" }) => (
  <span className={`avatar ${className}`}>{children}</span>
);

export const Modal = ({ open, title, onClose, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Rendered into #modal-root, which sits inside the themed wrapper so the
  // portal keeps the active theme's CSS variables.
  const host = document.getElementById("modal-root") || document.body;

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-hd">
          <h3 className="display">{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>,
    host
  );
};

export const Toasts = () => {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  const host = document.getElementById("modal-root") || document.body;

  return createPortal(
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.variant}`}
          role="status"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>,
    host
  );
};

/**
 * `loading` dims the current rows in place rather than swapping the whole
 * table for a spinner. With a debounced search box the table would otherwise
 * flash empty on every pause, which reads as "no results" for a moment.
 */
export const Table = ({ columns, rows, renderRow, empty, loading }) => {
  if (!rows?.length) return loading ? <Loading /> : <Empty {...empty} />;

  return (
    <div className={`table-wrap ${loading ? "table-busy" : ""}`}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key || c.label} className={c.num ? "num" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
};

/**
 * Page controls for a server-paginated table. Renders nothing when everything
 * fits on one page, so it can be dropped under every table unconditionally.
 */
export const Pagination = ({ page, limit, total, onPage, loading }) => {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 25)));
  if (pages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="pager">
      <span className="muted pager-info">
        {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of{" "}
        {(total || 0).toLocaleString("en-IN")}
      </span>
      <span className="pager-ctl">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="pager-page">
          {page} / {pages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= pages || loading}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </span>
    </div>
  );
};

/**
 * A row of filter controls above a table. Children are the controls; the
 * Clear button appears only once something is actually filtered.
 */
export const FilterBar = ({ children, activeCount = 0, onClear }) => (
  <div className="filters">
    {children}
    {activeCount > 0 && onClear && (
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear{activeCount > 1 ? ` (${activeCount})` : ""}
      </Button>
    )}
  </div>
);

export const Kpi = ({ label, value, delta, tone }) => (
  <div className="kpi">
    <span className="kicker">{label}</span>
    <b className="kpi-v display">{value}</b>
    {delta && <span className={`kpi-d badge ${tone ? `badge-${tone}` : ""}`}>{delta}</span>}
  </div>
);
