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
import styles from "./ContentPage.module.css";

const BLANK = {
  title: "",
  description: "",
  imageUrl: "",
  videoUrl: "",
  duration: "",
  outlet: "",
  isActive: true,
};

/** Content and offers share a shape, so one page drives both via `kind`. */
const ContentPage = ({ kind = "content" }) => {
  const isOffer = kind === "offers";
  const api = {
    list: isOffer ? hotelApi.listOffers : hotelApi.listContents,
    create: isOffer ? hotelApi.createOffer : hotelApi.createContent,
    update: isOffer ? hotelApi.updateOffer : hotelApi.updateContent,
    remove: isOffer ? hotelApi.deleteOffer : hotelApi.deleteContent,
  };

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  // `kind` is baked into api.list by the parent, so it is not a filter here.
  const list = usePaginatedList(api.list, { limit: 12, filters: { isActive: "" } });
  const { loading, error, run } = list;

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
      title: item.title || "",
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      videoUrl: item.videoUrl || "",
      duration: item.duration || "",
      outlet: item.outlet || "",
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
        imageUrl: form.imageUrl || undefined,
        videoUrl: form.videoUrl || undefined,
        duration: form.duration || undefined,
      };
      if (editing) await api.update(editing._id, payload);
      else await api.create(payload);

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

  const remove = async (item) => {
    try {
      await api.remove(item._id);
      toastSuccess("Deleted");
      run();
    } catch (err) {
      toastError(err.message);
    }
  };

  const items = list.items;

  return (
    <div>
      <PageHead
        title={isOffer ? "Offers" : "Content"}
        subtitle={
          isOffer
            ? "Promotions guests see in their app"
            : "Photos and videos guests see during their stay"
        }
        actions={<Button onClick={startNew}>Add {isOffer ? "offer" : "content"}</Button>}
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
            title={`No ${isOffer ? "offers" : "content"} yet`}
            hint="Add something for guests to see in their app."
          />
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
          {items.map((item) => (
            <Card key={item._id} className="p-0 overflow-hidden">
              <span
                className={`block h-[132px] ${styles.img}`}
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
              />
              <div className="p-3.5">
                <div className="between">
                  <b className="font-display text-[14.5px] font-semibold">{item.title}</b>
                  <Badge tone={item.isActive ? "ok" : undefined}>
                    {item.isActive ? "Live" : "Hidden"}
                  </Badge>
                </div>
                {item.description && (
                  <p className="text-xs text-muted leading-[1.5] mt-1.5 line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex gap-[7px] mt-3">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(item)}>
                    Delete
                  </Button>
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
        title={editing ? "Edit" : `Add ${isOffer ? "offer" : "content"}`}
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        }
      >
        {message && <div className="notice-bad">{message}</div>}

        <Field label="Title" error={errors.title}>
          <Input value={form.title} onChange={change("title")} error={errors.title} />
        </Field>

        <Field label="Description" error={errors.description}>
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={change("description")}
          />
        </Field>

        <ImagePicker
          label="Image"
          hint={
            isOffer
              ? "Shown on the offer card."
              : "Shown in the slideshow on the guest's home screen."
          }
          aspect="wide"
          value={form.imageUrl}
          onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
          getSignature={hotelApi.createContentUpload}
        />

        <Field
          label="Video URL"
          hint="Optional. Adds a play button to the card. File uploads are coming later."
          error={errors.videoUrl}
        >
          <Input
            value={form.videoUrl}
            onChange={change("videoUrl")}
            error={errors.videoUrl}
            placeholder="https://…"
          />
        </Field>

        {form.videoUrl && (
          <Field label="Duration" hint="Shown on the card, e.g. 1:20" error={errors.duration}>
            <Input value={form.duration} onChange={change("duration")} placeholder="1:20" />
          </Field>
        )}

        <Field label="Outlet" error={errors.outlet}>
          <Input value={form.outlet} onChange={change("outlet")} placeholder="Restaurant" />
        </Field>

        <label className="flex items-center gap-[9px] text-[13px] cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
          Visible to guests
        </label>
      </Modal>
    </div>
  );
};

export default ContentPage;
