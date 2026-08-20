import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getHotel,
  sellCoins,
  createHotelAdmin,
  updateHotel,
  deleteHotel,
} from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Kpi,
  Loading,
  Modal,
  PasswordInput,
  Select,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { ROUTES } from "../../constants/routePaths.js";
import { formatCoins, formatCurrency, formatDate } from "../../utils/format.js";
import styles from "./HotelDetailPage.module.css";

const HotelDetailPage = () => {
  const { hotelId } = useParams();
  const { data, loading, error, run } = useAsync(() => getHotel(hotelId), [hotelId]);

  const [sellOpen, setSellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    city: "",
    address: "",
    phone: "",
    email: "",
    earnRatePercent: 15,
    isActive: true,
  });
  const [sellForm, setSellForm] = useState({ coins: "", amountPaid: "", paymentRef: "" });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "HOTEL_ADMIN",
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const hotel = data?.hotel || {};
  const joinUrl = `${window.location.origin}/join/${data?.qr?.slug}`;

  const doSell = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await sellCoins(hotelId, {
        coins: Number(sellForm.coins),
        amountPaid: Number(sellForm.amountPaid),
        paymentRef: sellForm.paymentRef || undefined,
      });
      toastSuccess(`${formatCoins(Number(sellForm.coins))} coins added`);
      setSellOpen(false);
      setSellForm({ coins: "", amountPaid: "", paymentRef: "" });
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doCreateUser = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await createHotelAdmin(hotelId, userForm);
      toastSuccess("Account created");
      setUserOpen(false);
      setUserForm({ name: "", email: "", password: "", role: "HOTEL_ADMIN" });
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setEditForm({
      name: hotel.name || "",
      city: hotel.city || "",
      address: hotel.address || "",
      phone: hotel.phone || "",
      email: hotel.email || "",
      earnRatePercent: hotel.earnRatePercent ?? 15,
      isActive: hotel.isActive,
    });
    setErrors({});
    setMessage("");
    setEditOpen(true);
  };

  const doUpdate = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      await updateHotel(hotelId, {
        ...editForm,
        earnRatePercent: Number(editForm.earnRatePercent),
        email: editForm.email || undefined,
      });
      toastSuccess("Hotel updated");
      setEditOpen(false);
      run();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteHotel(hotelId);
      toastSuccess("Hotel removed");
      navigate(ROUTES.ADMIN_HOTELS);
    } catch (err) {
      // Refused while guests still hold coins there — show why.
      toastError(err.message);
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const alert = message && (
    <div className={styles.alert}>{message}</div>
  );

  return (
    <div>
      <Link to={ROUTES.ADMIN_HOTELS} className={styles.back}>
        ← All hotels
      </Link>

      <PageHead
        title={hotel.name}
        subtitle={`${hotel.city || "—"} · joined ${formatDate(hotel.createdAt)}`}
        actions={
          <>
            <Button variant="ghost" onClick={startEdit}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setUserOpen(true)}>
              Add account
            </Button>
            <Button onClick={() => setSellOpen(true)}>Sell coins</Button>
          </>
        }
      />

      <div className="kpis">
        <Kpi
          label="Coin inventory"
          value={formatCoins(hotel.coinInventory)}
          delta={hotel.coinInventory < 10000 ? "Running low" : "Healthy"}
          tone={hotel.coinInventory < 10000 ? "bad" : "ok"}
        />
        <Kpi label="Total purchased" value={formatCoins(hotel.totalCoinsPurchased)} />
        <Kpi label="Allocated" value={formatCoins(hotel.totalCoinsAllocated)} />
        <Kpi label="Redeemed" value={formatCoins(hotel.totalCoinsRedeemed)} />
      </div>

      <div className={styles.cols}>
        <Card title="Purchase history">
          <Table
            columns={[
              { label: "Date" },
              { label: "Reference" },
              { label: "Coins", num: true },
              { label: "Paid", num: true },
            ]}
            rows={data?.purchases || []}
            empty={{ title: "No purchases yet", hint: "Record the first coin sale." }}
            renderRow={(p) => (
              <tr key={p._id}>
                <td>{formatDate(p.createdAt)}</td>
                <td>{p.paymentRef || "—"}</td>
                <td className="num">
                  <b>{formatCoins(p.coins)}</b>
                </td>
                <td className="num">{formatCurrency(p.amountPaid)}</td>
              </tr>
            )}
          />
        </Card>

        <div>
          <Card title="Accounts">
            <Table
              columns={[{ label: "Name" }, { label: "Access" }, { label: "Status" }]}
              rows={data?.staff || []}
              empty={{ title: "No accounts", hint: "Create the hotel's first manager login." }}
              renderRow={(u) => (
                <tr key={u._id}>
                  <td>
                    <b>{u.name}</b>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {u.email}
                    </div>
                  </td>
                  <td>
                    <Badge tone={u.role === "HOTEL_ADMIN" ? "acc" : undefined}>
                      {u.role === "HOTEL_ADMIN" ? "Manager" : "Front desk"}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={u.isActive ? "ok" : undefined}>
                      {u.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                </tr>
              )}
            />
          </Card>

          <Card title="Guest QR link" className={styles.spaced}>
            <div className={styles.url}>{joinUrl}</div>
            <p className={styles.note}>
              The hotel prints this as a QR code for reception, rooms and outlets.
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={sellOpen}
        title="Sell coins to this hotel"
        onClose={() => setSellOpen(false)}
        footer={
          <Button block onClick={doSell} disabled={busy}>
            {busy ? "Recording…" : "Record purchase"}
          </Button>
        }
      >
        {alert}
        <Field label="Coins" error={errors.coins}>
          <Input
            type="number"
            value={sellForm.coins}
            onChange={(e) => setSellForm((f) => ({ ...f, coins: e.target.value }))}
            error={errors.coins}
            placeholder="100000"
          />
        </Field>
        <Field label="Amount paid (₹)" error={errors.amountPaid}>
          <Input
            type="number"
            value={sellForm.amountPaid}
            onChange={(e) => setSellForm((f) => ({ ...f, amountPaid: e.target.value }))}
            error={errors.amountPaid}
            placeholder="100000"
          />
        </Field>
        <Field label="Payment reference" hint="UTR, cheque number, or a note" error={errors.paymentRef}>
          <Input
            value={sellForm.paymentRef}
            onChange={(e) => setSellForm((f) => ({ ...f, paymentRef: e.target.value }))}
          />
        </Field>
        <p className="hint">
          This immediately credits the hotel's inventory. They can then allocate coins to guests.
        </p>
      </Modal>

      <Modal
        open={userOpen}
        title="Create hotel account"
        onClose={() => setUserOpen(false)}
        footer={
          <Button block onClick={doCreateUser} disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        }
      >
        {alert}
        <Field label="Name" error={errors.name}>
          <Input
            value={userForm.name}
            onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            value={userForm.email}
            onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters" error={errors.password}>
          <PasswordInput
            value={userForm.password}
            onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
          />
        </Field>
        <Field label="Access level">
          <Select
            value={userForm.role}
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="HOTEL_ADMIN">Manager — full panel</option>
            <option value="HOTEL_STAFF">Front desk — verify only</option>
          </Select>
        </Field>
      </Modal>

      <Modal
        open={editOpen}
        title="Edit hotel"
        onClose={() => setEditOpen(false)}
        footer={
          <Button block onClick={doUpdate} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      >
        {alert}
        <Field label="Hotel name" error={errors.name}>
          <Input
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
            autoFocus
          />
        </Field>
        <Field label="City" error={errors.city}>
          <Input
            value={editForm.city}
            onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
          />
        </Field>
        <Field label="Address" error={errors.address}>
          <Input
            value={editForm.address}
            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
          />
        </Field>
        <Field
          label="Earn rate (%)"
          hint="Coins = room amount × nights × this percentage"
          error={errors.earnRatePercent}
        >
          <Input
            type="number"
            value={editForm.earnRatePercent}
            onChange={(e) => setEditForm((f) => ({ ...f, earnRatePercent: e.target.value }))}
            min={0}
            max={100}
          />
        </Field>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={editForm.isActive}
            onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Hotel is live
        </label>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Remove this hotel?"
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="row" style={{ gap: 9 }}>
            <Button variant="ghost" block onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" block onClick={doDelete} disabled={busy}>
              {busy ? "Removing…" : "Remove hotel"}
            </Button>
          </div>
        }
      >
        <p className={styles.confirm}>
          <b>{hotel.name}</b>, its staff accounts, content and memberships will be removed. This
          cannot be undone.
        </p>
        <div className={styles.warnBox}>
          If guests still hold coins at this hotel the removal is refused — those coins are a
          liability the hotel has already paid for. Deactivate it instead if you only want to pause
          it.
        </div>
      </Modal>
    </div>
  );
};

export default HotelDetailPage;
