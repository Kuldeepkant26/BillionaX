import { CONTENT_KINDS } from "./constants.js";

/**
 * The privileges every new hotel starts with.
 *
 * Seeded per hotel rather than served as a global list, so a manager can edit
 * the wording, restrict one to Gold, or hide it — and only their property is
 * affected. `tiers` is deliberately omitted: a new hotel's perks apply to
 * every member until someone decides otherwise.
 *
 * The images are stock photography hotlinked from Unsplash. They are a
 * placeholder until Cloudinary lands and hotels upload their own; a hotel that
 * sets its own imageUrl overrides these with no code change.
 */
export const DEFAULT_PRIVILEGES = Object.freeze([
  {
    title: "Breakfast",
    valueLabel: "Included",
    description: "Buffet breakfast for two, every morning of your stay.",
    outlet: "Restaurant",
    imageUrl: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=70",
  },
  {
    title: "Happy hour",
    valueLabel: "Till 8pm",
    description: "Two-for-one on house pours at the bar, daily.",
    outlet: "Bar",
    imageUrl: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800&q=70",
  },
  {
    title: "Spa",
    valueLabel: "20% off",
    description: "A fifth off every treatment, weekdays.",
    outlet: "Spa",
    imageUrl: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=70",
  },
  {
    title: "Late checkout",
    valueLabel: "Till 2pm",
    description: "Keep the room two hours longer, subject to availability.",
    outlet: "Rooms",
    imageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=70",
  },
]);

/** Shaped for Content.insertMany — kind and hotelId are applied here. */
export const buildDefaultPrivileges = (hotelId) =>
  DEFAULT_PRIVILEGES.map((privilege, index) => ({
    ...privilege,
    hotelId,
    kind: CONTENT_KINDS.PRIVILEGE,
    isActive: true,
    sortOrder: index,
  }));
