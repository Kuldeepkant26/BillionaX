import { useState } from "react";
import { listAdmins, createAdmin, updateAdmin, deleteAdmin } from "../../api/admin.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  Pagination,
  PasswordInput,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatDate } from "../../utils/format.js";
import styles from "./AdminsPage.module.css";

const BLANK = { name: "", email: "", password: "" };

const AdminsPage = () => {
  const me = useAppStore((s) => s.user);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  // key: "admins" — bespoke response key kept.
  const list = usePaginatedList(listAdmins, { limit: 25, key: "admins" });
  const { loading, error, run } = list;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const startNew = () => {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const startEdit = (admin) => {
    setEditing(admin);
    setForm({ name: admin.name, email: admin.email, password: "" });
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      if (editing) {
        // Password is only sent when actually changed.
        await updateAdmin(editing._id, {
          name: form.name,
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
        });
        toastSuccess("Admin updated");
      } else {
        await createAdmin(form);
        toastSuccess("Admin created");
      }
      setOpen(false);
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
      await deleteAdmin(confirmDelete._id);
      toastSuccess("Admin removed");
      setConfirmDelete(null);
      run();
    } catch (err) {
      toastError(err.message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (admin) => {
    try {
      await updateAdmin(admin._id, { isActive: !admin.isActive });
      run();
    } catch (err) {
      toastError(err.message);
    }
  };

  return (
    <div>
      <PageHead
        title="Administrators"
        subtitle="Accounts with full platform access"
        actions={<Button onClick={startNew}>Add admin</Button>}
      />

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
              { label: "Last signed in" },
              { label: "Status" },
              { label: "" },
            ]}
            rows={list.items}
            empty={{ title: "No admins" }}
            renderRow={(a) => {
              const isMe = String(a._id) === String(me?.id);
              return (
                <tr key={a._id}>
                  <td>
                    <b>{a.name}</b>
                    {a.isProtected && (
                      <Badge tone="acc" className={styles.tag}>
                        Superadmin
                      </Badge>
                    )}
                    {isMe && !a.isProtected && <span className={styles.you}>you</span>}
                  </td>
                  <td>{a.email}</td>
                  <td>{a.lastLoginAt ? formatDate(a.lastLoginAt) : "Never"}</td>
                  <td>
                    <Badge tone={a.isActive ? "ok" : undefined}>
                      {a.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td>
                    {a.isProtected ? (
                      <span className={styles.locked} title="The primary superadmin is protected">
                        Protected
                      </span>
                    ) : (
                      <div className={styles.actions}>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(a)}>
                          {a.isActive ? "Disable" : "Enable"}
                        </Button>
                        {!isMe && (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(a)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            }}
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

      <p className={styles.note}>
        The primary superadmin cannot be edited, disabled or deleted — that guarantee is what stops
        the platform being locked out of its own admin panel.
      </p>

      <Modal
        open={open}
        title={editing ? "Edit admin" : "Add admin"}
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create admin"}
          </Button>
        }
      >
        {message && <div className={styles.alert}>{message}</div>}

        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={change("name")} error={errors.name} autoFocus />
        </Field>

        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={change("email")} error={errors.email} />
        </Field>

        <Field
          label={editing ? "New password" : "Password"}
          hint={editing ? "Leave blank to keep the current password" : "At least 8 characters"}
          error={errors.password}
        >
          <PasswordInput
            value={form.password}
            onChange={change("password")}
            error={errors.password}
          />
        </Field>
      </Modal>

      <Modal
        open={!!confirmDelete}
        title="Remove this admin?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <div className="row" style={{ gap: 9 }}>
            <Button variant="ghost" block onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" block onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove admin"}
            </Button>
          </div>
        }
      >
        <p className={styles.confirm}>
          <b>{confirmDelete?.name}</b> ({confirmDelete?.email}) will lose access immediately. This
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

export default AdminsPage;
