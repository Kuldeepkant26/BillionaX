import { useState } from "react";
import { listStaff, createStaff, setStaffActive } from "../../api/hotel.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  FilterBar,
  Input,
  Modal,
  Pagination,
  PasswordInput,
  Select,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatDate } from "../../utils/format.js";

const BLANK = { name: "", email: "", password: "", role: "HOTEL_STAFF" };

const StaffPage = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  // key: "staff" — the endpoint keeps its bespoke response key.
  const list = usePaginatedList(listStaff, { limit: 25, key: "staff", filters: { role: "" } });
  const { loading, error, run } = list;

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await createStaff(form);
      toastSuccess("Staff account created");
      setOpen(false);
      setForm(BLANK);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (user) => {
    try {
      await setStaffActive(user._id, !user.isActive);
      run();
    } catch (err) {
      toastError(err.message);
    }
  };

  return (
    <div>
      <PageHead
        title="Staff"
        subtitle="Front desk can verify codes; managers get the full panel"
        actions={<Button onClick={() => setOpen(true)}>Add staff</Button>}
      />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Select value={list.filters.role} onChange={(e) => list.setFilter("role", e.target.value)}>
          <option value="">All access levels</option>
          <option value="HOTEL_ADMIN">Full access</option>
          <option value="HOTEL_STAFF">Verify only</option>
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
              { label: "Name" },
              { label: "Email" },
              { label: "Access" },
              { label: "Last signed in" },
              { label: "Status" },
              { label: "" },
            ]}
            rows={list.items}
            empty={{
              title: list.activeFilterCount ? "No staff match" : "No staff yet",
              hint: list.activeFilterCount ? "Try clearing the filter." : "Add your front desk team.",
            }}
            renderRow={(u) => (
              <tr key={u._id}>
                <td>
                  <b>{u.name}</b>
                </td>
                <td>{u.email}</td>
                <td>
                  <Badge tone={u.role === "HOTEL_ADMIN" ? "acc" : undefined}>
                    {u.role === "HOTEL_ADMIN" ? "Full access" : "Verify only"}
                  </Badge>
                </td>
                <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
                <td>
                  <Badge tone={u.isActive ? "ok" : undefined}>
                    {u.isActive ? "Active" : "Disabled"}
                  </Badge>
                </td>
                <td>
                  <Button size="sm" variant="ghost" onClick={() => toggle(u)}>
                    {u.isActive ? "Disable" : "Enable"}
                  </Button>
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
        open={open}
        title="Add staff"
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        }
      >
        {message && (
          <div className="notice-bad">
            {message}
          </div>
        )}

        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={change("name")} error={errors.name} />
        </Field>

        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={change("email")} error={errors.email} />
        </Field>

        <Field label="Password" hint="At least 8 characters" error={errors.password}>
          <PasswordInput
            value={form.password}
            onChange={change("password")}
            error={errors.password}
          />
        </Field>

        <Field label="Access level">
          <Select value={form.role} onChange={change("role")}>
            <option value="HOTEL_STAFF">Front desk — verify codes only</option>
            <option value="HOTEL_ADMIN">Manager — full panel access</option>
          </Select>
        </Field>
      </Modal>
    </div>
  );
};

export default StaffPage;
