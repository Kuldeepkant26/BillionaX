import PanelLayout from "./PanelLayout.jsx";
import { ROUTES } from "../../constants/routePaths.js";
import { ROLES } from "../../store/slices/authSlice.js";

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
    to: ROUTES.HOTEL_VERIFY,
    label: "Verify code",
    icon: "M9 3a6 6 0 1 0 3.4 10.9l3.9 3.9 1.4-1.4-3.9-3.9A6 6 0 0 0 9 3zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  },
  {
    to: ROUTES.HOTEL_MEMBERS,
    label: "Members",
    icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z",
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
    to: ROUTES.HOTEL_CONTENT,
    label: "Content",
    roles: ADMIN,
    icon: "M2.5 4.5h15v11h-15zm2 8l3-3 2.5 2.5L14 8l2 2.5v3h-11zM7 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
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
    to: ROUTES.HOTEL_SETTINGS,
    label: "Settings",
    roles: ADMIN,
    icon: "M10 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM9.2 2h1.6l.3 2a6 6 0 0 1 1.5.9l1.9-.8 1 1.7-1.5 1.3a6 6 0 0 1 0 1.8l1.5 1.3-1 1.7-1.9-.8a6 6 0 0 1-1.5.9l-.3 2H9.2l-.3-2a6 6 0 0 1-1.5-.9l-1.9.8-1-1.7 1.5-1.3a6 6 0 0 1 0-1.8L4.5 5.8l1-1.7 1.9.8a6 6 0 0 1 1.5-.9z",
  },
];

const HotelPanelLayout = () => (
  <PanelLayout brand="Hotel panel" subtitle="Billionax" nav={NAV} />
);

export default HotelPanelLayout;
