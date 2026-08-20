export const ROUTES = {
  // guest
  HOME: "/",
  JOIN: "/join/:slug",
  LOGIN: "/login",
  APP: "/app",
  APP_REDEEM: "/app/redeem",
  APP_HISTORY: "/app/history",
  APP_OFFERS: "/app/offers",
  APP_ALERTS: "/app/alerts",
  APP_PROFILE: "/app/profile",

  // hotel panel
  HOTEL_LOGIN: "/hotel/login",
  HOTEL: "/hotel",
  HOTEL_VERIFY: "/hotel/verify",
  HOTEL_TRANSACTIONS: "/hotel/transactions",
  HOTEL_MEMBERS: "/hotel/members",
  HOTEL_COINS: "/hotel/coins",
  HOTEL_CONTENT: "/hotel/content",
  HOTEL_PRIVILEGES: "/hotel/privileges",
  HOTEL_STAFF: "/hotel/staff",
  HOTEL_SETTINGS: "/hotel/settings",

  // admin panel
  ADMIN_LOGIN: "/admin/login",
  ADMIN: "/admin",
  ADMIN_HOTELS: "/admin/hotels",
  ADMIN_HOTEL_DETAIL: "/admin/hotels/:hotelId",
  ADMIN_GUESTS: "/admin/guests",
  ADMIN_ADMINS: "/admin/admins",
  ADMIN_TRANSACTIONS: "/admin/transactions",
  ADMIN_SETTINGS: "/admin/settings",
};

export const joinPath = (slug) => `/join/${slug}`;
export const adminHotelPath = (id) => `/admin/hotels/${id}`;

/** Where each role belongs after signing in. */
export const homeForRole = (role) =>
  ({
    MAIN_ADMIN: ROUTES.ADMIN,
    HOTEL_ADMIN: ROUTES.HOTEL,
    HOTEL_STAFF: ROUTES.HOTEL_VERIFY,
    GUEST: ROUTES.APP,
  }[role] || ROUTES.HOME);
