import PanelLayout from "./PanelLayout.jsx";
import { ROUTES } from "../../constants/routePaths.js";
import { ROLES } from "../../store/slices/authSlice.js";
import { useHotelSupportBadge } from "../../hooks/useHotelSupportBadge.js";
import { useHotelGuestChatsBadge } from "../../hooks/useHotelGuestChatsBadge.js";

// Hotel-admin-only nav items. MAIN_ADMIN never reaches this panel — they work
// from the admin panel, which targets a specific hotel.
const ADMIN = [ROLES.HOTEL_ADMIN];

const NAV = [
  {
    to: ROUTES.HOTEL,
    label: "Dashboard",
    end: true,
    roles: ADMIN,
    icon: "M2.5 2.5h6.5v6.5H2.5zM11 2.5h6.5v4H11zM11 8.5h6.5v9H11zM2.5 11h6.5v6.5H2.5z",
  },
  {
    to: ROUTES.HOTEL_BILL,
    label: "Bill a guest",
    icon: "M9 3a6 6 0 1 0 3.4 10.9l3.9 3.9 1.4-1.4-3.9-3.9A6 6 0 0 0 9 3zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  },
  {
    to: ROUTES.HOTEL_MEMBERS,
    label: "Members",
    icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z",
  },
  {
    // No `roles` key, deliberately: this is the front desk's queue, and the
    // whole point of the channel is that whoever is on shift can answer
    // without waiting for a manager to relay it.
    //
    // High in the rail, beside the other guest-facing work, rather than down
    // with "Contact Billionax" — that one is an account-level question about
    // the platform; this is a guest in the building waiting on a reply.
    to: ROUTES.HOTEL_GUEST_CHATS,
    label: "Guest messages",
    badge: "guestChats",
    // An envelope, distinct from the speech bubble that means the platform
    // conversation. Filled, like every icon here — PanelLayout renders these
    // with no stroke, so a line-drawn path would come out invisible.
    icon: "M2.5 4.5h15v11h-15zm1.6 1.4L10 10.4l5.9-4.5v-.4H4.1z",
  },
  {
    to: ROUTES.HOTEL_TRANSACTIONS,
    label: "Transactions",
    icon: "M3 6h9l-2.5-2.5L11 2l5 5-5 5-1.5-1.5L12 8H3zm14 8H8l2.5 2.5L9 18l-5-5 5-5 1.5 1.5L8 12h9z",
  },
  {
    to: ROUTES.HOTEL_COINS,
    label: "Coins",
    roles: ADMIN,
    icon: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm.9 12.4v1.1H9.3v-1.1c-1.2-.2-2.2-.9-2.3-2.2h1.7c.1.6.6 1 1.4 1 .8 0 1.3-.4 1.3-1 0-.5-.3-.8-1.5-1.1-1.7-.4-2.7-1-2.7-2.4 0-1.2.9-2 2.1-2.2V5.4h1.6v1.1c1.2.2 2 1 2.1 2.1h-1.7c-.1-.5-.5-.9-1.2-.9-.7 0-1.2.3-1.2.9 0 .5.4.7 1.6 1 1.7.4 2.6 1.1 2.6 2.5 0 1.2-.9 2.1-2.2 2.3z",
  },
  {
    // One destination for the slideshow, the offers and the videos. They are
    // three separate things, but they are all "what guests see", and as three
    // top-level entries they read as unrelated — offers did not even have one.
    to: ROUTES.HOTEL_CONTENT,
    label: "Guest content",
    roles: ADMIN,
    icon: "M2.5 4.5h15v11h-15zm2 8l3-3 2.5 2.5L14 8l2 2.5v3h-11zM7 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
  },
  {
    // No `roles` key, unlike its neighbours: staff post to the network feed as
    // themselves, so the tab is theirs too. What changes with role is the scope
    // of the list inside, which the server decides from the token.
    to: ROUTES.HOTEL_FEED,
    label: "Feed",
    // Gone from the rail while the main admin has the feed switched off —
    // there is nowhere for these posts to appear, so offering the composer
    // would be inviting staff to write into a void.
    feature: "feed",
    icon: "M6.5 3.2h10.3a1 1 0 0 1 1 1v9.3M3.2 6.5v9.8a1 1 0 0 0 1 1h9.8a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1H4.2a1 1 0 0 0-1 1zm2.1 8.4 2.8-3.1 1.9 2 1.7-1.8 1.6 1.7",
  },
  {
    // Next to Privileges rather than in Settings: this is a list a manager
    // edits row by row, not a form they apply in one go.
    to: ROUTES.HOTEL_SERVICES,
    label: "Services",
    roles: ADMIN,
    // Filled, like every icon here — PanelLayout renders these with no stroke,
    // so a line-drawn path would come out invisible.
    icon: "M2.6 3.4h6.2v6.2H2.6zm8.6 0h6.2v6.2h-6.2zM2.6 11.4h6.2v5.2H2.6zm8.6 0h6.2v5.2h-6.2z",
  },
  {
    to: ROUTES.HOTEL_PRIVILEGES,
    label: "Privileges",
    roles: ADMIN,
    icon: "M10 2.2l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.5 7.7l5.2-.8z",
  },
  {
    to: ROUTES.HOTEL_STAFF,
    label: "Staff",
    roles: ADMIN,
    icon: "M7 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm7 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM1.5 17c.5-3 2.7-5.2 5.5-5.2S12 14 12.5 17zm12.2 0c-.3-1.8-1-3.3-2.1-4.4.7-.3 1.5-.4 2.4-.4 2.2 0 3.8 1.6 4.2 4.8z",
  },
  {
    // Last but one, next to Settings: this is where a manager goes with a
    // question about the platform itself rather than about a guest in the
    // building, so it belongs with the account-level items.
    // `badge` names the count PanelLayout draws — see useHotelSupportBadge.
    to: ROUTES.HOTEL_SUPPORT,
    label: "Contact Billionax",
    roles: ADMIN,
    badge: "support",
    // A speech bubble with three dots, filled like every icon here — the same
    // mark the admin panel uses for its own Support tab, because it is the
    // other end of the same conversation.
    icon: "M10 3c-4 0-7.2 2.5-7.2 5.6 0 1.8 1 3.4 2.7 4.5L4.4 17l3.6-2a9.9 9.9 0 0 0 2 .2c4 0 7.2-2.5 7.2-5.6S14 3 10 3zM6.6 9.8a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm3.4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm3.4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z",
  },
  {
    to: ROUTES.HOTEL_SETTINGS,
    label: "Settings",
    roles: ADMIN,
    icon: "M10 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM9.2 2h1.6l.3 2a6 6 0 0 1 1.5.9l1.9-.8 1 1.7-1.5 1.3a6 6 0 0 1 0 1.8l1.5 1.3-1 1.7-1.9-.8a6 6 0 0 1-1.5.9l-.3 2H9.2l-.3-2a6 6 0 0 1-1.5-.9l-1.9.8-1-1.7 1.5-1.3a6 6 0 0 1 0-1.8L4.5 5.8l1-1.7 1.9.8a6 6 0 0 1 1.5-.9z",
  },
];

// showHotel swaps the static brand line for this hotel's own logo and name;
// "Hotel panel" stays as the fallback until the hotel loads.
const HotelPanelLayout = () => {
  // Mounted here rather than in PanelLayout: the admin panel shares that shell
  // and counts a different queue entirely.
  useHotelSupportBadge();
  // Mounted right beside it, and for the same reason: a badge hook that nothing
  // calls is a hook that silently never runs.
  useHotelGuestChatsBadge();

  return <PanelLayout brand="Hotel panel" subtitle="Billionax" nav={NAV} showHotel />;
};

export default HotelPanelLayout;
