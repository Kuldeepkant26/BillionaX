import { useState } from "react";
import { Modal } from "../../components/common/index.jsx";
import { formatCoins } from "../../utils/format.js";
import { avatarUrl } from "../../utils/upload.js";
import styles from "./HotelSwitcher.module.css";

/**
 * The hotel's logo, falling back to its initial.
 *
 * Not every hotel has uploaded one, and an empty circle reads as an image that
 * failed to load — the initial makes the gap look intentional.
 */
const HotelMark = ({ hotel }) =>
  hotel?.logoUrl ? (
    <img className={styles.dot} src={avatarUrl(hotel.logoUrl, 60)} alt="" />
  ) : (
    <span className={styles.dot}>
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
        className={styles.bar}
        onClick={() => multiple && setOpen(true)}
        disabled={!multiple}
        aria-label={multiple ? "Switch hotel" : hotel.name}
      >
        <HotelMark hotel={hotel} />
        <span className={styles.meta}>
          <b>{hotel.name}</b>
          <i>{hotel.city || "Member"}</i>
        </span>
        {multiple && <span className={styles.action}>Switch</span>}
      </button>

      <Modal open={open} title="Your hotels" onClose={() => setOpen(false)}>
        <div className={styles.list}>
          {memberships.map((m) => {
            const isActive = String(m.hotelId?._id) === String(activeHotelId);
            return (
              <button
                key={m._id}
                className={`${styles.item} ${isActive ? styles.itemOn : ""}`}
                onClick={() => {
                  onSelect(m.hotelId._id);
                  setOpen(false);
                }}
              >
                <HotelMark hotel={m.hotelId} />
                <span className={styles.meta}>
                  <b>{m.hotelId.name}</b>
                  <i>{m.tier.toLowerCase()}</i>
                </span>
                <span className={styles.bal}>{formatCoins(m.balance)}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
};
