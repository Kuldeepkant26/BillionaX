import { OUTLETS, TIERS } from "./constants.js";

/**
 * The services every hotel starts with.
 *
 * Seeded from OUTLETS — the list that used to be the only set of outlets in the
 * platform — so a hotel opens with the seven it always had and can then rename,
 * re-rate, hide or delete them, and add its own.
 *
 * THE CAP IS THE HOTEL'S OWN SILVER RATE, not a flat constant. Seeding a fixed
 * 10% would quietly cut a property running 30% caps the moment its staff began
 * tagging lines; seeding 0 would stop coins working everywhere until someone
 * configured each hotel. Starting at the rate the hotel's entry tier already
 * grants means nothing changes in practice on day one, and a manager tunes
 * upward from a floor they already chose.
 */
const DEFAULT_CAP_FALLBACK = 10;

/** Shaped for HotelService.insertMany — takes the hotel, not just its id. */
export const buildDefaultServices = (hotel) => {
  // `??`, never `||`: a hotel that has deliberately set Silver to 0 means it,
  // and promoting that to 10 would be the same bug this feature exists to stop.
  const cap = hotel?.tierCaps?.[TIERS.SILVER] ?? DEFAULT_CAP_FALLBACK;

  return OUTLETS.map((name, index) => ({
    hotelId: hotel._id,
    name,
    coinCapPercent: cap,
    isActive: true,
    sortOrder: index,
  }));
};
