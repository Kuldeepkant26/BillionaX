import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Loading, Modal } from "../../components/common/index.jsx";

/**
 * The invoice preview popup, shared by the admin and hotel Transactions tabs.
 *
 * WHY AN IFRAME. The server returns a whole HTML document — its own <head>,
 * its own @page rule for print, and a body of inline styles written against no
 * particular host. Injecting that into the panel with dangerouslySetInnerHTML
 * would drop the document's styles into the panel's own cascade, and the
 * panel's CSS would repaint the invoice; neither side survives the other. An
 * iframe gives the document the isolated rendering context it was written for,
 * so the preview is pixel-identical to what prints and to what was emailed.
 *
 * `sandbox` is the second layer over the server's sanitiser. The markup inside
 * is admin-authored, and a denylist over HTML is never something to rely on
 * alone — allow-same-origin is withheld too, so even script that survived
 * sanitising has no access to the panel's origin, cookies or storage.
 *
 * WHY srcDoc AND NOT A URL. A src would be a second authenticated request from
 * a context that does not carry the panel's auth the same way, and it would
 * show a flash of blank while it loaded. The HTML is already in hand.
 */

/**
 * Printing is done through a hidden same-document iframe rather than
 * window.open.
 *
 * A popup is blocked by default in most browsers when it is not opened
 * directly from a click on the page itself, and this print happens after an
 * async fetch. The hidden frame needs no permission, and — unlike printing the
 * visible sandboxed frame — it can be given allow-same-origin, which is what
 * makes contentWindow.print() reachable at all.
 */
/* The width the invoice template lays out at — see defaultInvoiceTemplates.js. */
const INVOICE_W = 780;

const printHtml = (html) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const cleanup = () => {
    // Deferred: removing the frame while the print dialog is still reading it
    // prints a blank page in Safari.
    setTimeout(() => frame.remove(), 1000);
  };

  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      // Nothing useful to do — the document is already on screen behind the
      // dialog, and the caller has shown its own message.
    }
    cleanup();
  };

  frame.srcdoc = html;
};

/**
 * @param {string|null} invoiceId  The invoice to show. Null closes the modal.
 * @param {(id: string) => Promise} fetchInvoice  Panel-specific API call —
 *   admin and hotel hit different, differently-scoped endpoints.
 */
