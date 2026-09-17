/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { hotelChatUnreadCount } from "../api/guest.api.js";
import { useSupportRealtime } from "./useSupportRealtime.js";
import { useAppStore } from "../store/useAppStore.js";
import { useLocation } from "react-router-dom";

/**
 * Keeps the Help dot honest for a guest's HOTEL conversations.
 *
 * This hook is the fix for a real hole rather than a refinement. The guest app
 * had exactly one support badge, useSupportBadge, and it counts the platform
 * thread — so when the front desk replied, the message arrived on the socket,
 * was correctly filtered OUT as another channel, and nothing counted it. The
 * Help tab stayed dark until the guest happened to open the screen.
 *
 * The Alerts badge did move, because sendFromHotel also writes a notification
 * row. That made the gap easy to miss in testing: something lit up, just not
 * the tab the conversation is behind.
 *
 * Per-property counts rather than one number, because a guest belongs to
 * several hotels and the Help screen dots each row. The bottom nav shows the
 * derived total — see selectHotelUnreadTotal.
 *
 * Mounted in GuestLayout beside useSupportBadge: the dot has to be right on
 * every screen, which is the whole reason it lives in the shell.
 */
export const useGuestHotelChatBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setHotelUnread = useAppStore((s) => s.setHotelUnread);
  const bumpHotelUnread = useAppStore((s) => s.bumpHotelUnread);
  const { pathname } = useLocation();

  const enabled = isAuthenticated && role === "GUEST";

  const sync = () => {
    if (!enabled) return;
    hotelChatUnreadCount()
      .then((data) => {
        if (data?.byHotel) setHotelUnread(data.byHotel);
      })
      .catch(() => {
        // A badge is not worth a visible failure.
      });
  };

  useEffect(() => {
    sync();
  }, [enabled]);

  useSupportRealtime({
    // Every hotel thread this guest has. No hotelId filter, deliberately —
    // unlike a chat SCREEN, which watches one property, this badge counts them
    // all and uses the payload's hotelId to decide which one to raise.
    party: "HOTEL_GUEST",
    onMessage: (payload) => {
      // ADMIN is the side that answers, which on this channel is the hotel.
      // The guest's own message is echoed back so a second device stays in
      // step, and counting it would dot the tab for what they just typed.
      if (payload?.message?.sender !== "ADMIN") return;

      // Not counted while the guest is reading THAT hotel's thread. Scoped to
      // the property rather than the route prefix: a guest reading hotel A
      // must still be told that hotel B replied.
      if (pathname === `/app/help/hotel/${payload.hotelId}`) return;

      bumpHotelUnread(payload.hotelId);
    },
    onResync: sync,
  });
};
