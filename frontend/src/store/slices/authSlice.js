export const ROLES = {
  MAIN_ADMIN: "MAIN_ADMIN",
  HOTEL_ADMIN: "HOTEL_ADMIN",
  HOTEL_STAFF: "HOTEL_STAFF",
  GUEST: "GUEST",
};

export const createAuthSlice = (set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  // Distinguishes "not logged in" from "haven't checked yet", so guards don't
  // bounce an authenticated user during the initial session restore.
  isBootstrapping: true,

  setAuth: ({ user, accessToken }) =>
    set({ user, accessToken, isAuthenticated: !!user, isBootstrapping: false }),

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setAccessToken: (accessToken) => set({ accessToken }),

  finishBootstrap: () => set({ isBootstrapping: false }),

  logout: () =>
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isBootstrapping: false,
      activeHotelId: null,
      memberships: [],
      activeVoucher: null,
    }),

  hasRole: (...roles) => roles.includes(get().user?.role),
});
