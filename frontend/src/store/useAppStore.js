import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice } from "./slices/authSlice.js";
import { createHotelSlice } from "./slices/hotelSlice.js";
import { createUiSlice } from "./slices/uiSlice.js";
import { createThemeSlice } from "./slices/themeSlice.js";
import { createNotificationSlice } from "./slices/notificationSlice.js";
import { createBillSlice } from "./slices/billSlice.js";
import { createFeedSlice } from "./slices/feedSlice.js";
import { createSupportSlice } from "./slices/supportSlice.js";

export const useAppStore = create()(
  devtools(
    persist(
      (...args) => ({
        ...createAuthSlice(...args),
        ...createHotelSlice(...args),
        ...createUiSlice(...args),
        ...createThemeSlice(...args),
        ...createNotificationSlice(...args),
        ...createBillSlice(...args),
        // Contributes nothing to partialize, on purpose — see feedSlice.js.
        ...createFeedSlice(...args),
        // Also contributes nothing to partialize — see supportSlice.js for why
        // feedEnabled in particular must not be persisted.
        ...createSupportSlice(...args),
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
          // Persisted for the same first-frame reason as cardDesign: without
          // it every reload of the panel flashes the fallback brand line
          // before the hotel lands.
          staffHotel: state.staffHotel,
          activeHotelId: state.activeHotelId,
          guestTheme: state.guestTheme,
          // Persisted so the card paints in the admin's chosen design on the
          // first frame after a reload. Without it every refresh flashes the
          // default design until the memberships call lands.
          cardDesign: state.cardDesign,
          // Same first-frame rationale as cardDesign: the pre-paint script in
          // index.html reads this key to set data-accent before React loads.
          accent: state.accent,
          accentCustom: state.accentCustom,
          // Same again for the typeface: the pre-paint script reads this key
          // to set data-font, so without it every cold load renders one frame
          // in the default pairing before switching.
          font: state.font,
          sidebarCollapsed: state.sidebarCollapsed,
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
