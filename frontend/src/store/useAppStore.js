import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice } from "./slices/authSlice.js";
import { createHotelSlice } from "./slices/hotelSlice.js";
import { createUiSlice } from "./slices/uiSlice.js";
import { createThemeSlice } from "./slices/themeSlice.js";
import { createNotificationSlice } from "./slices/notificationSlice.js";

export const useAppStore = create()(
  devtools(
    persist(
      (...args) => ({
        ...createAuthSlice(...args),
        ...createHotelSlice(...args),
        ...createUiSlice(...args),
        ...createThemeSlice(...args),
        ...createNotificationSlice(...args),
      }),
      {
        name: "gw-storage",

        // accessToken MUST be persisted. Without it a page refresh restores
        // isAuthenticated: true with no token, so the UI looks signed in while
        // every request 401s.
        // This allowlist is exhaustive — anything omitted is forgotten on
        // reload. guestTheme is here because a theme toggle that resets itself
        // on refresh is indistinguishable from a broken one.
        partialize: (state) => ({
          user: state.user,
          accessToken: state.accessToken,
          isAuthenticated: state.isAuthenticated,
          activeHotelId: state.activeHotelId,
          guestTheme: state.guestTheme,
        }),

        // Persisted state means the session is already known — skip the
        // bootstrapping flash on reload.
        onRehydrateStorage: () => (state) => state?.finishBootstrap?.(),
      }
    )
  )
);

/** Non-reactive read, for use inside the axios interceptors. */
export const getAppState = () => useAppStore.getState();
