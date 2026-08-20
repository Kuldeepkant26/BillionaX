import { useState } from "react";
import { listGuests, updateGuest, deleteGuest } from "../../api/admin.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Button,
  Card,
  ErrorState,
  Field,
  FilterBar,
  Input,
  Modal,
  Pagination,
  PhoneInput,
  Select,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatCoins, formatDate, isValidPhone } from "../../utils/format.js";
import styles from "./GuestsPage.module.css";

const GuestsPage = () => {
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const list = usePaginatedList(listGuests, {
    limit: 25,
    filters: { hasBalance: "" },
  });
  const { loading, error, run } = list;

  const startEdit = (guest) => {
    setEditing(guest);
    setForm({ name: guest.name || "", email: guest.email || "", phone: guest.phone || "" });
    setErrors({});
    setMessage("");
  };

  const submit = async () => {
    if (form.phone && !isValidPhone(form.phone)) {
      return setErrors({ phone: "Enter a valid 10-digit mobile number" });
    }

    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await updateGuest(editing.id, {
        name: form.name,
        email: form.email || "",
        phone: form.phone,
      });
      toastSuccess("Guest updated");
      setEditing(null);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteGuest(confirmDelete.id);
      toastSuccess("Guest removed");
      setConfirmDelete(null);
      run();
    } catch (err) {
      // The API refuses while the guest still holds coins — surface why.
      toastError(err.message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        title="Guests"
        subtitle="Everyone on the network, across all hotels"
        actions={
          undefined
        }
      />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Input
          className="filter-search"
          placeholder="Search name, phone or email"
          value={list.q}
          onChange={(e) => list.search(e.target.value)}
        />
        <Select
          value={list.filters.hasBalance}
          onChange={(e) => list.setFilter("hasBalance", e.target.value)}
        >
          <option value="">All guests</option>
          <option value="true">Holding coins</option>
        </Select>
      </FilterBar>

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={run} />
        ) : (
          <>
          <Table
            loading={loading}
            columns={[
              { label: "Guest" },
              { label: "Phone" },
              { label: "Joined" },
              { label: "Hotels", num: true },
              { label: "Balance", num: true },
              { label: "Earned", num: true },
              { label: "Redeemed", num: true },
              { label: "" },
            ]}
            rows={list.items}
            empty={{
              title: list.activeFilterCount ? "No guests match" : "No guests yet",
              hint: list.activeFilterCount
                ? "Try clearing the filters."
                : "Guests appear once they scan a hotel QR.",
            }}
            renderRow={(g) => (
              <tr key={g.id}>
                <td>
                  <b>{g.name}</b>
                </td>
                <td>{g.phone}</td>
                <td>{formatDate(g.createdAt)}</td>
                <td className="num">{g.hotels}</td>
                <td className="num">
                  <b>{formatCoins(g.balance)}</b>
                </td>
                <td className="num">{formatCoins(g.lifetimeEarned)}</td>
                <td className="num">{formatCoins(g.lifetimeRedeemed)}</td>
                <td>
                  <div className={styles.actions}>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(g)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(g)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          />
          <Pagination
            page={list.page}
            limit={list.limit}
            total={list.total}
            onPage={list.setPage}
            loading={loading}
          />
          </>
        )}
      </Card>

      <Modal
        open={!!editing}
        title="Edit guest"
        onClose={() => setEditing(null)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        {message && <div className={styles.alert}>{message}</div>}

        <Field label="Name" error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
            autoFocus
          />
        </Field>

        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
          />
        </Field>

        <Field
          label="Mobile number"
          hint="This is the guest's login. Changing it changes how they sign in."
          error={errors.phone}
        >
          <PhoneInput
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            error={errors.phone}
          />
        </Field>
      </Modal>

      <Modal
        open={!!confirmDelete}
        title="Remove this guest?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <div className="row" style={{ gap: 9 }}>
            <Button variant="ghost" block onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" block onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove guest"}
            </Button>
          </div>
        }
      >
        <p className={styles.confirm}>
          <b>{confirmDelete?.name}</b> ({confirmDelete?.phone}) and all their memberships will be
          removed. Their transaction history is kept as an audit record.
        </p>
        {confirmDelete?.balance > 0 && (
          <div className={styles.warn}>
            This guest still holds <b>{formatCoins(confirmDelete.balance)}</b> coins. Those are a
            liability a hotel has already paid for, so the removal will be refused until the
            balance is cleared.
          </div>
        )}
      </Modal>
    </div>
  );
};

export default GuestsPage;
