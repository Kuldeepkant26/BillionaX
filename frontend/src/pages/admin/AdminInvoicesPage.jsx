import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getInvoiceTemplate,
  updateInvoiceTemplate,
  previewInvoiceTemplate,
  listInvoices,
  getInvoice,
  resendInvoice,
} from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  Table,
  Toggle,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { ApplyBar } from "../../features/panel/ApplyBar.jsx";
import { InvoiceButton, InvoiceModal } from "../../features/panel/InvoiceModal.jsx";
import { formatDateTime } from "../../utils/format.js";

/**
 * The main admin's Invoices tab: every invoice on the network, and the
 * template they are all rendered from.
 *
 * TWO SCREENS, ONE TAB. The list is what you reach for when a guest asks about
 * a charge; the editor is what you touch once a quarter. They share a tab
 * because they are the same subject, and the list leads because it is the one
 * with a daily reason to be open.
 */

const TABS = [
  { id: "list", label: "Issued invoices" },
  { id: "branding", label: "Branding" },
  { id: "email", label: "Email copy" },
  { id: "html", label: "Templates" },
];

const KINDS = [
  { value: "", label: "All kinds" },
  { value: "GUEST_BILL", label: "Guest bills" },
  { value: "COIN_PURCHASE", label: "Coin purchases" },
];

const EMAIL_TONE = { SENT: "ok", FAILED: "danger", SKIPPED: undefined };

