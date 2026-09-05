import { invalidateCache } from "../../hooks/asyncCache.js";

export const ROLES = {
  MAIN_ADMIN: "MAIN_ADMIN",
  HOTEL_ADMIN: "HOTEL_ADMIN",
  HOTEL_STAFF: "HOTEL_STAFF",
  GUEST: "GUEST",
};

export const createAuthSlice = (set, get) => ({
  user: null,
  accessToken: null,

  /**
   * The hotel a staff user works at — name and logo only, for the panel's
   * brand line. Null for guests and the main admin, who are not tied to one.
   */
  staffHotel: null,
  setStaffHotel: (staffHotel) => set({ staffHotel }),

  isAuthenticated: false,
  // Distinguishes "not logged in" from "haven't checked yet", so guards don't
  // bounce an authenticated user during the initial session restore.
  isBootstrapping: true,

  setAuth: ({ user, accessToken }) =>
    set({ user, accessToken, isAuthenticated: !!user, isBootstrapping: false }),

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setAccessToken: (accessToken) => set({ accessToken }),

  finishBootstrap: () => set({ isBootstrapping: false }),

  logout: () => {
    // Wipe the request cache BEFORE clearing auth. It holds other people's
    // personal data (member names, phone numbers, bills), and on a shared
    // front-desk machine the next person to log in must not be shown the
    // previous user's cached screens.
    invalidateCache();

    set({
      user: null,
      accessToken: null,
      staffHotel: null,
      isAuthenticated: false,
      isBootstrapping: false,
      activeHotelId: null,
      memberships: [],
      pendingBills: [],
      popupBill: null,
    });
  },

  hasRole: (...roles) => roles.includes(get().user?.role),
});
