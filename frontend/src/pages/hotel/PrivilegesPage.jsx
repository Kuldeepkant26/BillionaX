import { useState } from "react";
import * as hotelApi from "../../api/hotel.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  FilterBar,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { ImagePicker } from "../../features/panel/ImagePicker.jsx";
import styles from "./PrivilegesPage.module.css";

const TIERS = ["SILVER", "GOLD", "PLATINUM"];

const BLANK = {
  title: "",
  description: "",
  valueLabel: "",
  imageUrl: "",
  tiers: [],
  isActive: true,
};

/**
 * Privileges are the standing benefits a guest sees on their home screen —
 * "Breakfast · Included". Deliberately its own page rather than another `kind`
 * of ContentPage: the form here is a value label plus a tier target, which
 * that component has no room for.
 */
const PrivilegesPage = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const list = usePaginatedList(hotelApi.listPrivileges, {
    limit: 12,
    filters: { isActive: "" },
  });
  const { items, loading, error, run } = list;

  const change = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const toggleTier = (tier) =>
    setForm((f) => ({
      ...f,
      tiers: f.tiers.includes(tier) ? f.tiers.filter((t) => t !== tier) : [...f.tiers, tier],
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
      title: item.title || "",
      description: item.description || "",
      valueLabel: item.valueLabel || "",
      imageUrl: item.imageUrl || "",
      // Untargeted rows come back with NO tiers key at all, so this fallback
      // is what stops toggleTier's .includes() throwing on the first click.
      tiers: item.tiers || [],
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

    try {
      const payload = {
        ...form,
        valueLabel: form.valueLabel || undefined,
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        // Sent even when empty: [] is the meaningful "every tier" value, and
        // dropping it would make un-targeting a privilege impossible on edit.
        tiers: form.tiers,
      };

      if (editing) await hotelApi.updatePrivilege(editing._id, payload);
      else await hotelApi.createPrivilege(payload);

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

  /**
   * Show/hide straight from the row. Optimistic: the switch moves at once and
   * rolls back if the request fails, because waiting on a round trip makes a
   * toggle feel broken.
   */
  const toggleVisible = async (item) => {
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
      await hotelApi.updatePrivilege(item._id, { isActive: next });
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

  const remove = async (item) => {
    try {
      await hotelApi.deletePrivilege(item._id);
      toastSuccess("Deleted");
      run();
    } catch (err) {
      toastError(err.message);
    }
  };

  return (
    <div>
      <PageHead
        title="Privileges"
        subtitle="Benefits members see on their home screen"
        actions={<Button onClick={startNew}>Add privilege</Button>}
      />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Select
          value={list.filters.isActive}
          onChange={(e) => list.setFilter("isActive", e.target.value)}
        >
          <option value="">All</option>
          <option value="true">Published</option>
          <option value="false">Hidden</option>
        </Select>
      </FilterBar>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={run} />
      ) : !items.length ? (
        <Card>
          <Empty
            title="No privileges yet"
            hint="Add the perks that come with staying here — breakfast, late checkout, a spa discount."
          />
        </Card>
      ) : (
        <>
          <div className={styles.grid}>
            {items.map((item) => (
              <Card
                key={item._id}
                className={`${styles.item} ${item.isActive ? "" : styles.hidden}`}
              >
                {/* Mirrors exactly what the guest sees on their home screen. */}
                <span
                  className={styles.preview}
                  style={
                    item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined
                  }
                >
                  <span className={styles.previewBody}>
                    <b>{item.title}</b>
                    {item.valueLabel && <u>{item.valueLabel}</u>}
                  </span>
                </span>

                <div className={styles.body}>
                  {item.description && <p className={styles.desc}>{item.description}</p>}

                  <div className={styles.badges}>
                    {item.tiers?.length ? (
                      item.tiers.map((tier) => <Badge key={tier}>{tier}</Badge>)
                    ) : (
                      <Badge tone="acc">All members</Badge>
                    )}
                  </div>

                  <div className={styles.actions}>
                    <label className={styles.switchRow}>
                      <input
                        type="checkbox"
                        className={styles.switchInput}
                        checked={item.isActive}
                        onChange={() => toggleVisible(item)}
                        aria-label={`Show ${item.title} to guests`}
                      />
                      <span className={styles.switch} />
                      <span className={styles.switchLabel}>
                        {item.isActive ? "Shown" : "Hidden"}
                      </span>
                    </label>

                    <span className={styles.rowBtns}>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(item)}>
                        Delete
                      </Button>
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            page={list.page}
            limit={list.limit}
            total={list.total}
            onPage={list.setPage}
            loading={loading}
          />
        </>
      )}

      <Modal
        open={open}
        title={editing ? "Edit privilege" : "Add privilege"}
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        }
      >
        {message && <div className={styles.alert}>{message}</div>}

        <Field label="Title" hint="What the benefit is" error={errors.title}>
          <Input
            value={form.title}
            onChange={change("title")}
            error={errors.title}
            placeholder="Breakfast"
            autoFocus
          />
        </Field>

        <Field
          label="Value"
          hint="The short line beside it on the guest's card"
          error={errors.valueLabel}
        >
          <Input
            value={form.valueLabel}
            onChange={change("valueLabel")}
            error={errors.valueLabel}
            placeholder="Included"
          />
        </Field>

        <Field
          label="Available to"
          hint="Leave all unticked to show this to every member."
          error={errors.tiers || errors["tiers[0]"]}
        >
          <div className={styles.tierRow}>
            {TIERS.map((tier) => (
              <label key={tier} className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.tiers.includes(tier)}
                  onChange={() => toggleTier(tier)}
                />
                {tier.charAt(0) + tier.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </Field>

        <ImagePicker
          label="Background image"
          hint="Shown behind the title on the guest's home screen."
          aspect="wide"
          value={form.imageUrl}
          onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
          getSignature={hotelApi.createContentUpload}
        />

        <Field label="Description" hint="Optional detail" error={errors.description}>
          <textarea
            className="input"
            rows={2}
            value={form.description}
            onChange={change("description")}
          />
        </Field>

        {/* Also on every row as a switch — kept here so the create form can
            add something hidden, before its wording is finished. */}
        <label className={styles.check}>
          <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
          Visible to guests
        </label>
      </Modal>
    </div>
  );
};

export default PrivilegesPage;
