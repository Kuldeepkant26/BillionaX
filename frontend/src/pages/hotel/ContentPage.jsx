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
import { ImagePicker } from "../../features/panel/ImagePicker.jsx";
import { VideoPicker } from "../../features/panel/VideoPicker.jsx";
import { videoPoster } from "../../utils/upload.js";
import { OfferArt } from "../../features/guest/OfferArt.jsx";
import { offerState } from "./offerState.js";
import { KINDS } from "./guestContentKinds.js";
import styles from "./ContentPage.module.css";

const BLANK = {
  title: "",
  description: "",
  imageUrl: "",
  videoUrl: "",
  duration: "",
  outlet: "",
  isActive: true,
  // OFFER only — ignored by the other kinds (see config.offerFields).
  discountLabel: "",
  terms: "",
  howToRedeem: "",
  validFrom: "",
  validTo: "",
  tiers: [],
};

const TIERS = ["SILVER", "GOLD", "PLATINUM"];

/** <input type="date"> wants YYYY-MM-DD; the API sends an ISO timestamp. */
const toDateInput = (value) => (value ? String(value).slice(0, 10) : "");

const ContentPage = ({ kind = "slideshow" }) => {
  const config = KINDS[kind] || KINDS.slideshow;
  const api = config.api;
  const isVideo = config.media === "video";
  const isOffer = Boolean(config.offerFields);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  // `kind` is baked into api.list by the config above, so it is not a filter.
  //
  // `state` is one select in the UI but three booleans on the API, so it is
  // translated here rather than teaching the backend a fourth vocabulary.
  const list = usePaginatedList(
    (params) => {
      const { state, ...rest } = params;
      return api.list({
        ...rest,
        currentlyValid: state === "live" ? true : undefined,
        scheduled: state === "scheduled" ? true : undefined,
        expired: state === "expired" ? true : undefined,
      });
    },
    { limit: 12, filters: { isActive: "", state: "" } }
  );
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
      discountLabel: item.discountLabel || "",
      terms: item.terms || "",
      howToRedeem: item.howToRedeem || "",
      validFrom: toDateInput(item.validFrom),
      validTo: toDateInput(item.validTo),
      // Untargeted rows come back with no `tiers` key at all, so this fallback
      // is what stops toggleTier's .includes() throwing on the first click.
      tiers: item.tiers || [],
    });
    setErrors({});
    setMessage("");
    setOpen(true);
  };

  /**
   * Duplicate: the same content, no dates, as a NEW row.
   *
   * This is what makes the 7-day grace period useful rather than merely a
   * delay — the point of keeping an expired offer around is to run it again.
   */
  const startDuplicate = (item) => {
    startEdit(item);
    setEditing(null);
    setForm((f) => ({ ...f, title: `${item.title} (copy)`, validFrom: "", validTo: "" }));
  };

  const toggleTier = (tier) =>
    setForm((f) => ({
      ...f,
      tiers: f.tiers.includes(tier) ? f.tiers.filter((t) => t !== tier) : [...f.tiers, tier],
    }));

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");

    // A video with no file is an empty player in the guest's feed, so it is
    // caught here rather than saved and discovered later.
    if (isVideo && !form.videoUrl) {
      setBusy(false);
      return setErrors({ videoUrl: "Upload a video first" });
    }

    try {
      // On CREATE an empty field is simply absent. On EDIT it must be sent as
      // "" — that is the API's "remove it" signal, and mapping it to undefined
      // made Remove a no-op because Mongoose drops undefined keys.
      const blank = editing ? "" : undefined;
      const {
        discountLabel,
        terms,
        howToRedeem,
        validFrom,
        validTo,
        tiers,
        ...shared
      } = form;

      const payload = {
        ...shared,
        imageUrl: form.imageUrl || blank,
        videoUrl: form.videoUrl || blank,
        duration: form.duration || blank,
        // Only offers carry these; sending them on a slideshow photo would
        // stamp fields onto a row that has no use for them.
        ...(isOffer
          ? {
              discountLabel: discountLabel || blank,
              terms: terms || blank,
              howToRedeem: howToRedeem || blank,
              // Dates take null, NOT "". An empty string slips past
              // optional({values:"falsy"}) and then Mongoose casts it into a
              // Date field and throws — null is what actually clears one.
              validFrom: validFrom || (editing ? null : undefined),
              validTo: validTo || (editing ? null : undefined),
              // Always sent as an array: [] is the meaningful "every tier"
              // value, and dropping it would make un-targeting impossible.
              tiers,
            }
          : null),
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-[19px] tracking-[-0.3px]">{config.title}</h2>
          <p className="mt-0.5 text-xs text-muted">{config.subtitle}</p>
        </div>
        <Button onClick={startNew}>Add {config.singular}</Button>
      </div>

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Select
          value={list.filters.isActive}
          onChange={(e) => list.setFilter("isActive", e.target.value)}
        >
          <option value="">All</option>
          <option value="true">Published</option>
          <option value="false">Hidden</option>
        </Select>

        {/* Orthogonal to Published/Hidden: an offer can be hidden AND expired.
            The three states map to the API's date filters. */}
        {isOffer && (
          <Select
            value={list.filters.state}
            onChange={(e) => list.setFilter("state", e.target.value)}
          >
            <option value="">Any date</option>
            <option value="live">Running now</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
          </Select>
        )}
      </FilterBar>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={run} />
      ) : !items.length ? (
        <Card>
          <Empty title={config.empty} hint={config.emptyHint} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
            {items.map((item) => {
              // A video without its own cover still gets art: the poster is a
              // frame Cloudinary renders from the clip itself.
              const art = item.imageUrl || videoPoster(item.videoUrl, 480);
              // Offers show exactly what the guest will, fallback art included.
              const state = isOffer ? offerState(item) : null;

              return (
                <Card key={item._id} className="overflow-hidden p-0">
                  {isOffer ? (
                    <OfferArt offer={item} size="card" />
                  ) : (
                    <span
                      className={`relative block h-[132px] ${styles.img}`}
                      style={art ? { backgroundImage: `url(${art})` } : undefined}
                    >
                      {isVideo && (
                        <>
                          <i className={styles.play} aria-hidden="true" />
                          {item.duration && <em className={styles.dur}>{item.duration}</em>}
                        </>
                      )}
                    </span>
                  )}
                  <div className="p-3.5">
                    <div className="between">
                      <b className="font-display text-[14.5px] font-semibold">{item.title}</b>
                      <Badge tone={state ? state.tone : item.isActive ? "ok" : undefined}>
                        {state ? state.label : item.isActive ? "Live" : "Hidden"}
                      </Badge>
                    </div>
                    {state?.note && (
                      <p
                        className={`mt-1 text-[11px] ${
                          state.state === "expired" ? "font-semibold text-[var(--bad)]" : "text-muted"
                        }`}
                      >
                        {state.note}
                      </p>
                    )}
                    {item.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-[1.5] text-muted">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-[7px]">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                        Edit
                      </Button>
                      {isOffer && (
                        <Button size="sm" variant="ghost" onClick={() => startDuplicate(item)}>
                          Duplicate
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(item)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
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
        title={editing ? `Edit ${config.singular}` : `Add ${config.singular}`}
        onClose={() => setOpen(false)}
        footer={
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        }
      >
        {message && <div className="notice-bad">{message}</div>}

        {/* The video comes first on a video: it is the point of the record,
            and the fields below describe it. */}
        {isVideo && (
          <>
            <VideoPicker
              label="Video"
              hint="MP4, MOV or WEBM, up to 100MB."
              value={form.videoUrl}
              onChange={(url) => setForm((f) => ({ ...f, videoUrl: url }))}
              // Read from the file itself, so the badge is right without
              // anyone typing it. Still editable below.
              onDurationDetected={(duration) => setForm((f) => ({ ...f, duration }))}
              getSignature={hotelApi.createContentVideoUpload}
            />
            {errors.videoUrl && <span className="err -mt-2 mb-3 block">{errors.videoUrl}</span>}
          </>
        )}

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
          label={isVideo ? "Cover image" : "Image"}
          hint={config.imageHint}
          aspect="wide"
          value={form.imageUrl}
          onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
          getSignature={hotelApi.createContentUpload}
        />

        {isVideo && form.videoUrl && (
          <Field
            label="Duration"
            hint="Detected from the video — shown on the card."
            error={errors.duration}
          >
            <Input value={form.duration} onChange={change("duration")} placeholder="1:20" />
          </Field>
        )}

        {isOffer && (
          <>
            <Field
              label="Discount"
              hint="Shown large on the offer card, and in place of a photo if you do not upload one."
              error={errors.discountLabel}
            >
              <Input
                value={form.discountLabel}
                onChange={change("discountLabel")}
                error={errors.discountLabel}
                placeholder="30% off"
                maxLength={24}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" hint="Leave empty to start now." error={errors.validFrom}>
                <Input type="date" value={form.validFrom} onChange={change("validFrom")} />
              </Field>
              <Field
                label="Ends"
                hint="Guests stop seeing it at the deadline. It stays here for 7 days, then it and its image are deleted."
                error={errors.validTo}
              >
                <Input
                  type="date"
                  value={form.validTo}
                  onChange={change("validTo")}
                  error={errors.validTo}
                />
              </Field>
            </div>

            <Field
              label="Available to"
              hint="Leave all unticked to show this to every member."
              error={errors.tiers || errors["tiers[0]"]}
            >
              <div className="flex flex-wrap gap-3.5">
                {TIERS.map((tier) => (
                  <label
                    key={tier}
                    className="flex cursor-pointer items-center gap-[7px] text-[12.5px] text-ink"
                  >
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

            <Field label="How to claim" error={errors.howToRedeem}>
              <Input
                value={form.howToRedeem}
                onChange={change("howToRedeem")}
                error={errors.howToRedeem}
                placeholder="Show this screen at the host desk."
              />
            </Field>

            <Field label="Terms & conditions" hint="Shown collapsed under the offer." error={errors.terms}>
              <textarea
                className="input"
                rows={3}
                value={form.terms}
                onChange={change("terms")}
              />
            </Field>
          </>
        )}

        <Field label="Outlet" error={errors.outlet}>
          <Input value={form.outlet} onChange={change("outlet")} placeholder="Restaurant" />
        </Field>

        <label className="flex cursor-pointer items-center gap-[9px] text-[13px]">
          <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
          Visible to guests
        </label>
      </Modal>
    </div>
  );
};

export default ContentPage;
