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

const TIERS = ["SILVER", "GOLD", "PLATINUM"];
const TIER_LABEL = { SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum" };

const BLANK = { name: "", SILVER: 10, GOLD: 10, PLATINUM: 10, isActive: true };

/** True when all three tiers are the same, i.e. the simple form is enough. */
const isUniform = (caps) =>
  Number(caps.SILVER) === Number(caps.GOLD) && Number(caps.GOLD) === Number(caps.PLATINUM);

/**
 * The outlets this hotel bills to, and how far coins go at each per tier.
 *
 * Its own page rather than a section of Settings, and the reason is that
 * page's shape: its dirty check is a shallow compare over flat scalar keys
 * (goldNights, silverRate), which a variable-length list with create and delete
 * cannot express. This is the PrivilegesPage shape instead — a list, a modal,
 * and a refetch after each mutation.
 *
 * The caps REPLACE the tier cap on any line billed to the service, so 0 here
 * genuinely means "coins are not accepted at this outlet" rather than "unset".
 * The table says so in as many words, because it is the consequential setting
 * on the screen and nothing else on it looks dangerous.
 *
 * The form asks for ONE number until a manager asks for three. Most outlets run
 * a single rate, and making every service three decisions would tax the common
 * case to serve the rarer one — so the per-tier sliders are a toggle away
 * rather than always on. The three tiers are held as flat form keys, matching
 * how HotelSettingsPage flattens its own nested config.
 */
const ServicesPage = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  // Whether the modal is showing three sliders or one.
  const [perTier, setPerTier] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const list = usePaginatedList(hotelApi.listServices, { limit: 50 });
  const { items, loading, error, run } = list;

  const change = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  /**
   * In simple mode one slider drives all three tiers, so switching to per-tier
   * starts from what the manager already set rather than resetting it.
   */
  const setCap = (tier) => (e) => {
    const value = e.target.value;
    setForm((f) => (perTier ? { ...f, [tier]: value } : { ...f, SILVER: value, GOLD: value, PLATINUM: value }));
  };

  const startNew = () => {
    setEditing(null);
    setForm(BLANK);
    setPerTier(false);
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const startEdit = (item) => {
    const caps = item.coinCaps || {};
    setEditing(item);
    setForm({
      name: item.name || "",
      // `??`, not `||`: a tier set to 0 must open its form showing 0, not
      // silently reset to the default the moment a manager clicks edit.
      SILVER: caps.SILVER ?? 0,
      GOLD: caps.GOLD ?? 0,
      PLATINUM: caps.PLATINUM ?? 0,
      isActive: item.isActive,
    });
    // A service whose tiers already differ opens showing them — collapsing it
    // to one slider would misrepresent what is saved, and the first edit would
    // flatten the other two tiers without the manager noticing.
    setPerTier(!isUniform(caps));
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
      coinCaps: {
        SILVER: Number(form.SILVER) || 0,
        GOLD: Number(form.GOLD) || 0,
        PLATINUM: Number(form.PLATINUM) || 0,
      },
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
                {(() => {
                  const caps = item.coinCaps || {};
                  const every = TIERS.map((t) => caps[t] ?? 0);

                  // Nothing anywhere accepts coins — the one setting on this
                  // screen with a consequence a manager might not expect, so it
                  // says what it does rather than showing "0%".
                  if (every.every((n) => n === 0)) return <Badge tone="bad">No coins</Badge>;

                  // One number when the tiers agree, which is most services.
                  // Three only when they genuinely differ, so the column stays
                  // scannable instead of reading "10 / 10 / 10" seven times.
                  if (isUniform(caps)) return `${every[0]}%`;

                  return (
                    <span title="Silver / Gold / Platinum">
                      {every.join(" / ")}
                      <span className="text-muted">%</span>
                    </span>
                  );
                })()}
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

        {perTier ? (
          <>
            {TIERS.map((tier) => (
              <Field
                key={tier}
                label={`${TIER_LABEL[tier]} members`}
                error={errors[`coinCaps.${tier}`]}
                hint={
                  Number(form[tier]) > 0
                    ? undefined
                    : `${TIER_LABEL[tier]} members cannot use coins here.`
                }
              >
                <Slider
                  value={form[tier]}
                  onChange={setCap(tier)}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  error={errors[`coinCaps.${tier}`]}
                />
              </Field>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              // Levels the three to Silver's value, so the simple slider is not
              // showing one number while two others are quietly different.
              onClick={() => {
                setForm((f) => ({ ...f, GOLD: f.SILVER, PLATINUM: f.SILVER }));
                setPerTier(false);
              }}
            >
              Use one rate for every tier
            </button>
          </>
        ) : (
          <>
            <Field
              label="Coins may cover"
              error={errors["coinCaps.SILVER"]}
              hint={
                Number(form.SILVER) > 0
                  ? `Up to ${form.SILVER}% of anything billed to this service can be paid with coins.`
                  : "Coins cannot be used on this service at all."
              }
            >
              <Slider
                value={form.SILVER}
                onChange={setCap("SILVER")}
                min={0}
                max={100}
                step={1}
                unit="%"
                error={errors["coinCaps.SILVER"]}
              />
            </Field>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPerTier(true)}>
              Set a different rate per tier
            </button>
          </>
        )}

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