export const InvoiceModal = ({ invoiceId, onClose, fetchInvoice }) => {
  const [state, setState] = useState({ loading: true, html: "", invoice: null, error: null });

  // Guards against a slow response for an invoice the user has already closed
  // or moved past overwriting the one now on screen.
  const wantedRef = useRef(null);

  // The ResizeObserver watching the preview wrapper, so it can be disconnected.
  const fitObs = useRef(null);

  useEffect(() => {
    if (!invoiceId) return;

    wantedRef.current = invoiceId;

    /*
     * The reset runs in a microtask rather than synchronously in the effect
     * body. Fetching and storing the result IS the intended use of an effect
     * — the same case useAsync.js documents — but the synchronous setState
     * before the await is the cascading render the rule actually targets, and
     * deferring it costs nothing: the modal has just opened, and the first
     * paint it skips is one nobody sees.
     */
    Promise.resolve().then(() => {
      if (wantedRef.current !== invoiceId) return;
      setState({ loading: true, html: "", invoice: null, error: null });
    });

    fetchInvoice(invoiceId)
      .then((data) => {
        if (wantedRef.current !== invoiceId) return;
        setState({ loading: false, html: data.html, invoice: data.invoice, error: null });
      })
      .catch((err) => {
        if (wantedRef.current !== invoiceId) return;
        setState({
          loading: false,
          html: "",
          invoice: null,
          error: err?.message || "Could not load this invoice",
        });
      });
  }, [invoiceId, fetchInvoice]);

  /*
   * Scales the 780px frame down to whatever width the wrapper actually has.
   *
   * Measured here rather than in CSS: a container query cannot do it, because
   * `cqw` inside a custom property on the container's own child resolves
   * against the PARENT container — an element cannot query itself — so the
   * value never resolved and the frame stayed clipped on a phone.
   *
   * A callback ref, not an effect on mount: the wrapper only exists once the
   * fetch resolves, so a mount effect would run before there is anything to
   * measure. The observer is disposed when React calls the ref back with null.
   */
  const fitRef = useCallback((node) => {
    if (fitObs.current) {
      fitObs.current.disconnect();
      fitObs.current = null;
    }
    if (!node) return;

    const apply = () => {
      const w = node.clientWidth;
      if (!w) return;
      // Never above 1: a dialog wider than the document should show it at its
      // true size, not blow it up.
      node.style.setProperty("--inv-scale", String(Math.min(1, w / INVOICE_W)));
    };

    apply();
    fitObs.current = new ResizeObserver(apply);
    fitObs.current.observe(node);
  }, []);

  const onDownload = () => {
    if (!state.html) return;
    // Deliberately state.html, NOT previewHtml — what prints must be the
    // server's document exactly, not the copy carrying the preview's cosmetic
    // scrollbar rule.
    printHtml(state.html);
  };

  const number = state.invoice?.number;

  /*
   * The server's HTML with one preview-only rule appended.
   *
   * The frame is a separate document, so the panel's CSS cannot reach its
   * scrollbar — the rule has to travel inside the document itself. Appended to
   * the srcDoc copy rather than added to the template on the server, because
   * that template is also what prints and what is emailed, and neither should
   * change to satisfy a preview.
   *
   * Injected before </head> when there is one, otherwise prepended; the frame
   * is sandboxed with no allow-scripts and no allow-same-origin either way.
   */
  const previewHtml = state.html
    ? (() => {
        /*
         * Two preview-only rules:
         *
         * 1. No visible scrollbar. The invoice is a document, and a track down
         *    its edge reads as chrome on the page. Wheel, trackpad, touch and
         *    keyboard scrolling all still work.
         *
         * 2. A layout floor of 780px — the width the template is built for —
         *    so a narrow frame lays the document out at its design width and
         *    the browser scales it to fit, rather than reflowing it. Without
         *    this the header and the totals ran off the right edge on a phone,
         *    clipping "TAX INVOICE" and the reference.
         */
        const css =
          "<style>" +
          "html{scrollbar-width:none;-ms-overflow-style:none}" +
          "html::-webkit-scrollbar{display:none}" +
          // The document lays out at its design width; the frame is widened to
          // match and scaled down by the wrapper, so nothing reflows or clips.
          "body{min-width:780px}" +
          "</style>";
        return state.html.includes("</head>")
          ? state.html.replace("</head>", `${css}</head>`)
          : css + state.html;
      })()
    : "";

  return (
    <Modal
      open={Boolean(invoiceId)}
      title={number ? `Invoice ${number}` : "Invoice"}
      onClose={onClose}
      // The invoice is a page-proportioned document; the default 440px shell
      // wrapped it into a narrow column with a scrollbar inside a scrollbar.
      size="wide"
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onDownload} disabled={!state.html}>
            Download PDF
          </Button>
        </div>
      }
    >
      {state.loading && <Loading />}

      {state.error && (
        <p style={{ padding: "18px 4px", color: "var(--danger, #b4342f)" }}>{state.error}</p>
      )}

      {!state.loading && !state.error && (
        <>
          {/*
            A fixed 780px frame inside a wrapper that scrolls.

            The template lays out at 780px. Letting the frame be narrower
            reflows the document — on a phone the header and totals ran off the
            right edge and "TAX INVOICE" was clipped. Pinning the frame to 780px
            keeps the layout exactly as it prints; the dialog is wide enough to
            show it whole, and a narrow screen pans sideways (see .invoice-fit,
            which also explains why scaling it was not an option).
          */}
          <div className="invoice-fit" ref={fitRef}>
            <iframe
              title={number ? `Invoice ${number}` : "Invoice preview"}
              srcDoc={previewHtml}
              sandbox=""
              // Width, border and the scale transform all live in
              // .invoice-fit's CSS so the two stay in step.
            />
          </div>
          {/* The delivery outcome, where there is one worth reporting. An
              invoice with nowhere to send is the normal case for a guest, so
              SKIPPED says nothing rather than looking like a fault. */}
          {state.invoice?.email?.status === "SENT" && (
            <p style={{ margin: "10px 2px 0", fontSize: 12.5, color: "var(--muted, #8b8189)" }}>
              Emailed to {state.invoice.email.to}
            </p>
          )}
          {state.invoice?.email?.status === "FAILED" && (
            <p style={{ margin: "10px 2px 0", fontSize: 12.5, color: "var(--danger, #b4342f)" }}>
              Email to {state.invoice.email.to} failed.
            </p>
          )}
        </>
      )}
    </Modal>
  );
};

/** The eye button that opens the modal. Rendered in a table's last cell. */
export const InvoiceButton = ({ onClick, title = "View invoice" }) => (
  <button
    type="button"
    className="icon-btn"
    onClick={onClick}
    title={title}
    aria-label={title}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 30,
      height: 30,
      padding: 0,
      border: "1px solid var(--line, #ece4e8)",
      borderRadius: 8,
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
    }}
  >
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 4c-4 0-7.2 3.1-8 6 .8 2.9 4 6 8 6s7.2-3.1 8-6c-.8-2.9-4-6-8-6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  </button>
);
