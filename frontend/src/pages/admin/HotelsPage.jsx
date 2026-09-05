import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { listHotels, createHotel, listHotelCities } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
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
  Select,
  Slider,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { adminHotelPath } from "../../constants/routePaths.js";
import { formatCoins, formatDate } from "../../utils/format.js";

const BLANK = { name: "", city: "", address: "", phone: "", email: "", earnRatePercent: 15 };

const HotelsPage = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const navigate = useNavigate();

  const list = usePaginatedList(listHotels, {
    limit: 25,
    filters: { isActive: "", city: "", lowInventory: "" },
  });

  // Reference data for the filter dropdown — changes rarely, read often.
  const { data: cityData } = useAsync(() => listHotelCities(), [], {
    cacheKey: "admin.hotelCities",
  });
  const cities = cityData?.cities || [];

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    try {
      const result = await createHotel({
        ...form,
        earnRatePercent: Number(form.earnRatePercent),
        email: form.email || undefined,
      });
      toastSuccess(`${result.hotel.name} registered`);
      setOpen(false);
      setForm(BLANK);
      navigate(adminHotelPath(result.hotel._id));
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        title="Hotels"
        subtitle="Your client hotels on the Billionax network"
        actions={<Button onClick={() => setOpen(true)}>Register hotel</Button>}
      />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Input
          className="filter-search"
          placeholder="Search hotels"
          value={list.q}
          onChange={(e) => list.search(e.target.value)}
        />
        <Select value={list.filters.city} onChange={(e) => list.setFilter("city", e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={list.filters.isActive}
          onChange={(e) => list.setFilter("isActive", e.target.value)}
        >
          <option value="">Any status</option>
          <option value="true">Live</option>
          <option value="false">Paused</option>
        </Select>
        {/* An empty-inventory hotel silently 409s every allocation, so this
            turns a support ticket into a dashboard glance. */}
        <Select
          value={list.filters.lowInventory}
          onChange={(e) => list.setFilter("lowInventory", e.target.value)}
        >
          <option value="">Any inventory</option>
          <option value="true">Low inventory</option>
        </Select>
      </FilterBar>

      <Card>
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.run} />
        ) : (
          <>
          <Table
            loading={list.loading}
            columns={[
              { label: "Hotel" },
              { label: "City" },
              { label: "Joined" },
              { label: "Inventory", num: true },
              { label: "Allocated", num: true },
              { label: "Redeemed", num: true },
              { label: "Status" },
            ]}
            rows={list.items}
            empty={{
              title: list.activeFilterCount ? "No hotels match" : "No hotels yet",
              hint: list.activeFilterCount
                ? "Try clearing the filters."
                : "Register your first client hotel to get started.",
            }}
            renderRow={(h) => (
              <tr
                key={h._id}
                onClick={() => navigate(adminHotelPath(h._id))}
                className="cursor-pointer"
              >
                <td>
                  <b>{h.name}</b>
                </td>
                <td>{h.city || "—"}</td>
                <td>{formatDate(h.createdAt)}</td>
                <td className="num">
                  <b>{formatCoins(h.coinInventory)}</b>
                </td>
                <td className="num">{formatCoins(h.totalCoinsAllocated)}</td>
                <td className="num">{formatCoins(h.totalCoinsRedeemed)}</td>
                <td>
                  <Badge tone={h.isActive ? "ok" : undefined}>
                    {h.isActive ? "Live" : "Paused"}
                  </Badge>
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

      <Modal
        open={open}
        title="Register a hotel"
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Registering…" : "Register hotel"}
          </Button>
        }
      >
        {message && (
          <div className="notice-bad">
            {message}
          </div>
        )}

        <Field label="Hotel name" error={errors.name}>
          <Input
            value={form.name}
            onChange={change("name")}
            error={errors.name}
            placeholder="Novotel Juhu"
          />
        </Field>
        <Field label="City" error={errors.city}>
          <Input value={form.city} onChange={change("city")} placeholder="Mumbai" />
        </Field>
        <Field label="Address" error={errors.address}>
          <Input value={form.address} onChange={change("address")} />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={form.phone} onChange={change("phone")} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={change("email")} error={errors.email} />
        </Field>
        <Field
          label="Earn rate"
          hint="Coins = room amount × nights × this percentage"
          error={errors.earnRatePercent}
        >
          <Slider
            min={0}
            max={100}
            unit="%"
            value={form.earnRatePercent}
            onChange={change("earnRatePercent")}
            error={errors.earnRatePercent}
          />
        </Field>
      </Modal>
    </div>
  );
};

export default HotelsPage;