/** ₹ from paise, for the list. The document does its own formatting. */
const rupees = (paise) =>
  `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const AdminInvoicesPage = () => {
  const [tab, setTab] = useState("list");
  const { data, loading, error, run } = useAsync(getInvoiceTemplate, []);

  return (
    <div>
      <PageHead
        title="Invoices"
        subtitle="Every invoice issued, and the template they are built from"
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "primary" : "ghost"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "list" && <InvoiceList />}

      {tab !== "list" &&
        (loading || !data?.template ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={run} />
        ) : (
          /* Remounting on updatedAt reseeds the form from fresh data after a
             save, without an effect syncing state — the pattern the platform
             rules page uses. The tab is part of the key so switching sections
             also starts from the server's copy rather than a stale draft. */
          <TemplateForm
            key={`${data.template.updatedAt}:${tab}`}
            section={tab}
            template={data.template}
            defaults={data.defaults}
            reload={run}
          />
        ))}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * the issued list
 * ------------------------------------------------------------------ */

const InvoiceList = () => {
  const list = usePaginatedList(listInvoices, {
    limit: 25,
    filters: { kind: "", q: "", from: "", to: "" },
  });

  const [invoiceId, setInvoiceId] = useState(null);
  const [resending, setResending] = useState(null);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const fetchInvoice = useCallback((id) => getInvoice(id), []);

  const onResend = async (id) => {
    setResending(id);
    try {
      await resendInvoice(id);
      toastSuccess("Invoice sent");
      // The row shows a delivery status, so it has to be refetched — the send
      // changes the record, not just the outside world.
      list.run();
    } catch (err) {
      toastError(err?.message || "Could not send that invoice");
    } finally {
      setResending(null);
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Invoice number…"
          value={list.filters.q}
          onChange={(e) => list.setFilter("q", e.target.value)}
          className="max-w-[220px]"
        />
        <Select value={list.filters.kind} onChange={(e) => list.setFilter("kind", e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="From date"
          value={list.filters.from}
          onChange={(e) => list.setFilter("from", e.target.value)}
        />
        <Input
          type="date"
          aria-label="To date"
          value={list.filters.to}
          onChange={(e) => list.setFilter("to", e.target.value)}
        />
        {Boolean(list.activeFilterCount) && (
          <Button size="sm" variant="ghost" onClick={list.resetFilters}>
            Clear
          </Button>
        )}
      </div>

      <Card>
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.run} />
        ) : (
          <>
            <Table
              loading={list.loading}
              columns={[
                { label: "Number" },
                { label: "Kind" },
                { label: "Billed to" },
                { label: "Hotel" },
                { label: "Issued" },
                { label: "Amount", num: true },
                { label: "Email" },
                { label: "" },
              ]}
              rows={list.items}
              empty={{
                title: list.activeFilterCount ? "No matching invoices" : "No invoices yet",
                hint: list.activeFilterCount
                  ? "Try clearing the filters."
                  : "An invoice is issued automatically on every payment.",
              }}
              renderRow={(inv) => (
                <tr key={inv._id}>
                  <td>
                    <b>{inv.number}</b>
                  </td>
                  <td>
                    <Badge tone={inv.kind === "GUEST_BILL" ? "acc" : undefined}>
                      {inv.kind === "GUEST_BILL" ? "GUEST" : "COINS"}
                    </Badge>
                  </td>
                  <td>{inv.buyer?.name || "—"}</td>
                  <td>{inv.hotelId?.name || "—"}</td>
                  <td>{formatDateTime(inv.issuedAt)}</td>
                  <td className="num">
                    <b>{rupees(inv.amountPaidPaise)}</b>
                  </td>
                  <td>
                    {/* SKIPPED is the normal case for a guest, who signs up by
                        phone — it is reported as "no email", not as a fault. */}
                    {inv.email?.status === "SKIPPED" ? (
                      <span className="text-muted text-[12.5px]">No email</span>
                    ) : (
                      <Badge tone={EMAIL_TONE[inv.email?.status]}>{inv.email?.status}</Badge>
                    )}
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <InvoiceButton
                        onClick={() => setInvoiceId(inv._id)}
                        title={`View invoice ${inv.number}`}
                      />
                      {Boolean(inv.buyer?.email) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onResend(inv._id)}
                          disabled={resending === inv._id}
                        >
                          {resending === inv._id ? "Sending…" : "Resend"}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              )}
            />
            <Pagination
              page={list.page}
              limit={list.limit}
              total={list.total}
              onPage={list.setPage}
              loading={list.loading}
            />
          </>
        )}
      </Card>

      <InvoiceModal
        invoiceId={invoiceId}
        onClose={() => setInvoiceId(null)}
        fetchInvoice={fetchInvoice}
      />
    </>
  );
};

/* ------------------------------------------------------------------ *
 * the editor
 * ------------------------------------------------------------------ */

/** The editable shape, flattened out of the stored document. */
const toForm = (t) => ({
  numberPrefix: t.branding?.numberPrefix || "",
  legalName: t.branding?.legalName || "",
  address: t.branding?.address || "",
  taxId: t.branding?.taxId || "",
  supportEmail: t.branding?.supportEmail || "",
  supportPhone: t.branding?.supportPhone || "",
  logoUrl: t.branding?.logoUrl || "",
  accentColor: t.branding?.accentColor || "#8d4360",
  footerNote: t.branding?.footerNote || "",
  guestBillTitle: t.branding?.guestBillTitle || "",
  coinPurchaseTitle: t.branding?.coinPurchaseTitle || "",

  subject: t.emailCopy?.subject || "",
  heading: t.emailCopy?.heading || "",
  intro: t.emailCopy?.intro || "",
  signoff: t.emailCopy?.signoff || "",

  invoiceHtml: t.invoiceHtml || "",
  emailHtml: t.emailHtml || "",
  emailText: t.emailText || "",

  // Boolean among strings, and the dirty check below compares with String() —
  // so it must be a real boolean rather than undefined on an older payload, or
  // the form reads dirty the moment it loads. Same trap as feedEnabled.
  emailEnabled: Boolean(t.emailEnabled),
});

/** Back into the nested shape the PATCH expects. */
const toPayload = (f) => ({
  branding: {
    numberPrefix: f.numberPrefix,
    legalName: f.legalName,
    address: f.address,
    taxId: f.taxId,
    supportEmail: f.supportEmail,
    supportPhone: f.supportPhone,
    logoUrl: f.logoUrl,
    accentColor: f.accentColor,
    footerNote: f.footerNote,
    guestBillTitle: f.guestBillTitle,
    coinPurchaseTitle: f.coinPurchaseTitle,
  },
  emailCopy: {
    subject: f.subject,
    heading: f.heading,
    intro: f.intro,
    signoff: f.signoff,
  },
  invoiceHtml: f.invoiceHtml,
  emailHtml: f.emailHtml,
  emailText: f.emailText,
  emailEnabled: f.emailEnabled,
});

const TemplateForm = ({ section, template, defaults, reload }) => {
  const initial = useMemo(() => toForm(template), [template]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  // Every value is a scalar, so a shallow compare is enough to know whether
  // anything is unsaved, and it stays honest if a field is edited back to its
  // original value.
  const dirty = Object.keys(initial).some((k) => String(form[k]) !== String(initial[k]));

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const onApply = async () => {
    setBusy(true);
    try {
      await updateInvoiceTemplate(toPayload(form));
      toastSuccess("Invoice template saved");
      reload();
    } catch (err) {
      toastError(err?.message || "Could not save the template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {section === "branding" && <BrandingSection form={form} set={set} setForm={setForm} />}
      {section === "email" && <EmailSection form={form} set={set} setForm={setForm} />}
      {section === "html" && <HtmlSection form={form} setForm={setForm} defaults={defaults} />}

      {/* The preview follows the draft, not the saved copy — a raw-HTML editor
          is only safe to hand someone if they can see the result before they
          commit it. */}
      <TemplatePreview form={form} section={section} />

      <ApplyBar
        open={dirty}
        busy={busy}
        onApply={onApply}
        onDiscard={() => setForm(initial)}
      />
    </>
  );
};

const BrandingSection = ({ form, set }) => (
  <>
    <Card title="Your business">
      <div className="grid gap-x-4 gap-y-1 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <Field label="Legal entity name" hint="As it should appear on a tax invoice.">
          <Input value={form.legalName} onChange={set("legalName")} />
        </Field>
        <Field label="GSTIN / Tax ID">
          <Input value={form.taxId} onChange={set("taxId")} />
        </Field>
        <Field label="Registered address">
          <Input value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Support email">
          <Input type="email" value={form.supportEmail} onChange={set("supportEmail")} />
        </Field>
        <Field label="Support phone">
          <Input value={form.supportPhone} onChange={set("supportPhone")} />
        </Field>
      </div>
      <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
        These identify the platform on a coin-purchase invoice. On a guest's bill the
        <b> hotel</b> is the seller, so its own name, address and GSTIN are used instead —
        these are only the fallback for a property that has not completed onboarding.
      </p>
    </Card>

    <Card title="Look" className="mt-4">
      <div className="grid gap-x-4 gap-y-1 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <Field label="Logo URL" hint="Left empty, the invoice shows no logo rather than a broken image.">
          <Input value={form.logoUrl} onChange={set("logoUrl")} placeholder="https://…" />
        </Field>
        <Field label="Accent colour">
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : "#8d4360"}
              onChange={set("accentColor")}
              className="h-9 w-12 cursor-pointer rounded-lg border border-hairline bg-transparent p-1"
              aria-label="Accent colour"
            />
            <Input value={form.accentColor} onChange={set("accentColor")} className="max-w-[120px]" />
          </span>
        </Field>
        <Field label="Invoice number prefix" hint="e.g. BLX gives BLX-2026-000412.">
          <Input value={form.numberPrefix} onChange={set("numberPrefix")} maxLength={8} />
        </Field>
        <Field label="Guest bill heading">
          <Input value={form.guestBillTitle} onChange={set("guestBillTitle")} />
        </Field>
        <Field label="Coin purchase heading">
          <Input value={form.coinPurchaseTitle} onChange={set("coinPurchaseTitle")} />
        </Field>
      </div>
      <Field label="Footer note">
        <textarea
          className="input min-h-[72px] resize-y"
          value={form.footerNote}
          onChange={set("footerNote")}
        />
      </Field>
    </Card>

    <p className="text-muted mt-3 text-[12.5px] leading-relaxed">
      Changing any of this affects invoices issued <b>from now on</b>. Invoices already issued keep
      the details they were issued under, so an old invoice never changes after the fact.
    </p>
  </>
);

const PLACEHOLDERS = [
  "{{invoice.number}}",
  "{{invoice.issuedAt}}",
  "{{buyer.name}}",
  "{{seller.name}}",
  "{{totals.amountPaid}}",
];

const EmailSection = ({ form, set, setForm }) => (
  <>
    <Card title="Delivery">
      <Toggle
        label="Email the invoice on every payment"
        hint="Off, invoices are still issued and visible here — they are simply not sent."
        checked={form.emailEnabled}
        onChange={(v) => setForm((f) => ({ ...f, emailEnabled: v }))}
      />
    </Card>

    <Card title="What the email says" className="mt-4">
      <Field label="Subject">
        <Input value={form.subject} onChange={set("subject")} />
      </Field>
      <Field label="Heading">
        <Input value={form.heading} onChange={set("heading")} />
      </Field>
      <Field label="Opening paragraph">
        <textarea
          className="input min-h-[96px] resize-y"
          value={form.intro}
          onChange={set("intro")}
        />
      </Field>
      <Field label="Sign-off">
        <textarea
          className="input min-h-[72px] resize-y"
          value={form.signoff}
          onChange={set("signoff")}
        />
      </Field>

      <div className="mt-2">
        <span className="text-muted text-[12.5px]">Placeholders you can use:</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <code
              key={p}
              className="rounded-md border border-hairline px-1.5 py-1 text-[12px]"
            >
              {p}
            </code>
          ))}
        </div>
      </div>
    </Card>
  </>
);

const HTML_FIELDS = [
  {
    key: "invoiceHtml",
    label: "Invoice document",
    hint: "The invoice itself — shown in the preview popup, printed, and embedded in the email.",
  },
  {
    key: "emailHtml",
    label: "Email body",
    hint: "Wraps the invoice. {{invoice.html}} is where the rendered invoice is dropped in.",
  },
  {
    key: "emailText",
    label: "Plain-text part",
    hint: "For clients that refuse HTML. Never leave it empty — an absent text part is a spam signal.",
  },
];

const HtmlSection = ({ form, setForm, defaults }) => {
  const [open, setOpen] = useState("invoiceHtml");
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const reset = (key) => {
    setForm((f) => ({ ...f, [key]: defaults?.[key] || "" }));
    toastSuccess("Restored the shipped default — Apply to save it");
  };

  const field = HTML_FIELDS.find((f) => f.key === open);

  return (
    <Card title="Raw templates">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {HTML_FIELDS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={open === f.key ? "primary" : "ghost"}
            onClick={() => setOpen(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-muted text-[12.5px] leading-relaxed">{field.hint}</p>
        <Button size="sm" variant="ghost" onClick={() => reset(field.key)}>
          Reset to default
        </Button>
      </div>

      <textarea
        className="input min-h-[340px] resize-y font-mono text-[12.5px] leading-[1.5]"
        spellCheck={false}
        value={form[field.key]}
        onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
        aria-label={field.label}
      />

      <p className="text-muted mt-2 text-[12.5px] leading-relaxed">
        <b>{"{{#if x}}…{{/if}}"}</b> hides a block when a value is empty, and{" "}
        <b>{"{{#each lines}}…{{/each}}"}</b> repeats one per line item. Script tags, event handlers
        and <code>javascript:</code> links are stripped when the invoice is rendered, so they will
        not survive even if you paste them. A broken edit is always one <b>Reset to default</b>{" "}
        away from working again.
      </p>
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * live preview
 * ------------------------------------------------------------------ */

/**
 * Renders the DRAFT against sample data, server-side.
 *
 * Server-side because the renderer and the sanitiser live there and this
 * preview has to be the same document the guest receives — a second
 * implementation in the browser would be a second set of bugs, and would let
 * the preview disagree with the email about what is safe.
 *
 * Debounced: this fires on every keystroke in a textarea otherwise.
 */
const TemplatePreview = ({ form, section }) => {
  const [state, setState] = useState({ loading: true, invoiceHtml: "", email: null, error: null });
  const [showEmail, setShowEmail] = useState(false);

  // The latest request wins: a slow render of an older draft must not paint
  // over a newer one.
  const seq = useRef(0);

  const payload = useMemo(() => toPayload(form), [form]);
  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    const mine = seq.current + 1;
    seq.current = mine;

    const timer = setTimeout(() => {
      previewInvoiceTemplate(payload)
        .then((data) => {
          if (seq.current !== mine) return;
          setState({
            loading: false,
            invoiceHtml: data.invoiceHtml,
            email: data.email,
            error: null,
          });
        })
        .catch((err) => {
          if (seq.current !== mine) return;
          setState({
            loading: false,
            invoiceHtml: "",
            email: null,
            error: err?.message || "Could not render this template",
          });
        });
    }, 400);

    return () => clearTimeout(timer);
    // payloadKey, not payload: a fresh object each render would refire the
    // effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  // The email tab previews the email; everything else previews the document.
  const emailView = showEmail || section === "email";
  const html = emailView ? state.email?.html : state.invoiceHtml;

  return (
    <Card
      title="Preview"
      className="mt-4"
      action={
        <Button size="sm" variant="ghost" onClick={() => setShowEmail((v) => !v)}>
          {emailView ? "Show invoice" : "Show email"}
        </Button>
      }
    >
      {emailView && state.email?.subject && (
        <p className="text-muted mb-2 text-[12.5px]">
          <b>Subject:</b> {state.email.subject}
        </p>
      )}

      {state.error ? (
        <p className="text-[13px] text-[var(--danger,#b4342f)]">{state.error}</p>
      ) : state.loading ? (
        <Loading />
      ) : (
        <iframe
          title="Invoice template preview"
          srcDoc={html}
          /* Sandboxed with no allow-same-origin, for the reason InvoiceModal
             documents: this is admin-authored markup, and the sanitiser is a
             denylist that should never be the only layer. */
          sandbox=""
          className="w-full rounded-[10px] border border-hairline bg-white"
          style={{ height: "min(62vh, 760px)" }}
        />
      )}

      <p className="text-muted mt-2 text-[12.5px]">
        Rendered from sample data. No invoice number is used up by a preview.
      </p>
    </Card>
  );
};

export default AdminInvoicesPage;
