import PanelLayout from "./PanelLayout.jsx";
import { ROUTES } from "../../constants/routePaths.js";

const NAV = [
  {
    to: ROUTES.ADMIN,
    label: "Dashboard",
    end: true,
    icon: "M2.5 2.5h6.5v6.5H2.5zM11 2.5h6.5v4H11zM11 8.5h6.5v9H11zM2.5 11h6.5v6.5H2.5z",
  },
  {
    to: ROUTES.ADMIN_HOTELS,
    label: "Hotels",
    icon: "M3 17V6l7-3.5L17 6v11h-5v-5H8v5zm2-2h1v-3h2v3h1V7.2l-2-1-2 1z",
  },
  {
    to: ROUTES.ADMIN_GUESTS,
    label: "Guests",
    icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z",
  },
  {
    to: ROUTES.ADMIN_ADMINS,
    label: "Administrators",
    icon: "M7 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm7 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM1.5 17c.5-3 2.7-5.2 5.5-5.2S12 14 12.5 17zm12.2 0c-.3-1.8-1-3.3-2.1-4.4.7-.3 1.5-.4 2.4-.4 2.2 0 3.8 1.6 4.2 4.8z",
  },
  {
    to: ROUTES.ADMIN_TRANSACTIONS,
    label: "Transactions",
    icon: "M3 6h9l-2.5-2.5L11 2l5 5-5 5-1.5-1.5L12 8H3zm14 8H8l2.5 2.5L9 18l-5-5 5-5 1.5 1.5L8 12h9z",
  },
  {
    to: ROUTES.ADMIN_PAYMENTS,
    label: "Payments",
    icon: "M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H5a2 2 0 0 0 0 4h12v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  },
  {
    to: ROUTES.ADMIN_SETTINGS,
    label: "Platform rules",
    icon: "M10 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM9.2 2h1.6l.3 2a6 6 0 0 1 1.5.9l1.9-.8 1 1.7-1.5 1.3a6 6 0 0 1 0 1.8l1.5 1.3-1 1.7-1.9-.8a6 6 0 0 1-1.5.9l-.3 2H9.2l-.3-2a6 6 0 0 1-1.5-.9l-1.9.8-1-1.7 1.5-1.3a6 6 0 0 1 0-1.8L4.5 5.8l1-1.7 1.9.8a6 6 0 0 1 1.5-.9z",
  },
];

const AdminPanelLayout = () => (
  <PanelLayout brand="Billionax" subtitle="Super admin" nav={NAV} />
);

export default AdminPanelLayout;
