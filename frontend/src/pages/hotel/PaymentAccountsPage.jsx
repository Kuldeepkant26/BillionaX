import { useEffect, useRef, useState } from "react";
import * as hotelApi from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { uploadToCloudinary, validateImageFile } from "../../utils/upload.js";

/**
 * The UPI accounts guests pay their bills into.
 *
 * The most consequential list in the panel: guests pay these DIRECTLY, so
 * whoever edits a UPI ID here decides where the next guest's money goes. The
 * server keeps it manager-only and emails every manager on each change; this
 * screen's part is making a typo hard to save.
 *
 * That is what the QR upload is for. The image is decoded in the browser and
 * the UPI ID inside it fills the form, so the manager checks one thing against
 * another instead of typing an address from memory — and a QR that pays a
 * different account from the typed ID is flagged here and refused by the
 * server.
 *
 * Same shape as ServicesPage: a list, a modal, and a refetch after each write.
 */

const MAX_ACCOUNTS = 10;

const BLANK = { label: "", vpa: "", payeeName: "" };

// Mirrors upi.util.js on the server, which is the check that counts.
const VPA_RX = /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,63}$/i;

/** The payee inside a decoded QR, or null when it is not a UPI pay code. */
const parseUpi = (text) => {
  const raw = String(text || "").trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;
  const params = new URLSearchParams(raw.slice(raw.indexOf("?") + 1));
  const pa = params.get("pa");
  return pa ? { pa: pa.trim().toLowerCase(), pn: params.get("pn")?.trim() || "" } : null;
};

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });

/**
 * Reads the QR in an image file. jsQR is loaded only here, on the one screen
 * that needs it. A phone photo is scaled down first — decoding a 12 MP image
 * is slow, and a QR needs nowhere near that many pixels.
 */
const decodeQr = async (file) => {
  try {
    const [{ default: jsQR }, img] = await Promise.all([import("jsqr"), loadImage(file)]);
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    return jsQR(data, w, h, { inversionAttempts: "attemptBoth" })?.data || null;
  } catch {
    return null;
  }
};

