import { useState } from "react";
import { Modal } from "../../components/common/index.jsx";
import { formatCoins } from "../../utils/format.js";
import { avatarUrl } from "../../utils/upload.js";

/**
 * The hotel's logo, falling back to its initial.
 *
 * Not every hotel has uploaded one, and an empty circle reads as an image that
 * failed to load — the initial makes the gap look intentional.
 */
const HotelMark = ({ hotel }) =>
  hotel?.logoUrl ? (
    <img className="w-[30px] h-[30px] rounded-full flex-none bg-[var(--hero)] object-cover grid place-items-center overflow-hidden font-display text-[13px] font-semibold text-white leading-none" src={avatarUrl(hotel.logoUrl, 60)} alt="" />
  ) : (
    <span className="w-[30px] h-[30px] rounded-full flex-none bg-[var(--hero)] object-cover grid place-items-center overflow-hidden font-display text-[13px] font-semibold text-white leading-none">
      {(hotel?.name || "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );

/** The "Switch" control — a guest can be a member at several hotels at once. */
export const HotelSwitcher = ({ memberships, activeHotelId, onSelect }) => {
  const [open, setOpen] = useState(false);

  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));
  const hotel = active?.hotelId;

  if (!hotel) return null;

  const multiple = memberships.length > 1;

  return (
    <>
      <button
        className="flex items-center gap-[11px] w-full bg-card border border-hairline rounded-full px-[9px] py-2 cursor-pointer disabled:cursor-default text-left text-ink"
        onClick={() => multiple && setOpen(true)}
        disabled={!multiple}
        aria-label={multiple ? "Switch hotel" : hotel.name}
      >
        <HotelMark hotel={hotel} />
        <span className="flex-1 min-w-0 leading-[1.25]">
          <b className="block text-[12.5px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap">{hotel.name}</b>
          <i className="not-italic text-[10px] text-muted capitalize">{hotel.city || "Member"}</i>
        </span>
        {multiple && (
          <span className="text-[10.5px] font-semibold text-accent pr-2 flex-none">Switch</span>
        )}
      </button>

      <Modal open={open} title="Your hotels" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-2">
          {memberships.map((m) => {
            const isActive = String(m.hotelId?._id) === String(activeHotelId);
            return (
              <button
                key={m._id}
                className={`flex items-center gap-[11px] w-full border rounded-token-sm p-[11px] cursor-pointer text-left text-ink hover:border-accent ${
                  isActive ? "border-accent bg-[var(--soft)]" : "bg-card border-hairline"
                }`}
                onClick={() => {
                  onSelect(m.hotelId._id);
                  setOpen(false);
                }}
              >
                <HotelMark hotel={m.hotelId} />
                <span className="flex-1 min-w-0 leading-[1.25]">
                  <b className="block text-[12.5px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap">{m.hotelId.name}</b>
                  <i className="not-italic text-[10px] text-muted capitalize">{m.tier.toLowerCase()}</i>
                </span>
                <span className="font-display text-[15px] font-semibold flex-none">{formatCoins(m.balance)}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
};
