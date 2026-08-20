/**
 * The guest's hotel context. `activeHotelId` drives the "Switch" control and is
 * read by the dashboard, the voucher panel and the API layer alike — which is
 * why it lives in the shared store rather than in a separate one.
 */
export const createHotelSlice = (set, get) => ({
  activeHotelId: null,
  memberships: [],

  /** Platform tier thresholds, used to show progress to the next tier. */
  tierThresholds: null,
  setTierThresholds: (tierThresholds) => set({ tierThresholds }),

  setMemberships: (memberships) => {
    const { activeHotelId } = get();
    const stillValid = memberships.some((m) => String(m.hotelId?._id) === String(activeHotelId));

    set({
      memberships,
      activeHotelId: stillValid ? activeHotelId : memberships[0]?.hotelId?._id || null,
    });
  },

  setActiveHotel: (hotelId) => set({ activeHotelId: hotelId }),

  activeMembership: () => {
    const { memberships, activeHotelId } = get();
    return memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId)) || null;
  },
});
