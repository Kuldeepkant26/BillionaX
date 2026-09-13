import { useState } from "react";
import * as hotelApi from "../../api/hotel.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
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
  Slider,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";

const BLANK = { name: "", coinCapPercent: 10, isActive: true };

/**
 * The outlets this hotel bills to, and how far coins go at each.
 *
 * Its own page rather than a section of Settings, and the reason is that
 * page's shape: its dirty check is a shallow compare over flat scalar keys
 * (goldNights, silverRate), which a variable-length list with create and delete
 * cannot express. This is the PrivilegesPage shape instead — a list, a modal,
 * and a refetch after each mutation.
 *
 * The cap REPLACES the tier cap on any line billed to the service, so 0 here
 * genuinely means "coins are not accepted at this outlet" rather than "unset".
 * The table says so in as many words, because it is the consequential setting
 * on the screen and nothing else on it looks dangerous.
 */
const ServicesPage = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const list = usePaginatedList(hotelApi.listServices, { limit: 50 });
  const { items, loading, error, run } = list;

  const change = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const startNew = () => {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name || "",
      // `??`, not `||`: a service set to 0 must open its form showing 0, not
      // silently reset to the default the moment a manager clicks edit.
      coinCapPercent: item.coinCapPercent ?? 0,
      isActive: item.isActive,
    });
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    const payload = {
      name: form.name.trim(),
      coinCapPercent: Number(form.coinCapPercent) || 0,
      isActive: form.isActive,
    };

    try {
      if (editing) await hotelApi.updateService(editing._id, payload);
      else await hotelApi.createService(payload);
      toastSuccess("Saved");
      setOpen(false);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Optimistic, so the switch answers the click rather than the round trip. */
  const toggleActive = async (item) => {
    const next = !item.isActive;
    list.setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((row) =>
              row._id === item._id ? { ...row, isActive: next } : row
            ),
          }
        : current
    );

    try {
      await hotelApi.updateService(item._id, { isActive: next });
    } catch (err) {
      list.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((row) =>
                row._id === item._id ? { ...row, isActive: item.isActive } : row
              ),
            }
          : current
      );
      toastError(err.message);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await hotelApi.deleteService(confirming._id);
      toastSuccess("Deleted");
      setConfirming(null);
      run();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: "name", label: "Service" },
    { key: "cap", label: "Coins may cover", num: true },
    { key: "status", label: "Status" },
    { key: "actions", label: "" },
  ];

  return (
    <div>
      <PageHead
        title="Services"
        subtitle="What you bill for, and how much of each coins may cover"
        actions={<Button onClick={startNew}>Add a service</Button>}
      />

      {loading && !items.length ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={run} />
      ) : !items.length ? (
        <Empty
          title="No services yet"
          hint="Add the outlets you bill to — a restaurant, a spa, room service."
        />
      ) : (
        <Table
          columns={columns}
          rows={items}
          loading={loading}
          renderRow={(item) => (
            <tr key={item._id}>
              <td>
                <b>{item.name}</b>
              </td>
              <td className="tnum text-right">
                {item.coinCapPercent > 0 ? (
                  `${item.coinCapPercent}%`
                ) : (
                  // The one setting on this screen with a consequence a manager
                  // might not expect, so it says what it does rather than "0%".
                  <Badge tone="bad">No coins</Badge>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleActive(item)}
                >
                  {item.isActive ? "Visible" : "Hidden"}
                </button>
              </td>
              <td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(item)}>
                  Delete
                </Button>
              </td>
            </tr>
          )}
        />
      )}

      <Modal
        open={open}
        title={editing ? "Edit service" : "Add a service"}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !form.name.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {message && <p className="err mb-3">{message}</p>}

        <Field label="Name" error={errors.name}>
          <Input
            value={form.name}
            onChange={change("name")}
            placeholder="Restaurant, Spa, Room service…"
            maxLength={60}
            error={errors.name}
          />
        </Field>

        <Field
          label="Coins may cover"
          error={errors.coinCapPercent}
          hint={
            Number(form.coinCapPercent) > 0
              ? `Up to ${form.coinCapPercent}% of anything billed to this service can be paid with coins, whatever the guest's tier.`
              : "Coins cannot be used on this service at all."
          }
        >
          <Slider
            value={form.coinCapPercent}
            onChange={change("coinCapPercent")}
            min={0}
            max={100}
            step={1}
            unit="%"
            error={errors.coinCapPercent}
          />
        </Field>

        {editing && editing.name !== form.name.trim() && (
          <p className="hint">
            Bills already sent keep the old name in your history and reports.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(confirming)}
        title={`Delete ${confirming?.name || "service"}?`}
        onClose={() => setConfirming(null)}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed">
          Bills already sent keep this name and what they allowed. New bills will
          fall back to the guest&rsquo;s tier allowance instead.
        </p>
        <p className="hint">Hiding it instead keeps it off new bills without changing anything else.</p>
      </Modal>
    </div>
  );
};

export default ServicesPage;
