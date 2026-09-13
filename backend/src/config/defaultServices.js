import { OUTLETS, TIERS } from "./constants.js";

/**
 * The services every hotel starts with.
 *
 * Seeded from OUTLETS — the list that used to be the only set of outlets in the
 * platform — so a hotel opens with the seven it always had and can then rename,
 * re-rate, hide or delete them, and add its own.
 *
 * THE CAPS ARE THE HOTEL'S OWN TIER RATES, not flat constants. Seeding a fixed
 * 10% would quietly cut a property running 30% caps the moment its staff began
 * tagging lines; seeding 0 would stop coins working everywhere until someone
 * configured each hotel. Copying each tier's existing rate means nothing changes
 * in practice on day one — a Platinum guest keeps their Platinum allowance —
 * and a manager tunes from a floor they already chose.
 */
const DEFAULT_CAP_FALLBACK = 10;

/** Shaped for HotelService.insertMany — takes the hotel, not just its id. */
export const buildDefaultServices = (hotel) => {
  // `??` throughout, never `||`: a hotel that has deliberately set a tier to 0
  // means it, and promoting that to 10 would be the same bug this whole feature
  // exists to stop.
  const capFor = (tier) => hotel?.tierCaps?.[tier] ?? DEFAULT_CAP_FALLBACK;

  return OUTLETS.map((name, index) => ({
    hotelId: hotel._id,
    name,
    // Each tier seeds at the rate that tier already gets, so a new hotel's
    // services start out matching the allowance its guests would have had
    // anyway — including the higher rates Gold and Platinum already enjoy.
    coinCaps: {
      [TIERS.SILVER]: capFor(TIERS.SILVER),
      [TIERS.GOLD]: capFor(TIERS.GOLD),
      [TIERS.PLATINUM]: capFor(TIERS.PLATINUM),
    },
    isActive: true,
    sortOrder: index,
  }));
};