const PaymentAccountsPage = () => {
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const { data, loading, error, run } = useAsync(hotelApi.listPaymentAccounts, []);
  const items = data?.items || [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  // The QR as it will be saved: { url, payload, preview } — or null for none.
  const [qr, setQr] = useState(null);
  // Whether the QR was touched in this edit. Untouched, it is not sent, so the
  // server keeps the stored one rather than clearing it.
  const [qrChanged, setQrChanged] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => () => qr?.preview && URL.revokeObjectURL(qr.preview), [qr]);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const startNew = () => {
    setEditing(null);
    setForm(BLANK);
    setQr(null);
    setQrChanged(false);
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const startEdit = (account) => {
    setEditing(account);
    setForm({ label: account.label, vpa: account.vpa, payeeName: account.payeeName || "" });
    setQr(account.qrImageUrl ? { url: account.qrImageUrl, payload: null, stored: true } : null);
    setQrChanged(false);
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const pickQr = async (event) => {
    const file = event.target.files?.[0];
    // Reset first, or re-picking the same file after an error fires no event.
    event.target.value = "";
    if (!file) return;

    const problem = validateImageFile(file);
    if (problem) return toastError(problem);

    setUploading(true);
    setProgress(0);
    const preview = URL.createObjectURL(file);

    try {
      // Decode and upload together: the decode is what the manager is waiting
      // to see, and it needs no network.
      const [payload, url] = await Promise.all([
        decodeQr(file),
        hotelApi
          .createPaymentQrUpload()
          .then((signed) => uploadToCloudinary(file, signed, setProgress)),
      ]);

      const parsed = parseUpi(payload);
      setQr({ url, payload: parsed ? payload : null, parsed, preview, unreadable: !parsed });
      setQrChanged(true);

      // Fill what is empty; never overwrite what the manager typed — the
      // mismatch warning below is how a disagreement gets noticed.
      if (parsed) {
        setForm((f) => ({
          ...f,
          vpa: f.vpa.trim() ? f.vpa : parsed.pa,
          payeeName: f.payeeName.trim() ? f.payeeName : parsed.pn,
        }));
      }
    } catch (err) {
      URL.revokeObjectURL(preview);
      toastError(err.message || "Could not upload that image");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const removeQr = () => {
    setQr(null);
    setQrChanged(true);
  };

  const typedVpa = form.vpa.trim().toLowerCase();
  const vpaValid = VPA_RX.test(typedVpa);
  const mismatch = qr?.parsed && typedVpa && qr.parsed.pa !== typedVpa;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    const payload = {
      label: form.label.trim(),
      vpa: typedVpa,
      payeeName: form.payeeName.trim() || null,
      // Only when the QR was touched: an edit that leaves it alone must not
      // clear the stored one.
      ...((!editing || qrChanged) && {
        qrImageUrl: qr?.url || null,
        qrPayload: qr?.payload || null,
      }),
    };

    try {
      if (editing) await hotelApi.updatePaymentAccount(editing.id, payload);
      else await hotelApi.createPaymentAccount(payload);
      toastSuccess(editing ? "Account saved" : "Account added");
      setOpen(false);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (account) => {
    try {
      await hotelApi.setDefaultPaymentAccount(account.id);
      toastSuccess(`${account.label} is now the default`);
      run();
    } catch (err) {
      toastError(err.message);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await hotelApi.deletePaymentAccount(confirming.id);
      toastSuccess("Account removed");
      setConfirming(null);
      run();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const nextDefault = confirming?.isDefault ? items.find((a) => a.id !== confirming.id) : null;

  const columns = [
    { key: "qr", label: "" },
    { key: "account", label: "Account" },
    { key: "vpa", label: "UPI ID" },
    { key: "payee", label: "Guests see" },
    { key: "actions", label: "" },
  ];

  return (
    <div>
      <PageHead
        title="Payment accounts"
        subtitle="The UPI accounts guests pay their bills into"
        actions={
          <Button onClick={startNew} disabled={items.length >= MAX_ACCOUNTS}>
            Add an account
          </Button>
        }
      />

      <p className="notice-warn mb-4 text-[12.5px]">
        Guests pay these accounts <b>directly</b>. Only managers can change them, and every change
        is emailed to all of this hotel&rsquo;s managers.
      </p>

      {loading && !items.length ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={run} />
      ) : !items.length ? (
        <Empty
          title="No payment accounts yet"
          hint="Add the UPI ID your desk receives payments on. Bills can't be sent until there is at least one."
        />
      ) : (
        <Table
          columns={columns}
          rows={items}
          loading={loading}
          renderRow={(account) => (
            <tr key={account.id}>
              <td className="w-[52px]">
                {account.qrImageUrl ? (
                  <img
                    src={account.qrImageUrl}
                    alt=""
                    className="w-10 h-10 object-contain rounded-[6px] border border-hairline bg-white"
                  />
                ) : (
                  <span className="text-[11px] text-muted whitespace-nowrap">No QR</span>
                )}
              </td>
              <td>
                <span className="flex items-center gap-2">
                  <b>{account.label}</b>
                  {account.isDefault && <Badge tone="ok">Default</Badge>}
                </span>
                {!account.amountLocked && (
                  <span className="block text-[11px] text-muted mt-0.5">
                    Signed QR — guests type the amount
                  </span>
                )}
              </td>
              <td className="tnum">{account.vpa}</td>
              <td>{account.payeeName || <span className="text-muted">—</span>}</td>
              <td className="text-right whitespace-nowrap">
                {!account.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(account)}>
                    Make default
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => startEdit(account)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(account)}>
                  Remove
                </Button>
              </td>
            </tr>
          )}
        />
      )}

      <Modal
        open={open}
        title={editing ? `Edit ${editing.label}` : "Add a payment account"}
        onClose={() => !busy && !uploading && setOpen(false)}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy || uploading}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={busy || uploading || !form.label.trim() || !vpaValid || Boolean(mismatch)}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {message && <p className="err mb-3">{message}</p>}

        <Field
          label="Payment QR"
          error={errors.qrPayload || errors.qrImageUrl}
          hint="The QR your UPI app shows for receiving money. We read the UPI ID from it so a typo can't send guests' money elsewhere."
        >
          <div className="flex items-center gap-3">
            {qr ? (
              <img
                src={qr.preview || qr.url}
                alt="Payment QR"
                className="w-[72px] h-[72px] object-contain rounded-[8px] border border-hairline bg-white"
              />
            ) : (
              <span className="grid place-items-center w-[72px] h-[72px] rounded-[8px] border border-dashed border-hairline text-[11px] text-muted">
                No QR
              </span>
            )}
            <div className="flex flex-col items-start gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickQr}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? `Uploading… ${progress}%` : qr ? "Replace QR" : "Upload QR"}
              </Button>
              {qr && !uploading && (
                <button
                  type="button"
                  className="border-0 bg-transparent p-0 text-[11.5px] font-semibold text-bad cursor-pointer"
                  onClick={removeQr}
                >
                  Remove QR
                </button>
              )}
            </div>
          </div>
          {qr?.parsed && (
            <p className="hint">
              Read from the QR: <b className="tnum">{qr.parsed.pa}</b>
              {qr.parsed.pn ? ` (${qr.parsed.pn})` : ""}
            </p>
          )}
          {qr?.unreadable && (
            <p className="notice-warn mt-2 text-[12px]">
              We couldn&rsquo;t read a UPI code from that image. Guests can still scan it, but check
              the UPI ID below carefully — nothing is double-checking it.
            </p>
          )}
        </Field>

        <Field label="Account name" error={errors.label} hint="What staff pick when sending a bill.">
          <Input
            value={form.label}
            onChange={change("label")}
            placeholder="Front desk, Restaurant, Spa…"
            maxLength={40}
            error={errors.label}
          />
        </Field>

        <Field
          label="UPI ID"
          error={errors.vpa || (typedVpa && !vpaValid ? "A UPI ID looks like name@bank" : undefined)}
        >
          <Input
            value={form.vpa}
            onChange={change("vpa")}
            placeholder="frontdesk@okhdfcbank"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            error={errors.vpa}
          />
        </Field>

        {mismatch && (
          <p className="notice-bad mb-3 text-[12px]">
            The QR pays <b>{qr.parsed.pa}</b>, but the UPI ID above is <b>{typedVpa}</b>. They must be
            the same account.
          </p>
        )}

        {/* The stored QR still pays the old ID; the server refuses the pair. */}
        {editing?.hasQrPayload && !qrChanged && typedVpa && typedVpa !== editing.vpa && (
          <p className="notice-warn mb-3 text-[12px]">
            You&rsquo;re changing the UPI ID — upload the QR for the new one too, or remove the old QR.
          </p>
        )}

        <Field
          label="Name guests see"
          error={errors.payeeName}
          hint="Shown in the guest's UPI app. Usually your business name."
        >
          <Input
            value={form.payeeName}
            onChange={change("payeeName")}
            placeholder="Taj Palace"
            maxLength={50}
            error={errors.payeeName}
          />
        </Field>

        <p className="hint">
          Use a business UPI ID (PhonePe, Paytm or Google Pay for Business). Some UPI apps refuse
          pre-filled amounts sent to personal UPI IDs.
        </p>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        title={`Remove ${confirming?.label || "account"}?`}
        onClose={() => setConfirming(null)}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed">
          Guests will no longer be shown <b>{confirming?.vpa}</b>. Bills already sent to this account
          are paid into the default account instead, the next time their guest opens them.
        </p>
        {nextDefault && (
          <p className="hint">{nextDefault.label} becomes the default account.</p>
        )}
        {confirming && items.length === 1 && (
          <p className="notice-warn mt-3 text-[12px]">
            This is your only account. Until you add another, staff can&rsquo;t send bills.
          </p>
        )}
      </Modal>
    </div>
  );
};

export default PaymentAccountsPage;
